import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EquipePeriodo = "mes" | "ultimos_30" | "trimestre" | "ano";
export type EquipeAgencyFilter = "todas" | "cordial" | "morar";

export type EquipePerformanceRow = {
  corretorId: string;
  nome: string;
  primeiroNome: string;
  atendimentos: number;
  contratos: number;
  agenciamentos: number;
  conversao: number;
};

export type EquipePerformanceResult = {
  periodo: EquipePeriodo;
  periodoInicio: string;
  rows: EquipePerformanceRow[];
  totals: {
    atendimentos: number;
    contratos: number;
    agenciamentos: number;
    conversaoMedia: number;
  };
};

type EquipeInput = {
  periodo?: EquipePeriodo;
  imobiliaria?: EquipeAgencyFilter;
};

function startOfPeriod(periodo: EquipePeriodo): Date {
  const now = new Date();
  const d = new Date(now);
  switch (periodo) {
    case "mes": {
      return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
    }
    case "ultimos_30": {
      d.setDate(d.getDate() - 30);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "trimestre": {
      d.setMonth(d.getMonth() - 3);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "ano": {
      return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
    }
  }
}

function normalizeInput(d: EquipeInput | undefined): {
  periodo: EquipePeriodo;
  imobiliaria: EquipeAgencyFilter;
} {
  const periodo: EquipePeriodo =
    d?.periodo === "ultimos_30" ||
    d?.periodo === "trimestre" ||
    d?.periodo === "ano" ||
    d?.periodo === "mes"
      ? d.periodo
      : "mes";
  const imobiliaria: EquipeAgencyFilter =
    d?.imobiliaria === "cordial" || d?.imobiliaria === "morar" ? d.imobiliaria : "todas";
  return { periodo, imobiliaria };
}

function firstName(nome: string): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "—";
}

export const getEquipePerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: EquipeInput) => d ?? {})
  .handler(async ({ data, context }): Promise<EquipePerformanceResult> => {
    const { periodo, imobiliaria } = normalizeInput(data);
    const inicio = startOfPeriod(periodo);
    const inicioIso = inicio.toISOString();
    const inicioDate = inicioIso.slice(0, 10);

    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    const empty: EquipePerformanceResult = {
      periodo,
      periodoInicio: inicioIso,
      rows: [],
      totals: { atendimentos: 0, contratos: 0, agenciamentos: 0, conversaoMedia: 0 },
    };

    if (!isAdmin) return empty;

    let attQ = context.supabase
      .from("attendances")
      .select("corretor_id, corretor_nome, status, imobiliaria, created_at")
      .gte("created_at", inicioIso);
    if (imobiliaria !== "todas") {
      attQ = attQ.in("imobiliaria", [imobiliaria, "ambas"]);
    }

    let agQ = context.supabase
      .from("agenciamentos")
      .select("corretor_id, corretor_nome, imobiliaria, data_agenciamento")
      .gte("data_agenciamento", inicioDate);
    if (imobiliaria !== "todas") {
      agQ = agQ.in("imobiliaria", [imobiliaria, "ambas"]);
    }

    const [attRes, agRes] = await Promise.all([attQ, agQ]);
    if (attRes.error) throw new Error(attRes.error.message);
    if (agRes.error) throw new Error(agRes.error.message);

    type Bucket = {
      corretorId: string;
      nome: string;
      atendimentos: number;
      contratos: number;
      agenciamentos: number;
    };
    const buckets = new Map<string, Bucket>();

    const keyOf = (id: string | null, nome: string | null) => {
      const trimmedId = (id ?? "").trim();
      const trimmedNome = (nome ?? "").trim();
      if (trimmedId) return trimmedId;
      if (trimmedNome) return `nome::${trimmedNome.toLowerCase()}`;
      return "";
    };

    const bump = (
      id: string | null,
      nome: string | null,
      field: "atendimentos" | "contratos" | "agenciamentos",
    ) => {
      const key = keyOf(id, nome);
      if (!key) return;
      const existing = buckets.get(key) ?? {
        corretorId: key,
        nome: (nome ?? "").trim() || "Sem nome",
        atendimentos: 0,
        contratos: 0,
        agenciamentos: 0,
      };
      existing[field] += 1;
      if (!existing.nome || existing.nome === "Sem nome") {
        const candidate = (nome ?? "").trim();
        if (candidate) existing.nome = candidate;
      }
      buckets.set(key, existing);
    };

    for (const row of attRes.data ?? []) {
      const r = row as { corretor_id: string | null; corretor_nome: string | null; status: string };
      bump(r.corretor_id, r.corretor_nome, "atendimentos");
      if (r.status === "fechado") {
        bump(r.corretor_id, r.corretor_nome, "contratos");
      }
    }
    for (const row of agRes.data ?? []) {
      const r = row as { corretor_id: string | null; corretor_nome: string | null };
      bump(r.corretor_id, r.corretor_nome, "agenciamentos");
    }

    const rows: EquipePerformanceRow[] = Array.from(buckets.values())
      .map((b) => ({
        corretorId: b.corretorId,
        nome: b.nome,
        primeiroNome: firstName(b.nome),
        atendimentos: b.atendimentos,
        contratos: b.contratos,
        agenciamentos: b.agenciamentos,
        conversao:
          b.atendimentos > 0 ? Math.round((b.contratos / b.atendimentos) * 100) : 0,
      }))
      .sort((a, b) => {
        const score = (x: EquipePerformanceRow) =>
          x.atendimentos + x.contratos + x.agenciamentos;
        return score(b) - score(a);
      })
      .slice(0, 6);

    const totals = rows.reduce(
      (acc, r) => {
        acc.atendimentos += r.atendimentos;
        acc.contratos += r.contratos;
        acc.agenciamentos += r.agenciamentos;
        return acc;
      },
      { atendimentos: 0, contratos: 0, agenciamentos: 0 },
    );
    const conversaoMedia =
      totals.atendimentos > 0
        ? Math.round((totals.contratos / totals.atendimentos) * 100)
        : 0;

    return {
      periodo,
      periodoInicio: inicioIso,
      rows,
      totals: { ...totals, conversaoMedia },
    };
  });
