import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatPhoneBR,
  getAgenciamentoImobiliariaLabel,
  getAgenciamentoOrigemLabel,
  getAgenciamentoPeriodLabel,
  getAgenciamentoStatusLabel,
  getAgenciamentoTipoLabel,
  getChecklistCompletedCount,
  getChecklistCompletionPercent,
} from "@/services/agenciamentos";
import type {
  Agenciamento,
  AgenciamentoChecklist,
  AgenciamentoFiltersState,
} from "@/types/agenciamento";

export const AGENCIAMENTO_PRINT_ID = "agenciamento-print-report";

const checklistItems: Array<{ key: keyof AgenciamentoChecklist; label: string }> = [
  { key: "fotosHorizontal", label: "Fotos horizontal" },
  { key: "fotosVertical", label: "Fotos vertical" },
  { key: "fotosDrive", label: "Enviar ao Drive" },
  { key: "placaInstalada", label: "Instalar placa" },
  { key: "cadastradoMorar", label: "Cadastrar Morar" },
  { key: "cadastradoCordial", label: "Cadastrar Cordial" },
  { key: "videoRealizado", label: "Gravar vídeo" },
  { key: "validado", label: "Validar cadastro" },
];

function formatFullDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function AgenciamentoPrintReport({
  agenciamentos,
  filters,
  corretorNome,
  trackLabel,
}: {
  agenciamentos: Agenciamento[];
  filters: AgenciamentoFiltersState;
  corretorNome: string;
  trackLabel: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const generatedAt = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const extraFilters: string[] = [];
  if (filters.imobiliaria !== "todas") {
    extraFilters.push(
      `Imobiliária: ${getAgenciamentoImobiliariaLabel(filters.imobiliaria as never)}`,
    );
  }
  if (filters.status !== "todos") {
    extraFilters.push(`Status: ${getAgenciamentoStatusLabel(filters.status)}`);
  }
  if (filters.tipoImovel !== "todos") {
    extraFilters.push(`Tipo: ${getAgenciamentoTipoLabel(filters.tipoImovel)}`);
  }
  if (filters.busca.trim()) {
    extraFilters.push(`Busca: "${filters.busca.trim()}"`);
  }

  if (!mounted) return null;

  return createPortal(
    <div id={AGENCIAMENTO_PRINT_ID} className="hidden print:block" aria-hidden="true">
      <header className="print-report-header">
        <h1>Relação de imóveis captados</h1>
        <dl>
          <div>
            <dt>Corretor</dt>
            <dd>{corretorNome || "—"}</dd>
          </div>
          <div>
            <dt>Período</dt>
            <dd>{getAgenciamentoPeriodLabel(filters.periodo)}</dd>
          </div>
          <div>
            <dt>Trilha</dt>
            <dd>{trackLabel}</dd>
          </div>
          <div>
            <dt>Registros</dt>
            <dd>{agenciamentos.length}</dd>
          </div>
          <div>
            <dt>Gerado em</dt>
            <dd>{generatedAt}</dd>
          </div>
        </dl>
        {extraFilters.length > 0 && (
          <p className="print-report-extra">Filtros: {extraFilters.join(" · ")}</p>
        )}
      </header>

      <ol className="print-report-list">
        {agenciamentos.map((item, index) => {
          const progress = getChecklistCompletionPercent(item.checklist);
          const completed = getChecklistCompletedCount(item.checklist);
          const pending = checklistItems.filter((entry) => !item.checklist[entry.key]);
          const location = [item.bairro, item.cidade].filter(Boolean).join(" • ");
          const codes = [
            item.codigoMorar ? `Morar ${item.codigoMorar}` : null,
            item.codigoCordial ? `Cordial ${item.codigoCordial}` : null,
          ].filter(Boolean);

          return (
            <li key={item.id} className="print-record">
              <div className="print-record-top">
                <span className="print-record-index">{index + 1}</span>
                <div>
                  <h2>
                    {getAgenciamentoTipoLabel(item.tipoImovel)} — {item.endereco}
                  </h2>
                  {location && <p className="print-record-location">{location}</p>}
                </div>
                <span className="print-record-status">{getAgenciamentoStatusLabel(item.status)}</span>
              </div>

              <div className="print-record-grid">
                <Field label="Imobiliária" value={getAgenciamentoImobiliariaLabel(item.imobiliaria)} />
                <Field
                  label="Finalidade"
                  value={
                    item.finalidade === "aluguel"
                      ? "Aluguel"
                      : item.finalidade === "venda"
                        ? "Venda"
                        : "Sem classificação"
                  }
                />
                <Field label="Códigos" value={codes.length > 0 ? codes.join(" · ") : "—"} />
                <Field label="Corretor" value={item.corretorNome || "—"} />
                <Field label="Data" value={formatFullDate(item.dataAgenciamento)} />
                <Field label="Origem" value={getAgenciamentoOrigemLabel(item.origem)} />
                <Field label="Proprietário" value={item.proprietarioNome || "—"} />
                <Field
                  label="Telefone"
                  value={item.proprietarioTelefone ? formatPhoneBR(item.proprietarioTelefone) : "—"}
                />
              </div>

              <div className="print-record-checklist">
                <span className="print-record-checklist-title">
                  Checklist operacional — {completed}/{checklistItems.length} · {progress}%
                </span>
                <span className="print-record-pending">
                  {pending.length === 0
                    ? "Sem pendências"
                    : `Pendências: ${pending.map((entry) => entry.label).join(", ")}`}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <footer className="print-report-footer">
        Gestão Cordial · Relatório de agenciamentos · {corretorNome} ·{" "}
        {getAgenciamentoPeriodLabel(filters.periodo)}
      </footer>
    </div>,
    document.body,
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="print-field">
      <span className="print-field-label">{label}</span>
      <span className="print-field-value">{value}</span>
    </div>
  );
}
