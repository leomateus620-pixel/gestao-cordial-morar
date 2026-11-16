import { useState } from "react";
import { X } from "lucide-react";
import type { FilterPatch, SearchFilters } from "@/lib/public-property-bot/contracts";
import { parseAmount } from "@/lib/public-property-bot/state";
const labels: Record<keyof SearchFilters, string> = {
  operation: "Finalidade",
  type: "Tipo",
  city: "Cidade",
  district: "Bairro",
  reference: "Referência",
  budget: "Orçamento",
  bedrooms: "Quartos",
  bathrooms: "Banheiros",
  suites: "Suítes",
  parking: "Vagas",
  area: "Área",
  furnished: "Mobiliado",
  financing: "Financiamento",
  exchange: "Permuta",
  stage: "Estágio",
  features: "Diferenciais",
};
const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export function filterLabel(
  key: keyof SearchFilters,
  value: SearchFilters[keyof SearchFilters],
): string {
  if (key === "features")
    return (value as SearchFilters["features"])
      .map(
        (item) =>
          `${item.state === "absent" ? "Sem" : "Com"} ${item.name}${item.scope === "condominium" ? " no condomínio" : ""}${item.required ? "" : " (preferência)"}`,
      )
      .join(", ");
  if (key === "operation") return value === "aluguel" ? "Alugar" : "Comprar";
  if (typeof value === "boolean") return `${labels[key]}: ${value ? "sim" : "não"}`;
  if (value && typeof value === "object" && "op" in value)
    return `${value.op === "eq" ? "Exatamente " : value.op === "gt" ? "Mais de " : value.op === "lte" ? "Até " : value.op === "lt" ? "Menos de " : ""}${value.value}${value.op === "gte" ? "+" : ""} ${labels[key].toLowerCase()}`;
  if (value && typeof value === "object" && "min" in value)
    return [
      value.min && `${value.min.inclusive ? "A partir de" : "Acima de"} ${money(value.min.value)}`,
      value.max && `${value.max.inclusive ? "Até" : "Abaixo de"} ${money(value.max.value)}`,
    ]
      .filter(Boolean)
      .join(" · ");
  if (value && typeof value === "object" && "kind" in value)
    return `${labels[key]} ${value.kind}: ${[value.range.min && `${value.range.min.inclusive ? "a partir de" : "acima de"} ${value.range.min.value}`, value.range.max && `${value.range.max.inclusive ? "até" : "abaixo de"} ${value.range.max.value}`].filter(Boolean).join(" · ")} m²`;
  return String(value ?? "");
}
export function FilterChips({
  filters,
  disabled,
  onApply,
}: {
  filters: SearchFilters;
  disabled: boolean;
  onApply(patch: FilterPatch): void;
}) {
  const [patch, setPatch] = useState<FilterPatch>({}),
    [editing, setEditing] = useState<keyof SearchFilters | null>(null),
    [value, setValue] = useState(""),
    [countMode, setCountMode] = useState<"eq" | "gte" | "gt" | "lte" | "lt">("gte"),
    [error, setError] = useState("");
  const current = { ...filters, ...patch };
  function remove(key: keyof SearchFilters) {
    setPatch((previous) => ({ ...previous, [key]: key === "features" ? [] : null }));
    if (editing === key) setEditing(null);
  }
  const keys = (Object.keys(current) as Array<keyof SearchFilters>).filter((key) =>
    key === "features" ? current.features.length > 0 : current[key] != null,
  );
  function save() {
    if (!editing || disabled) return;
    setError("");
    let next: unknown = value.trim() || null;
    if (editing === "budget") {
      const amount = parseAmount(value);
      if (amount == null) {
        setError("Informe um valor, por exemplo 650.000 ou 650 mil.");
        return;
      }
      next = { min: null, max: { value: amount, inclusive: true } };
    }
    if (["bedrooms", "bathrooms", "suites", "parking"].includes(editing)) {
      if (!/^\d{1,3}$/.test(value) || Number(value) > 100) {
        setError("Informe uma quantidade inteira entre 0 e 100.");
        return;
      }
      next = { op: countMode, value: Number(value) };
    }
    if (["furnished", "financing", "exchange"].includes(editing)) next = value === "true";
    setPatch((previous) => ({ ...previous, [editing]: next }));
    setEditing(null);
  }
  if (!keys.length && !Object.keys(patch).length) return null;
  return (
    <section className="ppb-filters" aria-label="Filtros da busca">
      <div className="ppb-chips">
        {keys.map((key) => (
          <div className="ppb-chip" key={key}>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Editar ${labels[key].toLowerCase()}: ${filterLabel(key, current[key])}`}
              onClick={() => {
                setEditing(key);
                setError("");
                const v = current[key];
                setCountMode(v && typeof v === "object" && "op" in v ? v.op : "gte");
                setValue(
                  typeof v === "string" || typeof v === "boolean"
                    ? String(v)
                    : v && typeof v === "object" && "value" in v
                      ? String(v.value)
                      : v && typeof v === "object" && "max" in v
                        ? String(v.max?.value ?? v.min?.value ?? "")
                        : "",
                );
              }}
            >
              {filterLabel(key, current[key])}
            </button>
            <button
              type="button"
              disabled={disabled}
              aria-label={`Remover filtro de ${labels[key].toLowerCase()}`}
              onClick={() => remove(key)}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      {editing && (
        <form
          className="ppb-chip-editor"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          {editing === "features" || editing === "area" ? (
            <p>
              Para ajustar {labels[editing].toLowerCase()}, descreva a mudança na mensagem abaixo.
            </p>
          ) : (
            <label>
              {editing === "budget"
                ? "Novo teto em reais"
                : ["bedrooms", "bathrooms", "suites", "parking"].includes(editing)
                  ? labels[editing]
                  : labels[editing]}
              {editing === "operation" ? (
                <select value={value} onChange={(event) => setValue(event.target.value)}>
                  <option value="venda">Comprar</option>
                  <option value="aluguel">Alugar</option>
                </select>
              ) : ["furnished", "financing", "exchange"].includes(editing) ? (
                <select value={value} onChange={(event) => setValue(event.target.value)}>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              ) : (
                <input
                  autoFocus
                  maxLength={100}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              )}
            </label>
          )}
          {["bedrooms", "bathrooms", "suites", "parking"].includes(editing) && (
            <label>
              Como contar
              <select
                value={countMode}
                disabled={disabled}
                onChange={(event) => setCountMode(event.target.value as typeof countMode)}
              >
                <option value="eq">Exatamente</option>
                <option value="gte">Pelo menos</option>
                <option value="gt">Mais de</option>
                <option value="lte">Até</option>
                <option value="lt">Menos de</option>
              </select>
            </label>
          )}
          {error && <p role="alert">{error}</p>}
          {editing !== "features" && editing !== "area" && (
            <button type="submit" className="ppb-secondary" disabled={disabled}>
              Confirmar alteração
            </button>
          )}
          <button type="button" className="ppb-text-button" onClick={() => setEditing(null)}>
            Fechar
          </button>
        </form>
      )}
      {Object.keys(patch).length > 0 && (
        <div className="ppb-filter-apply">
          <button
            type="button"
            className="ppb-primary"
            disabled={disabled}
            onClick={() => {
              onApply(patch);
              setPatch({});
            }}
          >
            Atualizar busca
          </button>
          <button
            type="button"
            className="ppb-text-button"
            disabled={disabled}
            onClick={() => setPatch({})}
          >
            Desfazer alterações
          </button>
        </div>
      )}
    </section>
  );
}
