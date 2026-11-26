/** Conversor único do campo `properties.mobiliado` (coluna texto). Mesma leitura das views dos sites. */
export function parseMobiliado(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const t = value.trim().toLowerCase();
  if (t === "true" || t === "sim") return true;
  if (t === "false" || t === "nao" || t === "não") return false;
  return null;
}

/** Gravação estável: 'true' | 'false' | null. */
export function serializeMobiliado(value: unknown): "true" | "false" | null {
  const parsed = parseMobiliado(value);
  return parsed === null ? null : parsed ? "true" : "false";
}

/** Rótulo da ficha: «Sim» só quando verdadeiro. */
export function mobiliadoLabel(value: unknown): "Sim" | null {
  return parseMobiliado(value) === true ? "Sim" : null;
}
