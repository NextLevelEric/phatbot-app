import type { SupabaseClient } from "@supabase/supabase-js";

type RecoveryAuthClient = Pick<
  SupabaseClient["auth"],
  "exchangeCodeForSession" | "getSession" | "setSession" | "verifyOtp"
>;

export type PasswordRecoveryLink =
  | { kind: "pkce"; code: string; flowId?: string }
  | { kind: "token_hash"; tokenHash: string }
  | { kind: "implicit"; accessToken: string; refreshToken: string }
  | { kind: "invalid" }
  | { kind: "none" };

export type PasswordRecoverySessionResult =
  | { ok: true }
  | { ok: false; reason: "invalid_or_expired" | "missing" };

export function parsePasswordRecoveryLink(href: string): PasswordRecoveryLink {
  let url: URL;

  try {
    url = new URL(href);
  } catch {
    return { kind: "invalid" };
  }

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const hasProviderError = [
    url.searchParams.get("error"),
    url.searchParams.get("error_code"),
    url.searchParams.get("error_description"),
    hashParams.get("error"),
    hashParams.get("error_code"),
    hashParams.get("error_description"),
  ].some(Boolean);

  if (hasProviderError) return { kind: "invalid" };

  const code = url.searchParams.get("code");
  if (code) {
    const flowId = url.searchParams.get("sb_flow_id") || undefined;
    return { kind: "pkce", code, flowId };
  }

  const tokenHash = url.searchParams.get("token_hash");
  if (tokenHash && url.searchParams.get("type") === "recovery") {
    return { kind: "token_hash", tokenHash };
  }

  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  if (accessToken && refreshToken && hashParams.get("type") === "recovery") {
    return { kind: "implicit", accessToken, refreshToken };
  }

  return { kind: "none" };
}

export function shouldClearPasswordRecoveryUrl(link: PasswordRecoveryLink) {
  return link.kind !== "none";
}

export async function establishPasswordRecoverySession(
  auth: RecoveryAuthClient,
  link: PasswordRecoveryLink,
): Promise<PasswordRecoverySessionResult> {
  if (link.kind === "invalid") return { ok: false, reason: "invalid_or_expired" };

  const {
    data: { session: existingSession },
    error: existingSessionError,
  } = await auth.getSession();

  // createBrowserClient can consume a callback during its own initialization.
  // Reuse that session instead of attempting to exchange a one-time code twice.
  if (!existingSessionError && existingSession) return { ok: true };

  if (link.kind === "pkce") {
    const { data, error } = await auth.exchangeCodeForSession(
      link.code,
      link.flowId ? { flowId: link.flowId } : undefined,
    );
    return error || !data.session
      ? { ok: false, reason: "invalid_or_expired" }
      : { ok: true };
  }

  if (link.kind === "token_hash") {
    const { data, error } = await auth.verifyOtp({
      token_hash: link.tokenHash,
      type: "recovery",
    });
    return error || !data.session
      ? { ok: false, reason: "invalid_or_expired" }
      : { ok: true };
  }

  if (link.kind === "implicit") {
    const { data, error } = await auth.setSession({
      access_token: link.accessToken,
      refresh_token: link.refreshToken,
    });
    return error || !data.session
      ? { ok: false, reason: "invalid_or_expired" }
      : { ok: true };
  }

  return { ok: false, reason: "missing" };
}
