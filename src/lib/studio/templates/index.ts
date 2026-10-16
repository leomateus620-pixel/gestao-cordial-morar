import type { StudioBrand, StudioTemplate } from "./types";
import { CORDIAL_TEMPLATE_CURRENT, CORDIAL_TEMPLATES } from "./cordial";
import { MORAR_TEMPLATE_CURRENT, MORAR_TEMPLATES } from "./morar";

export type { StudioBrand, StudioTemplate } from "./types";

export function currentTemplate(brand: StudioBrand): StudioTemplate {
  return brand === "morar" ? MORAR_TEMPLATE_CURRENT : CORDIAL_TEMPLATE_CURRENT;
}

export function templateById(id: string): StudioTemplate | undefined {
  return [...CORDIAL_TEMPLATES, ...MORAR_TEMPLATES].find((t) => t.id === id);
}
