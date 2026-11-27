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
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "no-store, private");
    setResponseHeader("X-Robots-Tag", "noindex, nofollow");
    // has_role is deny-dominant in the DB for both external reviewer roles.
    const role = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (role.error) throw new Error("Não foi possível verificar o acesso ao relatório.");
    if (role.data !== true) return { status: "unauthorized" };
    const { loadSiteAudienceReport } = await import("./report.server");
    return loadSiteAudienceReport(data);
  });
