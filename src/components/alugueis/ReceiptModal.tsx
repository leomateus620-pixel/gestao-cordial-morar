import { useState } from "react";
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
import { brl } from "@/lib/format";

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
  const moneyFields = [
    ["aluguel", "Aluguel"],
    ["honorarios", "Honorários"],
    ["condominio", "Condomínio"],
    ["iptu", "IPTU"],
    ["seguroFianca", "Seguro fiança"],
  ] as const;
  async function submit() {
    try {
      buildReceiptModel(contract, input);
      setLocalError(null);
      await onSave(input);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Confira os dados.");
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
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
          <div className="grid grid-cols-2 gap-3">
            {moneyFields.map(([key, label]) => (
              <label key={key} className="space-y-1 text-xs font-semibold">
                {label}
                <Input
                  aria-label={label}
                  type="number"
                  min="0"
                  max="99999999"
                  step="0.01"
                  value={input[key]}
                  onChange={(e) => edit(key, Number(e.target.value))}
                  required
                />
              </label>
            ))}
            <label className="space-y-1 text-xs font-semibold">
              IPTU parcela x/y
              <Input
                aria-label="IPTU parcela x/y"
                value={input.iptuParcela}
                maxLength={20}
                onChange={(e) => edit("iptuParcela", e.target.value)}
              />
            </label>
            <label className="col-span-2 space-y-1 text-xs font-semibold">
              Vencimento
              <Input
                aria-label="Vencimento do recibo"
                type="date"
                value={input.vencimento}
                onChange={(e) => edit("vencimento", e.target.value)}
                required
              />
            </label>
            <label className="col-span-2 space-y-1 text-xs font-semibold">
              Observação de proporcional
              <Input
                aria-label="Observação de proporcional"
                maxLength={160}
                value={input.observacao}
                onChange={(e) => edit("observacao", e.target.value)}
              />
            </label>
          </div>
          <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
            <div>
              <dt className="text-muted-foreground">Total a pagar</dt>
              <dd className="mt-1 font-mono text-base font-semibold tabular-nums">
                {brl(totals?.totalPagar ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Total a receber</dt>
              <dd className="mt-1 font-mono text-base font-semibold tabular-nums">
                {brl(totals?.totalReceber ?? 0)}
              </dd>
            </div>
          </dl>
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
