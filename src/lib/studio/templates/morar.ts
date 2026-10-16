import type { StudioTemplate } from "./types";

/** Template Morar v1 — logo oficial em public/morar-site/logo.jpg. */
export const MORAR_TEMPLATE_V1: StudioTemplate = {
  id: "morar-v1",
  brand: "morar",
  version: 1,
  logoSrc: "/morar-site/logo.jpg",
  accentToken: "--primary",
  overlayOpacity: 0.55,
};

export const MORAR_TEMPLATES = [MORAR_TEMPLATE_V1];
export const MORAR_TEMPLATE_CURRENT = MORAR_TEMPLATE_V1;
