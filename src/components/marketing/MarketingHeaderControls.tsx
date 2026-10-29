import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { AgencySwitcher } from "@/components/agency-switcher";
import { useApp } from "@/store/app-store";
import {
  changeMarketingQuery,
  marketingSearchSchema,
  type MarketingDashboardQuery,
} from "@/lib/marketing/query-state";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Controlled context is used by the isolated component preview. Production reads the URL. */
  query?: MarketingDashboardQuery;
  onQueryChange?: (next: MarketingDashboardQuery) => void;
  showGoogle?: boolean;
};
function useMarketingHeaderContext({ query, onQueryChange }: Props) {
  const search = useRouterState({ select: (state) => state.location.search });
  const navigate = useNavigate();
  const filters = useMemo(() => query ?? marketingSearchSchema.parse(search), [query, search]);
  const apply = useCallback(
    (patch: Partial<MarketingDashboardQuery>) => {
      const next = changeMarketingQuery(filters, patch);
      if (onQueryChange) onQueryChange(next);
      else void navigate({ to: "/marketing", search: next, replace: true });
    },
    [filters, navigate, onQueryChange],
  );
  return { filters, apply };
}

/** The existing shell search slot becomes contextual, as it already does for the property catalog. */
export function MarketingHeaderSearchInput(props: Props) {
  const { filters, apply } = useMarketingHeaderContext(props);
  const contactSearch = filters.area === "leads";
  const field = contactSearch ? "leadSearch" : "search";
  const value = filters[field];
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(value), [value, field]);
  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => apply({ [field]: draft }), 350);
    return () => window.clearTimeout(timer);
  }, [draft, value, field, apply]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (inputRef.current?.getClientRects().length) {
          event.preventDefault();
          inputRef.current.focus();
        }
      }
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);
  return (
    <div
      className={cn(
        "glass-panel flex min-w-0 items-center gap-2 rounded-full border border-white/60 px-3.5 py-2 shadow-sm transition focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/30 motion-reduce:transition-none",
        props.className,
      )}
    >
      <Search className="size-4 shrink-0 text-primary/70" aria-hidden="true" />
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            apply({ [field]: draft });
          }
        }}
        placeholder={
          contactSearch ? "Buscar contato no Marketing…" : "Buscar campanha no Marketing…"
        }
        aria-label={contactSearch ? "Buscar contato no Marketing" : "Buscar campanha no Marketing"}
        className="h-7 min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground/65 focus:outline-none sm:h-6"
      />
      {draft ? (
        <button
          type="button"
          aria-label={contactSearch ? "Limpar busca de contatos" : "Limpar busca de campanhas"}
          className="grid size-7 shrink-0 place-items-center rounded-full text-foreground/65 hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => {
            setDraft("");
            apply({ [field]: "" });
            inputRef.current?.focus();
          }}
        >
          <X className="size-3.5" />
        </button>
      ) : (
        <kbd className="hidden shrink-0 rounded-md bg-foreground/5 px-1.5 py-0.5 text-[10px] text-foreground/60 xl:block">
          ⌘K
        </kbd>
      )}
    </div>
  );
}

/** Platform choice is URL-backed; switching also clears an incompatible account. */
export function MarketingPlatformSwitcher(props: Props) {
  const { filters, apply } = useMarketingHeaderContext(props);
  if (props.showGoogle === false) return null;
  return (
    <div
      role="group"
      aria-label="Plataforma de anúncios"
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-full border border-border/60 bg-card/75 p-1",
        props.className,
      )}
    >
      {(
        [
          { value: "meta", label: "Meta Ads", logo: "/brand/meta.svg" },
          { value: "google", label: "Google Ads", logo: "/brand/google-ads.svg" },
        ] as const
      ).map(({ value, label, logo }) => (
        <button
          key={value}
          type="button"
          aria-pressed={filters.platform === value}
          onClick={() => apply({ platform: value })}
          className={cn(
            "flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none",
            filters.platform === value
              ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/40"
              : "text-foreground/75 hover:bg-foreground/5",
          )}
        >
          <img src={logo} alt="" aria-hidden="true" className="size-5 shrink-0 object-contain" />
          {label}
          {filters.platform === value && <span className="sr-only">selecionado</span>}
        </button>
      ))}
    </div>
  );
}

/** Same global agency switcher; its Marketing URL and account scope change together. */
export function MarketingHeaderAgencyControl(props: Props) {
  const { filters, apply } = useMarketingHeaderContext(props);
  const globalAgency = useApp((state) => state.agency);
  const setAgency = useApp((state) => state.setAgency);
  return (
    <AgencySwitcher
      className={props.className}
      value={filters.agency ?? globalAgency}
      onChange={(agency) => {
        setAgency(agency);
        apply({ agency, accountId: "" });
      }}
    />
  );
}
