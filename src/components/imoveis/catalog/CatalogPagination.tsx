import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { paginationWindow } from "@/lib/imoveis/pagination";

export function CatalogPagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const items = paginationWindow(page, totalPages);

  const navButton =
    "grid size-9 place-items-center rounded-full border border-white/70 bg-white/60 text-foreground/65 backdrop-blur-md transition hover:bg-white hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-white/60";

  return (
    <nav
      aria-label="Paginação do catálogo"
      className={cn("flex flex-col items-center gap-3 sm:flex-row sm:justify-between", className)}
    >
      <p className="order-2 text-[12px] font-medium text-foreground/50 tabular-nums sm:order-1">
        Mostrando{" "}
        <span className="text-foreground/75">
          {from.toLocaleString("pt-BR")}–{to.toLocaleString("pt-BR")}
        </span>{" "}
        de <span className="text-foreground/75">{total.toLocaleString("pt-BR")}</span>
      </p>

      <div className="order-1 flex items-center gap-1 sm:order-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          aria-label="Página anterior"
          className={navButton}
        >
          <ChevronLeft className="size-4" />
        </button>

        <ol className="flex items-center gap-1">
          {items.map((item, index) =>
            item === null ? (
              <li
                key={`gap-${index}`}
                aria-hidden
                className="hidden w-5 text-center text-xs text-foreground/35 sm:block"
              >
                …
              </li>
            ) : (
              <li key={item} className={cn(item !== page && "hidden sm:block")}>
                <button
                  type="button"
                  onClick={() => onPageChange(item)}
                  aria-current={item === page ? "page" : undefined}
                  aria-label={`Página ${item + 1}`}
                  className={cn(
                    "grid h-9 min-w-9 place-items-center rounded-full px-2 text-[12px] font-semibold tabular-nums transition-colors",
                    item === page
                      ? "bg-primary text-white shadow-[0_8px_18px_-8px_rgba(30,100,125,0.6)]"
                      : "text-foreground/60 hover:bg-white/70 hover:text-foreground",
                  )}
                >
                  {item === page ? (
                    <span>
                      {item + 1}
                      <span className="sm:hidden"> / {totalPages}</span>
                    </span>
                  ) : (
                    item + 1
                  )}
                </button>
              </li>
            ),
          )}
        </ol>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page + 1 >= totalPages}
          aria-label="Próxima página"
          className={navButton}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}
