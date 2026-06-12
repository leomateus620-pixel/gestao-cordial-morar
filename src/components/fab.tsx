import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function Fab({ onClick, label = "Novo" }: { onClick?: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        "accent-button fab-safe-bottom fixed right-5 z-30 grid size-14 place-items-center rounded-full lg:right-10",
        "transition-transform hover:brightness-110 active:scale-95",
      )}
      style={{ boxShadow: "0 18px 36px -10px rgba(217,120,45,0.55)" }}
    >
      <Plus className="size-6" strokeWidth={2.4} />
    </button>
  );
}