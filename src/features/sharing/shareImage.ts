export type ShareTransport = "native" | "web" | "download";

type ShareFile = { name: string; type: string; blob: Blob };
type ShareEnvironment = {
  nativeShareImage?: (dataUrl: string) => Promise<void>;
  webShare?: (data: { files: ShareFile[]; title: string; text: string }) => Promise<void>;
  canWebShare?: (file: ShareFile) => boolean;
  blobToDataUrl: (blob: Blob) => Promise<string>;
  download: (blob: Blob, fileName: string) => void;
};

function aborted(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function browserEnvironment(): ShareEnvironment {
  const nativeMedia = (window as typeof window & { Capacitor?: { Plugins?: { PHATBOTMedia?: { shareImage?: (input: { base64: string }) => Promise<void> } } } }).Capacitor?.Plugins?.PHATBOTMedia;
  return {
    nativeShareImage: nativeMedia?.shareImage ? dataUrl => nativeMedia.shareImage!({ base64: dataUrl }) : undefined,
    webShare: typeof navigator.share === "function" ? async data => {
      const file = new File([data.files[0].blob], data.files[0].name, { type: data.files[0].type });
      await navigator.share({ files: [file], title: data.title, text: data.text });
    } : undefined,
    canWebShare: typeof navigator.share === "function" ? file => {
      if (!navigator.canShare) return true;
      const browserFile = new File([file.blob], file.name, { type: file.type });
      return navigator.canShare({ files: [browserFile] });
    } : undefined,
    blobToDataUrl: blob => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not encode image"));
      reader.onerror = () => reject(reader.error ?? new Error("Could not encode image"));
      reader.readAsDataURL(blob);
    }),
    download: (blob, fileName) => {
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = fileName;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(href), 3000);
    },
  };
}

export async function sharePngWithFallback(
  blob: Blob,
  meta: { fileName: string; title: string; text: string },
  environment: ShareEnvironment = browserEnvironment(),
): Promise<ShareTransport> {
  if (environment.nativeShareImage) {
    try {
      await environment.nativeShareImage(await environment.blobToDataUrl(blob));
      return "native";
    } catch (error) {
      if (aborted(error)) throw error;
    }
  }

  const file = { name: meta.fileName, type: "image/png", blob };
  if (environment.webShare && (!environment.canWebShare || environment.canWebShare(file))) {
    try {
      await environment.webShare({ files: [file], title: meta.title, text: meta.text });
      return "web";
    } catch (error) {
      if (aborted(error)) throw error;
    }
  }

  environment.download(blob, meta.fileName);
  return "download";
}
