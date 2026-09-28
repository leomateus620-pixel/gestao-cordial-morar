import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { describeAttendanceHistoryEvent } from "@/services/atendimentos";
import {
  atendimentoFinalidadeLabel,
  atendimentoOrigemLabel,
  atendimentoStatusLabel,
  attendanceEventLabel,
  pipelineStageLabel,
  type AtendimentoFinalidade,
  type AtendimentoStatus,
  type OrigemLeadAtendimento,
  type PipelineStage,
} from "@/types/atendimento";
import type {
  HistoryReportAttendance,
  HistoryReportEvent,
  HistoryReportResult,
} from "@/lib/attendances/history-report.functions";

export const ATENDIMENTO_HISTORY_PRINT_ID = "atendimento-history-print-report";

export type HistoryPrintPayload = {
  mode: "corretor" | "cliente";
  targetName: string;
  periodLabel: string;
  contact?: { telefone?: string; email?: string | null; corretorAtual?: string | null };
  result: HistoryReportResult;
};

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

const stage = (a: HistoryReportAttendance) =>
  a.pipelineStage ? pipelineStageLabel(a.pipelineStage as PipelineStage) : "—";

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
}

function eventText(e: HistoryReportEvent) {
  return describeAttendanceHistoryEvent({
    eventType: e.eventType,
    description: e.description,
    previousValue: e.previousValue,
    newValue: e.newValue,
  });
}

export function AtendimentoHistoryPrintReport({ payload }: { payload: HistoryPrintPayload }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const { result, mode } = payload;
  const generatedAt = fmtDateTime(new Date().toISOString());
  const eventsBy = new Map<string, HistoryReportEvent[]>();
  for (const e of result.events) {
    const list = eventsBy.get(e.attendanceId) ?? [];
    list.push(e);
    eventsBy.set(e.attendanceId, list);
  }
  const attendanceById = new Map(result.attendances.map((a) => [a.id, a]));
  const visibleEvents = result.events.filter((e) => attendanceById.has(e.attendanceId));

  const byStage = new Map<string, number>();
  for (const a of result.attendances) byStage.set(stage(a), (byStage.get(stage(a)) ?? 0) + 1);
  const opened = result.assignments.filter((a) => a.firstOpenedAt);
  const times = result.assignments
    .map((a) => a.responseTimeSeconds)
    .filter((v): v is number => typeof v === "number");
  const avg = times.length ? Math.round(times.reduce((s, v) => s + v, 0) / times.length) : null;

  return createPortal(
    <div id={ATENDIMENTO_HISTORY_PRINT_ID} className="hidden print:block" aria-hidden="true">
      <header className="print-report-header">
        <h1>{mode === "corretor" ? "Histórico do corretor" : "Histórico do cliente"}</h1>
        <dl>
          <div>
            <dt>{mode === "corretor" ? "Corretor" : "Cliente"}</dt>
            <dd>{payload.targetName}</dd>
          </div>
          {mode === "cliente" && payload.contact?.telefone && (
            <div>
              <dt>Telefone</dt>
              <dd>{payload.contact.telefone}</dd>
            </div>
          )}
          {mode === "cliente" && payload.contact?.email && (
            <div>
              <dt>E-mail</dt>
              <dd>{payload.contact.email}</dd>
            </div>
          )}
          {mode === "cliente" && (
            <div>
              <dt>Corretor atual</dt>
              <dd>{payload.contact?.corretorAtual || "A definir"}</dd>
            </div>
          )}
          <div>
            <dt>Período</dt>
            <dd>{payload.periodLabel}</dd>
          </div>
          <div>
            <dt>Atendimentos</dt>
            <dd>{result.attendances.length}</dd>
          </div>
          <div>
            <dt>Eventos</dt>
            <dd>{visibleEvents.length}</dd>
          </div>
          <div>
            <dt>Gerado em</dt>
            <dd>{generatedAt}</dd>
          </div>
        </dl>
        {mode === "corretor" && (
          <p className="print-report-extra">
            Por etapa:{" "}
            {[...byStage.entries()].map(([k, v]) => `${k} ${v}`).join(" · ") || "—"}
            {result.assignments.length > 0 &&
              ` — Encaminhamentos: ${result.assignments.length} · abertos ${opened.length}` +
                (avg !== null ? ` · tempo médio de resposta ${formatDuration(avg)}` : "")}
          </p>
        )}
        {result.truncated && (
          <p className="print-report-extra">
            Atenção: o relatório atingiu o limite de 2.000 eventos; os mais recentes podem não aparecer.
          </p>
        )}
      </header>

      {result.attendances.length === 0 ? (
        <p>Nenhum atendimento encontrado no período.</p>
      ) : mode === "corretor" ? (
        <ol className="print-report-list">
          {result.attendances.map((a, index) => (
            <li key={a.id} className="print-record">
              <AttendanceHead a={a} index={index + 1} />
              <Timeline events={eventsBy.get(a.id) ?? []} />
            </li>
          ))}
        </ol>
      ) : (
        <>
          <ol className="print-report-list">
            {result.attendances.map((a, index) => (
              <li key={a.id} className="print-record">
                <AttendanceHead a={a} index={index + 1} />
              </li>
            ))}
          </ol>
          <section className="print-record">
            <h2 className="print-history-title">Linha do tempo</h2>
            <Timeline
              events={visibleEvents}
              label={(e) => {
                const a = attendanceById.get(e.attendanceId);
                return result.attendances.length > 1 && a
                  ? `#${result.attendances.indexOf(a) + 1}`
                  : undefined;
              }}
            />
          </section>
        </>
      )}

      <footer className="print-report-footer">
        Gestão Cordial · Histórico de atendimentos · {payload.targetName} · {payload.periodLabel}
      </footer>
    </div>,
    document.body,
  );
}

function AttendanceHead({ a, index }: { a: HistoryReportAttendance; index: number }) {
  return (
    <>
      <div className="print-record-top">
        <span className="print-record-index">{index}</span>
        <div>
          <h2>{a.clienteNome || "Sem nome"}</h2>
          <p className="print-record-location">
            {[a.telefone, a.email].filter(Boolean).join(" • ")}
          </p>
        </div>
        <span className="print-record-status">{stage(a)}</span>
      </div>
      <div className="print-record-grid">
        <Field label="Status" value={atendimentoStatusLabel(a.status as AtendimentoStatus)} />
        <Field
          label="Finalidade"
          value={a.finalidade ? atendimentoFinalidadeLabel(a.finalidade as AtendimentoFinalidade) : "—"}
        />
        <Field label="Origem" value={a.origem ? atendimentoOrigemLabel(a.origem as OrigemLeadAtendimento) : "—"} />
        <Field label="Criado em" value={fmtDate(a.createdAt)} />
        <Field label="Corretor" value={a.corretorNome || "A definir"} />
        <Field label="Imóvel" value={a.imovelCodigo || a.imovelDescricao || "—"} />
        <Field label="Próximo retorno" value={a.proximoRetorno ? fmtDateTime(a.proximoRetorno) : "—"} />
        <Field label="Atualizado em" value={fmtDate(a.updatedAt)} />
      </div>
      {a.observacoes?.trim() && <p className="print-history-notes">Notas: {a.observacoes.trim()}</p>}
    </>
  );
}

function Timeline({
  events,
  label,
}: {
  events: HistoryReportEvent[];
  label?: (e: HistoryReportEvent) => string | undefined;
}) {
  if (events.length === 0)
    return <p className="print-history-empty">Sem movimentações registradas no período.</p>;
  return (
    <ul className="print-history-timeline">
      {events.map((e) => (
        <li key={e.id}>
          <span className="print-history-date">{fmtDateTime(e.createdAt)}</span>
          <span>
            {label?.(e) && <strong>{label(e)} </strong>}
            <strong>{attendanceEventLabel(e.eventType)}:</strong> {eventText(e)}
            {e.actorName && <em> — {e.actorName}</em>}
          </span>
        </li>
      ))}
    </ul>
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
