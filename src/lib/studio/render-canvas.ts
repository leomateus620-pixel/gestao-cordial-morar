/**
 * Renderização no navegador: desenha a foto recortada (cover, sem IA
 * generativa) mais sobreposições de texto/logo do template, e exporta PNG.
 * Só roda em ambiente com `document`/`OffscreenCanvas`.
 */
import { coverCrop } from "./crop";
import type { StudioTemplate } from "./templates";

export type RenderOverlayText = { text: string; x: number; y: number; sizePx: number; color: string };

export type RenderInput = {
  photo: HTMLImageElement | ImageBitmap;
  targetWidth: number;
  targetHeight: number;
  template: StudioTemplate;
  overlays: RenderOverlayText[];
  logo?: HTMLImageElement | ImageBitmap;
};

export async function renderStudioImage(input: RenderInput): Promise<Blob> {
  if (typeof document === "undefined") throw new Error("render_requires_browser");
  const canvas = document.createElement("canvas");
  canvas.width = input.targetWidth;
  canvas.height = input.targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_context_indisponivel");

  const sourceWidth = (input.photo as HTMLImageElement).naturalWidth ?? (input.photo as ImageBitmap).width;
  const sourceHeight = (input.photo as HTMLImageElement).naturalHeight ?? (input.photo as ImageBitmap).height;
  const crop = coverCrop(sourceWidth, sourceHeight, input.targetWidth / input.targetHeight);
  // Apenas recorte/escala (cover) — nenhum pixel é gerado ou alterado fora da janela.
  ctx.drawImage(
    input.photo as CanvasImageSource,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    input.targetWidth,
    input.targetHeight,
  );

  ctx.save();
  ctx.globalAlpha = input.template.overlayOpacity;
  ctx.fillStyle = "rgba(0,0,0,1)";
  ctx.fillRect(0, input.targetHeight * 0.68, input.targetWidth, input.targetHeight * 0.32);
  ctx.restore();

  for (const overlay of input.overlays) {
    ctx.fillStyle = overlay.color;
    ctx.font = `600 ${overlay.sizePx}px sans-serif`;
    ctx.fillText(overlay.text, overlay.x, overlay.y);
  }

  if (input.logo) {
    const logoW = input.targetWidth * 0.22;
    const logoH = logoW * ((input.logo as HTMLImageElement).naturalHeight ?? (input.logo as ImageBitmap).height) /
      ((input.logo as HTMLImageElement).naturalWidth ?? (input.logo as ImageBitmap).width);
    ctx.drawImage(input.logo as CanvasImageSource, 24, 24, logoW, logoH);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("export_falhou"))), "image/png");
  });
}
