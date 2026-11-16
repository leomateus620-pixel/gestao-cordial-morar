import type { BotBrand } from "./contracts";
export const botBrand = (brand: BotBrand) => ({
  brand,
  name: brand === "cordial" ? "Cordial Bot" : "Morar Bot",
  api: `/api/${brand}-site/bot`,
  avatar: `/public-property-bot/${brand}-neutral.svg`,
  greeting: "Vamos encontrar seu lugar? Conte o que você procura.",
});
export const QUOTA_MESSAGE =
  "Por hoje, continue com nossa equipe pelo WhatsApp. Amanhã você pode conversar por aqui novamente.";
