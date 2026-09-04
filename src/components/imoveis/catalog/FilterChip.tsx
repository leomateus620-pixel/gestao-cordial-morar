import { forwardRef, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Check, Search, X, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type FilterChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value"> & {
  icon: LucideIcon;
  /** Nome do filtro quando nada está selecionado (ex.: "Tipo"). */
  label: string;
  /** Valor atual; quando presente o chip entra no estado destacado. */
  value?: string | null;
  /** Quantidade extra exibida como badge (ex.: filtros avançados ativos). */
  count?: number;
  /** Força o destaque mesmo sem valor (ex.: painel aberto). */
  active?: boolean;
  /** Mostra o "x" para limpar quando há valor. */
  onClear?: () => void;
  /** Some com o texto em telas pequenas, deixando só o ícone (proporção mínima). */
  iconOnlyOnMobile?: boolean;
};

/**
 * Chip de filtro compacto: ícone em destaque + rótulo curto.
 * Idle = vidro neutro · Ativo = preenchido na cor primária.
 */
export const FilterChip = forwardRef<HTMLButtonElement, FilterChipProps>(function FilterChip(
  { icon: Icon, label, value, count, active, onClear, iconOnlyOnMobile, className, ...props },
  ref,
) {
  const hasValue = Boolean(value);
  const highlighted = hasValue || Boolean(active) || Boolean(count);
  const text = value ?? label;

  return (
    <button
      ref={ref}
      type="button"
      aria-label={hasValue ? `${label}: ${value}` : label}
      data-active={highlighted ? "true" : "false"}
      className={cn(
        "catalog-filter-chip group/chip relative inline-flex h-9 shrink-0 select-none items-center gap-1.5 rounded-full border pl-1 pr-3 text-xs font-semibold outline-none transition-[background-color,color,box-shadow,border-color,transform] duration-150",
        "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 active:scale-[0.97] motion-reduce:transform-none",
        highlighted
          ? "border-primary/80 bg-primary text-white shadow-[0_10px_22px_-10px_rgba(30,100,125,0.7)]"
          : "border-white/70 bg-white/60 text-foreground/70 shadow-[0_4px_14px_-8px_rgba(23,27,33,0.18)] backdrop-blur-md hover:border-primary/25 hover:bg-white/90 hover:text-foreground",
        iconOnlyOnMobile && !hasValue && "pr-1 sm:pr-3",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full transition-colors",
          highlighted ? "bg-white/18 text-white" : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="size-3.5" strokeWidth={2.2} />
      </span>
      <span
        className={cn(
          "max-w-[9.5rem] truncate",
          iconOnlyOnMobile && !hasValue && "sr-only sm:not-sr-only",
        )}
      >
        {text}
      </span>
      {count ? (
        <span className="grid size-4.5 place-items-center rounded-full bg-white text-[10px] font-bold leading-none text-primary tabular-nums">
          {count}
        </span>
      ) : null}
      {hasValue && onClear ? (
        <span
          role="button"
          tabIndex={-1}
          aria-label={`Limpar ${label.toLowerCase()}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClear();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          className="-mr-1.5 grid size-5 place-items-center rounded-full text-white/75 transition hover:bg-white/20 hover:text-white"
        >
          <X className="size-3" strokeWidth={2.4} />
        </span>
      ) : null}
    </button>
  );
});

export type FilterOption<T extends string = string> = { value: T; label: string; hint?: string };

type FilterChipSelectProps<T extends string> = {
  icon: LucideIcon;
  label: string;
  value: T;
  options: FilterOption<T>[];
  /** Valor considerado "sem filtro" — o chip fica neutro e sem "x". */
  emptyValue: T;
  /** Texto do chip no estado neutro (padrão: o próprio `label`). */
  emptyLabel?: string;
  onChange: (value: T) => void;
  /** Mostra busca dentro do popover quando a lista é longa. */
  searchable?: boolean;
  /** Conteúdo extra no rodapé do popover. */
  footer?: ReactNode;
  align?: "start" | "center" | "end";
  iconOnlyOnMobile?: boolean;
  className?: string;
};

/** Chip que abre uma lista de opções com marcação — substitui o `<select>` nativo. */
export function FilterChipSelect<T extends string>({
  icon,
  label,
  value,
  options,
  emptyValue,
  emptyLabel,
  onChange,
  searchable,
  footer,
  align = "start",
  iconOnlyOnMobile,
  className,
}: FilterChipSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const selected = options.find((option) => option.value === value);
  const isEmpty = value === emptyValue;
  const showSearch = searchable ?? options.length > 8;

  const visible = useMemo(() => {
    const q = term.trim().toLocaleLowerCase("pt-BR");
    if (!q) return options;
    return options.filter((option) => option.label.toLocaleLowerCase("pt-BR").includes(q));
  }, [options, term]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTerm("");
      }}
    >
      <PopoverTrigger asChild>
        <FilterChip
          icon={icon}
          label={isEmpty && emptyLabel ? emptyLabel : label}
          value={isEmpty ? null : (selected?.label ?? String(value))}
          active={open}
          onClear={() => onChange(emptyValue)}
          iconOnlyOnMobile={iconOnlyOnMobile}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={className}
        />
      </PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={8}
        collisionPadding={12}
        className="catalog-filter-popover w-[min(92vw,17.5rem)] rounded-2xl border-white/70 bg-white/92 p-1.5 shadow-[0_24px_60px_-20px_rgba(23,27,33,0.35)] backdrop-blur-2xl"
      >
        <div className="flex items-center justify-between px-2.5 pb-1 pt-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/45">
            {label}
          </span>
          {!isEmpty ? (
            <button
              type="button"
              onClick={() => {
                onChange(emptyValue);
                setOpen(false);
              }}
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              Limpar
            </button>
          ) : null}
        </div>

        {showSearch ? (
          <label className="mx-1 mb-1 flex items-center gap-2 rounded-xl bg-foreground/[0.05] px-2.5 py-1.5">
            <Search className="size-3.5 text-foreground/40" />
            <input
              autoFocus
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder={`Buscar ${label.toLocaleLowerCase("pt-BR")}…`}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/35"
            />
          </label>
        ) : null}

        <ul
          role="listbox"
          aria-label={label}
          className="max-h-[min(50vh,18rem)] overflow-y-auto p-0.5"
        >
          {visible.length === 0 ? (
            <li className="px-3 py-3 text-center text-xs text-foreground/45">Nada encontrado</li>
          ) : null}
          {visible.map((option) => {
            const isSelected = option.value === value;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors",
                    isSelected
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-foreground/80 hover:bg-foreground/[0.05]",
                  )}
                >
                  <span className="min-w-0 truncate">
                    {option.label}
                    {option.hint ? (
                      <span className="ml-1.5 text-[11px] font-normal text-foreground/40">
                        {option.hint}
                      </span>
                    ) : null}
                  </span>
                  {isSelected ? <Check className="size-4 shrink-0" strokeWidth={2.6} /> : null}
                </button>
              </li>
            );
          })}
        </ul>
        {footer}
      </PopoverContent>
    </Popover>
  );
}
