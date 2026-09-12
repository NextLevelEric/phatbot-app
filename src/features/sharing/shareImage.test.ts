import { describe, expect, it, vi } from "vitest";
import { sharePngWithFallback } from "./shareImage";

const blob = new Blob(["png"], { type: "image/png" });
const meta = { fileName: "phatbot.png", title: "PHATBOT", text: "Standing" };

function environment() {
  return {
    nativeShareImage: vi.fn(async () => undefined),
    webShare: vi.fn(async () => undefined),
    canWebShare: vi.fn(() => true),
    blobToDataUrl: vi.fn(async () => "data:image/png;base64,cG5n"),
    download: vi.fn(),
  };
}

describe("shared image fallback chain", () => {
  it("prefers the PHATBOTMedia native bridge", async () => {
    const env = environment();
    expect(await sharePngWithFallback(blob, meta, env)).toBe("native");
    expect(env.nativeShareImage).toHaveBeenCalledOnce();
    expect(env.webShare).not.toHaveBeenCalled();
    expect(env.download).not.toHaveBeenCalled();
  });

  it("falls through native failure to Web Share", async () => {
    const env = environment();
    env.nativeShareImage.mockRejectedValueOnce(new Error("bridge unavailable"));
    expect(await sharePngWithFallback(blob, meta, env)).toBe("web");
    expect(env.webShare).toHaveBeenCalledOnce();
    expect(env.download).not.toHaveBeenCalled();
  });

  it("downloads the PNG when native and Web Share are unavailable", async () => {
    const env = environment();
    env.nativeShareImage.mockRejectedValueOnce(new Error("bridge unavailable"));
    env.canWebShare.mockReturnValueOnce(false);
    expect(await sharePngWithFallback(blob, meta, env)).toBe("download");
    expect(env.download).toHaveBeenCalledWith(blob, "phatbot.png");
  });
});
