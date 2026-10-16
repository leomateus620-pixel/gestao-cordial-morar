import { effectiveRole, type AgentContext } from "./security";
/** Must match assistant_current_scope() in migration 0013. */
export function assistantScopeKey(ctx: AgentContext): string {
  return `${effectiveRole(ctx) ?? "none"}:${[...new Set(ctx.agencies.filter((agency) => agency === "cordial" || agency === "morar"))].sort().join(",")}`;
}
export const ASSISTANT_HISTORY_TEXT =
  "Os resultados desta conversa foram atualizados conforme seu acesso atual.";
/** History and audit keep only identifiers, dates, numeric limits and closed
 * enums. Free text search/name/city fields are intentionally not retained. */
export function assistantReferenceParams(params: unknown): Record<string, unknown> {
  if (!params || typeof params !== "object" || Array.isArray(params)) return {};
  const enums: Record<string, readonly string[]> = {
    kind: ["property", "client", "attendance", "rental", "agenciamento", "agenda"],
    topic: ["precos_regionais", "mercado_local", "ipca", "igpm"],
    region: [
      "santa_rosa_rs",
      "horizontina_rs",
      "tres_de_maio_rs",
      "tuparendi_rs",
      "tucunduva_rs",
      "porto_alegre_rs",
      "brasil",
    ],
    imobiliaria: ["cordial", "morar"],
  };
  return Object.fromEntries(
    Object.entries(params).filter(
      ([key, value]) =>
        (["limit", "days", "diasParado"].includes(key) &&
          typeof value === "number" &&
          Number.isFinite(value)) ||
        (typeof value === "string" &&
          ((["id", "clientId", "actionId"].includes(key) &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) ||
            (["date", "competencia"].includes(key) && /^\d{4}-\d{2}(?:-\d{2})?$/.test(value)) ||
            enums[key]?.includes(value))),
    ),
  );
}
