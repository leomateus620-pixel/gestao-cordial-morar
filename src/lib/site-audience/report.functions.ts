import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_AUDIENCE_OFFSET, type AudienceReport } from "./report";

const reportRequest = z.strictObject({
  brand: z.enum(["cordial", "morar"]),
  period: z.enum(["day", "week", "month"]),
  offset: z.int().min(0).max(MAX_AUDIENCE_OFFSET),
  view: z.enum(["overview", "origins", "pages"]),
});

export const getSiteAudienceReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(reportRequest)
  .handler(async ({ context, data }): Promise<AudienceReport> => {
    const { getRequest, setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "no-store, private");
    setResponseHeader("X-Robots-Tag", "noindex, nofollow");
    const access = await context.supabase.rpc("site_audience_allowed_brands");
    if (access.error) throw new Error("Não foi possível verificar o acesso ao relatório.");
    if (!access.data?.includes(data.brand)) return { status: "unauthorized" };
    const { loadSiteAudienceReport } = await import("./report.server");
    return loadSiteAudienceReport(data, getRequest(), context.userId);
  });
