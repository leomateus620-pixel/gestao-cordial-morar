import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brlCents } from "@/lib/format";
import {
  computeProportionalRent,
  daysFromDate,
  type ProportionalKind,
} from "@/lib/rentals/receipt-proportional";
import type { RentalContractFull } from "@/types/rental";

/** Suggests a proportional rent; only "Usar estes valores" changes the receipt. */
export function RentProportionalPanel({
  contract,
  competencia,
  onApply,
}: {
  contract: RentalContractFull;
  competencia: string;
  onApply: (valor: number, descricao: string) => void;
}) {
  const defaultDate = (k: ProportionalKind) => {
    const d =
      k === "entrada" ? contract.dataInicio : (contract.dataEncerramento ?? contract.dataFim);
    return d && d.slice(0, 7) === competencia ? d.slice(0, 10) : "";
  };
  const [kind, setKind] = useState<ProportionalKind>("entrada");
  const [date, setDate] = useState(() => defaultDate("entrada"));
  const [dias, setDias] = useState<string>(() => {
    const d = defaultDate("entrada");
    return d ? String(daysFromDate("entrada", d, competencia) ?? "") : "";
  });
  const syncDays = (k: ProportionalKind, d: string) => {
    const n = d ? daysFromDate(k, d, competencia) : null;
    setDias(n === null ? "" : String(n));
  };
  const dateError =
    date && daysFromDate(kind, date, competencia) === null
      ? "A data precisa estar dentro do mês do recibo."
      : null;
  const result =
    dias.trim() === ""
      ? null
      : computeProportionalRent({
          valorMensal: contract.valorMensal,
          competencia,
          kind,
          dias: Number(dias),
        });
  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3 text-xs">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1 font-semibold">
          Tipo
          <select
            aria-label="Tipo de proporcional"
            className="h-10 w-full rounded-md border border-input bg-background px-3"
            value={kind}
            onChange={(e) => {
              const k = e.target.value === "saida" ? "saida" : "entrada";
              setKind(k);
              const d = defaultDate(k) || date;
              setDate(d);
              syncDays(k, d);
            }}
          >
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
          </select>
        </label>
        <label className="block space-y-1 font-semibold">
          {kind === "entrada" ? "Data de entrada" : "Data de saída"}
          <Input
            aria-label={kind === "entrada" ? "Data de entrada" : "Data de saída"}
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              syncDays(kind, e.target.value);
            }}
          />
        </label>
        <label className="block space-y-1 font-semibold">
          Dias morados
          <Input
            aria-label="Dias morados"
            type="number"
            inputMode="numeric"
            min={1}
            value={dias}
            onChange={(e) => setDias(e.target.value)}
          />
        </label>
      </div>
      {dateError && <p className="text-destructive">{dateError}</p>}
      {result && !result.ok && <p className="text-destructive">{result.error}</p>}
      {result?.ok && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">
            {brlCents(result.valor)} · {result.descricao}
          </p>
          <Button type="button" size="sm" onClick={() => onApply(result.valor, result.descricao)}>
            Usar estes valores
          </Button>
        </div>
      )}
      <p className="text-muted-foreground">
        Honorários não são recalculados (seguem sobre o aluguel cheio). Ajuste manualmente se
        necessário.
      </p>
    </div>
  );
}
