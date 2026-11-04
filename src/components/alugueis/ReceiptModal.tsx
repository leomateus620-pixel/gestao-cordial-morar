import { useState, type ReactNode } from "react";
import { Loader2, Paperclip, Plus, ReceiptText, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildReceiptModel,
  computeReceiptTotals,
  defaultReceiptInput,
  MAX_ADJUSTMENTS_PER_SIDE,
  NEGATIVE_TOTAL_MESSAGE,
  type AdjustmentKind,
  type OwnerAdjustment,
  type ReceiptInput,
  type RecurringAdjustment,
  type TenantAdjustment,
} from "@/lib/rentals/receipt-model";
import { COMPROVANTE_MAX_BYTES } from "@/lib/rentals/receipt-registration";
import type { RentalContractFull } from "@/types/rental";
import { brlCents, formatBrlInput, parseBrlInput } from "@/lib/format";

type MoneyKey = "aluguel" | "honorarios" | "condominio" | "iptu" | "seguroFianca";

function MoneyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(() => formatBrlInput(value));
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
function DescriptionInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const empty = value.trim() === "";
  return (
    <label className="block space-y-1 text-xs font-semibold">
      Descrição
      <Input
        aria-label="Descrição do ajuste"
        aria-invalid={empty}
        maxLength={60}
        placeholder="Ex.: Fundo de reserva"
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
const signedValue = (a: { tipo: AdjustmentKind; valor: number }) =>
  Number.isFinite(a.valor) ? (a.tipo === "acrescimo" ? a.valor : -a.valor) : 0;
const adjLabel = (a: { tipo: AdjustmentKind; descricao: string }) =>
  `${a.tipo === "acrescimo" ? "Acréscimo" : "Desconto"} – ${a.descricao.trim() || "sem descrição"}`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
      <legend className="px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </legend>
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
        ajustesInquilino: tenantAdj.map((a) => ({ ...a, valor: Number.isFinite(a.valor) ? a.valor : 0 })),
        ajustesProprietario: ownerAdj.map((a) => ({ ...a, valor: Number.isFinite(a.valor) ? a.valor : 0 })),
      });
    } catch {
      return null;
    }
  })();
  const [localError, setLocalError] = useState<string | null>(null);
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
  const pagarLines: [string, number][] = [
    ["Aluguel", v("aluguel")],
    ["Condomínio", v("condominio")],
    ["IPTU", v("iptu")],
    ["Seguro fiança", v("seguroFianca")],
    ...tenantAdj.map((a) => [adjLabel(a), signedValue(a)] as [string, number]),
  ];
  const receberLines: [string, number][] = [
    ["Aluguel", v("aluguel")],
    ["Honorários", -v("honorarios")],
    ["Condomínio", v("condominio")],
    ...tenantAdj
      .filter((a) => a.repassarProprietario)
      .map((a) => [adjLabel(a), signedValue(a)] as [string, number]),
    ...ownerAdj.map((a) => [`${adjLabel(a)} (proprietário)`, signedValue(a)] as [string, number]),
  ];
  const negative =
    liveTotals && (liveTotals.totalPagar < 0 || liveTotals.totalReceber < 0);
  const Summary = ({ title, lines, total }: { title: string; lines: [string, number][]; total?: number }) => (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
      <ul className="mt-2 space-y-1 text-xs">
        {lines.map(([label, value], i) => (
          <li key={`${label}-${i}`} className="flex justify-between gap-2">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-mono tabular-nums">
              {value < 0 ? `− ${brlCents(-value)}` : brlCents(value)}
            </span>
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
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
          <Section title="Descontos e ajustes do inquilino">
            {tenantAdj.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum desconto ou ajuste neste mês.</p>
            )}
            {tenantAdj.map((a, i) => (
              <div key={a.id} className="space-y-3 rounded-lg border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">
                    Ajuste {i + 1}
                    {a.recorrenteId && (
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        Recorrente
                      </span>
                    )}
                  </span>
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
                <div className="grid gap-3 sm:grid-cols-[8rem_1fr_9rem]">
                  <KindSelect
                    label={`Tipo do ajuste ${i + 1}`}
                    value={a.tipo}
                    onChange={(tipo) => patchTenant(a.id, { tipo })}
                  />
                  <DescriptionInput
                    value={a.descricao}
                    onChange={(descricao) => patchTenant(a.id, { descricao })}
                  />
                  <MoneyInput
                    label="Valor"
                    value={a.valor}
                    onChange={(valor) => patchTenant(a.id, { valor })}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={a.repassarProprietario}
                      onChange={(e) => patchTenant(a.id, { repassarProprietario: e.target.checked })}
                    />
                    Repassar ao proprietário
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={tenantAdj.length >= MAX_ADJUSTMENTS_PER_SIDE}
              onClick={() =>
                setTenant([
                  ...tenantAdj,
                  { id: newId(), tipo: "desconto", descricao: "", valor: NaN, repassarProprietario: true },
                ])
              }
            >
              <Plus /> Adicionar desconto/ajuste
            </Button>
          </Section>
          <Section title="Desconto da administração">
            <div className="grid gap-3 sm:grid-cols-2">{money("honorarios", "Honorários")}</div>
          </Section>
          <Section title="Descontos do proprietário">
            {ownerAdj.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum. Só aparece na via do locador e da imobiliária.
              </p>
            )}
            {ownerAdj.map((a, i) => (
              <div key={a.id} className="space-y-3 rounded-lg border border-border bg-background p-3">
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
                    value={a.descricao}
                    onChange={(descricao) => patchOwner(a.id, { descricao })}
                  />
                  <MoneyInput
                    label="Valor"
                    value={a.valor}
                    onChange={(valor) => patchOwner(a.id, { valor })}
                  />
                </div>
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
                      setProofs(({ [a.id]: _old, ...rest }) => (file ? { ...rest, [a.id]: file } : rest));
                    }}
                  />
                  {proofs[a.id] && proofs[a.id].size > COMPROVANTE_MAX_BYTES && (
                    <span className="text-destructive">Arquivo maior que 5 MB.</span>
                  )}
                </label>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ownerAdj.length >= MAX_ADJUSTMENTS_PER_SIDE}
              onClick={() =>
                setOwner([...ownerAdj, { id: newId(), tipo: "desconto", descricao: "", valor: NaN }])
              }
            >
              <Plus /> Adicionar desconto do proprietário
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
              <label className="block space-y-1 text-xs font-semibold sm:col-span-2">
                Observação de proporcional
                <Input
                  aria-label="Observação de proporcional"
                  placeholder="Opcional"
                  maxLength={160}
                  value={input.observacao}
                  onChange={(e) => edit("observacao", e.target.value)}
                />
              </label>
            </div>
          </Section>
          <div className="grid gap-3 sm:grid-cols-2">
            <Summary
              title="Inquilino paga"
              lines={pagarLines}
              total={totals?.totalPagar ?? liveTotals?.totalPagar}
            />
            <Summary
              title="Proprietário recebe"
              lines={receberLines}
              total={totals?.totalReceber ?? liveTotals?.totalReceber}
            />
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
