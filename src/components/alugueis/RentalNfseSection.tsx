import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Loader2, Receipt, RefreshCw, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRentalNfse, useRentalNfsePreview } from "@/hooks/useRentalNfse";
import type { NfseEmission } from "@/lib/nfse/nfse.functions";
import { competenciaFromVencimento, currentYmSaoPaulo } from "@/lib/nfse/emission-rules";
import type { RentalContractFull } from "@/types/rental";

const STATUS_LABEL: Record<NfseEmission["status"], string> = {
  teste_ok: "Validada (teste)",
  emitida: "Emitida",
  erro: "Não emitida",
  cancelada: "Cancelada",
  processando: "Enviando…",
  incerto: "Aguardando conferência",
};

const STATUS_CLASS: Record<NfseEmission["status"], string> = {
  teste_ok: "bg-sky-500/10 text-sky-800",
  emitida: "bg-emerald-500/10 text-emerald-800",
  erro: "bg-amber-500/12 text-amber-900",
  cancelada: "bg-foreground/[0.07] text-foreground/65",
  processando: "bg-primary/10 text-primary",
  incerto: "bg-orange-500/15 text-orange-900",
};

function formatCompetence(value: string) {
  return `${value.slice(5, 7)}/${value.slice(0, 4)}`;
}

export function RentalNfseSection({
  contract,
  canEmit,
  sectionId,
}: {
  contract: RentalContractFull;
  canEmit: boolean;
  sectionId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [modoTeste, setModoTeste] = useState(true);
  const [confirmReal, setConfirmReal] = useState(false);
  const [competencia, setCompetencia] = useState(() =>
    competenciaFromVencimento(contract.proximoVencimento, currentYmSaoPaulo()),
  );
  const { emissions, isLoading, emit, isEmitting, reconcile, reconcilingId } = useRentalNfse(
    contract.id,
    canEmit,
  );
  const preview = useRentalNfsePreview(contract.id, competencia, open && canEmit);
  const p = preview.data;
  const travadoEmTeste = p?.configModoTeste ?? true;

  useEffect(() => {
    if (p?.configModoTeste) setModoTeste(true);
  }, [p?.configModoTeste]);
  useEffect(() => {
    if (!open) setConfirmReal(false);
  }, [open]);

  const comissao = Number(contract.comissaoMensal ?? 0);
  const semComissao = !comissao || comissao <= 0;

  if (!canEmit) return null;

  const existentesReais = (p?.existentes ?? []).filter(
    (e) => !e.modoTeste && ["emitida", "processando", "incerto"].includes(e.status),
  );

  async function send() {
    if (!modoTeste && !confirmReal) {
      setConfirmReal(true);
      return;
    }
    try {
      const result = await emit({
        modoTeste,
        competencia,
        confirmarEmissaoReal: !modoTeste ? true : undefined,
      });
      if (result.emission && result.emission.status !== "erro") setOpen(false);
    } catch {
      // erro exibido pelo hook
    } finally {
      setConfirmReal(false);
    }
  }

  return (
    <section
      id={sectionId}
      className="rounded-3xl border border-foreground/[0.07] bg-white/70 p-5 backdrop-blur-xl"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-primary/8 text-primary">
            <Receipt className="size-3.5" />
          </span>
          <div>
            <h3 className="text-sm font-extrabold text-foreground">NFS-e (Santa Rosa)</h3>
            <p className="text-[11px] text-foreground/60">
              Nota do serviço de administração — valor da comissão, não do aluguel.
            </p>
          </div>
        </div>

        {semComissao ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/12 px-3 py-1.5 text-[11px] font-bold text-amber-900">
            <AlertTriangle className="size-3.5" />
            Informe a comissão mensal no contrato
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm transition hover:brightness-105"
          >
            <Receipt className="size-3.5" />
            Emitir NFS-e
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-foreground/55">Carregando histórico…</p>
      ) : emissions.length === 0 ? (
        <p className="text-xs text-foreground/55">Nenhuma NFS-e registrada para este contrato.</p>
      ) : (
        <ul className="space-y-2">
          {emissions.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-foreground/[0.06] bg-white/70 px-3 py-2"
            >
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                  STATUS_CLASS[e.status],
                )}
              >
                {e.status === "erro" ? (
                  <AlertTriangle className="size-3" />
                ) : e.status === "processando" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : e.status === "incerto" ? (
                  <Clock className="size-3" />
                ) : (
                  <CheckCircle2 className="size-3" />
                )}
                {STATUS_LABEL[e.status]}
              </span>
              {e.modoTeste && (
                <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-bold text-foreground/65">
                  Teste — sem valor fiscal
                </span>
              )}
              <span className="text-xs font-semibold text-foreground">
                {formatCompetence(e.competencia)} · {brl(e.valor)}
              </span>
              {!e.modoTeste && e.numeroNfse && (
                <span className="text-[11px] text-foreground/60">
                  Nº {e.numeroNfse}
                  {e.serieNfse ? ` · série ${e.serieNfse}` : ""}
                </span>
              )}
              {!e.modoTeste && e.codigoVerificador && (
                <span className="text-[11px] text-foreground/60">Verificador {e.codigoVerificador}</span>
              )}
              {!e.modoTeste && e.linkPdf && (
                <a
                  href={e.linkPdf}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-primary"
                >
                  <ExternalLink className="size-3" />
                  Abrir nota
                </a>
              )}
              {e.status === "incerto" && e.identificador && (
                <button
                  type="button"
                  disabled={reconcilingId === e.id}
                  onClick={() => reconcile(e.id)}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-foreground/10 px-3 py-1 text-[11px] font-bold text-foreground disabled:opacity-50"
                >
                  {reconcilingId === e.id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3" />
                  )}
                  Conferir na prefeitura
                </button>
              )}
              {e.errorCodes.length > 0 && (
                <span className="w-full text-[11px] font-semibold text-amber-900">
                  Códigos: {e.errorCodes.join(", ")}
                </span>
              )}
              {e.errorMessage && (
                <span className="w-full text-[11px] text-amber-900">{e.errorMessage}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Emitir NFS-e</DialogTitle>
            <DialogDescription>
              A nota é emitida sobre o serviço de administração (comissão), com prestação em Santa
              Rosa/RS.
            </DialogDescription>
          </DialogHeader>

          <label className="flex items-center justify-between gap-3 text-xs">
            <span className="font-bold text-foreground">Competência</span>
            <input
              type="month"
              value={competencia}
              onChange={(ev) => ev.target.value && setCompetencia(ev.target.value)}
              className="rounded-xl border border-foreground/[0.1] bg-white/80 px-3 py-1.5 text-xs"
            />
          </label>

          <dl className="space-y-2 rounded-2xl bg-foreground/[0.04] p-3 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-foreground/60">Valor</dt>
              <dd className="font-bold text-foreground">{brl(p?.valor ?? comissao)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground/60">Tomador</dt>
              <dd className="text-right font-semibold text-foreground">
                {p?.tomadorNome ?? contract.tenant?.nome ?? "—"}
                {p?.tomadorDocumento ? ` · ${p.tomadorDocumento}` : ""}
              </dd>
            </div>
          </dl>

          {preview.isLoading ? (
            <p className="text-xs text-foreground/55">Conferindo os dados…</p>
          ) : preview.isError ? (
            <p className="rounded-xl bg-amber-500/12 px-3 py-2 text-[11px] font-semibold text-amber-900">
              {preview.error instanceof Error ? preview.error.message : "Não foi possível conferir os dados."}
            </p>
          ) : p ? (
            <ul className="space-y-1 text-[11px]">
              {p.checklist.map((c) => (
                <li key={c.key} className="flex items-start gap-1.5">
                  {c.ok ? (
                    <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-700" />
                  ) : c.level === "bloqueia" ? (
                    <XCircle className="mt-0.5 size-3 shrink-0 text-destructive" />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-700" />
                  )}
                  <span>
                    <span className="font-semibold">{c.label}</span>
                    {c.detail ? <span className="text-foreground/60"> — {c.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {existentesReais.length > 0 && (
            <p className="rounded-xl bg-orange-500/12 px-3 py-2 text-[11px] font-semibold text-orange-900">
              Já existe nota real para esta competência ({STATUS_LABEL[existentesReais[0]!.status]}). Uma
              nova nota real não será aceita.
            </p>
          )}

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-foreground/[0.07] px-3 py-2">
            <span className="text-xs">
              <span className="block font-bold text-foreground">Modo teste</span>
              <span className="text-[11px] text-foreground/60">
                {travadoEmTeste
                  ? "Travado: o modo teste está ligado nas Integrações. Desligue lá para emitir nota real."
                  : "Valida na prefeitura sem emitir a nota de verdade."}
              </span>
            </span>
            <Switch
              checked={modoTeste}
              disabled={travadoEmTeste}
              onCheckedChange={(v) => {
                setModoTeste(v);
                setConfirmReal(false);
              }}
            />
          </label>

          {confirmReal && !modoTeste && (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[11px] font-bold text-destructive">
              Emitir NOTA REAL com valor fiscal — {brl(p?.valor ?? comissao)} para{" "}
              {p?.tomadorNome ?? "o locatário"}, competência {formatCompetence(competencia)}. Clique de
              novo para confirmar.
            </p>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full px-4 py-2 text-xs font-bold text-foreground/65 hover:bg-foreground/[0.05]"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isEmitting || !p || p.bloqueado || (!modoTeste && existentesReais.length > 0)}
              onClick={() => void send()}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold disabled:opacity-50",
                confirmReal && !modoTeste
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {isEmitting && <Loader2 className="size-3.5 animate-spin" />}
              {modoTeste ? "Validar em modo teste" : confirmReal ? "Confirmar nota real" : "Emitir nota real"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
