import { useApp } from "@/store/app-store";
import { cn } from "@/lib/utils";

const options = [
  { id: "cordial" as const, label: "Cordial" },
  { id: "morar" as const, label: "Morar" },
  { id: "todas" as const, label: "Todas" },
];

export function AgencySwitcher() {
  const agency = useApp((s) => s.agency);
  const setAgency = useApp((s) => s.setAgency);
  return (
    <div className="glass-panel flex gap-1 rounded-full p-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => setAgency(o.id)}
          className={cn(
            "flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
            agency === o.id
              ? "bg-white/80 text-foreground shadow-sm"
              : "text-foreground/55 hover:text-foreground/80",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}