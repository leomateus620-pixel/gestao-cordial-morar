import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Barcode, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { issueBoleto, previewBoleto, reconcileBoleto, type PublicBoleto } from "@/lib/boleto/boletos.functions";
import { addDays, formatCompetencia, todaySaoPaulo } from "@/lib/boleto/rules";
import { brlCents } from "@/lib/format";

type Preview = Awaited<ReturnType<typeof previewBoleto>>;
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function AmbienteSeal({ ambiente }: { ambiente: "sandbox" | "producao" | null }) {
  if (ambiente !== "sandbox") return null;
  return (
    <span className="rounded-full bg-emission-boleto/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emission-boleto">
      Homologação
    </span>
  );
}

export function BoletoConfirmModal({
  contractId,
  competencia,
  onClose,
  onDone,
}: {
  contractId: string;
  competencia: string;
  onClose: () => void;
  onDone: (b: PublicBoleto, mensagem: string) => void;
}) {
  const preview = useServerFn(previewBoleto);
  const issue = useServerFn(issueBoleto);
  const [data, setData] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [novo, setNovo] = useState("");
  const [applied, setApplied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    preview({ data: { contractId, competencia, novoVencimento: applied } })
      .then((p) => alive && setData(p))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Não foi possível montar a prévia."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [contractId, competencia, applied, preview]);

  const needsDate =
    data?.vencimento && !data.vencimento.ok && (data.vencimento.code === "vencimento_passado" || applied);
  const today = todaySaoPaulo();

  async function confirm() {
    if (!data?.ok || !data.ambiente || sending) return;
    setSending(true);
    setError(null);
    try {
      const out = await issue({
        data: {
          contractId,
          competencia,
          novoVencimento: applied,
          expectedTotalCentavos: data.totalCentavos,
          expectedAmbiente: data.ambiente,
        },
      });
      const b = out.boleto;
      const msg =
        b.estado === "registrado"
          ? b.pdfEstado === "pronto"
            ? "Boleto registrado."
            : "Boleto registrado. O PDF ficou pendente."
          : b.estado === "incerto"
            ? "O Sicredi não confirmou a tempo. Confira antes de qualquer novo envio."
            : b.estado === "rejeitado"
              ? (b.ultimoErro ?? "O Sicredi recusou o boleto.")
              : out.reaproveitado
                ? "Já existe um boleto para esta competência."
                : "Boleto em processamento.";
      onDone(b, msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível emitir o boleto.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Barcode className="size-5 text-emission-boleto" />
            Boleto de {formatCompetencia(competencia)}
            <AmbienteSeal ambiente={data?.ambiente ?? null} />
          </DialogTitle>
          <DialogDescription>
            Confira os valores. O título é registrado no Sicredi uma única vez.
          </DialogDescription>
        </DialogHeader>
        {loading && !data ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Montando a prévia…
          </div>
        ) : data ? (
          <div className="space-y-4 text-sm">
            {data.ambiente === "sandbox" && (
              <p className="rounded-lg bg-emission-boleto/10 p-3 text-xs text-emission-boleto">
                Ambiente de homologação do Sicredi: o boleto não tem valor de cobrança e não deve ser enviado ao inquilino.
              </p>
            )}
            <section className="rounded-lg border p-3">
              {data.linhas.map((l, i) => (
                <div key={i} className="flex justify-between gap-3 py-0.5">
                  <span className="text-muted-foreground">{l.rotulo}</span>
                  <span className="font-mono tabular-nums">{brlCents(l.centavos / 100)}</span>
                </div>
              ))}
              <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
                <span>Total do inquilino</span>
                <span className="font-mono tabular-nums">{brlCents(data.totalCentavos / 100)}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {data.fonte === "recibo" ? "Valores do recibo emitido nesta competência." : "Valores do contrato e ajustes recorrentes."}
              </p>
            </section>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Pagador</dt>
              <dd>{data.pagador ? `${data.pagador.nome} · ${data.pagador.documento} · ${data.pagador.cidadeUf}` : "Incompleto"}</dd>
              <dt className="text-muted-foreground">Vencimento</dt>
              <dd>
                {data.vencimento?.ok
                  ? `${br(data.vencimento.vencimento)}${data.vencimento.alterado ? ` (contrato: ${br(data.vencimento.original)})` : ""}`
                  : data.vencimento
                    ? `${br(data.vencimento.original)} (já passou)`
                    : "—"}
              </dd>
              <dt className="text-muted-foreground">Juros e multa</dt>
              <dd>{data.encargosAtivos ? "Instruções enviadas ao banco a partir do dia seguinte" : "Desligados"}</dd>
            </dl>
            {needsDate && (
              <div className="rounded-lg border border-destructive/40 p-3">
                <Label htmlFor="boleto-novo-vencimento" className="text-xs">
                  Nova data de vencimento (futura)
                </Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    id="boleto-novo-vencimento"
                    type="date"
                    min={addDays(today, 1)}
                    max={addDays(today, 120)}
                    value={novo}
                    onChange={(e) => setNovo(e.target.value)}
                  />
                  <Button variant="outline" disabled={!novo || loading} onClick={() => setApplied(novo)}>
                    Usar data
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">A alteração fica registrada no histórico do boleto.</p>
              </div>
            )}
            {(data.bloqueios.length > 0 || data.pendencias.length > 0) && (
              <ul role="alert" className="space-y-1 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                {data.bloqueios.map((b) => (
                  <li key={b} className="flex gap-1">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                    {b}
                  </li>
                ))}
                {data.pendencias.map((p) => (
                  <li key={p.campo} className="flex gap-1">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                    Falta {p.campo} — corrija em {p.tela}.
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Cancelar
          </Button>
          <Button
            onClick={() => void confirm()}
            disabled={!data?.ok || sending || loading}
            className="bg-emission-boleto text-emission-contrast hover:bg-emission-boleto/90"
          >
            {sending ? <Loader2 className="animate-spin" /> : <Barcode />}
            {sending ? "Registrando…" : data?.ambiente === "sandbox" ? "Emitir em homologação" : "Emitir boleto"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BoletoReconcileModal({
  boleto,
  onClose,
  onDone,
}: {
  boleto: PublicBoleto;
  onClose: () => void;
  onDone: (b: PublicBoleto, mensagem: string) => void;
}) {
  const reconcile = useServerFn(reconcileBoleto);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run(liberar: boolean) {
    setBusy(true);
    try {
      const out = await reconcile({ data: { id: boleto.id, liberarMotivo: liberar ? motivo : null } });
      if (out.boleto.estado !== "incerto" && out.boleto.estado !== "enviando") onDone(out.boleto, out.mensagem);
      else setMsg(out.mensagem);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não foi possível conferir.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Resultado incerto <AmbienteSeal ambiente={boleto.ambiente} />
          </DialogTitle>
          <DialogDescription>
            O Sicredi não confirmou o registro. Nada é reenviado automaticamente: confira primeiro.
          </DialogDescription>
        </DialogHeader>
        <Button variant="outline" disabled={busy} onClick={() => void run(false)}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Conferir no Sicredi
        </Button>
        <div className="space-y-1">
          <Label htmlFor="boleto-motivo" className="text-xs">
            Tenho certeza de que não foi registrado (motivo)
          </Label>
          <Textarea id="boleto-motivo" maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <Button variant="destructive" size="sm" disabled={busy || motivo.trim().length < 10} onClick={() => void run(true)}>
            Liberar para novo envio
          </Button>
        </div>
        {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
      </DialogContent>
    </Dialog>
  );
}
