import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { HistoryChange } from "@/lib/imoveis/history-labels";

export type PropertyHistoryEvent = {
  id: string;
  actorName: string;
  actorKind: string;
  category: string;
  title: string;
  summary: string | null;
  changes: HistoryChange[];
  createdAt: string;
  privateHidden: boolean;
};

export type PropertyHistoryInput = {
  propertyId: string;
  before?: { createdAt: string; id: string } | null;
  category?: string | null;
};

/** Linha do tempo do imóvel; dados privados vêm mascarados pelo banco para quem não pode vê-los. */
export const listPropertyHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PropertyHistoryInput) => {
    if (!input?.propertyId || !/^[0-9a-f-]{36}$/i.test(input.propertyId)) throw new Error("Imóvel inválido.");
    return input;
  })
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase as any).rpc("property_history_list", {
      _property_id: data.propertyId,
      _before: data.before?.createdAt ?? null,
      _before_id: data.before?.id ?? null,
      _category: data.category || null,
      _limit: 20,
    });
    if (error) throw new Error("Não foi possível carregar o histórico.");
    const events: PropertyHistoryEvent[] = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      actorName: String(r.actor_name ?? "Sistema"),
      actorKind: String(r.actor_kind ?? "system"),
      category: String(r.category),
      title: String(r.title),
      summary: (r.summary as string | null) ?? null,
      changes: Array.isArray(r.changes) ? (r.changes as HistoryChange[]) : [],
      createdAt: String(r.created_at),
      privateHidden: Boolean(r.private_hidden),
    }));
    return { events, hasMore: events.length === 20 };
  });
