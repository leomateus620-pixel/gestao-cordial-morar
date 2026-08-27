/**
 * Conferência remota de disponibilidade de código (server-only).
 * A API ImobiBrasil não expõe "próximo código livre": o candidato vem do índice
 * local e é validado por consulta de referência antes de ser entregue.
 */

import { imobiRequest, hasProviderToken } from "@/lib/imobibrasil/client.server";
import type { ImobiProvider } from "@/lib/imobibrasil/providers";

export async function remoteCodeTaken(provider: ImobiProvider, code: string): Promise<boolean | null> {
  if (!hasProviderToken(provider)) return null; // sem token não há como afirmar nada
  try {
    const response = await imobiRequest(
      provider,
      `/imovel/lista?referencia=${encodeURIComponent(code)}`,
      { method: "GET" },
    );
    const raw = response.data as unknown;
    const container =
      Array.isArray(raw)
        ? raw
        : ((raw as Record<string, unknown>)?.["resultSet"] ??
           (raw as Record<string, unknown>)?.["data"] ??
           []);
    const list = Array.isArray(container) ? container : [];
    return list.some((item) => {
      if (!item || typeof item !== "object") return false;
      const record = item as Record<string, unknown>;
      const ref = String(record["referenciaImovel"] ?? record["referencia"] ?? "").trim();
      return ref === code;
    });
  } catch {
    return null; // indisponibilidade da API não bloqueia o cadastro
  }
}
