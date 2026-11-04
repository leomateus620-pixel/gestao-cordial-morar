import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  House,
  MapPin,
  Wallet,
  BedDouble,
  SlidersHorizontal,
  Search,
  ChevronDown,
  X,
} from "lucide-react";
import { defaultSearch, searchSchema, type SiteSearch } from "@/lib/cordial-site/contract";
import { loadCatalog } from "@/lib/cordial-site/data";
import { useSite } from "@/lib/cordial-site/context";
import { searchLabels } from "@/lib/cordial-site/search-labels";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

function useIsMobileDrawer() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return mobile;
}

const groups = [
  { key: "imovel", label: "Tipo de imóvel", icon: House, fields: ["tipo"] },
  { key: "local", label: "Onde morar", icon: MapPin, fields: ["cidade", "bairro"] },
  {
    key: "valor",
    label: "Seu orçamento",
    icon: Wallet,
    fields: ["precoMin", "precoMax", "valorModo"],
  },
  {
    key: "espacos",
    label: "Espaços",
    icon: BedDouble,
    fields: ["dormitorios", "banheiros", "suites", "vagas", "contagem"],
  },
  {
    key: "mais",
    label: "Mais filtros",
    icon: SlidersHorizontal,
    fields: [
      "referencia",
      "exata",
      "q",
      "areaTipo",
      "areaMin",
      "areaMax",
      "mobiliado",
      "permuta",
      "financiamento",
      "fotos",
      "estagio",
    ],
  },
] as const;
type Group = (typeof groups)[number]["key"];
type Values = Record<string, string>;
const initialValues = (initial: Partial<SiteSearch>): Values =>
  Object.fromEntries(
    Object.entries({ ...defaultSearch, ...initial })
      .filter(([, v]) => v != null)
      .map(([k, v]) => [k, String(v)]),
  );

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
  const [values, setValues] = useState<Values>(() =>
    initialValues(compact ? { ...initial, finalidade: initial.finalidade ?? "venda" } : initial),
  );
  const [active, setActive] = useState<Group | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [count, setCount] = useState<number | null>(null);
  const [countPending, setCountPending] = useState(false);
  const [countError, setCountError] = useState(false);
  const sequence = useRef(0);
  const isMobile = useIsMobileDrawer();
  // Mobile drawer edits a draft; applied `values` only change on "Aplicar filtros".
  const [draft, setDraft] = useState<Values | null>(null);
  const drawerOpen = isMobile && active !== null && draft !== null;
  const editing = drawerOpen && draft ? draft : values;
  const setEditing = drawerOpen ? (setDraft as typeof setValues) : setValues;
  const update = (key: string, value: string) =>
    setEditing((old) => ({ ...old, [key]: value, ...(key === "cidade" ? { bairro: "" } : {}) }));
  const openGroup = (key: Group) => {
    if (isMobile) {
      setDraft({ ...values });
      setActive(key);
    } else setActive((old) => (old === key ? null : key));
  };
  const closeDrawer = (apply: boolean) => {
    const key = active;
    if (apply && draft) setValues(draft);
    setDraft(null);
    setActive(null);
    if (key) requestAnimationFrame(() => document.getElementById(`${id}-group-${key}`)?.focus());
  };
  useEffect(() => {
    // Breakpoint change: keep applied filters, drop any unapplied draft so only one UI is mounted.
    setDraft(null);
    setActive(null);
  }, [isMobile]);
  const countValues = editing;
  useEffect(() => {
    const generation = ++sequence.current;
    const abort = new AbortController();
    if (!available) {
      setCount(null);
      setCountPending(false);
      setCountError(true);
      return;
    }
    const timer = setTimeout(() => {
      const parsed = searchSchema.safeParse(countValues);
      if (!parsed.success) {
        setCount(null);
        setCountPending(false);
        return;
      }
      setCountPending(true);
      setCountError(false);
      loadCatalog({ ...parsed.data, pagina: 1 }, abort.signal, "morar")
        .then((result) => {
          if (generation === sequence.current) setCount(result.total);
        })
        .catch(() => {
          if (generation === sequence.current && !abort.signal.aborted) {
            setCount(null);
            setCountError(true);
          }
        })
        .finally(() => {
          if (generation === sequence.current) setCountPending(false);
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [countValues, available]);
  useEffect(() => {
    const key = Object.keys(errors)[0];
    if (key) document.getElementById(`${id}-${key}`)?.focus();
  }, [errors, active, id]);
  const choices: Record<string, Array<[string, string]>> = {
    tipo: facets.types.map((x) => [x.value, `${x.value} (${x.count})`]),
    cidade: facets.cities.map((x) => [x.value, x.value]),
    bairro: facets.districts.filter((x) => x.city === editing.cidade).map((x) => [x.value, x.value]),
    valorModo: [
      ["fixo", "Preço informado"],
      ["consulte", "Sob consulta"],
    ],
    contagem: [
      ["minima", "Pelo menos"],
      ["exata", "Quantidade exata"],
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
    estagio: facets.stages.map((x) => [x, x]),
    ...Object.fromEntries(
      ["mobiliado", "permuta", "financiamento", "fotos"].map((k) => [
        k,
        [
          ["sim", "Sim"],
          ["nao", "Não"],
        ],
      ]),
    ),
  };
  const field = (key: string) => {
    if (key === "estagio" && !facets.stages.length) return null;
    const label =
      key === "referencia"
        ? "Referência Morar"
        : key === "q"
          ? "Tipo, cidade ou bairro"
          : key === "valorModo"
            ? "Tipo de preço"
            : (searchLabels[key] ?? key);
    const numeric = [
      "precoMin",
      "precoMax",
      "dormitorios",
      "banheiros",
      "suites",
      "vagas",
      "areaMin",
      "areaMax",
    ].includes(key);
    return (
      <label className="cs-field" htmlFor={`${id}-${key}`} key={key}>
        <span>{label}</span>
        {choices[key] ? (
          <select
            id={`${id}-${key}`}
            value={editing[key] ?? ""}
            onChange={(e) => update(key, e.target.value)}
            disabled={key === "bairro" && !editing.cidade}
          >
            <option value="">
              {key === "bairro" && !editing.cidade ? "Escolha a cidade primeiro" : "Todas as opções"}
            </option>
            {choices[key].map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`${id}-${key}`}
            type={numeric ? "number" : "text"}
            inputMode={numeric ? "decimal" : "text"}
            min={numeric ? 0 : undefined}
            step={
              numeric
                ? ["dormitorios", "banheiros", "suites", "vagas"].includes(key)
                  ? 1
                  : "any"
                : undefined
            }
            maxLength={numeric ? undefined : 100}
            value={editing[key] ?? ""}
            onChange={(e) => update(key, e.target.value)}
            aria-invalid={!!errors[key]}
            aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
          />
        )}{" "}
        {errors[key] && (
          <small id={`${id}-${key}-error`} className="cs-field-error">
            {errors[key]}
          </small>
        )}
      </label>
    );
  };
  const group = groups.find((g) => g.key === active);
  return (
    <form
      className={`ms-search ${compact ? "is-compact" : ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = searchSchema.safeParse(values);
        if (!parsed.success) {
          setErrors(Object.fromEntries(parsed.error.issues.map((e) => [e.path[0], e.message])));
          const invalid = String(parsed.error.issues[0]?.path[0]);
          setActive(
            groups.find((candidate) => candidate.fields.some((key) => key === invalid))?.key ??
              "mais",
          );
          return;
        }
        setErrors({});
        void navigate({ to: "/site-morar/buscar", search: { ...parsed.data, pagina: 1 } });
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
            onClick={() => update("finalidade", value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="ms-filter-row">
        {groups.map(({ key, label, icon: Icon, fields }) => {
          const selected = fields.filter(
            (k) => values[k] && values[k] !== String(defaultSearch[k as keyof SiteSearch] ?? ""),
          ).length;
          return (
            <button
              type="button"
              id={`${id}-group-${key}`}
              key={key}
              className={`ms-filter-trigger ${active === key ? "is-open" : ""}`}
              aria-expanded={active === key}
              aria-controls={`${id}-panel`}
              aria-haspopup={isMobile ? "dialog" : undefined}
              onClick={() => openGroup(key)}
            >
              <Icon size={22} strokeWidth={1.6} aria-hidden="true" />
              <span>
                {label}
                {selected > 0 && (
                  <small>
                    {selected} selecionado{selected > 1 ? "s" : ""}
                  </small>
                )}
              </span>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {isMobile && (
        <Sheet open={drawerOpen} onOpenChange={(open) => !open && closeDrawer(false)}>
          <SheetContent
            side="bottom"
            closeLabel="Fechar sem aplicar"
            className="ms-drawer"
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") {
                event.preventDefault();
                closeDrawer(true);
              }
            }}
          >
            <SheetHeader>
              <SheetTitle>{group?.label ?? "Filtros"}</SheetTitle>
              <SheetDescription>As mudanças só valem depois de aplicar.</SheetDescription>
            </SheetHeader>
            <div className="ms-drawer-body">
              <div className="ms-filter-fields">{group?.fields.map(field)}</div>
            </div>
            <div className="ms-drawer-footer">
              <span aria-live="polite" className="ms-search-count">
                {countPending
                  ? "Consultando…"
                  : count != null
                    ? `${count} ${count === 1 ? "imóvel" : "imóveis"}`
                    : ""}
              </span>
              <button
                type="button"
                className="cs-text-link"
                onClick={() => {
                  if (!group || !draft) return;
                  const cleared = { ...draft };
                  for (const k of group.fields)
                    cleared[k] = String(defaultSearch[k as keyof SiteSearch] ?? "");
                  setDraft(cleared);
                }}
              >
                Limpar
              </button>
              <button type="button" className="cs-button" onClick={() => closeDrawer(true)}>
                Aplicar filtros
              </button>
            </div>
          </SheetContent>
        </Sheet>
      )}
      {group && !isMobile && (
        <section
          className="ms-filter-panel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-group-${group.key}`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setActive(null);
              document.getElementById(`${id}-group-${group.key}`)?.focus();
            }
          }}
        >
          <div className="ms-filter-panel-heading">
            <h3>{group.label}</h3>
            <button
              type="button"
              className="cs-icon-button"
              aria-label="Recolher filtros"
              onClick={() => {
                setActive(null);
                document.getElementById(`${id}-group-${group.key}`)?.focus();
              }}
            >
              <X size={19} />
            </button>
          </div>
          <div className="ms-filter-fields">{group.fields.map(field)}</div>
        </section>
      )}
      <div className="ms-search-actions">
        <button
          type="button"
          className="cs-text-link"
          onClick={() => {
            setValues(initialValues(compact ? { finalidade: "venda" } : {}));
            setErrors({});
          }}
        >
          Limpar filtros
        </button>
        <span aria-live="polite" className="ms-search-count">
          {countPending
            ? "Consultando…"
            : countError
              ? "Contagem temporariamente indisponível"
              : count != null
                ? `${count} ${count === 1 ? "imóvel disponível" : "imóveis disponíveis"}`
                : "Combine os filtros do seu jeito"}
        </span>
        <button type="submit" className="cs-button">
          <Search size={18} />
          {compact
            ? "Encontrar meu lugar"
            : count != null
              ? `Ver ${count} imóveis`
              : "Aplicar filtros"}
        </button>
      </div>
    </form>
  );
}
