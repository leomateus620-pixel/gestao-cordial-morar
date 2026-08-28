/**
 * Preparo da foto no navegador (browser-only).
 * Redimensiona para o lado máximo publicável com alta qualidade antes de
 * enviar: o envio fica leve, o processamento da marca não estoura tempo nem
 * memória no servidor e o resultado continua nítido nos sites e no Drive.
 */

export const CLIENT_MAX_EDGE_PX = 2560;
export const CLIENT_JPEG_QUALITY = 0.92;
/** Abaixo disso não compensa reprocessar: envia o arquivo como veio. */
const SKIP_BELOW_BYTES = 700 * 1024;

export type PreparedImage = {
  blob: Blob;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
};

function jpegName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, "") + ".jpg";
}

export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  const fallback: PreparedImage = {
    blob: file,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    width: null,
    height: null,
  };
  if (typeof window === "undefined" || typeof createImageBitmap !== "function") return fallback;

  let bitmap: ImageBitmap;
  try {
    // imageOrientation "from-image" já resolve o EXIF antes de qualquer corte.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return fallback;
  }

  try {
    const maxEdge = Math.max(bitmap.width, bitmap.height);
    if (maxEdge <= CLIENT_MAX_EDGE_PX && file.size <= SKIP_BELOW_BYTES) {
      return { ...fallback, width: bitmap.width, height: bitmap.height };
    }
    const scale = Math.min(1, CLIENT_MAX_EDGE_PX / maxEdge);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ...fallback, width: bitmap.width, height: bitmap.height };
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", CLIENT_JPEG_QUALITY),
    );
    if (!blob || !blob.size) return { ...fallback, width: bitmap.width, height: bitmap.height };
    // Se o "otimizado" ficou maior que o original, o original vence.
    if (blob.size >= file.size && maxEdge <= CLIENT_MAX_EDGE_PX) {
      return { ...fallback, width: bitmap.width, height: bitmap.height };
    }
    return {
      blob,
      fileName: jpegName(file.name),
      mimeType: "image/jpeg",
      sizeBytes: blob.size,
      width,
      height,
    };
  } finally {
    bitmap.close?.();
  }
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Envio direto ao bucket privado por URL assinada, com progresso real. */
export function uploadSignedWithProgress(args: {
  bucket: string;
  path: string;
  token: string;
  blob: Blob;
  contentType: string;
  onProgress?: (ratio: number) => void;
}): Promise<void> {
  const base = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
  if (!base) return Promise.reject(new Error("Armazenamento indisponível."));
  const url = `${base}/storage/v1/object/upload/sign/${args.bucket}/${args.path}?token=${encodeURIComponent(args.token)}`;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", args.contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && args.onProgress) args.onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error("Não foi possível enviar a foto agora."));
    xhr.onerror = () => reject(new Error("Conexão interrompida durante o envio."));
    xhr.onabort = () => reject(new Error("Envio cancelado."));
    xhr.send(args.blob);
  });
}
