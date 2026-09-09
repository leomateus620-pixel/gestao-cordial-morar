/**
 * Regras (puras) de entrega das fotos aos sites.
 *
 * A API dos sites recusa arquivos acima de 1 MB ("A imagem deve conter no
 * máximo 1 MB!"). Aqui ficam o orçamento de bytes, os degraus de redução e a
 * classificação de erro que decide se vale a pena tentar de novo — sem
 * nenhuma dependência de rede, para poder ser testado isoladamente.
 */

/** Limite do provedor com folga de segurança (multipart adiciona overhead). */
export const IMOBI_IMAGE_MAX_BYTES = 980_000;

export type DeliveryStep = { width: number; quality: number };

/** Degraus aplicados em ordem: o primeiro que couber no orçamento é enviado. */
export const DELIVERY_STEPS: readonly DeliveryStep[] = [
  { width: 1600, quality: 78 },
  { width: 1400, quality: 70 },
  { width: 1200, quality: 62 },
  { width: 1024, quality: 55 },
] as const;

export function isWithinBudget(bytes: number, budget = IMOBI_IMAGE_MAX_BYTES): boolean {
  return bytes > 0 && bytes <= budget;
}

/**
 * Escolhe o primeiro degrau cujo tamanho medido cabe no orçamento.
 * `sizes` é o tamanho real devolvido pelo armazenamento para cada degrau
 * (`null` quando aquele degrau falhou).
 */
export function pickDeliveryStep(
  sizes: ReadonlyArray<number | null>,
  budget = IMOBI_IMAGE_MAX_BYTES,
  steps: readonly DeliveryStep[] = DELIVERY_STEPS,
): { index: number; step: DeliveryStep } | null {
  for (let index = 0; index < steps.length; index += 1) {
    const size = sizes[index];
    if (typeof size === "number" && isWithinBudget(size, budget)) {
      return { index, step: steps[index]! };
    }
  }
  return null;
}

export type ImageDeliveryErrorClass =
  | "imagem_grande"
  | "rede"
  | "provedor"
  | "armazenamento"
  | "desconhecido";

/** Classifica a falha de envio de uma foto para decidir o reenvio automático. */
export function classifyImageDeliveryError(message: string | null | undefined): ImageDeliveryErrorClass {
  const raw = (message ?? "").toLowerCase();
  if (!raw) return "desconhecido";
  if (/m[aá]ximo\s*1\s*mb|too large|payload too large|413/.test(raw)) return "imagem_grande";
  if (/armazenamento|storage|object not found|não foi possível ler a imagem/.test(raw))
    return "armazenamento";
  if (/timeout|network|socket|fetch failed|abort|523|522|520|502|503|504|cloudflare|gateway/.test(raw))
    return "rede";
  return "provedor";
}

export const MAX_IMAGE_DELIVERY_ATTEMPTS = 6;

/** Espera crescente entre tentativas (em segundos). */
export function imageRetryDelaySeconds(attempts: number): number {
  const ladder = [60, 300, 900, 3600, 10_800];
  return ladder[Math.min(Math.max(attempts, 1), ladder.length) - 1]!;
}

/** Erros que não adianta repetir sozinho — precisam de decisão/arquivo novo. */
const PERMANENT_CLASSES: ReadonlySet<ImageDeliveryErrorClass> = new Set(["armazenamento"]);

export function shouldRetryImageDelivery(
  errorClass: ImageDeliveryErrorClass,
  attempts: number,
  max = MAX_IMAGE_DELIVERY_ATTEMPTS,
): boolean {
  if (PERMANENT_CLASSES.has(errorClass)) return false;
  return attempts < max;
}

/** Momento da próxima tentativa; `null` quando não haverá reenvio automático. */
export function nextImageRetryAt(
  errorClass: ImageDeliveryErrorClass,
  attempts: number,
  now: Date = new Date(),
  max = MAX_IMAGE_DELIVERY_ATTEMPTS,
): string | null {
  if (!shouldRetryImageDelivery(errorClass, attempts, max)) return null;
  return new Date(now.getTime() + imageRetryDelaySeconds(attempts) * 1000).toISOString();
}
