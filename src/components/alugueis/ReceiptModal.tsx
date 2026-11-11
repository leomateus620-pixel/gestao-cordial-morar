import { RentProportionalPanel } from "./RentProportionalPanel";
import { useState, type ReactNode } from "react";
import { Calculator, Loader2, Paperclip, Plus, ReceiptText, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildReceiptModel,
  computeReceiptTotals,
  defaultReceiptInput,
  MAX_ADJUSTMENTS_PER_SIDE,
  MAX_ADJUSTMENT_DESCRIPTION,
  NEGATIVE_TOTAL_MESSAGE,
  receiptViaRows,
  MAX_RENT_DESCRIPTION,
  type AdjustmentKind,
  type OwnerAdjustment,
  type ReceiptInput,
  type RecurringAdjustment,
  type TenantAdjustment,
} from "@/lib/rentals/receipt-model";
import { COMPROVANTE_MAX_BYTES } from "@/lib/rentals/receipt-registration";
import {
  RECEIPT_ADJUSTMENT_PRESETS,
  ownerAdjustmentFromPreset,
  ownerToTenantAdjustment,
  suggestTenantSide,
  tenantAdjustmentFromPreset,
  type ReceiptPreset,
} from "@/lib/rentals/receipt-presets";
import { deactivateContractAdjustment } from "@/lib/rentals/emissions.functions";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import type { RentalContractFull } from "@/types/rental";
import { brlCents, formatBrlInput, parseBrlInput } from "@/lib/format";
import { sameMoneyValue, syncMoneyText } from "@/lib/rentals/money-input-sync";

type MoneyKey = "aluguel" | "honorarios" | "condominio" | "iptu" | "seguroFianca";

function MoneyInput({
  label,
  value,
  onChange,
  inputId,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  inputId?: string;
}) {
  const [text, setText] = useState(() => formatBrlInput(value));
  const [lastValue, setLastValue] = useState(value);
  // Value changed from outside (e.g. "Usar estes valores"): show it, unless the typed text already means it.
  if (!sameMoneyValue(lastValue, value)) {
    setLastValue(value);
    setText((t) => syncMoneyText(t, value));
  }
  const parsed = parseBrlInput(text);
  const invalid = text.trim() !== "" && (Number.isNaN(parsed) || parsed < 0);
  const empty = text.trim() === "";
  return (
    <label className="block space-y-1 text-xs font-semibold">
      {label}
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          R$
        </span>
        <Input
          id={inputId}
          aria-label={label}
          aria-invalid={invalid || empty}
          inputMode="decimal"
          className="pl-9 text-right font-mono tabular-nums"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseBrlInput(e.target.value);
            onChange(Number.isNaN(n) ? NaN : n);
          }}
          onBlur={() => {
            if (!Number.isNaN(parsed) && parsed >= 0) setText(formatBrlInput(parsed));
          }}
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>
      {(invalid || empty) && (
        <span className="block text-[11px] font-normal text-destructive">
          {empty ? "Informe o valor (use 0,00 se não houver)." : "Valor inválido."}
        </span>
      )}
    </label>
  );
}

function KindSelect({
  value,
  onChange,
  label,
}: {
  value: AdjustmentKind;
  onChange: (v: AdjustmentKind) => void;
  label: string;
}) {
  return (
    <label className="block space-y-1 text-xs font-semibold">
      Tipo
      <select
        aria-label={label}
        className="h-10 w-full rounded-md border border-input bg-background px-3"
        value={value}
        onChange={(e) => onChange(e.target.value === "acrescimo" ? "acrescimo" : "desconto")}
      >
        <option value="desconto">Desconto</option>
        <option value="acrescimo">Acréscimo</option>
      </select>
    </label>
  );
}
function DescriptionInput({
  value,
  onChange,
  inputId,
}: {
  value: string;
  onChange: (v: string) => void;
  inputId?: string;
}) {
  const empty = value.trim() === "";
  return (
    <label className="block space-y-1 text-xs font-semibold">
      <span className="flex justify-between">
        Descrição
        <span className="font-normal tabular-nums text-muted-foreground">
          {value.length}/{MAX_ADJUSTMENT_DESCRIPTION}
        </span>
      </span>
      <Input
        id={inputId}
        aria-label="Descrição do ajuste"
        aria-invalid={empty}
        maxLength={MAX_ADJUSTMENT_DESCRIPTION}
        placeholder="Ex.: Água ref. set/2026 – leitura 125 m³"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {empty && (
        <span className="block text-[11px] font-normal text-destructive">Informe a descrição.</span>
      )}
    </label>
  );
}
const newId = () => crypto.randomUUID();

function Section({
  title,
  subtitle,
  tone = "default",
  children,
}: {
  title: string;
  subtitle?: string;
  tone?: "default" | "tenant" | "owner";
  children: ReactNode;
}) {
  const toneClass =
    tone === "tenant"
      ? "border-l-4 border-primary/60 bg-primary/5"
      : tone === "owner"
        ? "border-l-4 border-accent-foreground/40 bg-accent/40"
        : "bg-muted/30";
  return (
    <fieldset className={`space-y-3 rounded-xl border border-border p-3 ${toneClass}`}>
      <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </legend>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      {children}
    </fieldset>
  );
}

export function ReceiptModal({
  contract,
  competencia,
  recurring = [],
  onClose,
  onSave,
  pending,
  error,
}: {
  contract: RentalContractFull;
  competencia: string;
  recurring?: RecurringAdjustment[];
  onClose: () => void;
  onSave: (input: ReceiptInput, proofs: Record<string, File>) => Promise<void>;
  pending: boolean;
  error: string | null;
}) {
  const [input, setInput] = useState(() => defaultReceiptInput(contract, competencia, recurring));
  const [proofs, setProofs] = useState<Record<string, File>>({});
  const deactivate = useServerFn(deactivateContractAdjustment);
  const qc = useQueryClient();
  const [ending, setEnding] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);
  const focusLater = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);
  function addPreset(p: ReceiptPreset) {
    const id = newId();
    if (p.side === "inquilino") setTenant([...tenantAdj, tenantAdjustmentFromPreset(p, id)]);
    else setOwner([...ownerAdj, ownerAdjustmentFromPreset(p, id)]);
    focusLater(`adj-${p.focus}-${id}`);
  }
  async function endRecurring(a: TenantAdjustment) {
    if (!a.recorrenteId) return;
    if (!window.confirm("O item deixa de aparecer nos próximos recibos. Continuar?")) return;
    setEnding(a.id);
    setEndError(null);
    try {
      await deactivate({ data: { id: a.recorrenteId, contractId: contract.id } });
      setTenant(tenantAdj.filter((x) => x.id !== a.id));
      await qc.invalidateQueries({ queryKey: ["rental-contract-adjustments", contract.id] });
    } catch {
      setEndError("Não foi possível encerrar a recorrência. Tente novamente.");
    } finally {
      setEnding(null);
    }
  }
  const Chips = ({ side, full }: { side: ReceiptPreset["side"]; full: boolean }) => (
    <div className="flex flex-wrap gap-2" aria-label="Atalhos">
      {RECEIPT_ADJUSTMENT_PRESETS.filter((p) => p.side === side).map((p) => (
        <Button
          key={p.id}
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 rounded-full px-3 text-xs"
          disabled={full}
          onClick={() => addPreset(p)}
        >
          <Plus className="size-3" /> {p.label}
        </Button>
      ))}
    </div>
  );
  const tenantAdj = input.ajustesInquilino ?? [];
  const ownerAdj = input.ajustesProprietario ?? [];
  const setTenant = (list: TenantAdjustment[]) =>
    setInput((c) => ({ ...c, ajustesInquilino: list }));
  const setOwner = (list: OwnerAdjustment[]) =>
    setInput((c) => ({ ...c, ajustesProprietario: list }));
  const patchTenant = (id: string, patch: Partial<TenantAdjustment>) =>
    setTenant(tenantAdj.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const patchOwner = (id: string, patch: Partial<OwnerAdjustment>) =>
    setOwner(ownerAdj.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const liveTotals = (() => {
    try {
      return computeReceiptTotals({
        ...input,
        ajustesInquilino: tenantAdj.map((a) => ({
          ...a,
          valor: Number.isFinite(a.valor) ? a.valor : 0,
        })),
        ajustesProprietario: ownerAdj.map((a) => ({
          ...a,
          valor: Number.isFinite(a.valor) ? a.valor : 0,
        })),
      });
    } catch {
      return null;
    }
  })();
  const [localError, setLocalError] = useState<string | null>(null);
  const [showProportional, setShowProportional] = useState(false);
  const edit = <K extends keyof ReceiptInput>(key: K, value: ReceiptInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));
  let totals: ReturnType<typeof buildReceiptModel> | null = null;
  try {
    totals = buildReceiptModel(contract, input);
  } catch {
    /* Validation is shown on submit. */
  }
  const v = (key: MoneyKey) => (Number.isFinite(input[key]) ? input[key] : 0);
  const money = (key: MoneyKey, label: string) => (
    <MoneyInput label={label} value={input[key]} onChange={(n) => edit(key, n)} />
  );
  async function submit() {
    try {
      const keys: MoneyKey[] = ["aluguel", "honorarios", "condominio", "iptu", "seguroFianca"];
      if (keys.some((k) => !Number.isFinite(input[k]) || input[k] < 0))
        throw new Error("Confira os valores destacados.");
      for (const f of Object.values(proofs))
        if (f.size > COMPROVANTE_MAX_BYTES) throw new Error("Comprovante maior que 5 MB.");
      buildReceiptModel(contract, input);
      setLocalError(null);
      const usedProofs = Object.fromEntries(
        Object.entries(proofs).filter(([id]) => ownerAdj.some((a) => a.id === id)),
      );
      await onSave(input, usedProofs);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Confira os dados.");
    }
  }
  const previewSource = {
    ...input,
    aluguel: v("aluguel"),
    honorarios: v("honorarios"),
    condominio: v("condominio"),
    iptu: v("iptu"),
    seguroFianca: v("seguroFianca"),
    ajustesInquilino: tenantAdj.map((a) => ({
      ...a,
      descricao: a.descricao.trim() || "sem descrição",
      valor: Number.isFinite(a.valor) ? a.valor : 0,
    })),
    ajustesProprietario: ownerAdj.map((a) => ({
      ...a,
      descricao: a.descricao.trim() || "sem descrição",
      valor: Number.isFinite(a.valor) ? a.valor : 0,
    })),
  };
  const viaLines = (via: 0 | 1) => {
    const { base, adjustments, rentNote } = receiptViaRows(previewSource, via);
    return [...base, ...adjustments].map(([label, value], i): [string, number, string?] => [
      label,
      label === "Honorários" ? -value : value,
      i === 0 ? rentNote : undefined,
    ]);
  };
  const pagarLines = viaLines(0);
  const receberLines = viaLines(1);
  const negative = liveTotals && (liveTotals.totalPagar < 0 || liveTotals.totalReceber < 0);
  const Summary = ({
    title,
    lines,
    total,
  }: {
    title: string;
    lines: [string, number, string?][];
    total?: number;
  }) => (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </p>
      <ul className="mt-2 space-y-1 text-xs">
        {lines.map(([label, value, note], i) => (
          <li key={`${label}-${i}`}>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono tabular-nums">
                {value < 0 ? `− ${brlCents(-value)}` : brlCents(value)}
              </span>
            </div>
            {note && (
              <p className="whitespace-normal break-words text-[11px] text-muted-foreground/80">
                {note}
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-semibold">
        <span>Total</span>
        <span className="font-mono tabular-nums text-primary">{brlCents(total ?? 0)}</span>
      </p>
    </div>
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="size-5 text-primary" />
            Emitir recibo
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-4"
          noValidate
        >
          {contract.brand === "ambas" && (
            <label className="block space-y-1 text-xs font-semibold">
              Empresa
              <select
                aria-label="Empresa do recibo"
                className="h-10 w-full rounded-md border border-input bg-background px-3"
                value={input.brand}
                onChange={(e) => edit("brand", e.target.value === "morar" ? "morar" : "cordial")}
              >
                <option value="cordial">Cordial</option>
                <option value="morar">Morar</option>
              </select>
            </label>
          )}
          <Section title="Valores do mês">
            <div className="grid gap-3 sm:grid-cols-2">
              {money("aluguel", "Aluguel")}
              <div className="flex items-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-expanded={showProportional}
                  onClick={() => setShowProportional((o) => !o)}
                >
                  <Calculator /> Calcular proporcional
                </Button>
              </div>
              {showProportional && (
                <div className="sm:col-span-2">
                  <RentProportionalPanel
                    contract={contract}
                    competencia={input.competencia}
                    onApply={(valor, descricao) => {
                      setInput((c) => ({ ...c, aluguel: valor, observacao: descricao }));
                      setShowProportional(false);
                    }}
                  />
                </div>
              )}
              <label className="block space-y-1 text-xs font-semibold sm:col-span-2">
                <span className="flex justify-between">
                  <span>Descrição do aluguel (opcional)</span>
                  <span className="font-normal text-muted-foreground tabular-nums">
                    {input.observacao.length}/{MAX_RENT_DESCRIPTION}
                  </span>
                </span>
                <Input
                  aria-label="Descrição do aluguel"
                  placeholder="Ex.: referente aos 26 dias morados em outubro"
                  maxLength={MAX_RENT_DESCRIPTION}
                  value={input.observacao}
                  onChange={(e) => edit("observacao", e.target.value)}
                />
                <span className="block font-normal text-muted-foreground">
                  Aparece ao lado do valor do aluguel em todas as vias do recibo.
                </span>
              </label>
              {money("condominio", "Condomínio")}
              {money("iptu", "IPTU")}
              <label className="block space-y-1 text-xs font-semibold">
                IPTU parcela (x/y)
                <Input
                  aria-label="IPTU parcela x/y"
                  placeholder="Ex.: 3/10"
                  value={input.iptuParcela}
                  maxLength={20}
                  onChange={(e) => edit("iptuParcela", e.target.value)}
                />
              </label>
              {money("seguroFianca", "Seguro fiança")}
            </div>
          </Section>
          <Section
            title="Acréscimos e descontos do inquilino"
            subtitle="Afeta o que o inquilino paga (aparece na via do locatário)."
            tone="tenant"
          >
            {tenantAdj.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum acréscimo ou desconto neste mês.
              </p>
            )}
            {endError && (
              <p role="alert" className="text-xs text-destructive">
                {endError}
              </p>
            )}
            {tenantAdj.map((a, i) => (
              <div
                key={a.id}
                className="space-y-3 rounded-lg border border-border bg-background p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">
                    Ajuste {i + 1}
                    {a.recorrenteId && (
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        Recorrente
                      </span>
                    )}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {a.recorrenteId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={ending === a.id}
                        onClick={() => void endRecurring(a)}
                      >
                        {ending === a.id && <Loader2 className="size-4 animate-spin" />}
                        Encerrar recorrência
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remover ajuste ${i + 1}`}
                      onClick={() => setTenant(tenantAdj.filter((x) => x.id !== a.id))}
                    >
                      <Trash2 className="size-4" />
                      {a.recorrenteId ? "Remover só deste mês" : "Remover"}
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-[8rem_1fr_9rem]">
                  <KindSelect
                    label={`Tipo do ajuste ${i + 1}`}
                    value={a.tipo}
                    onChange={(tipo) => patchTenant(a.id, { tipo })}
                  />
                  <DescriptionInput
                    inputId={`adj-descricao-${a.id}`}
                    value={a.descricao}
                    onChange={(descricao) => patchTenant(a.id, { descricao })}
                  />
                  <MoneyInput
                    label="Valor"
                    inputId={`adj-valor-${a.id}`}
                    value={a.valor}
                    onChange={(valor) => patchTenant(a.id, { valor })}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={a.repassarProprietario}
                      onChange={(e) =>
                        patchTenant(a.id, { repassarProprietario: e.target.checked })
                      }
                    />
                    Repassar ao proprietário
                    <span className="text-muted-foreground">
                      (também {a.tipo === "acrescimo" ? "acrescenta" : "desconta"} no repasse ao
                      proprietário)
                    </span>
                  </label>
                  {!a.recorrenteId && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(a.repetir)}
                        onChange={(e) => patchTenant(a.id, { repetir: e.target.checked })}
                      />
                      Repetir todo mês
                    </label>
                  )}
                  {a.repetir && !a.recorrenteId && (
                    <label className="flex items-center gap-2">
                      até
                      <Input
                        type="month"
                        aria-label="Repetir até a competência"
                        className="h-8 w-40"
                        min={competencia}
                        value={a.fimCompetencia ?? ""}
                        onChange={(e) =>
                          patchTenant(a.id, { fimCompetencia: e.target.value || undefined })
                        }
                      />
                      <span className="text-muted-foreground">(opcional)</span>
                    </label>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {a.repassarProprietario
                    ? "Também altera o valor que o proprietário recebe."
                    : "Não altera o proprietário: a imobiliária absorve."}
                </p>
              </div>
            ))}
            <Chips side="inquilino" full={tenantAdj.length >= MAX_ADJUSTMENTS_PER_SIDE} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={tenantAdj.length >= MAX_ADJUSTMENTS_PER_SIDE}
              onClick={() =>
                setTenant([
                  ...tenantAdj,
                  {
                    id: newId(),
                    tipo: "desconto",
                    descricao: "",
                    valor: NaN,
                    repassarProprietario: true,
                  },
                ])
              }
            >
              <Plus /> Adicionar acréscimo/desconto
            </Button>
          </Section>
          <Section title="Desconto da administração">
            <div className="grid gap-3 sm:grid-cols-2">{money("honorarios", "Honorários")}</div>
          </Section>
          <Section
            title="Descontos só do proprietário (não aparecem para o inquilino)"
            tone="owner"
          >
            <p className="rounded-md border border-border bg-background px-3 py-2 text-xs">
              Use apenas para despesas descontadas do repasse (ex.: reparo). Para descontos que o
              inquilino recebe, use a seção do inquilino.
            </p>
            {ownerAdj.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum. Só aparece na via do locador e da imobiliária.
              </p>
            )}
            {ownerAdj.map((a, i) => (
              <div
                key={a.id}
                className="space-y-3 rounded-lg border border-border bg-background p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">Item {i + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remover item do proprietário ${i + 1}`}
                    onClick={() => {
                      setOwner(ownerAdj.filter((x) => x.id !== a.id));
                      setProofs(({ [a.id]: _drop, ...rest }) => rest);
                    }}
                  >
                    <Trash2 className="size-4" /> Remover
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-[8rem_1fr_9rem]">
                  <KindSelect
                    label={`Tipo do item do proprietário ${i + 1}`}
                    value={a.tipo}
                    onChange={(tipo) => patchOwner(a.id, { tipo })}
                  />
                  <DescriptionInput
                    inputId={`adj-descricao-${a.id}`}
                    value={a.descricao}
                    onChange={(descricao) => patchOwner(a.id, { descricao })}
                  />
                  <MoneyInput
                    label="Valor"
                    inputId={`adj-valor-${a.id}`}
                    value={a.valor}
                    onChange={(valor) => patchOwner(a.id, { valor })}
                  />
                </div>
                {suggestTenantSide(a.descricao) && (
                  <div
                    role="status"
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs"
                  >
                    <span>
                      Fundo de reserva costuma ser desconto do inquilino. Aqui ele não aparece na
                      via do locatário.
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={tenantAdj.length >= MAX_ADJUSTMENTS_PER_SIDE}
                      onClick={() => {
                        setInput((c) => ({
                          ...c,
                          ajustesProprietario: (c.ajustesProprietario ?? []).filter(
                            (x) => x.id !== a.id,
                          ),
                          ajustesInquilino: [
                            ...(c.ajustesInquilino ?? []),
                            ownerToTenantAdjustment(a),
                          ],
                        }));
                        setProofs(({ [a.id]: _drop, ...rest }) => rest);
                      }}
                    >
                      Mover para o inquilino (repassado ao proprietário)
                    </Button>
                  </div>
                )}
                <label className="flex flex-wrap items-center gap-2 text-xs">
                  <Paperclip className="size-4 text-muted-foreground" />
                  Comprovante (opcional, PDF/JPG/PNG até 5 MB)
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    aria-label={`Comprovante do item ${i + 1}`}
                    className="text-xs"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      setProofs(({ [a.id]: _old, ...rest }) =>
                        file ? { ...rest, [a.id]: file } : rest,
                      );
                    }}
                  />
                  {proofs[a.id] && proofs[a.id].size > COMPROVANTE_MAX_BYTES && (
                    <span className="text-destructive">Arquivo maior que 5 MB.</span>
                  )}
                </label>
              </div>
            ))}
            <Chips side="proprietario" full={ownerAdj.length >= MAX_ADJUSTMENTS_PER_SIDE} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ownerAdj.length >= MAX_ADJUSTMENTS_PER_SIDE}
              onClick={() =>
                setOwner([
                  ...ownerAdj,
                  { id: newId(), tipo: "desconto", descricao: "", valor: NaN },
                ])
              }
            >
              <Plus /> Adicionar desconto só do proprietário
            </Button>
          </Section>
          <Section title="Dados do recibo">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-xs font-semibold">
                Vencimento
                <Input
                  aria-label="Vencimento do recibo"
                  type="date"
                  value={input.vencimento}
                  onChange={(e) => edit("vencimento", e.target.value)}
                  required
                />
              </label>
            </div>
          </Section>
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Prévia das vias
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Summary
                title="Via do locatário · Total a pagar"
                lines={pagarLines}
                total={totals?.totalPagar ?? liveTotals?.totalPagar}
              />
              <Summary
                title="Via do proprietário · Total a receber"
                lines={receberLines}
                total={totals?.totalReceber ?? liveTotals?.totalReceber}
              />
            </div>
          </div>
          {negative && (
            <p role="alert" className="text-xs text-destructive">
              {NEGATIVE_TOTAL_MESSAGE}
            </p>
          )}
          {(localError || error) && (
            <p role="alert" className="text-xs text-destructive">
              {localError || error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="h-11 w-full">
            {pending ? <Loader2 className="animate-spin" /> : <ReceiptText />}
            {pending ? "Emitindo…" : "Gerar PDF e guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
