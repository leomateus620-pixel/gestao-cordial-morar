import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { BellRing, CheckCheck, ChevronRight, X } from "lucide-react";
import { useSession } from "@/lib/auth-mock";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/notifications.functions";
import { cn } from "@/lib/utils";

const HIGH = new Set(["atendimento_atribuido", "atendimento_iniciado"]);
const DISMISS_KEY = "notif-spotlight-dismissed";

function useDismissed() {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DISMISS_KEY);
      if (raw) setDismissed(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);
  return {
    dismissed,
    dismiss(id: string) {
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(id);
        try {
          sessionStorage.setItem(DISMISS_KEY, JSON.stringify(Array.from(next)));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
  };
}

/**
 * Banner destacado que aparece uma vez por sessão para notificações prioritárias
 * não lidas (atendimento atribuído / iniciado). Complementa o sino de notificações.
 */
export function NotificationsSpotlight() {
  const user = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { dismissed, dismiss } = useDismissed();

  const query = useQuery({
    queryKey: ["notifications", "mine"],
    queryFn: () => listMyNotifications(),
    enabled: Boolean(user),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const priority = useMemo(() => {
    return (query.data ?? [])
      .filter((n) => !n.lida && HIGH.has(n.tipo) && !dismissed.has(n.id))
      .slice(0, 3);
  }, [query.data, dismissed]);

  const markOne = useMutation({
    mutationFn: (id: string) => markNotificationRead({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "mine"] }),
  });
  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "mine"] }),
  });

  if (!user || priority.length === 0) return null;

  const first = priority[0];
  const extra = priority.length - 1;
  const tone = first.tipo === "atendimento_atribuido"
    ? { bg: "from-teal-500/15 to-teal-200/5", ring: "ring-teal-500/25", chip: "bg-teal-500/15 text-teal-700" }
    : { bg: "from-orange-500/15 to-orange-200/5", ring: "ring-orange-500/25", chip: "bg-orange-500/15 text-orange-700" };

  return (
    <section
      className={cn(
        "relative mb-4 overflow-hidden rounded-[1.6rem] bg-gradient-to-br p-4 ring-1 backdrop-blur-xl",
        "shadow-[0_18px_44px_-28px_rgba(15,118,110,0.55)]",
        tone.bg,
        tone.ring,
      )}
      aria-label="Notificações em destaque"
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/70 text-teal-700 shadow-sm">
          <BellRing className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", tone.chip)}>
              {first.tipo === "atendimento_atribuido" ? "Novo lead" : "Atendimento iniciado"}
            </span>
            {extra > 0 && (
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-foreground/70">
                +{extra} novo{extra > 1 ? "s" : ""}
              </span>
            )}
            <span className="text-[10px] text-foreground/50">
              {new Date(first.created_at).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">{first.titulo}</p>
          {first.mensagem && (
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-foreground/65">
              {first.mensagem}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {first.link && (
              <button
                type="button"
                onClick={() => {
                  markOne.mutate(first.id);
                  dismiss(first.id);
                  void navigate({ to: first.link as string } as never);
                }}
                className="inline-flex items-center gap-1 rounded-full bg-teal-700 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-teal-800"
              >
                Abrir atendimento <ChevronRight className="size-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                markAll.mutate();
                priority.forEach((n) => dismiss(n.id));
              }}
              className="inline-flex items-center gap-1 rounded-full bg-white/70 px-3 py-1.5 text-[12px] font-semibold text-foreground/75 transition hover:bg-white"
            >
              <CheckCheck className="size-3.5" /> Marcar como lidas
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => dismiss(first.id)}
          aria-label="Dispensar destaque"
          className="grid size-8 shrink-0 place-items-center rounded-full text-foreground/45 transition hover:bg-white/60 hover:text-foreground/70"
        >
          <X className="size-4" />
        </button>
      </div>
    </section>
  );
}
