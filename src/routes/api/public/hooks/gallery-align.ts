import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { authorizeWorkerRequest } from "@/lib/workers/hook-auth";

const Body = z.object({
  propertyId: z.string().uuid(),
  provider: z.enum(["cordial", "morar"]),
  apply: z.boolean().default(false),
});

/** Alinhamento pontual de galeria (uso interno, só com o segredo do servidor). */
export const Route = createFileRoute("/api/public/hooks/gallery-align")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = authorizeWorkerRequest(request);
        if (denied) return denied;
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { alignGallery } = await import("@/lib/imobibrasil/gallery-align.server");
        try {
          const report = await alignGallery(supabaseAdmin, parsed.data.propertyId, parsed.data.provider, {
            apply: parsed.data.apply,
          });
          return Response.json(report);
        } catch (error) {
          const { sanitizeMessage } = await import("@/lib/imobibrasil/errors");
          return Response.json({ error: sanitizeMessage(error) }, { status: 500 });
        }
      },
    },
  },
});
