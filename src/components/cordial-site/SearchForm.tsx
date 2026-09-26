import { useEffect, useId, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Search, SlidersHorizontal } from "lucide-react";
import { defaultSearch, searchSchema, type SiteSearch } from "@/lib/cordial-site/contract";
import { loadCatalog } from "@/lib/cordial-site/data";
import { sitePath } from "@/lib/cordial-site/presentation";
import { SiteLink } from "./SiteShell";
import { useSite } from "@/lib/cordial-site/context";

import { searchLabels as labels } from "@/lib/cordial-site/search-labels";
export function SearchForm({
  initial = defaultSearch,
  compact = false,
  onApplied,
}: {
  initial?: Partial<SiteSearch>;
  compact?: boolean;
  onApplied?: () => void;
}) {
  const { facets, available } = useSite();
  const navigate = useNavigate();
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries({ ...defaultSearch, ...initial })
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, String(v)]),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [count, setCount] = useState<number | null>(null);
  const update = (key: string, value: string) =>
    setValues((old) => ({ ...old, [key]: value, ...(key === "cidade" ? { bairro: "" } : {}) }));
  useEffect(() => {
    if (compact || !available) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      const parsed = searchSchema.safeParse(values);
      if (parsed.success)
        loadCatalog({ ...parsed.data, pagina: 1 }, abort.signal)
          .then((r) => setCount(r.total))
          .catch(() => setCount(null));
    }, 400);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [values, available, compact]);
  const select = (key: string, options: Array<[string, string]>, empty = "Todos") => (
    <label className="cs-field" key={key} htmlFor={`${id}-${key}`}>
      <span>{labels[key]}</span>
      <select
        id={`${id}-${key}`}
        name={key}
        value={values[key] ?? ""}
        onChange={(e) => update(key, e.target.value)}
      >
        <option value="">{empty}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  const number = (key: string) => (
    <label className="cs-field" key={key} htmlFor={`${id}-${key}`}>
      <span>{labels[key]}</span>
      <input
        id={`${id}-${key}`}
        name={key}
        type="number"
        inputMode="decimal"
        min="0"
        step={["dormitorios", "banheiros", "suites", "vagas"].includes(key) ? "1" : "any"}
        value={values[key] ?? ""}
        onChange={(e) => update(key, e.target.value)}
        aria-invalid={!!errors[key]}
        aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
      />
      {errors[key] && (
        <small className="cs-field-error" id={`${id}-${key}-error`}>
          {errors[key]}
        </small>
      )}
    </label>
  );
  return (
    <form
      className={`cs-search-form ${compact ? "is-compact" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = searchSchema.safeParse(values);
        if (!parsed.success) {
          setErrors(Object.fromEntries(parsed.error.issues.map((x) => [x.path[0], x.message])));
          return;
        }
        setErrors({});
        void navigate({
          to: "/site/buscar",
          search: {
            ...parsed.data,
            ...(compact ? { finalidade: parsed.data.finalidade ?? "venda" } : {}),
            pagina: 1,
          },
        });
        onApplied?.();
      }}
    >
      {compact ? (
        <div className="cs-purpose-tabs" role="group" aria-label="Finalidade">
          {[
            ["venda", "Quero comprar"],
            ["aluguel", "Quero alugar"],
          ].map(([v, l]) => (
            <button
              type="button"
              key={v}
              aria-pressed={(values.finalidade ?? "venda") === v}
              onClick={() => update("finalidade", v)}
            >
              {l}
            </button>
          ))}
        </div>
      ) : (
        <div className="cs-form-intro">
          <span className="cs-eyebrow">Do seu jeito</span>
          <h2>O que faz um lugar ser seu?</h2>
        </div>
      )}
      <div className="cs-search-fields">
        {!compact &&
          select(
            "finalidade",
            [
              ["venda", "Comprar"],
              ["aluguel", "Alugar"],
            ],
            "Comprar ou alugar",
          )}
        {select(
          "tipo",
          facets.types.map((x) => [x.value, `${x.value} (${x.count})`]),
          "Qual tipo?",
        )}
        {select(
          "cidade",
          facets.cities.map((x) => [x.value, x.value]),
          "Em qual cidade?",
        )}
        {!compact &&
          select(
            "bairro",
            facets.districts.filter((x) => x.city === values.cidade).map((x) => [x.value, x.value]),
            values.cidade ? "Todos os bairros" : "Escolha uma cidade",
          )}
        {number("precoMin")}
        {number("precoMax")}
        {compact && (
          <button className="cs-button" type="submit">
            <Search size={19} />
            Buscar imóveis
          </button>
        )}
        {!compact && (
          <>
            <label className="cs-field" htmlFor={`${id}-referencia`}>
              <span>Referência Cordial</span>
              <input
                id={`${id}-referencia`}
                value={values.referencia ?? ""}
                maxLength={80}
                onChange={(e) => update("referencia", e.target.value)}
                placeholder="Código do imóvel"
              />
            </label>
            {select(
              "exata",
              [
                ["sim", "Referência exata"],
                ["nao", "Parte da referência"],
              ],
              "Selecione",
            )}
            <label className="cs-field" htmlFor={`${id}-q`}>
              <span>Tipo, cidade ou bairro</span>
              <input
                id={`${id}-q`}
                maxLength={100}
                value={values.q ?? ""}
                onChange={(e) => update("q", e.target.value)}
              />
            </label>
            {select(
              "contagem",
              [
                ["minima", "Pelo menos a quantidade informada"],
                ["exata", "Exatamente a quantidade informada"],
              ],
              "Escolha a comparação",
            )}
            {["dormitorios", "banheiros", "suites", "vagas"].map(number)}
            {select(
              "areaTipo",
              [
                ["construida", "Área construída"],
                ["util", "Área útil"],
                ["terreno", "Área do terreno"],
                ["total", "Área total"],
              ],
              "Selecione a medida",
            )}
            {number("areaMin")}
            {number("areaMax")}
            {["mobiliado", "permuta", "financiamento", "fotos"].map((k) =>
              select(
                k,
                [
                  ["sim", "Sim"],
                  ["nao", "Não"],
                ],
                "Indiferente",
              ),
            )}
            {facets.stages.length > 0 &&
              select(
                "estagio",
                facets.stages.map((x) => [x, x]),
              )}
            {select(
              "valorModo",
              [
                ["fixo", "Preço informado"],
                ["consulte", "Sob consulta"],
              ],
              "Todos os preços",
            )}
          </>
        )}
      </div>
      {compact ? (
        <div className="cs-search-links">
          <SiteLink to={sitePath("/buscar")}>
            <SlidersHorizontal size={15} />
            Pesquisa completa
          </SiteLink>
          <SiteLink to={sitePath("/buscar#referencia")}>
            Já tem uma referência? <ArrowRight size={15} />
          </SiteLink>
        </div>
      ) : (
        <div className="cs-form-actions">
          <button
            type="button"
            className="cs-button cs-button-light"
            onClick={() => {
              setValues(
                Object.fromEntries(Object.entries(defaultSearch).map(([k, v]) => [k, String(v)])),
              );
              setErrors({});
            }}
          >
            Limpar filtros
          </button>
          <button className="cs-button" type="submit">
            {count != null ? `Ver ${count} imóveis` : "Aplicar filtros"}
            <ArrowRight size={18} />
          </button>
        </div>
      )}
    </form>
  );
}
