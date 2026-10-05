import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { internalTokenAuthorized } from "@/lib/workers/internal-token.server";
import { archiveNfsePdf } from "@/lib/nfse/pdf-archive.server";

/** Nova tentativa automática (pg_cron, de hora em hora) de guardar o PDF das NFS-e emitidas. */
export const Route = createFileRoute("/api/public/hooks/nfse-pdf-retry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
        const supabaseUrl = process.env["SUPABASE_URL"];
        if (!serviceRoleKey || !supabaseUrl)
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        if (!(await internalTokenAuthorized(admin, apikey)))
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { data } = await admin
          .from("rental_nfse_emissions")
          .select("id")
          .in("pdf_status", ["pendente", "falhou"])
          .is("pdf_document_id", null)
          .lt("pdf_attempts", 24)
          .limit(20);
        const results: Record<string, string> = {};
        for (const row of data ?? []) {
          const r = await archiveNfsePdf(admin, row.id);
          results[row.id] = r.status;
        }
        return Response.json({ processed: Object.keys(results).length, results });
      },
    },
  },
});
