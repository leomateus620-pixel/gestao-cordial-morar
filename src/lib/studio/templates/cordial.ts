import type { StudioTemplate } from "./types";

/** Template Cordial v1 — logo oficial em public/cordial-site/logo.png. */
export const CORDIAL_TEMPLATE_V1: StudioTemplate = {
  id: "cordial-v1",
  brand: "cordial",
  version: 1,
  logoSrc: "/cordial-site/logo.png",
  accentToken: "--primary",
  overlayOpacity: 0.55,
};

export const CORDIAL_TEMPLATES = [CORDIAL_TEMPLATE_V1];
export const CORDIAL_TEMPLATE_CURRENT = CORDIAL_TEMPLATE_V1;
