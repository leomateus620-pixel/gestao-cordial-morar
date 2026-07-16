import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { runSheetSync } from "@/lib/financeiro/sheets-import.server";

export const Route = createFileRoute("/api/public/hooks/financeiro-sheets-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.FINANCEIRO_SYNC_SECRET;
        const provided = request.headers.get("x-cron-secret") ?? "";
        if (!secret || provided !== secret) {
          return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const { data: configs, error: cfgErr } = await supabase
          .from("financeiro_sheet_config")
          .select("id, spreadsheet_id, sheet_name, range, header_row, updated_by")
          .order("updated_at", { ascending: false });
        if (cfgErr) {
          return Response.json({ ok: false, error: cfgErr.message }, { status: 500 });
        }
        if (!configs?.length) {
          return Response.json({ ok: true, message: "no config", results: [] });
        }

        const results: any[] = [];
        for (const cfg of configs) {
          const startedAt = Date.now();
          const t0 = new Date().toISOString();
          const owner = cfg.updated_by;
          if (!owner) {
            await supabase.from("financeiro_sync_log").insert({
              config_id: cfg.id,
              ran_at: t0,
              ok: false,
              error_message: "config sem updated_by (owner)",
              triggered_by: "cron",
            });
            results.push({ configId: cfg.id, ok: false, error: "missing owner" });
            continue;
          }
          try {
            const out = await runSheetSync(supabase, cfg, owner);
            await supabase
              .from("financeiro_sheet_config")
              .update({
                last_import_at: new Date().toISOString(),
                last_import_count: out.inserted + out.updated,
              })
              .eq("id", cfg.id);
            await supabase.from("financeiro_sync_log").insert({
              config_id: cfg.id,
              ran_at: t0,
              duration_ms: Date.now() - startedAt,
              inserted: out.inserted,
              updated: out.updated,
              soft_deleted: out.softDeleted,
              skipped: out.skipped,
              errors: out.errors,
              triggered_by: "cron",
            });
            results.push({
              configId: cfg.id,
              ok: true,
              inserted: out.inserted,
              updated: out.updated,
              softDeleted: out.softDeleted,
              skipped: out.skipped,
              errors: out.errors.length,
            });
          } catch (e: any) {
            await supabase.from("financeiro_sync_log").insert({
              config_id: cfg.id,
              ran_at: t0,
              duration_ms: Date.now() - startedAt,
              ok: false,
              error_message: String(e?.message ?? e).slice(0, 500),
              triggered_by: "cron",
            });
            results.push({ configId: cfg.id, ok: false, error: String(e?.message ?? e) });
          }
        }

        return Response.json({ ok: true, results });
      },
    },
  },
});
