/**
 * Código externo exclusivo por imobiliária.
 * Nunca há fallback silencioso do código de um provedor para o outro.
 */
export function providerExternalCode(
  property: Record<string, unknown> | null | undefined,
  provider: "cordial" | "morar",
): string | null {
  const raw = property?.[provider === "cordial" ? "codigo_cordial" : "codigo_morar"];
  const code = typeof raw === "string" ? raw.trim() : "";
  return code ? code : null;
}
