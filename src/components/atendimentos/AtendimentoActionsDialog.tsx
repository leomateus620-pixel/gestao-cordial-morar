import { useEffect, useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  atendimentoProximoPassoOptions,
  type Atendimento,
  type ProximoPassoAtendimento,
} from "@/types/atendimento";

export type AtendimentoActionKind =
  | "vincular-corretor"
  | "criar-visita"
  | "criar-retorno"
  | "registrar-historico"
  | "motivo-perda";

export type AtendimentoActionPayload =
  | { kind: "vincular-corretor"; corretorId: string; corretorNome: string }
  | {
      kind: "criar-visita";
      data: string;
      hora: string;
      duracaoMin: number;
      local: string;
      observacoes: string;
    }
  | {
      kind: "criar-retorno";
      data: string;
      hora: string;
      proximoPasso: ProximoPassoAtendimento;
    }
  | { kind: "registrar-historico"; texto: string }
  | { kind: "motivo-perda"; motivoPerda: string };

const motivosComuns = [
  "Sem retorno do cliente",
  "Comprou com outra imobiliária",
  "Fora do orçamento",
  "Mudou de ideia / desistiu",
  "Sem imóvel compatível",
  "Outro",
];

const inputClass =
  "w-full rounded-xl border border-foreground/12 bg-white/72 px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/15";

export function AtendimentoActionsDialog({
  kind,
  atendimento,
  open,
  onOpenChange,
  onSubmit,
  brokerOptions = [],
}: {
  kind: AtendimentoActionKind | null;
  atendimento: Atendimento;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: AtendimentoActionPayload) => Promise<void> | void;
  brokerOptions?: Array<{ id: string; nome: string }>;
}) {
  if (!kind) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-3xl border-white/70 bg-background/96 shadow-2xl backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight">
            {titleFor(kind)}
          </DialogTitle>
          <DialogDescription className="text-xs text-foreground/60">
            {descriptionFor(kind, atendimento.clienteNome)}
          </DialogDescription>
        </DialogHeader>
        <FormBody
          kind={kind}
          atendimento={atendimento}
          brokerOptions={brokerOptions}
          onSubmit={async (payload) => {
            await onSubmit(payload);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function titleFor(kind: AtendimentoActionKind) {
  switch (kind) {
    case "vincular-corretor":
      return "Vincular corretor";
    case "criar-visita":
      return "Criar visita";
    case "criar-retorno":
      return "Criar tarefa de retorno";
    case "registrar-historico":
      return "Registrar histórico";
    case "motivo-perda":
      return "Marcar motivo de perda";
  }
}

function descriptionFor(kind: AtendimentoActionKind, nome: string) {
  switch (kind) {
    case "vincular-corretor":
      return `Defina quem assume o atendimento de ${nome}.`;
    case "criar-visita":
      return `Cria um compromisso na agenda vinculado a este atendimento.`;
    case "criar-retorno":
      return `Programa o próximo contato. O status vai para Aguardando retorno.`;
    case "registrar-historico":
      return `A anotação fica no histórico do atendimento de ${nome}.`;
    case "motivo-perda":
      return `Marca o atendimento como perdido e registra o motivo.`;
  }
}

function FormBody({
  kind,
  atendimento,
  onSubmit,
  onCancel,
  brokerOptions,
}: {
  kind: AtendimentoActionKind;
  atendimento: Atendimento;
  onSubmit: (payload: AtendimentoActionPayload) => Promise<void>;
  onCancel: () => void;
  brokerOptions: Array<{ id: string; nome: string }>;
}) {
  // Local state per-kind
  const [corretorId, setCorretorId] = useState(
    atendimento.corretorId && atendimento.corretorId !== "a_definir" ? atendimento.corretorId : "",
  );
  const [data, setData] = useState(toDateInput(atendimento.proximoRetorno) || todayInput());
  const [hora, setHora] = useState(toTimeInput(atendimento.proximoRetorno) || "09:00");
  const [duracaoMin, setDuracaoMin] = useState("60");
  const [local, setLocal] = useState(atendimento.bairroInteresse ?? "");
  const [observacoes, setObservacoes] = useState("");
  const [proximoPasso, setProximoPasso] = useState<ProximoPassoAtendimento>(
    atendimento.proximoPasso ?? "ligar_cliente",
  );
  const [texto, setTexto] = useState("");
  const [motivoPreset, setMotivoPreset] = useState(motivosComuns[0]);
  const [motivoLivre, setMotivoLivre] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sortedBrokerOptions = [...brokerOptions]
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map((broker) => ({ id: broker.id, label: broker.nome }));

  useEffect(() => {
    setError(null);
  }, [kind]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      setSaving(true);
      if (kind === "vincular-corretor") {
        if (!corretorId) throw new Error("Selecione um corretor.");
        const option = sortedBrokerOptions.find((o) => o.id === corretorId);
        await onSubmit({
          kind,
          corretorId,
          corretorNome: option?.label ?? corretorId,
        });
      } else if (kind === "criar-visita") {
        if (!data) throw new Error("Informe a data.");
        if (!hora) throw new Error("Informe o horário.");
        const d = Number(duracaoMin);
        if (!Number.isFinite(d) || d <= 0) throw new Error("Duração inválida.");
        await onSubmit({ kind, data, hora, duracaoMin: d, local, observacoes });
      } else if (kind === "criar-retorno") {
        if (!data) throw new Error("Informe a data.");
        await onSubmit({ kind, data, hora: hora || "09:00", proximoPasso });
      } else if (kind === "registrar-historico") {
        if (!texto.trim()) throw new Error("Escreva a anotação.");
        await onSubmit({ kind, texto: texto.trim() });
      } else if (kind === "motivo-perda") {
        const motivo = motivoPreset === "Outro" ? motivoLivre.trim() : motivoPreset;
        if (!motivo) throw new Error("Informe o motivo.");
        await onSubmit({ kind, motivoPerda: motivo });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {kind === "vincular-corretor" && (
        <Field label="Corretor">
          <select
            value={corretorId}
            onChange={(e) => setCorretorId(e.target.value)}
            className={inputClass}
          >
            <option value="">Selecione...</option>
            {sortedBrokerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      {kind === "criar-visita" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Data">
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className={inputClass}
                required
              />
            </Field>
            <Field label="Horário">
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className={inputClass}
                required
              />
            </Field>
          </div>
          <Field label="Duração (min)">
            <input
              type="number"
              min={15}
              step={15}
              value={duracaoMin}
              onChange={(e) => setDuracaoMin(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Local">
            <input
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="Endereço ou ponto de encontro"
              className={inputClass}
            />
          </Field>
          <Field label="Observações">
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              className={cn(inputClass, "min-h-16 resize-none")}
            />
          </Field>
        </>
      )}

      {kind === "criar-retorno" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Data do retorno">
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className={inputClass}
                required
              />
            </Field>
            <Field label="Horário (opcional)">
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Próximo passo">
            <select
              value={proximoPasso}
              onChange={(e) => setProximoPasso(e.target.value as ProximoPassoAtendimento)}
              className={inputClass}
            >
              {atendimentoProximoPassoOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      {kind === "registrar-historico" && (
        <Field label="Anotação">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={4}
            placeholder="Ex.: Cliente pediu para retornar na sexta após as 14h."
            className={cn(inputClass, "min-h-24 resize-none")}
            required
          />
        </Field>
      )}

      {kind === "motivo-perda" && (
        <>
          <Field label="Motivo">
            <select
              value={motivoPreset}
              onChange={(e) => setMotivoPreset(e.target.value)}
              className={inputClass}
            >
              {motivosComuns.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          {motivoPreset === "Outro" && (
            <Field label="Descreva o motivo">
              <textarea
                value={motivoLivre}
                onChange={(e) => setMotivoLivre(e.target.value)}
                rows={2}
                className={cn(inputClass, "min-h-16 resize-none")}
                required
              />
            </Field>
          )}
        </>
      )}

      {error && (
        <p className="rounded-xl bg-destructive/8 px-3 py-2 text-xs text-destructive">{error}</p>
      )}

      <DialogFooter className="gap-2 pt-2 sm:gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-2xl bg-white/60 px-4 py-2 text-xs font-semibold text-foreground/72 transition hover:bg-white/80"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-2xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-teal-700/25 transition hover:bg-teal-800 disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Confirmar"}
        </button>
      </DialogFooter>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-foreground/56">
        {label}
      </span>
      {children}
    </label>
  );
}

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toDateInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
