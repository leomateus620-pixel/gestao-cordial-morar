import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireMarketingAction } from "./authorization.server";
import { buildEntityReport, type EntityReportSource } from "./entity-report.model";

export const generateMetaEntityReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: { jobId: string }) => z.object({ jobId: z.uuid() }).parse(value))
  .handler(async ({ context, data }) => {
    await requireMarketingAction(context, "generate_report");
    // One authenticated SQL snapshot fixes job ID, all rows and masking before service-role storage.
    const { data: source, error } = await (context.supabase as SupabaseClient).rpc(
      "meta_insight_export_snapshot",
      { p_job: data.jobId },
    );
    if (error || !source)
      throw new Error(
        "Snapshot indisponível para exportação. Confirme a conclusão, o acesso e o limite de 5.000 registros.",
      );
    const model = buildEntityReport(source as EntityReportSource);
    const { persistMarketingReport } = await import("@/lib/marketing/report-storage.server");
    return persistMarketingReport(context, model);
  });
