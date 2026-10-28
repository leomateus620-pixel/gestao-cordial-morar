import { createFileRoute } from "@tanstack/react-router";
import { authorizeWorkerRequest } from "@/lib/workers/hook-auth";
import { runAdsSyncWorker } from "@/lib/ads/sync.server";
import { runMarketingReportJobs } from "@/lib/marketing/report-jobs.server";
import { runMetaInsightJobs } from "@/lib/ads/entity-insights.server";
export const Route = createFileRoute("/api/public/hooks/ads-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = authorizeWorkerRequest(request);
        if (denied) return denied;
        try {
          const campaigns = await runAdsSyncWorker();
          // Explicit report jobs share this dispatch, never its credential mechanism.
          // An unavailable additive migration cannot interrupt existing campaign sync.
          const insights = await runMetaInsightJobs(2).catch(() => ({
            processed: 0,
            failed: 1,
          }));
          const reports = await runMarketingReportJobs(1).catch(() => ({
            processed: 0,
            failed: 1,
          }));
          return Response.json({ ...campaigns, insights, reports });
        } catch {
          return Response.json(
            { error: "Não foi possível executar a sincronização." },
            { status: 503 },
          );
        }
      },
    },
  },
});
