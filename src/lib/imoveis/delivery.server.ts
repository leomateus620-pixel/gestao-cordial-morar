/**
 * Gera a cópia de envio da foto já dentro do limite do provedor.
 *
 * O redimensionamento acontece no próprio armazenamento (transformação de
 * imagem), então nada depende de WebAssembly nem do navegador: o servidor
 * publicado consegue preparar a foto sozinho, em qualquer horário.
 */
import {
  DELIVERY_STEPS,
  IMOBI_IMAGE_MAX_BYTES,
  isWithinBudget,
  type DeliveryStep,
} from "./delivery";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type DeliveryPayload = {
  blob: Blob;
  bytes: number;
  step: DeliveryStep | null;
};

async function tryDownload(
  admin: Admin,
  bucket: string,
  path: string,
  transform?: DeliveryStep,
): Promise<Blob | null> {
  try {
    const { data, error } = await admin.storage.from(bucket).download(
      path,
      transform
        ? { transform: { width: transform.width, quality: transform.quality, resize: "contain" } }
        : undefined,
    );
    if (error || !data) return null;
    return data as Blob;
  } catch {
    return null;
  }
}

/**
 * Devolve os bytes que serão enviados ao site.
 * Tenta o arquivo original (quando já cabe) e, se necessário, os degraus de
 * redução em ordem. Lança erro classificado quando nenhum degrau couber.
 */
export async function fetchDeliveryBytes(
  admin: Admin,
  bucket: string,
  path: string,
  budget = IMOBI_IMAGE_MAX_BYTES,
  steps: readonly DeliveryStep[] = DELIVERY_STEPS,
): Promise<DeliveryPayload> {
  const original = await tryDownload(admin, bucket, path);
  if (original && isWithinBudget(original.size, budget)) {
    return { blob: original, bytes: original.size, step: null };
  }
  if (!original) {
    throw new Error("Falha ao ler a imagem no armazenamento.");
  }

  for (const step of steps) {
    const reduced = await tryDownload(admin, bucket, path, step);
    if (reduced && isWithinBudget(reduced.size, budget)) {
      return { blob: reduced, bytes: reduced.size, step };
    }
  }

  throw new Error(
    `A imagem deve conter no máximo 1 MB! Não foi possível reduzir a foto (${Math.round(
      original.size / 1024,
    )} KB) dentro do limite do site.`,
  );
}
