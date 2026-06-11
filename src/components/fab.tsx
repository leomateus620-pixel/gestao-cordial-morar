import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function Fab({ onClick, label = "Novo" }: { onClick?: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        "fixed bottom-24 right-6 z-30 grid size-14 place-items-center rounded-full",
        "bg-primary text-primary-foreground shadow-2xl shadow-primary/40",
        "ring-4 ring-primary/15 transition-transform active:scale-95",
      )}
    >
      <Plus className="size-6" strokeWidth={2.4} />
    </button>
  );
}