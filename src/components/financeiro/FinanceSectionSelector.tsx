import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { financeSections, type FinanceSection } from "@/components/financeiro/finance-sections";

export function FinanceSectionSelector({
  value,
  onChange,
}: {
  value: FinanceSection;
  onChange: (section: FinanceSection) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % financeSections.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + financeSections.length) % financeSections.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = financeSections.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    refs.current[nextIndex]?.focus();
    onChange(financeSections[nextIndex].id);
  };

  return (
    <nav aria-label="Seções do Financeiro" className="min-w-0">
      <div
        role="tablist"
        aria-orientation="horizontal"
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-2 lg:overflow-visible lg:px-0 2xl:grid-cols-8"
      >
        {financeSections.map((section, index) => {
          const Icon = section.icon;
          const selected = value === section.id;
          return (
            <button
              key={section.id}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`finance-tab-${section.id}`}
              aria-selected={selected}
              aria-controls="finance-section-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(section.id)}
              onKeyDown={(event) => moveFocus(event, index)}
              className={cn(
                "relative flex min-h-11 min-w-max snap-start items-center justify-center gap-2 overflow-hidden rounded-2xl border px-3.5 text-xs font-black transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 motion-reduce:transition-none lg:min-w-0",
                selected
                  ? "border-primary/25 bg-primary text-white shadow-[0_12px_28px_-16px_rgba(30,100,125,0.75)]"
                  : "border-white/60 bg-white/48 text-foreground/62 hover:border-primary/15 hover:bg-white/72 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">{section.label}</span>
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-3 bottom-0 h-0.5 origin-center rounded-full bg-white transition-transform duration-200 ease-out motion-reduce:transition-none",
                  selected ? "scale-x-100" : "scale-x-0",
                )}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
