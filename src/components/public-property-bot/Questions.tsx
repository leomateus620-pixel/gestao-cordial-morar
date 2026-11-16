import { useId, useState } from "react";
import type {
  BotAction,
  BotQuestion,
  SearchDraft,
  SearchFilters,
} from "@/lib/public-property-bot/contracts";
import { parseAmount } from "@/lib/public-property-bot/state";
const currency = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export function CountsQuestion({
  filters,
  disabled,
  onSubmit,
}: {
  filters: SearchFilters;
  disabled: boolean;
  onSubmit(action: BotAction, label: string): void;
}) {
  const [bedrooms, setBedrooms] = useState(filters.bedrooms?.value.toString() ?? "");
  const [bathrooms, setBathrooms] = useState(filters.bathrooms?.value.toString() ?? "");
  const [bedroomMode, setBedroomMode] = useState<"eq" | "gte">(
    filters.bedrooms?.op === "eq" ? "eq" : "gte",
  );
  const [bathroomMode, setBathroomMode] = useState<"eq" | "gte">(
    filters.bathrooms?.op === "eq" ? "eq" : "gte",
  );
  const id = useId();
  return (
    <form
      className="ppb-question"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        onSubmit(
          {
            kind: "filters",
            patch: {
              bedrooms: bedrooms ? { value: Number(bedrooms), op: bedroomMode } : null,
              bathrooms: bathrooms ? { value: Number(bathrooms), op: bathroomMode } : null,
            },
            countsAnswered: true,
          },
          [
            bedrooms
              ? `${bedroomMode === "eq" ? "Exatamente" : "Pelo menos"} ${bedrooms} quartos`
              : "Quartos sem preferência",
            bathrooms
              ? `${bathroomMode === "eq" ? "exatamente" : "pelo menos"} ${bathrooms} banheiros`
              : "banheiros sem preferência",
          ].join(" e "),
        );
      }}
    >
      <fieldset disabled={disabled}>
        <legend>Quartos e banheiros</legend>
        <div className="ppb-counts">
          {(
            [
              {
                key: "bedrooms",
                label: "Quartos",
                value: bedrooms,
                set: setBedrooms,
                mode: bedroomMode,
                setMode: setBedroomMode,
              },
              {
                key: "bathrooms",
                label: "Banheiros",
                value: bathrooms,
                set: setBathrooms,
                mode: bathroomMode,
                setMode: setBathroomMode,
              },
            ] as const
          ).map((field) => (
            <div className="ppb-field" key={field.key}>
              <label htmlFor={`${id}-${field.key}`}>{field.label}</label>
              <select
                id={`${id}-${field.key}`}
                value={field.value}
                onChange={(event) => field.set(event.target.value)}
              >
                <option value="">Sem preferência</option>
                {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>
                    {value}
                    {field.mode === "gte" ? "+" : ""}
                  </option>
                ))}
              </select>
              <label className="ppb-sr-only" htmlFor={`${id}-${field.key}-mode`}>
                Quantidade de {field.label.toLowerCase()}
              </label>
              <select
                id={`${id}-${field.key}-mode`}
                value={field.mode}
                onChange={(event) => field.setMode(event.target.value as "eq" | "gte")}
              >
                <option value="gte">Pelo menos</option>
                <option value="eq">Exatamente</option>
              </select>
            </div>
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
