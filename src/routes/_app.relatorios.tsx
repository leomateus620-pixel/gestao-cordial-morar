import { createFileRoute } from "@tanstack/react-router";
import { useApp, useFiltered } from "@/store/app-store";
import { SectionHeader } from "@/components/section-header";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_app/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const atendimentos = useFiltered(useApp((s) => s.atendimentos));
  const corretores = useFiltered(useApp((s) => s.corretores));
  const imoveis = useFiltered(useApp((s) => s.imoveis));
  const contratos = useFiltered(useApp((s) => s.contratos));

  const fechados = atendimentos.filter((a) => a.status === "Fechado").length;
  const total = atendimentos.length;
  const conversao = total ? Math.round((fechados / total) * 100) : 0;

  const venda = contratos.filter((c) => c.tipo === "Venda").length;
  const aluguel = contratos.filter((c) => c.tipo === "Aluguel").length;

  const bairros = imoveis.reduce<Record<string, number>>((acc, i) => {
    acc[i.bairro] = (acc[i.bairro] ?? 0) + 1;
    return acc;
  }, {});
  const topBairros = Object.entries(bairros).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const ranking = [...corretores].sort((a, b) => b.comissaoMes - a.comissaoMes);

  return (
    <>
      <section className="glass-panel mb-4 rounded-3xl p-5">
        <SectionHeader title="Conversão de atendimentos" />
        <div className="flex items-end gap-3">
          <span className="font-mono text-4xl font-bold text-primary">{conversao}%</span>
          <span className="pb-1 text-[11px] text-foreground/55">{fechados} de {total} fechados</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/50">
          <div className="h-full rounded-full bg-primary" style={{ width: `${conversao}%` }} />
        </div>
      </section>

      <section className="glass-panel mb-4 rounded-3xl p-5">
        <SectionHeader title="Mix venda × aluguel" />
        <div className="flex h-3 overflow-hidden rounded-full">
          <div className="bg-primary" style={{ flex: venda || 1 }} />
          <div className="bg-amber-300" style={{ flex: aluguel || 1 }} />
        </div>
        <div className="mt-3 flex justify-between text-[11px] text-foreground/60">
          <span><span className="mr-1 inline-block size-2 rounded-full bg-primary" />Vendas: {venda}</span>
          <span><span className="mr-1 inline-block size-2 rounded-full bg-amber-300" />Aluguéis: {aluguel}</span>
        </div>
      </section>

      <section className="mb-4">
        <SectionHeader title="Ranking de corretores" />
        <div className="space-y-2">
          {ranking.map((c, idx) => (
            <div key={c.id} className="glass-panel flex items-center gap-3 rounded-2xl p-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/12 font-mono text-xs font-bold text-primary">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.nome}</p>
                <p className="text-[10px] text-foreground/55">{c.contratosFechados} contratos</p>
              </div>
              <p className="font-mono text-xs font-bold text-primary">{brl(c.comissaoMes, { compact: true })}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title="Top bairros" />
        <div className="glass-panel divide-y divide-white/50 rounded-2xl">
          {topBairros.map(([bairro, qtd]) => (
            <div key={bairro} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="font-medium">{bairro}</span>
              <span className="font-mono text-xs text-foreground/60">{qtd} imóveis</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}