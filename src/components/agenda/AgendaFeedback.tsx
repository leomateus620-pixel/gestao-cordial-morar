import { CheckCircle2, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgendaFeedbackState = { message: string; tone?: "success" | "error" } | null;

/** Transient confirmation banner shown after agenda mutations (create/edit/delete). */
export function AgendaFeedback({ feedback }: { feedback: AgendaFeedbackState }) {
  if (!feedback) return null;
  const isError = feedback.tone === "error";
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed left-1/2 top-5 z-[70] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-xl shadow-stone-950/12 backdrop-blur-xl",
        "animate-in fade-in slide-in-from-top-2 duration-200",
        isError
          ? "border-rose-200/70 bg-white/92 text-rose-900"
          : "border-white/70 bg-white/90 text-teal-950",
      )}
    >
      {isError ? (
        <CircleAlert className="size-4 shrink-0 text-rose-600" />
      ) : (
        <CheckCircle2 className="size-4 shrink-0 text-emerald-700" />
      )}
      <span className="min-w-0 flex-1">{feedback.message}</span>
    </div>
  );
}
