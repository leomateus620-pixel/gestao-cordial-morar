import { useEffect, useRef, useState } from "react";
import { useApp } from "@/store/app-store";
import { cn } from "@/lib/utils";

const options = [
  { id: "todas" as const, label: "Todas", color: "var(--system-primary)" },
  { id: "cordial" as const, label: "Cordial", color: "var(--cordial-primary)" },
  { id: "morar" as const, label: "Morar", color: "var(--morar-primary)" },
];

export function AgencySwitcher() {
  const agency = useApp((s) => s.agency);
  const setAgency = useApp((s) => s.setAgency);
  const [activeAgency, setActiveAgency] = useState(agency);
  const pendingFrame = useRef<number | null>(null);
  const pointerHandled = useRef(false);

  useEffect(() => {
    setActiveAgency(agency);
  }, [agency]);

  useEffect(
    () => () => {
      if (pendingFrame.current !== null) window.cancelAnimationFrame(pendingFrame.current);
    },
    [],
  );

  const changeAgency = (nextAgency: (typeof options)[number]["id"]) => {
    setActiveAgency(nextAgency);

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
    <div className="glass-panel flex w-full min-w-0 gap-1 rounded-full p-1 sm:max-w-xs">
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
