import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Receipt } from "lucide-react";
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
import { useRentalNfse } from "@/hooks/useRentalNfse";
import type { NfseEmission } from "@/lib/nfse/nfse.functions";
import type { RentalContractFull } from "@/types/rental";

const STATUS_LABEL: Record<NfseEmission["status"], string> = {
  teste_ok: "Validada (teste)",
  emitida: "Emitida",
  erro: "Não emitida",
  cancelada: "Cancelada",
};

const STATUS_CLASS: Record<NfseEmission["status"], string> = {
  teste_ok: "bg-sky-500/10 text-sky-800",
  emitida: "bg-emerald-500/10 text-emerald-800",
  erro: "bg-amber-500/12 text-amber-900",
  cancelada: "bg-foreground/[0.07] text-foreground/65",
};

function competenceFromContract(contract: RentalContractFull) {
  const base = contract.proximoVencimento ? new Date(contract.proximoVencimento) : new Date();
  const safe = Number.isNaN(base.getTime()) ? new Date() : base;
  return `${safe.getFullYear()}-${String(safe.getMonth() + 1).padStart(2, "0")}-01`;
}

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
  const { emissions, isLoading, emit, isEmitting } = useRentalNfse(contract.id, canEmit);

  const competencia = useMemo(() => competenceFromContract(contract), [contract]);
  const comissao = Number(contract.comissaoMensal ?? 0);
  const semComissao = !comissao || comissao <= 0;
  const tomador = contract.tenant;
  const semDocumento = !tomador?.cpfCnpj;

  if (!canEmit) return null;

  async function confirm() {
    try {
      const result = await emit({ modoTeste, competencia });
      if (result.emission.status !== "erro") setOpen(false);
    } catch {
      // erro já exibido em toast pelo hook
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
                ) : (
                  <CheckCircle2 className="size-3" />
                )}
                {STATUS_LABEL[e.status]}
              </span>
              <span className="text-xs font-semibold text-foreground">
                {formatCompetence(e.competencia)} · {brl(e.valor)}
              </span>
              {e.numeroNfse && (
                <span className="text-[11px] text-foreground/60">Nº {e.numeroNfse}</span>
              )}
              {e.codigoVerificador && (
                <span className="text-[11px] text-foreground/60">
                  Verificador {e.codigoVerificador}
                </span>
              )}
              {e.linkPdf && (
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
              {e.errorMessage && (
                <span className="w-full text-[11px] text-amber-900">{e.errorMessage}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Emitir NFS-e</DialogTitle>
            <DialogDescription>
              A nota é emitida sobre o serviço de administração (comissão), com prestação em Santa
              Rosa/RS.
            </DialogDescription>
          </DialogHeader>

          <dl className="space-y-2 rounded-2xl bg-foreground/[0.04] p-3 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-foreground/60">Valor</dt>
              <dd className="font-bold text-foreground">{brl(comissao)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground/60">Tomador</dt>
              <dd className="text-right font-semibold text-foreground">
                {tomador?.nome ?? "—"}
                {tomador?.cpfCnpj ? ` · ${tomador.cpfCnpj}` : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground/60">Competência</dt>
              <dd className="font-semibold text-foreground">{formatCompetence(competencia)}</dd>
            </div>
          </dl>

          {semDocumento && (
            <p className="rounded-xl bg-amber-500/12 px-3 py-2 text-[11px] font-semibold text-amber-900">
              Cadastre o CPF/CNPJ do locatário principal antes de emitir.
            </p>
          )}

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-foreground/[0.07] px-3 py-2">
            <span className="text-xs">
              <span className="block font-bold text-foreground">Modo teste</span>
              <span className="text-[11px] text-foreground/60">
                Valida na prefeitura sem emitir a nota de verdade.
              </span>
            </span>
            <Switch checked={modoTeste} onCheckedChange={setModoTeste} />
          </label>

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
              disabled={isEmitting || semDocumento}
              onClick={() => void confirm()}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {isEmitting && <Loader2 className="size-3.5 animate-spin" />}
              {modoTeste ? "Validar em modo teste" : "Emitir nota"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
