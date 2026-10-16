/**
 * Formatos suportados pelo Estúdio de Conteúdo. Regras puras, sem rede/DOM.
 */

export type StudioFormatId = "story" | "feed_quadrado" | "feed_retrato" | "carrossel" | "video_vertical";

export type StudioFormatSpec = {
  id: StudioFormatId;
  label: string;
  width: number;
  height: number;
  aspect: number;
};

export const STUDIO_FORMATS: Record<StudioFormatId, StudioFormatSpec> = {
  story: { id: "story", label: "Story (9:16)", width: 1080, height: 1920, aspect: 1080 / 1920 },
  feed_quadrado: { id: "feed_quadrado", label: "Feed quadrado", width: 1080, height: 1080, aspect: 1 },
  feed_retrato: { id: "feed_retrato", label: "Feed retrato (4:5)", width: 1080, height: 1350, aspect: 1080 / 1350 },
  carrossel: { id: "carrossel", label: "Carrossel", width: 1080, height: 1350, aspect: 1080 / 1350 },
  video_vertical: { id: "video_vertical", label: "Vídeo (9:16)", width: 1080, height: 1920, aspect: 1080 / 1920 },
};

export const CAROUSEL_MIN_SLIDES = 1;
export const CAROUSEL_MAX_SLIDES = 10;

export const VIDEO_MIN_SECONDS = 6;
export const VIDEO_MAX_SECONDS = 15;

export function formatSpec(id: StudioFormatId): StudioFormatSpec {
  const spec = STUDIO_FORMATS[id];
  if (!spec) throw new Error("formato_invalido");
  return spec;
}

export function clampCarouselSlides(n: number): number {
  return Math.max(CAROUSEL_MIN_SLIDES, Math.min(CAROUSEL_MAX_SLIDES, Math.floor(n)));
}

export function isValidCarouselCount(n: number): boolean {
  return Number.isInteger(n) && n >= CAROUSEL_MIN_SLIDES && n <= CAROUSEL_MAX_SLIDES;
}

export function clampVideoSeconds(seconds: number): number {
  return Math.max(VIDEO_MIN_SECONDS, Math.min(VIDEO_MAX_SECONDS, seconds));
}

export function isValidVideoDuration(seconds: number): boolean {
  return seconds >= VIDEO_MIN_SECONDS && seconds <= VIDEO_MAX_SECONDS;
}
