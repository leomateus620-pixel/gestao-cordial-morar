import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Search, X } from "lucide-react";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import type { BuscaResultado } from "@/types/busca";
import { cn } from "@/lib/utils";
import { SearchResultCard } from "./SearchResultCard";
import { RecordTimelineDrawer } from "./RecordTimelineDrawer";

type Props = {
  className?: string;
};

export function GlobalSearchBar({ className }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<{
    categoria: BuscaResultado["categoria"];
    id: string;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { results, isLoading, hasQuery } = useGlobalSearch(query, "todos", open);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const visible = results.slice(0, 8);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="glass-panel flex items-center gap-2 rounded-full border border-white/60 px-3.5 py-2 shadow-sm transition focus-within:border-primary/40 focus-within:shadow-md focus-within:shadow-primary/10">
        <Search className="size-4 shrink-0 text-primary/70" />
        <input
          ref={inputRef}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && query.trim().length >= 2) {
              setOpen(false);
              navigate({ to: "/busca", search: { q: query.trim() } });
            }
          }}
          placeholder="Buscar cliente, contrato, venda, agenciamento…"
          aria-label="Busca global do sistema"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground/40 focus:outline-none"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Limpar busca"
            className="grid size-6 shrink-0 place-items-center rounded-full text-foreground/40 transition hover:bg-foreground/5 hover:text-foreground/70"
          >
            <X className="size-3.5" />
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded-md bg-foreground/5 px-1.5 py-0.5 text-[10px] font-semibold text-foreground/40 xl:block">
            ⌘K
          </kbd>
        )}
      </div>

      {open && hasQuery ? (
        <div className="absolute top-[calc(100%+0.5rem)] right-0 left-0 z-50 max-h-[65vh] overflow-y-auto rounded-3xl border border-white/60 bg-white/95 p-2 shadow-2xl shadow-foreground/10 backdrop-blur-xl">
          {isLoading ? (
            <p className="flex items-center gap-2 px-3 py-4 text-sm text-foreground/50">
              <Loader2 className="size-4 animate-spin" /> Buscando…
            </p>
          ) : visible.length === 0 ? (
            <p className="px-3 py-4 text-sm text-foreground/50">
              Nada encontrado para “{query.trim()}”.
            </p>
          ) : (
            <div className="space-y-1">
              {visible.map((result) => (
                <SearchResultCard
                  key={`${result.categoria}-${result.id}`}
                  result={result}
                  compact
                  onSelect={(item) => {
                    setOpen(false);
                    setTarget({ categoria: item.categoria, id: item.id });
                  }}
                />
              ))}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate({ to: "/busca", search: { q: query.trim() } });
                }}
                className="w-full rounded-2xl px-3 py-2 text-left text-xs font-semibold text-primary transition hover:bg-primary/5"
              >
                Ver todos os resultados
              </button>
            </div>
          )}
        </div>
      ) : null}

      <RecordTimelineDrawer target={target} onOpenChange={(o) => !o && setTarget(null)} />
    </div>
  );
}
