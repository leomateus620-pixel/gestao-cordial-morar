import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { PublicSurveyView } from "@/types/satisfaction";

function getPublicClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const getPublicSurvey = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ token: z.string().min(4).max(64) }).parse(data),
  )
  .handler(async ({ data }): Promise<PublicSurveyView> => {
    const supa = getPublicClient();
    const { data: rows, error } = await supa.rpc("get_satisfaction_survey_by_token", {
      _token: data.token,
    });
    if (error) throw new Error(error.message);
    const row = (rows ?? [])[0];
    if (!row) return { status: "not_found" };
    if (row.status === "respondida") return { status: "already_answered" };
    if (row.status === "expirada" || row.expired) return { status: "expired" };
    return {
      status: "ok",
      surveyId: row.survey_id as string,
      corretorNome: (row.corretor_nome as string) ?? "",
      corretorIniciais: (row.corretor_iniciais as string) ?? "",
      contexto: (row.contexto as string | null) ?? null,
    };
  });

export const submitPublicSurveyResponse = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        token: z.string().min(4).max(64),
        rating: z.number().int().min(1).max(5),
        comentario: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const supa = getPublicClient();
    const { error } = await supa.rpc("submit_satisfaction_response", {
      _token: data.token,
      _rating: data.rating,
      _comentario: data.comentario ?? "",
    });
    if (error) {
      const msg = error.message || "erro";
      if (msg.includes("token_invalido")) return { ok: false, reason: "not_found" as const };
      if (msg.includes("ja_respondida")) return { ok: false, reason: "already_answered" as const };
      if (msg.includes("expirada")) return { ok: false, reason: "expired" as const };
      throw new Error(msg);
    }
    return { ok: true as const };
  });
