import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Search, SlidersHorizontal, ChevronDown } from "lucide-react";
import {
  defaultSearch,
  searchSchema,
  type SiteSearch,
  type SiteFacets,
} from "@/lib/cordial-site/contract";
import { loadCatalogCount, loadFacets } from "@/lib/cordial-site/data";
import { money, sitePath } from "@/lib/cordial-site/presentation";
import {
  foldSearchText,
  latestRequest,
  searchDraft,
  searchQueryKey,
  updateSearchDraft,
} from "@/lib/cordial-site/search-state";
import { SiteLink } from "./SiteShell";
import { useSite, useSiteBrand } from "@/lib/cordial-site/context";
import { MorarSearchForm } from "./MorarSearchForm";
import { searchLabels as labels } from "@/lib/cordial-site/search-labels";
import { trackSiteEvent } from "@/lib/cordial-site/experience";

type SearchFormProps = { initial?: Partial<SiteSearch>; compact?: boolean; onApplied?: () => void };
export function SearchForm(props: SearchFormProps) {
  const brand = useSiteBrand();
  return brand === "morar" ? <MorarSearchForm {...props} /> : <CordialSearchForm {...props} />;
}

function RegionCombobox({
  id,
  districts,
  city,
  value,
  contextual,
  onChange,
}: {
  id: string;
  districts: SiteFacets["districts"];
  city: string;
  value: string;
  contextual: boolean;
  onChange: (district: string, city?: string) => void;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    setText(value);
  }, [value, city]);
  const options = districts
    .filter(
      (d) => (!city || d.city === city) && foldSearchText(d.value).includes(foldSearchText(text)),
    )
    .slice(0, 12);
  const choose = (index: number) => {
    const selected = options[index];
    if (!selected) return;
    setText(selected.value);
    onChange(selected.value, selected.city);
    setOpen(false);
    setActive(-1);
  };
  return (
    <div className="cs-field cs-region-combobox">
      <label htmlFor={id}>Bairro ou loteamento</label>
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
        value={text}
        maxLength={100}
        placeholder={city ? "Todos os bairros" : "Nome do bairro ou loteamento"}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setText(value);
        }}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
          setActive(-1);
          if (!event.target.value) onChange("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            setText(value);
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive((old) =>
              options.length
                ? (old + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length
                : -1,
            );
          }
          if (event.key === "Enter" && open) {
            event.preventDefault();
            choose(active >= 0 ? active : 0);
          }
        }}
      />
      {open && (
        <div
          id={`${id}-options`}
          role="listbox"
          className="cs-region-options"
          aria-label="Bairros e loteamentos do catálogo"
        >
          {options.length ? (
            options.map((d, index) => (
              <button
                type="button"
                role="option"
                id={`${id}-option-${index}`}
                key={`${d.city}:${d.value}`}
                aria-selected={active === index || (value === d.value && city === d.city)}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(index)}
              >
                <span>{d.value}</span>
                <small>
                  {d.city} · {d.count} {contextual ? "neste recorte" : "no catálogo geral"}
                </small>
              </button>
            ))
          ) : (
            <p>Nenhuma região cadastrada corresponde a este nome.</p>
          )}
        </div>
      )}
    </div>
  );
}

function CordialSearchForm({
  initial = defaultSearch,
  compact = false,
  onApplied,
}: SearchFormProps) {
  const { facets, available, settings } = useSite();
  const navigate = useNavigate();
  const id = useId();
  const [values, setValues] = useState(() =>
    searchDraft(compact ? { ...initial, finalidade: initial.finalidade ?? "venda" } : initial),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [budget, setBudget] = useState(initial.precoMin != null || initial.precoMax != null);
  const [reference, setReference] = useState(!!initial.referencia);
  const [retry, setRetry] = useState(0);
  const [count, setCount] = useState<{ key: string; total?: number; error?: boolean }>({ key: "" });
  const [regionFacets, setRegionFacets] = useState<{
    key: string;
    districts: SiteFacets["districts"];
  }>({ key: "", districts: facets.districts });
  const requests = useRef(latestRequest());
  const parsed = searchSchema.safeParse(values);
  const queryKey = parsed.success ? searchQueryKey(parsed.data, true) : "invalid";
  const facetsKey = parsed.success
    ? searchQueryKey({ ...parsed.data, bairro: undefined }, true)
    : "invalid";
  const currentCount = count.key === queryKey ? count : undefined;
  const update = (key: string, value: string) => {
    setValues((old) => updateSearchDraft(old, key, value));
    trackSiteEvent("filter_changed", { source: `${compact ? "home" : "filters"}:${key}` });
  };
  useEffect(() => {
    if (compact || !available || queryKey === "invalid") return;
    const requestTracker = requests.current;
    const request = requestTracker.next();
    const abort = new AbortController();
    const timer = setTimeout(() => {
      loadCatalogCount(
        { ...defaultSearch, ...Object.fromEntries(JSON.parse(queryKey)), pagina: 1 },
        abort.signal,
      )
        .then((result) => {
          if (requestTracker.current(request) && !abort.signal.aborted)
            setCount({ key: queryKey, total: result.total });
        })
        .catch(() => {
          if (requestTracker.current(request) && !abort.signal.aborted)
            setCount({ key: queryKey, error: true });
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      abort.abort();
      requestTracker.invalidate();
    };
  }, [queryKey, retry, available, compact]);
  useEffect(() => {
    if (!available || facetsKey === "invalid") return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      void loadFacets(
        { ...defaultSearch, ...Object.fromEntries(JSON.parse(facetsKey)) },
        abort.signal,
      )
        .then((result) => {
          if (!abort.signal.aborted)
            setRegionFacets({ key: facetsKey, districts: result.districts });
        })
        .catch(() => {
          /* Official bootstrap options remain available, explicitly labeled as global. */
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [facetsKey, available]);
  useEffect(() => {
    const invalid = Object.keys(errors)[0];
    if (invalid) document.getElementById(`${id}-${invalid}`)?.focus();
  }, [errors, id]);
  const select = (key: string, options: Array<[string, string]>, empty = "Todas as opções") => (
    <label className="cs-field" key={key} htmlFor={`${id}-${key}`}>
      <span>{labels[key]}</span>
      <select
        id={`${id}-${key}`}
        name={key}
        value={values[key] ?? ""}
        onChange={(e) => update(key, e.target.value)}
      >
        <option value="">{empty}</option>
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
  const numeric = (key: string) => (
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
  const typeField = select(
    "tipo",
    facets.types.map((x) => [x.value, x.value]),
    "Todos os tipos",
  );
  const cityField = select(
    "cidade",
    facets.cities.map((x) => [x.value, x.value]),
    "Todas as cidades",
  );
  const contextualRegions = regionFacets.key === facetsKey;
  const regionField = (
    <RegionCombobox
      id={`${id}-bairro`}
      districts={contextualRegions ? regionFacets.districts : facets.districts}
      contextual={contextualRegions}
      city={values.cidade ?? ""}
      value={values.bairro ?? ""}
      onChange={(district, city) => {
        setValues((old) => ({ ...old, bairro: district, ...(city ? { cidade: city } : {}) }));
        trackSiteEvent("filter_changed", { source: `${compact ? "home" : "filters"}:bairro` });
      }}
    />
  );
  const referenceFields = (
    <>
      <label className="cs-field" htmlFor={`${id}-referencia`}>
        <span>Referência Cordial</span>
        <input
          id={`${id}-referencia`}
          name="referencia"
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
        "Referência exata",
      )}
      {values.referencia && (
        <p className="cs-search-help">
          A referência será pesquisada junto com os demais filtros escolhidos.
        </p>
      )}
    </>
  );
  const group = (title: string, children: ReactNode) => (
    <fieldset className="cs-search-group">
      <legend>{title}</legend>
      <div className="cs-search-fields">{children}</div>
    </fieldset>
  );
  const budgetLabel =
    values.precoMin || values.precoMax
      ? `${values.precoMin ? money(Number(values.precoMin)) : "Sem mínimo"} — ${values.precoMax ? money(Number(values.precoMax)) : "sem máximo"}`
      : "Qual faixa de valor?";
  const priceSteps =
    values.finalidade === "venda" || values.finalidade === "aluguel"
      ? settings.priceSteps[values.finalidade]
      : [];
  const pricePresets = (
    <div
      className="cs-price-presets"
      role="group"
      aria-label="Tetos de valor, incluindo o limite informado"
    >
      {priceSteps.length ? (
        <>
          <small>Escolha um teto ou informe valores personalizados abaixo.</small>
          {priceSteps.map((ceiling) => (
            <button
              type="button"
              key={ceiling}
              aria-pressed={!values.precoMin && values.precoMax === String(ceiling)}
              onClick={() => {
                setValues((old) => ({ ...old, precoMin: "", precoMax: String(ceiling) }));
                trackSiteEvent("filter_changed", {
                  source: `${compact ? "home" : "filters"}:price_ceiling`,
                });
              }}
            >
              Até {money(ceiling)}
              {values.finalidade === "aluguel" ? " / mês" : ""}
            </button>
          ))}
        </>
      ) : (
        <small>
          Escolha Comprar ou Alugar para ver faixas prontas. Os valores personalizados continuam
          disponíveis.
        </small>
      )}
    </div>
  );
  return (
    <form
      className={`cs-search-form cs-search-essential ${compact ? "is-compact" : ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        const valid = searchSchema.safeParse(values);
        if (!valid.success) {
          setErrors(
            Object.fromEntries(valid.error.issues.map((issue) => [issue.path[0], issue.message])),
          );
          setBudget(true);
          return;
        }
        setErrors({});
        trackSiteEvent("search_applied", {
          source: compact ? "home" : "filters",
          ...(currentCount?.total != null ? { count: currentCount.total } : {}),
        });
        void navigate({ to: "/site/buscar", search: { ...valid.data, pagina: 1 } });
        onApplied?.();
      }}
    >
      {compact ? (
        <>
          <div className="cs-purpose-tabs" role="group" aria-label="Finalidade">
            {[
              ["venda", "Quero comprar"],
              ["aluguel", "Quero alugar"],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={values.finalidade === value}
                onClick={() => update("finalidade", value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="cs-search-fields">
            {typeField}
            {cityField}
            {regionField}
            <button
              type="button"
              className="cs-budget-trigger"
              aria-expanded={budget}
              aria-controls={`${id}-budget`}
              onClick={() => setBudget((old) => !old)}
            >
              <span>Valor</span>
              <strong>{budgetLabel}</strong>
              <ChevronDown size={16} />
            </button>
          </div>
          {budget && (
            <div className="cs-budget-fields cs-search-fields" id={`${id}-budget`}>
              {pricePresets}
              {numeric("precoMin")}
              {numeric("precoMax")}
            </div>
          )}
          <button className="cs-button cs-search-submit" type="submit">
            <Search size={19} />
            Buscar imóveis
          </button>
          <div className="cs-search-links">
            <SiteLink to={sitePath("/buscar")}>
              <SlidersHorizontal size={15} />
              Pesquisa completa
            </SiteLink>
            <button
              className="cs-text-link"
              type="button"
              aria-expanded={reference}
              aria-controls={`${id}-reference`}
              onClick={() => setReference((old) => !old)}
            >
              Buscar por referência <ArrowRight size={15} />
            </button>
          </div>
          {reference && (
            <div className="cs-search-fields" id={`${id}-reference`}>
              {referenceFields}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="cs-filter-scroll">
            {group(
              "Localização",
              <>
                {select(
                  "finalidade",
                  [
                    ["venda", "Comprar"],
                    ["aluguel", "Alugar"],
                  ],
                  "Comprar ou alugar",
                )}
                {typeField}
                {cityField}
                {regionField}
                <label className="cs-field" htmlFor={`${id}-q`}>
                  <span>Palavra na busca</span>
                  <input
                    id={`${id}-q`}
                    value={values.q ?? ""}
                    maxLength={100}
                    onChange={(e) => update("q", e.target.value)}
                    placeholder="Tipo, cidade ou bairro"
                  />
                </label>
              </>,
            )}
            {group(
              "Valores",
              <>
                {pricePresets}
                {numeric("precoMin")}
                {numeric("precoMax")}
                {select(
                  "valorModo",
                  [
                    ["fixo", "Preço informado"],
                    ["consulte", "Sob consulta"],
                  ],
                  "Todos os preços",
                )}
              </>,
            )}
            {group(
              "Características",
              <>
                {select(
                  "contagem",
                  [
                    ["minima", "Pelo menos a quantidade informada"],
                    ["exata", "Exatamente a quantidade informada"],
                  ],
                  "Pelo menos",
                )}
                {["dormitorios", "banheiros", "suites", "vagas"].map(numeric)}
              </>,
            )}
            {group(
              "Área e condições",
              <>
                {select(
                  "areaTipo",
                  [
                    ["construida", "Área construída"],
                    ["util", "Área útil"],
                    ["terreno", "Área do terreno"],
                    ["total", "Área total"],
                  ],
                  "Área construída",
                )}
                {numeric("areaMin")}
                {numeric("areaMax")}
                {["mobiliado", "permuta", "financiamento", "fotos"].map((key) =>
                  select(
                    key,
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
                    facets.stages.map((stage) => [stage, stage]),
                  )}
              </>,
            )}
            {group("Referência", referenceFields)}
          </div>
          <div className="cs-filter-actions cs-form-actions">
            <p className="cs-search-count" role="status" aria-live="polite">
              {!available ? (
                "Catálogo temporariamente indisponível."
              ) : queryKey === "invalid" ? (
                "Revise os valores informados."
              ) : currentCount?.error ? (
                <>
                  Contagem indisponível.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setCount({ key: "" });
                      setRetry((old) => old + 1);
                    }}
                  >
                    Tentar novamente
                  </button>
                </>
              ) : currentCount?.total != null ? (
                `${currentCount.total} ${currentCount.total === 1 ? "imóvel corresponde" : "imóveis correspondem"} a estes filtros.`
              ) : (
                "Atualizando a contagem…"
              )}
            </p>
            <button
              type="button"
              className="cs-button cs-button-light"
              onClick={() => {
                setValues(
                  searchDraft({ visualizacao: initial.visualizacao, ordem: initial.ordem }),
                );
                setErrors({});
              }}
            >
              Limpar
            </button>
            <button className="cs-button" type="submit">
              {currentCount?.total != null
                ? `Ver ${currentCount.total} imóveis`
                : "Aplicar filtros"}
              <ArrowRight size={18} />
            </button>
          </div>
        </>
      )}
    </form>
  );
}
