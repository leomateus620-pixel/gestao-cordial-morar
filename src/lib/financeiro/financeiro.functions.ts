import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Lancamento } from "@/lib/mock/data";

type Row = {
  id: string;
  user_id: string;
  imobiliaria: string;
  tipo: string;
  categoria: string;
  descricao: string;
  valor: number | string;
  data_competencia: string;
  data_pagamento: string | null;
  status: string;
  origem: string | null;
  origem_id: string | null;
  corretor_id: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};

export type LancamentoInput = {
  imobiliaria: "cordial" | "morar" | "ambas";
  tipo: "entrada" | "saida";
  categoria: string;
  descricao: string;
  valor: number;
  dataCompetencia: string;
  dataPagamento?: string | null;
  status?: "Pago" | "Pendente" | "Atrasado" | "Cancelado";
  origem?: string | null;
  origemId?: string | null;
  corretorId?: string | null;
  observacoes?: string | null;
};

function mapRow(r: Row): Lancamento {
  return {
    id: r.id,
    descricao: r.descricao,
    categoria: r.categoria as Lancamento["categoria"],
    valor: Number(r.valor),
    data: r.data_competencia,
    tipo: r.tipo as Lancamento["tipo"],
    imobiliaria: r.imobiliaria as Lancamento["imobiliaria"],
    status: r.status as Lancamento["status"],
  };
}

function inputToPayload(input: LancamentoInput) {
  const orNull = (v?: string | null) =>
    v !== undefined && v !== null && String(v).trim() ? String(v).trim() : null;
  return {
    imobiliaria: input.imobiliaria,
    tipo: input.tipo,
    categoria: input.categoria.trim(),
    descricao: input.descricao.trim(),
    valor: Number(input.valor),
    data_competencia: input.dataCompetencia,
    data_pagamento: orNull(input.dataPagamento ?? null),
    status: input.status ?? "Pendente",
    origem: orNull(input.origem ?? null),
    origem_id: orNull(input.origemId ?? null),
    corretor_id: orNull(input.corretorId ?? null),
    observacoes: orNull(input.observacoes ?? null),
  };
}

export const listLancamentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Lancamento[]> => {
    const { data, error } = await context.supabase
      .from("financeiro_lancamentos")
      .select("*")
      .is("deleted_at", null)
      .order("data_competencia", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(mapRow);
  });

export const createLancamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: LancamentoInput) => data)
  .handler(async ({ data, context }): Promise<Lancamento> => {
    const { data: row, error } = await context.supabase
      .from("financeiro_lancamentos")
      .insert({ ...inputToPayload(data), user_id: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapRow(row as unknown as Row);
  });

export const updateLancamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; input: LancamentoInput }) => data)
  .handler(async ({ data, context }): Promise<Lancamento> => {
    const { data: row, error } = await context.supabase
      .from("financeiro_lancamentos")
      .update(inputToPayload(data.input))
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapRow(row as unknown as Row);
  });

export const deleteLancamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("financeiro_lancamentos")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
