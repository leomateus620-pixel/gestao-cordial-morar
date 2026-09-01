import { useEffect, useRef, useState } from "react";
import { useApp } from "@/store/app-store";
import { cn } from "@/lib/utils";

const options = [
  { id: "todas" as const, label: "Todas", color: "var(--system-primary)" },
  { id: "cordial" as const, label: "Cordial", color: "var(--cordial-primary)" },
  { id: "morar" as const, label: "Morar", color: "var(--morar-primary)" },
];

type AgencyId = (typeof options)[number]["id"];

export function AgencySwitcher({
  value,
  onChange,
  className,
}: {
  /** Modo controlado (ex.: filtro de carteira do catálogo de Imóveis). */
  value?: AgencyId;
  onChange?: (value: AgencyId) => void;
  className?: string;
} = {}) {
  const controlled = value !== undefined;
  const agency = useApp((s) => s.agency);
  const setAgency = useApp((s) => s.setAgency);
  const [activeAgency, setActiveAgency] = useState<AgencyId>(value ?? agency);
  const pendingFrame = useRef<number | null>(null);
  const pointerHandled = useRef(false);

  useEffect(() => {
    setActiveAgency(value ?? agency);
  }, [agency, value]);

  useEffect(
    () => () => {
      if (pendingFrame.current !== null) window.cancelAnimationFrame(pendingFrame.current);
    },
    [],
  );

  const changeAgency = (nextAgency: AgencyId) => {
    setActiveAgency(nextAgency);

    if (controlled) {
      onChange?.(nextAgency);
      return;
    }

    if (pendingFrame.current !== null) window.cancelAnimationFrame(pendingFrame.current);
    if (agency === nextAgency) {
      pendingFrame.current = null;
      return;
    }

    pendingFrame.current = window.requestAnimationFrame(() => {
      pendingFrame.current = window.requestAnimationFrame(() => {
        setAgency(nextAgency);
        pendingFrame.current = null;
      });
    });
  };

  return (
    <div
      className={cn(
        "glass-panel flex w-full min-w-0 gap-0.5 rounded-full p-0.5 sm:max-w-xs",
        className,
      )}
    >

      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={activeAgency === o.id}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            pointerHandled.current = true;
            changeAgency(o.id);
          }}
          onClick={() => {
            if (pointerHandled.current) {
              pointerHandled.current = false;
              return;
            }
            changeAgency(o.id);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") changeAgency(o.id);
          }}
          style={activeAgency === o.id ? { background: o.color, color: "#fff" } : undefined}
          className={cn(
            "min-h-11 min-w-0 flex-1 cursor-pointer truncate rounded-full px-3 py-2 text-xs font-semibold select-none touch-manipulation [-webkit-tap-highlight-color:transparent] transition-[background-color,color,box-shadow] duration-75 ease-out motion-reduce:transition-none",
            activeAgency === o.id
              ? "shadow-[0_6px_18px_-6px_rgba(23,27,33,0.35)]"
              : "text-foreground/60 [@media(hover:hover)]:hover:text-foreground/85",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
