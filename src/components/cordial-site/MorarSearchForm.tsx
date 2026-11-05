import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  House,
  MapPin,
  Wallet,
  BedDouble,
  SlidersHorizontal,
  Search,
  type LucideIcon,
} from "lucide-react";
import { defaultSearch, searchSchema, type SiteSearch } from "@/lib/cordial-site/contract";
import { loadCatalogCount } from "@/lib/cordial-site/data";
import { useSite } from "@/lib/cordial-site/context";
import { searchDraft, searchQueryKey } from "@/lib/cordial-site/search-state";
import {
  advancedCount,
  advancedDraft,
  changePurpose,
  formatSearchPrice,
  mergeAdvanced,
  morarAdvancedFields,
  parseSearchPrice,
  type AdvancedField,
  type SearchValues,
} from "@/lib/cordial-site/morar-search";
import { searchLabels } from "@/lib/cordial-site/search-labels";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MorarIcon } from "./MorarIcon";
import { MorarLocationCombobox } from "./MorarLocationCombobox";

function SearchGroup({
  icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="ms-search-group">
      <legend>
        <MorarIcon icon={icon} size={24} />
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function MoneyInput({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(() => formatSearchPrice(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current || value === "") setText(formatSearchPrice(value));
  }, [value]);
  return (
    <label className="cs-field" htmlFor={id}>
      <span>{label}</span>
      <span className="ms-money-input">
        <span aria-hidden="true">R$</span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder={label === "Mínimo" ? "Sem mínimo" : "Sem máximo"}
          value={text}
          aria-label={`${label} em reais`}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onFocus={() => {
            editing.current = true;
          }}
          onBlur={() => {
            editing.current = false;
            if (value !== "invalid") setText(formatSearchPrice(value));
          }}
          onChange={(event) => {
            setText(event.target.value);
            onChange(parseSearchPrice(event.target.value));
          }}
        />
      </span>
      {error && (
        <small className="cs-field-error" id={`${id}-error`}>
          {error}
        </small>
      )}
    </label>
  );
}

export function MorarSearchForm({
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
  const [values, setValues] = useState<SearchValues>(() => searchDraft(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [locationPending, setLocationPending] = useState(false);
  const [locationReset, setLocationReset] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [draft, setDraft] = useState<SearchValues>({});
  const [advancedErrors, setAdvancedErrors] = useState<Record<string, string>>({});
  const advancedButton = useRef<HTMLButtonElement>(null);
  const [count, setCount] = useState<{ key: string; total: number } | null>(null);
  const [countError, setCountError] = useState(false);
  const sequence = useRef(0);
  const parsed = searchSchema.safeParse(values);
  const countKey =
    parsed.success && !locationPending ? searchQueryKey(parsed.data, true) : "invalid";

  useEffect(() => {
    const generation = ++sequence.current;
    const abort = new AbortController();
    if (!available || countKey === "invalid") return;
    setCountError(false);
    const timer = setTimeout(() => {
      loadCatalogCount(
        { ...defaultSearch, ...Object.fromEntries(JSON.parse(countKey)), pagina: 1 },
        abort.signal,
        "morar",
      )
        .then((result) => {
          if (generation === sequence.current && !abort.signal.aborted)
            setCount({ key: countKey, total: result.total });
        })
        .catch(() => {
          if (generation === sequence.current && !abort.signal.aborted) setCountError(true);
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [countKey, available]);

  useEffect(() => {
    const key = Object.keys(advancedOpen ? advancedErrors : errors)[0];
    if (key) document.getElementById(`${id}-${key}`)?.focus();
  }, [errors, advancedErrors, advancedOpen, id]);

  const update = (key: string, value: string) => {
    setValues((old) => ({ ...old, [key]: value }));
    setErrors((old) => {
      const next = { ...old };
      delete next[key];
      return next;
    });
  };
  const openAdvanced = (open: boolean) => {
    if (open) {
      setDraft(advancedDraft(values));
      setAdvancedErrors({});
    } else setDraft({});
    setAdvancedOpen(open);
  };
  const applyAdvanced = () => {
    const result = searchSchema.safeParse(mergeAdvanced(values, draft));
    const issues = result.success
      ? []
      : result.error.issues.filter((issue) =>
          morarAdvancedFields.includes(issue.path[0] as AdvancedField),
        );
    if (issues.length) {
      setAdvancedErrors(Object.fromEntries(issues.map((issue) => [issue.path[0], issue.message])));
      return;
    }
    // Functional merge: the dialog never restores an older purpose/location/budget/count mode.
    setValues((current) => mergeAdvanced(current, draft));
    openAdvanced(false);
  };

  const countMode = values.contagem === "exata" ? "exata" : "minima";
  const roomOptions = (current: string) =>
    [
      ...new Set([
        ...Array.from({ length: 101 }, (_, value) => value),
        ...(current ? [Number(current)] : []),
      ]),
    ].sort((a, b) => a - b);
  const roomSelect = (
    key: string,
    label: string,
    current: string,
    onChange: (value: string) => void,
    error?: string,
  ) => (
    <label className="cs-field" htmlFor={`${id}-${key}`} key={key}>
      <span>{label}</span>
      <select
        id={`${id}-${key}`}
        name={key}
        value={current}
        onChange={(event) => onChange(event.target.value)}
        aria-label={searchLabels[key]}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-${key}-error` : `${id}-count-help`}
      >
        <option value="">Todos</option>
        {roomOptions(current).map((n) => (
          <option key={n} value={n}>
            {n}
            {countMode === "minima" ? "+" : ""}
          </option>
        ))}
      </select>
      {error && (
        <small className="cs-field-error" id={`${id}-${key}-error`}>
          {error}
        </small>
      )}
    </label>
  );
  const advancedChoices: Partial<Record<AdvancedField, Array<[string, string]>>> = {
    valorModo: [
      ["fixo", "Preço informado"],
      ["consulte", "Sob consulta"],
    ],
    areaTipo: [
      ["construida", "Área construída"],
      ["util", "Área útil"],
      ["total", "Área total"],
      ["terreno", "Área do terreno"],
    ],
    exata: [
      ["sim", "Referência exata"],
      ["nao", "Parte da referência"],
    ],
    estagio: [...new Set([...facets.stages, ...(draft.estagio ? [draft.estagio] : [])])].map(
      (stage) => [stage, stage],
    ),
    ...Object.fromEntries(
      ["mobiliado", "permuta", "financiamento", "fotos", "destaque"].map((key) => [
        key,
        [
          ["sim", "Sim"],
          ["nao", "Não"],
        ],
      ]),
    ),
  };
  const advancedField = (key: AdvancedField) => {
    if (key === "estagio" && !facets.stages.length && !draft.estagio) return null;
    const error = advancedErrors[key];
    const change = (value: string) => {
      setDraft((old) => ({ ...old, [key]: value }));
      setAdvancedErrors((old) => {
        const next = { ...old };
        delete next[key];
        return next;
      });
    };
    if (key === "suites") return roomSelect(key, "Suítes", draft[key] ?? "", change, error);
    const label =
      key === "referencia"
        ? "Referência Morar"
        : key === "valorModo"
          ? "Tipo de preço"
          : key === "destaque"
            ? "Imóveis em destaque"
            : (searchLabels[key] ?? key);
    const options = advancedChoices[key];
    return (
      <label className="cs-field" htmlFor={`${id}-${key}`} key={key}>
        <span>{label}</span>
        {options ? (
          <select
            id={`${id}-${key}`}
            value={draft[key] ?? ""}
            onChange={(event) => change(event.target.value)}
          >
            <option value="">Todas as opções</option>
            {options.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`${id}-${key}`}
            type={key.startsWith("area") ? "number" : "text"}
            inputMode={key.startsWith("area") ? "decimal" : "text"}
            min={0}
            step="any"
            maxLength={100}
            value={draft[key] ?? ""}
            onChange={(event) => change(event.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-${key}-error` : undefined}
          />
        )}
        {error && (
          <small className="cs-field-error" id={`${id}-${key}-error`}>
            {error}
          </small>
        )}
      </label>
    );
  };
  const activeAdvanced = advancedCount(values);
  return (
    <Sheet open={advancedOpen} onOpenChange={openAdvanced}>
      <form
        className={`ms-search ${compact ? "is-compact" : ""}`}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (locationPending) {
            setErrors({
              localizacao: "Selecione uma cidade ou bairro da lista, ou limpe a localização.",
            });
            return;
          }
          const result = searchSchema.safeParse(values);
          if (!result.success) {
            const invalid = Object.fromEntries(
              result.error.issues.map((issue) => [
                issue.path[0],
                issue.code === "invalid_type" && String(issue.path[0]).startsWith("preco")
                  ? "Informe um valor válido em reais."
                  : issue.message,
              ]),
            );
            const advanced = Object.fromEntries(
              Object.entries(invalid).filter(([key]) =>
                morarAdvancedFields.includes(key as AdvancedField),
              ),
            );
            setErrors(invalid);
            if (Object.keys(advanced).length) {
              setDraft(advancedDraft(values));
              setAdvancedErrors(advanced);
              setAdvancedOpen(true);
            }
            return;
          }
          setErrors({});
          void navigate({ to: "/site-morar/buscar", search: { ...result.data, pagina: 1 } });
          onApplied?.();
        }}
      >
        <div className="ms-search-purpose" role="group" aria-label="Comprar ou alugar">
          {[
            ["venda", "Quero comprar"],
            ["aluguel", "Quero alugar"],
            ...(!compact ? [["", "Todas as opções"]] : []),
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={(values.finalidade ?? "") === value}
              onClick={() => {
                if ((values.finalidade ?? "") === value) return;
                setValues((old) => changePurpose(old, value));
                setErrors((old) =>
                  Object.fromEntries(
                    Object.entries(old).filter(([key]) => !key.startsWith("preco")),
                  ),
                );
                setAnnouncement(
                  "Finalidade alterada. O orçamento foi limpo; os demais filtros foram mantidos.",
                );
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ms-search-grid">
          <SearchGroup icon={House} title="Tipo de imóvel">
            <select
              id={`${id}-tipo`}
              name="tipo"
              aria-label="Tipo de imóvel"
              value={values.tipo ?? ""}
              onChange={(event) => update("tipo", event.target.value)}
            >
              <option value="">Todos os tipos</option>
              {values.tipo && !facets.types.some((type) => type.value === values.tipo) && (
                <option value={values.tipo}>{values.tipo}</option>
              )}
              {facets.types.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.value}
                </option>
              ))}
            </select>
          </SearchGroup>
          <SearchGroup icon={MapPin} title="Onde morar">
            <MorarLocationCombobox
              id={`${id}-localizacao`}
              facets={facets}
              city={values.cidade ?? ""}
              district={values.bairro ?? ""}
              resetKey={locationReset}
              error={errors.localizacao}
              onPendingChange={setLocationPending}
              onChange={(cidade, bairro) => {
                setValues((old) => ({ ...old, cidade, bairro }));
                setErrors((old) => {
                  const next = { ...old };
                  delete next.localizacao;
                  return next;
                });
              }}
            />
          </SearchGroup>
          <SearchGroup icon={Wallet} title="Seu orçamento">
            <div className="ms-budget-fields">
              <MoneyInput
                id={`${id}-precoMin`}
                label="Mínimo"
                value={values.precoMin ?? ""}
                error={errors.precoMin}
                onChange={(value) => update("precoMin", value)}
              />
              <MoneyInput
                id={`${id}-precoMax`}
                label="Máximo"
                value={values.precoMax ?? ""}
                error={errors.precoMax}
                onChange={(value) => update("precoMax", value)}
              />
            </div>
            <small className="ms-field-help">
              {values.finalidade === "aluguel"
                ? "Aluguel por mês"
                : values.finalidade === "venda"
                  ? "Valor de compra"
                  : "Valor do imóvel"}{" "}
              em reais
            </small>
          </SearchGroup>
          <SearchGroup icon={BedDouble} title="Espaços">
            <div className="ms-space-fields">
              {roomSelect(
                "dormitorios",
                "Dorm.",
                values.dormitorios ?? "",
                (value) => update("dormitorios", value),
                errors.dormitorios,
              )}
              {roomSelect(
                "banheiros",
                "Banh.",
                values.banheiros ?? "",
                (value) => update("banheiros", value),
                errors.banheiros,
              )}
              {roomSelect(
                "vagas",
                "Vagas",
                values.vagas ?? "",
                (value) => update("vagas", value),
                errors.vagas,
              )}
            </div>
            <label className="ms-count-mode">
              <span>Contagem</span>
              <select
                id={`${id}-contagem`}
                aria-label="Modo de contagem dos espaços"
                value={countMode}
                onChange={(event) => update("contagem", event.target.value)}
              >
                <option value="minima">Pelo menos (+)</option>
                <option value="exata">Quantidade exata</option>
              </select>
            </label>
            <span id={`${id}-count-help`} className="cs-sr-only">
              {countMode === "exata"
                ? "Quantidade exata, incluindo suítes nos filtros avançados."
                : "O sinal mais significa pelo menos a quantidade escolhida, incluindo suítes nos filtros avançados."}
            </span>
          </SearchGroup>
        </div>
        <SheetTrigger asChild>
          <button ref={advancedButton} type="button" className="ms-more-filters">
            <MorarIcon icon={SlidersHorizontal} />
            Mais filtros
            {activeAdvanced > 0 && (
              <span aria-label={`${activeAdvanced} filtros avançados ativos`}>
                {activeAdvanced}
              </span>
            )}
          </button>
        </SheetTrigger>
        <div className="ms-search-actions">
          <button
            type="button"
            className="cs-text-link"
            onClick={() => {
              setValues(
                searchDraft({
                  finalidade: values.finalidade as SiteSearch["finalidade"],
                  visualizacao: initial.visualizacao,
                  ordem: initial.ordem,
                }),
              );
              setErrors({});
              setLocationPending(false);
              setLocationReset((old) => old + 1);
              setAnnouncement("Filtros limpos. Finalidade mantida.");
            }}
          >
            Limpar filtros
          </button>
          <span
            role="status"
            aria-live="polite"
            className="ms-search-count"
            aria-busy={
              available && countKey !== "invalid" && count?.key !== countKey && !countError
            }
          >
            {!available || countError
              ? "Contagem temporariamente indisponível"
              : countKey === "invalid"
                ? "Revise os campos para atualizar a contagem"
                : count
                  ? `${count.total} ${count.total === 1 ? "imóvel disponível" : "imóveis disponíveis"}${count.key !== countKey ? " · atualizando…" : ""}`
                  : "Consultando imóveis…"}
          </span>
          <button type="submit" className="cs-button">
            <MorarIcon icon={Search} />
            Encontrar meu lugar
          </button>
        </div>
        <span className="cs-sr-only" role="status">
          {announcement}
        </span>
      </form>
      <SheetContent
        side="bottom"
        closeLabel="Fechar sem aplicar"
        className="cordial-site morar-site ms-drawer"
        overlayClassName="cordial-site morar-site ms-drawer-overlay"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          advancedButton.current?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") {
            event.preventDefault();
            applyAdvanced();
          }
        }}
      >
        <SheetHeader>
          <SheetTitle>Mais filtros</SheetTitle>
          <SheetDescription>
            Refine sua busca. As mudanças só valem depois de aplicar.
          </SheetDescription>
        </SheetHeader>
        <div className="ms-drawer-body">
          <div className="ms-advanced-fields">{morarAdvancedFields.map(advancedField)}</div>
        </div>
        <div className="ms-drawer-footer">
          <button
            type="button"
            className="cs-text-link"
            onClick={() => {
              setDraft(advancedDraft(searchDraft()));
              setAdvancedErrors({});
            }}
          >
            Limpar avançados
          </button>
          <button type="button" className="cs-button" onClick={applyAdvanced}>
            Aplicar filtros
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
