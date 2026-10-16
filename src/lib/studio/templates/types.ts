export type StudioBrand = "cordial" | "morar";

export type StudioTemplate = {
  id: string;
  brand: StudioBrand;
  version: number;
  /** Caminho público do logo/marca usado como selo/marca d'água no template. */
  logoSrc: string;
  /** Tokens de cor (classes/tailwind tokens do projeto — nunca hex fixo na UI). */
  accentToken: string;
  overlayOpacity: number;
};
