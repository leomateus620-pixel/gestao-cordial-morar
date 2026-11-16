import { useId, useState } from "react";
import { Bath, BedDouble, Check } from "lucide-react";
import type {
  BotAction,
  BotQuestion,
  SearchDraft,
  SearchFilters,
} from "@/lib/public-property-bot/contracts";
import { parseAmount } from "@/lib/public-property-bot/state";
const currency = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
function countLabel(value: SearchFilters["bedrooms"], singular: string, plural: string) {
  if (!value) return `${plural} sem preferência`;
  const prefix =
    value.op === "gt"
      ? "Mais de "
      : value.op === "lte"
        ? "Até "
        : value.op === "lt"
          ? "Menos de "
          : "";
  return `${prefix}${value.value}${value.op === "gte" ? "+" : ""} ${value.value === 1 ? singular : plural}`;
}
export function CountsQuestion({
  filters,
  disabled,
  onSubmit,
}: {
  filters: SearchFilters;
  disabled: boolean;
  onSubmit(action: BotAction, label: string): void;
}) {
  const [bedrooms, setBedrooms] = useState(filters.bedrooms);
  const [bathrooms, setBathrooms] = useState(filters.bathrooms);
  const id = useId();
  return (
    <form
      className="ppb-question"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        onSubmit(
          { kind: "filters", patch: { bedrooms, bathrooms }, countsAnswered: true },
          [
            countLabel(bedrooms, "quarto", "quartos"),
            countLabel(bathrooms, "banheiro", "banheiros"),
          ].join(" e "),
        );
      }}
    >
      <fieldset disabled={disabled}>
        <legend>Quartos e banheiros</legend>
        <div className="ppb-counts">
          {[
            {
              key: "bedrooms",
              label: "Quartos",
              singular: "quarto",
              plural: "quartos",
              value: bedrooms,
              set: setBedrooms,
              Icon: BedDouble,
            },
            {
              key: "bathrooms",
              label: "Banheiros",
              singular: "banheiro",
              plural: "banheiros",
              value: bathrooms,
              set: setBathrooms,
              Icon: Bath,
            },
          ].map((field) => (
            <fieldset
              className="ppb-count-group"
              key={field.key}
              aria-describedby={
                field.value &&
                (field.value.op !== "eq" || field.value.value < 1 || field.value.value > 10)
                  ? `${id}-${field.key}-current`
                  : undefined
              }
            >
              <legend>{field.label}</legend>
              {field.value &&
                (field.value.op !== "eq" || field.value.value < 1 || field.value.value > 10) && (
                  <p id={`${id}-${field.key}-current`} className="ppb-count-current">
                    Filtro atual: {countLabel(field.value, field.singular, field.plural)}
                  </p>
                )}
              <div className="ppb-count-options">
                {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                  <label className="ppb-count-option" key={value}>
                    <input
                      className="ppb-count-radio"
                      type="radio"
                      name={`${id}-${field.key}`}
                      value={value}
                      checked={field.value?.value === value}
                      aria-label={`${value} ${value === 1 ? field.singular : field.plural}`}
                      onChange={() => field.set({ value, op: "eq" })}
                      onClick={() => field.set({ value, op: "eq" })}
                    />
                    <span className="ppb-count-option-body">
                      <field.Icon size={20} aria-hidden="true" />
                      <span>{value}</span>
                      {field.value?.value === value && (
                        <Check className="ppb-count-check" size={12} aria-hidden="true" />
                      )}
                    </span>
                  </label>
                ))}
                <label className="ppb-count-option ppb-count-any">
                  <input
                    className="ppb-count-radio"
                    type="radio"
                    name={`${id}-${field.key}`}
                    value=""
                    checked={field.value === null}
                    onChange={() => field.set(null)}
                  />
                  <span className="ppb-count-option-body">
                    Sem preferência{field.value === null && <Check size={14} aria-hidden="true" />}
                  </span>
                </label>
              </div>
            </fieldset>
          ))}
        </div>
        <button type="submit" className="ppb-primary">
          Continuar
        </button>
      </fieldset>
    </form>
  );
}
export function BudgetQuestion({
  operation,
  disabled,
  onSubmit,
}: {
  operation: "venda" | "aluguel";
  disabled: boolean;
  onSubmit(action: BotAction, label: string): void;
}) {
  const [custom, setCustom] = useState(false),
    [value, setValue] = useState(""),
    [mode, setMode] = useState("max"),
    [error, setError] = useState("");
  const amounts =
    operation === "venda"
      ? [200000, 300000, 500000, 700000, 1000000]
      : [1000, 1500, 2000, 3000, 5000];
  function choose(value: number, above = false) {
    onSubmit(
      {
        kind: "filters",
        patch: {
          budget: above
            ? { min: { value, inclusive: false }, max: null }
            : { min: null, max: { value, inclusive: true } },
        },
        budgetAnswered: true,
      },
      `${above ? "Acima de" : "Até"} ${currency(value)}${operation === "aluguel" ? " por mês" : ""}`,
    );
  }
  return (
    <div className="ppb-question">
      <p className="ppb-label">
        {operation === "aluguel" ? "Aluguel mensal, sem encargos" : "Valor de compra"}
      </p>
      <div className="ppb-choices">
        {amounts.map((amount) => (
          <button key={amount} type="button" disabled={disabled} onClick={() => choose(amount)}>
            Até {currency(amount)}
          </button>
        ))}
        <button type="button" disabled={disabled} onClick={() => choose(amounts.at(-1)!, true)}>
          Acima de {currency(amounts.at(-1)!)}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setCustom(!custom)}
          aria-expanded={custom}
        >
          Definir valor
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onSubmit(
              { kind: "filters", patch: { budget: null }, budgetAnswered: true },
              "Orçamento sem preferência",
            )
          }
        >
          Sem preferência
        </button>
      </div>
      {custom && (
        <form
          className="ppb-custom-budget"
          onSubmit={(event) => {
            event.preventDefault();
            const amount = parseAmount(value);
            if (amount == null) {
              setError("Informe um valor, por exemplo 650.000 ou 650 mil.");
              return;
            }
            setError("");
            choose(amount, mode === "min");
          }}
        >
          <label>
            Limite
            <select
              value={mode}
              disabled={disabled}
              onChange={(event) => setMode(event.target.value)}
            >
              <option value="max">Até, incluindo o valor</option>
              <option value="min">Acima do valor</option>
            </select>
          </label>
          <label>
            Valor em reais
            <input
              autoFocus
              inputMode="decimal"
              value={value}
              disabled={disabled}
              onChange={(event) => setValue(event.target.value)}
              placeholder="R$"
              maxLength={30}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button type="submit" className="ppb-primary" disabled={disabled}>
            Aplicar valor
          </button>
        </form>
      )}
    </div>
  );
}
export function Question({
  question,
  draft,
  disabled,
  onSubmit,
}: {
  question: BotQuestion;
  draft: SearchDraft;
  disabled: boolean;
  onSubmit(action: BotAction, label: string): void;
}) {
  if (question.kind === "counts")
    return <CountsQuestion filters={draft.filters} disabled={disabled} onSubmit={onSubmit} />;
  if (question.kind === "budget")
    return (
      <BudgetQuestion operation={question.operation} disabled={disabled} onSubmit={onSubmit} />
    );
  if (question.kind === "clarify") return <p className="ppb-question">{question.message}</p>;
  return (
    <div className="ppb-question ppb-choices">
      {question.kind === "operation" ? (
        <>
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              onSubmit({ kind: "filters", patch: { operation: "venda" } }, "Quero comprar")
            }
          >
            Comprar
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              onSubmit({ kind: "filters", patch: { operation: "aluguel" } }, "Quero alugar")
            }
          >
            Alugar
          </button>
        </>
      ) : (
        question.cities.map((city) => (
          <button
            key={city}
            type="button"
            disabled={disabled}
            onClick={() =>
              onSubmit(
                { kind: "filters", patch: { city, district: question.district } },
                `${question.district}, ${city}`,
              )
            }
          >
            {city}
          </button>
        ))
      )}
    </div>
  );
}
