import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Record mentions share exactly the same authorization and masking as chat/MCP. */
export const searchAssistantRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z
      .object({
        kind: z.enum(["client", "property"]),
        query: z.string().trim().min(2).max(80),
      })
      .strict()
      .parse(value),
  )
  .handler(async ({ data, context }) => {
    const [{ getRequest }, { supabaseForUser }, { loadAgentContext }, { executeAgentTool }] =
      await Promise.all([
        import("@tanstack/react-start/server"),
        import("@/lib/mcp/supabase"),
        import("./security"),
        import("./tools"),
      ]);
    const request = getRequest();
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!token) throw new Error("Sessão inválida. Entre novamente.");
    const client = supabaseForUser({ getToken: () => token });
    const ctx = await loadAgentContext(client, context.userId, request.signal);
    const result = await executeAgentTool(
      data.kind === "client" ? "search_clients" : "search_properties",
      data.kind === "client" ? { name: data.query, limit: 8 } : { query: data.query, limit: 8 },
      ctx,
    );
    const records = result.structuredContent[data.kind === "client" ? "clients" : "properties"];
    return (Array.isArray(records) ? records : []).map((row: Record<string, unknown>) => ({
      kind: data.kind,
      id: String(row.id),
      label: String(
        data.kind === "client"
          ? (row.nome ?? "Cliente")
          : (row.codigo ?? row.codigoCordial ?? row.codigoMorar ?? "Imóvel"),
      ),
      detail: [row.tipo, row.bairro, row.cidade, row.status].filter(Boolean).join(" · "),
      href: String(row.href),
    }));
  });
