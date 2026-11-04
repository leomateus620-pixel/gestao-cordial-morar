import { useState, type ReactNode } from "react";
import { Loader2, ReceiptText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildReceiptModel,
  defaultReceiptInput,
  type ReceiptInput,
} from "@/lib/rentals/receipt-model";
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
  onClose,
  onSave,
  pending,
  error,
}: {
  contract: RentalContractFull;
  competencia: string;
  onClose: () => void;
  onSave: (input: ReceiptInput) => Promise<void>;
  pending: boolean;
  error: string | null;
}) {
  const [input, setInput] = useState(() => defaultReceiptInput(contract, competencia));
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
      buildReceiptModel(contract, input);
      setLocalError(null);
      await onSave(input);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Confira os dados.");
    }
  }
  const pagarLines: [string, number][] = [
    ["Aluguel", v("aluguel")],
    ["Condomínio", v("condominio")],
    ["IPTU", v("iptu")],
    ["Seguro fiança", v("seguroFianca")],
  ];
  const receberLines: [string, number][] = [
    ["Aluguel", v("aluguel")],
    ["Honorários", -v("honorarios")],
    ["Condomínio", v("condominio")],
  ];
  const Summary = ({ title, lines, total }: { title: string; lines: [string, number][]; total?: number }) => (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
      <ul className="mt-2 space-y-1 text-xs">
        {lines.map(([label, value]) => (
          <li key={label} className="flex justify-between gap-2">
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" aria-describedby={undefined}>
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
          <Section title="Desconto da administração">
            <div className="grid gap-3 sm:grid-cols-2">{money("honorarios", "Honorários")}</div>
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
            <Summary title="Inquilino paga" lines={pagarLines} total={totals?.totalPagar} />
            <Summary title="Proprietário recebe" lines={receberLines} total={totals?.totalReceber} />
          </div>
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
