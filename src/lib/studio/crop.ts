/**
 * Cálculo puro de recorte "cover": encaixa a foto original no formato alvo
 * sem distorcer e sem alterar pixels fora da janela recortada (o recorte só
 * seleciona uma região; nunca redesenha/gera conteúdo). Usado tanto pela UI
 * (canvas) quanto pelos testes.
 */

export type CropRect = { x: number; y: number; width: number; height: number };

/** Janela de origem (na imagem original) que, esticada, preenche o alvo sem bordas. */
export function coverCrop(sourceWidth: number, sourceHeight: number, targetAspect: number): CropRect {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetAspect <= 0) {
    throw new Error("dimensoes_invalidas");
  }
  const sourceAspect = sourceWidth / sourceHeight;
  if (sourceAspect > targetAspect) {
    // Fonte mais larga que o alvo: corta as laterais, mantém a altura inteira.
    const width = sourceHeight * targetAspect;
    const x = (sourceWidth - width) / 2;
    return { x, y: 0, width, height: sourceHeight };
  }
  // Fonte mais alta (ou igual) que o alvo: corta topo/base, mantém a largura inteira.
  const height = sourceWidth / targetAspect;
  const y = (sourceHeight - height) / 2;
  return { x: 0, y, width: sourceWidth, height };
}

/** SHA-256 em hex da foto de entrada (bytes brutos), usado para rastrear integridade. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Garante que a janela de recorte está contida na imagem original (sem extrapolar). */
export function isCropWithinBounds(crop: CropRect, sourceWidth: number, sourceHeight: number): boolean {
  return (
    crop.x >= -1e-6 &&
    crop.y >= -1e-6 &&
    crop.x + crop.width <= sourceWidth + 1e-6 &&
    crop.y + crop.height <= sourceHeight + 1e-6
  );
}
