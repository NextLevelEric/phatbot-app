import { describe, expect, it, vi } from "vitest";
import {
  establishPasswordRecoverySession,
  parsePasswordRecoveryLink,
  shouldClearPasswordRecoveryUrl,
  type PasswordRecoveryLink,
} from "./passwordRecovery";

function authMock(overrides: Record<string, unknown> = {}) {
  return {
    exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: { user: {} } }, error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ data: { session: { user: {} } }, error: null }),
    setSession: vi.fn().mockResolvedValue({ data: { session: { user: {} } }, error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    ...overrides,
  };
}

describe("password recovery links", () => {
  it("parses the PKCE code and optional Supabase flow id", () => {
    expect(
      parsePasswordRecoveryLink(
        "https://phatbot.app/auth/update-password?code=secret-code&sb_flow_id=flow-id",
      ),
    ).toEqual({ kind: "pkce", code: "secret-code", flowId: "flow-id" });
  });

  it("parses recovery token hashes used by PHATBOT email links", () => {
    expect(
      parsePasswordRecoveryLink(
        "https://phatbot.app/auth/update-password?token_hash=secret-hash&type=recovery",
      ),
    ).toEqual({ kind: "token_hash", tokenHash: "secret-hash" });
  });

  it("parses legacy implicit recovery credentials from the URL hash", () => {
    expect(
      parsePasswordRecoveryLink(
        "https://phatbot.app/auth/update-password#access_token=access&refresh_token=refresh&type=recovery",
      ),
    ).toEqual({ kind: "implicit", accessToken: "access", refreshToken: "refresh" });
  });

  it("rejects provider errors and does not treat non-recovery hashes as password recovery", () => {
    expect(
      parsePasswordRecoveryLink(
        "https://phatbot.app/auth/update-password?error=access_denied&error_description=expired",
      ),
    ).toEqual({ kind: "invalid" });
    expect(
      parsePasswordRecoveryLink(
        "https://phatbot.app/auth/update-password#access_token=access&refresh_token=refresh&type=signup",
      ),
    ).toEqual({ kind: "none" });
  });

  it("identifies only links whose URL contains recovery credentials", () => {
    const credentials: PasswordRecoveryLink[] = [
      { kind: "pkce", code: "code" },
      { kind: "token_hash", tokenHash: "hash" },
      { kind: "implicit", accessToken: "access", refreshToken: "refresh" },
    ];

    for (const link of credentials) expect(shouldClearPasswordRecoveryUrl(link)).toBe(true);
    expect(shouldClearPasswordRecoveryUrl({ kind: "invalid" })).toBe(true);
    expect(shouldClearPasswordRecoveryUrl({ kind: "none" })).toBe(false);
  });
});

describe("password recovery session establishment", () => {
  it("exchanges a PKCE code before allowing a password update", async () => {
    const auth = authMock();

    await expect(
      establishPasswordRecoverySession(auth, {
        kind: "pkce",
        code: "secret-code",
        flowId: "flow-id",
      }),
    ).resolves.toEqual({ ok: true });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("secret-code", { flowId: "flow-id" });
    expect(auth.getSession).toHaveBeenCalledOnce();
  });

  it("verifies a recovery token hash", async () => {
    const auth = authMock();

    await expect(
      establishPasswordRecoverySession(auth, { kind: "token_hash", tokenHash: "secret-hash" }),
    ).resolves.toEqual({ ok: true });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "secret-hash", type: "recovery" });
  });

  it("restores a legacy implicit recovery session", async () => {
    const auth = authMock();

    await expect(
      establishPasswordRecoverySession(auth, {
        kind: "implicit",
        accessToken: "access",
        refreshToken: "refresh",
      }),
    ).resolves.toEqual({ ok: true });
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: "access", refresh_token: "refresh" });
  });

  it("uses an already-restored browser session when the callback parameters were consumed", async () => {
    const auth = authMock({
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: {} } }, error: null }),
    });

    await expect(
      establishPasswordRecoverySession(auth, { kind: "pkce", code: "already-consumed" }),
    ).resolves.toEqual({ ok: true });
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("fails safely for missing, expired, or reused recovery credentials", async () => {
    const missingAuth = authMock();
    const expiredAuth = authMock({
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: new Error("expired secret-code"),
      }),
    });

    await expect(establishPasswordRecoverySession(missingAuth, { kind: "none" })).resolves.toEqual({
      ok: false,
      reason: "missing",
    });
    await expect(
      establishPasswordRecoverySession(expiredAuth, { kind: "pkce", code: "secret-code" }),
    ).resolves.toEqual({ ok: false, reason: "invalid_or_expired" });
  });
});
