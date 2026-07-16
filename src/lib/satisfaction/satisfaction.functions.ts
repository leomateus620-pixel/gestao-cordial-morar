import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SatisfactionStats, SatisfactionSurvey } from "@/types/satisfaction";

function generateToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("forbidden");
}

const createSchema = z.object({
  corretor_id: z.string().uuid(),
  client_id: z.string().uuid().nullish(),
  client_nome: z.string().trim().min(1).max(160),
  client_contato: z.string().trim().max(80).nullish(),
  contexto: z.string().trim().max(240).nullish(),
});

export const createSatisfactionSurvey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const token = generateToken();
    const { data: row, error } = await context.supabase
      .from("satisfaction_surveys")
      .insert({
        token,
        corretor_id: data.corretor_id,
        client_id: data.client_id ?? null,
        client_nome: data.client_nome,
        client_contato: data.client_contato ?? null,
        contexto: data.contexto ?? null,
        created_by: context.userId,
      })
      .select("id, token")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string, token: row.token as string };
  });

export const listSatisfactionSurveys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SatisfactionSurvey[]> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("satisfaction_surveys")
      .select(
        "id, token, corretor_id, client_id, client_nome, client_contato, contexto, status, expires_at, responded_at, created_at, profiles:corretor_id(nome, iniciais), satisfaction_responses(rating, comentario)",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => {
      const resp = Array.isArray(row.satisfaction_responses)
        ? row.satisfaction_responses[0]
        : row.satisfaction_responses;
      return {
        id: row.id,
        token: row.token,
        corretor_id: row.corretor_id,
        corretor_nome: row.profiles?.nome ?? "",
        corretor_iniciais: row.profiles?.iniciais ?? "",
        client_id: row.client_id,
        client_nome: row.client_nome,
        client_contato: row.client_contato,
        contexto: row.contexto,
        status: row.status,
        expires_at: row.expires_at,
        responded_at: row.responded_at,
        created_at: row.created_at,
        rating: resp?.rating ?? null,
        comentario: resp?.comentario ?? null,
      };
    });
  });

export const deleteSatisfactionSurvey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("satisfaction_surveys")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSatisfactionStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SatisfactionStats> => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("satisfaction_surveys")
      .select(
        "id, corretor_id, client_nome, status, created_at, responded_at, profiles:corretor_id(nome, iniciais), satisfaction_responses(rating, comentario, created_at)",
      )
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const rows = (data ?? []).map((r: any) => {
      const resp = Array.isArray(r.satisfaction_responses)
        ? r.satisfaction_responses[0]
        : r.satisfaction_responses;
      return {
        id: r.id as string,
        corretor_id: r.corretor_id as string,
        corretor_nome: (r.profiles?.nome ?? "") as string,
        corretor_iniciais: (r.profiles?.iniciais ?? "") as string,
        client_nome: (r.client_nome ?? "") as string,
        status: r.status as string,
        created_at: r.created_at as string,
        rating: (resp?.rating ?? null) as number | null,
        comentario: (resp?.comentario ?? null) as string | null,
        response_at: (resp?.created_at ?? null) as string | null,
      };
    });

    const respondidas = rows.filter((r) => r.rating != null);
    const totalEnviadas = rows.length;
    const totalRespondidas = respondidas.length;
    const taxaResposta = totalEnviadas ? totalRespondidas / totalEnviadas : 0;
    const mediaGeral =
      totalRespondidas > 0
        ? respondidas.reduce((s, r) => s + (r.rating ?? 0), 0) / totalRespondidas
        : 0;

    const byCorretor = new Map<
      string,
      { nome: string; iniciais: string; soma: number; count: number }
    >();
    for (const r of respondidas) {
      const cur = byCorretor.get(r.corretor_id) ?? {
        nome: r.corretor_nome,
        iniciais: r.corretor_iniciais,
        soma: 0,
        count: 0,
      };
      cur.soma += r.rating ?? 0;
      cur.count += 1;
      byCorretor.set(r.corretor_id, cur);
    }
    const porCorretor = Array.from(byCorretor.entries())
      .map(([corretor_id, v]) => ({
        corretor_id,
        corretor_nome: v.nome,
        corretor_iniciais: v.iniciais,
        media: v.count ? v.soma / v.count : 0,
        respostas: v.count,
      }))
      .sort((a, b) => b.media - a.media || b.respostas - a.respostas);

    const byMonth = new Map<string, { soma: number; count: number }>();
    for (const r of respondidas) {
      const d = r.response_at ? new Date(r.response_at) : new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const cur = byMonth.get(key) ?? { soma: 0, count: 0 };
      cur.soma += r.rating ?? 0;
      cur.count += 1;
      byMonth.set(key, cur);
    }
    const evolucao = Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, v]) => ({
        mes,
        media: v.count ? v.soma / v.count : 0,
        respostas: v.count,
      }));

    const comentarios = respondidas
      .filter((r) => r.comentario && r.comentario.trim().length > 0)
      .slice(0, 50)
      .map((r) => ({
        id: r.id,
        corretor_nome: r.corretor_nome,
        client_nome: r.client_nome,
        rating: r.rating ?? 0,
        comentario: r.comentario ?? "",
        created_at: r.response_at ?? r.created_at,
      }));

    return {
      totalEnviadas,
      totalRespondidas,
      taxaResposta,
      mediaGeral,
      porCorretor,
      evolucao,
      comentarios,
    };
  });
