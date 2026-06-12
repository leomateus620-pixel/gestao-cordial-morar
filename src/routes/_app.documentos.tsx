import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileCheck2, FileText, UserRound } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { SectionHeader } from "@/components/section-header";
import { StatusBadge } from "@/components/status-badge";
import { useApp, useFiltered } from "@/store/app-store";

const filters = ["Todos", "Contrato", "Vistoria", "Proposta", "Cadastro"] as const;

export const Route = createFileRoute("/_app/documentos")({
  head: () => ({ meta: [{ title: "Documentos — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("Todos");
  const documentos = useFiltered(useApp((s) => s.documentos));
  const list = documentos.filter((d) => filter === "Todos" || d.categoria === filter);
  const pendentes = documentos.filter((d) => d.status === "Pendente").length;
  const assinados = documentos.filter((d) => d.status === "Assinado").length;

  return (
    <>
      <section className="mb-5 grid grid-cols-3 gap-3">
        <KpiCard
          label="Arquivos"
          value={documentos.length.toString()}
          tone="primary"
          delta="total"
        />
        <KpiCard label="Assinados" value={assinados.toString()} delta="ok" accent="up" />
        <KpiCard label="Pendentes" value={pendentes.toString()} delta="ação" accent="down" />
      </section>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {filters.map((item) => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            className={
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition " +
              (filter === item
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                : "glass-panel text-foreground/65")
            }
          >
            {item}
          </button>
        ))}
      </div>

      <section>
        <SectionHeader title="Central de documentos" />
        <div className="space-y-2">
          {list.map((documento) => (
            <article key={documento.id} className="glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    {documento.status === "Assinado" ? (
                      <FileCheck2 className="size-5" />
                    ) : (
                      <FileText className="size-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{documento.titulo}</p>
                    <p className="text-[11px] text-foreground/55">
                      {documento.categoria} ·{" "}
                      {new Date(documento.atualizadoEm).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </div>
                <StatusBadge status={documento.status} />
              </div>
              <p className="mt-3 flex items-center gap-1 border-t border-white/40 pt-3 text-[11px] text-foreground/60">
                <UserRound className="size-3" /> Responsável: {documento.responsavel}
              </p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
