import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Unlink2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  startGoogleOAuth,
  getMyGoogleConnection,
  disconnectGoogleCalendar,
} from "@/lib/google-calendar/google-calendar.functions";
import googleCalendarLogo from "@/assets/google-calendar.svg";
import { cn } from "@/lib/utils";

const QK = ["google-calendar", "connection"] as const;

export function GoogleCalendarCard({
  variant = "card",
  tone = "light",
}: {
  variant?: "card" | "inline";
  /** `dark` adapts the inline pill to sit on dark/gradient surfaces (e.g. module heroes). */
  tone?: "light" | "dark";
}) {
  const qc = useQueryClient();
  const search = useSearch({ strict: false }) as { google?: string; detail?: string };

  const connection = useQuery({
    queryKey: QK,
    queryFn: () => getMyGoogleConnection(),
    staleTime: 30_000,
  });

  // Flash messages do callback
  useEffect(() => {
    if (search.google === "connected") {
      toast.success("Google Agenda conectada — seus compromissos estão sendo sincronizados");
      qc.invalidateQueries({ queryKey: QK });
      window.history.replaceState({}, "", "/agenda");
    } else if (search.google === "error") {
      toast.error(`Falha ao conectar com Google: ${search.detail ?? "tente novamente"}`);
      window.history.replaceState({}, "", "/agenda");
    }
  }, [search.google, search.detail, qc]);

  const connectMut = useMutation({
    mutationFn: async () => {
      const { url } = await startGoogleOAuth();
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectMut = useMutation({
    mutationFn: () => disconnectGoogleCalendar(),
    onSuccess: () => {
      toast.success("Conta Google desconectada");
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const conn = connection.data;

  if (variant === "inline") {
    const hasError = Boolean(conn?.last_error);
    const dark = tone === "dark";
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-full py-1.5 pl-2 pr-1.5",
          dark ? "bg-white/10 ring-1 ring-white/14 backdrop-blur-sm" : "glass-panel",
          hasError &&
            (dark
              ? "bg-rose-300/12 ring-rose-200/30"
              : "border border-destructive/25 bg-destructive/5"),
        )}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white shadow-sm ring-1 ring-black/5">
          <img src={googleCalendarLogo} alt="" className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {connection.isLoading ? (
            <span
              className={cn("truncate text-[11px]", dark ? "text-white/60" : "text-foreground/55")}
            >
              Google Agenda…
            </span>
          ) : conn ? (
            <>
              <span
                className={cn(
                  "truncate text-[11.5px] font-semibold",
                  dark ? "text-white/88" : "text-foreground/80",
                )}
              >
                {conn.google_email}
              </span>
              {hasError ? (
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider",
                    dark ? "bg-rose-200/20 text-rose-100" : "bg-destructive/12 text-destructive",
                  )}
                >
                  <AlertTriangle className="size-3" /> Erro
                </span>
              ) : (
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider",
                    dark
                      ? "bg-emerald-300/18 text-emerald-100"
                      : "bg-emerald-600/12 text-emerald-800",
                  )}
                >
                  <CheckCircle2 className="size-3" /> Conectada
                </span>
              )}
            </>
          ) : (
            <span
              className={cn(
                "truncate text-[11.5px]",
                dark ? "text-white/70" : "text-foreground/60",
              )}
            >
              Google Agenda não conectada
            </span>
          )}
        </div>

        {conn ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Opções da conexão Google Agenda"
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full transition",
                  dark
                    ? "text-white/70 hover:bg-white/15 hover:text-white"
                    : "text-foreground/55 hover:bg-white/70 hover:text-foreground",
                )}
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onSelect={() => connectMut.mutate()}
                disabled={connectMut.isPending}
              >
                <RefreshCw className="size-3.5" />
                {hasError ? "Reconectar agora" : "Reconectar / trocar conta"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => disconnectMut.mutate()}
                disabled={disconnectMut.isPending}
                className="text-destructive focus:text-destructive"
              >
                <Unlink2 className="size-3.5" />
                Desconectar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            size="sm"
            className={cn(
              "h-7 shrink-0 rounded-full px-3 text-[11px]",
              dark && "bg-white text-teal-950 shadow-none hover:bg-white/90",
            )}
            onClick={() => connectMut.mutate()}
            disabled={connectMut.isPending || connection.isLoading}
          >
            {connectMut.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <ExternalLink className="size-3" />
            )}
            Conectar
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-3xl p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-black/5">
          <img src={googleCalendarLogo} alt="Google Agenda" className="size-7" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Google Agenda</p>
            {conn && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                <CheckCircle2 className="size-3" /> Conectada
              </span>
            )}
          </div>
          {connection.isLoading ? (
            <p className="mt-1 text-[11px] text-foreground/55">Carregando…</p>
          ) : conn ? (
            <>
              <p className="mt-0.5 text-[11px] text-foreground/55">
                {conn.google_email} · agenda <code>{conn.calendar_id}</code>
              </p>
              {conn.last_error ? (
                <p className="mt-1 flex items-start gap-1.5 rounded-md bg-rose-500/10 px-2 py-1 text-[11px] text-rose-800">
                  <AlertTriangle className="mt-[1px] size-3 shrink-0" />
                  <span>{conn.last_error}</span>
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-foreground/50">
                  Sincronização automática ativa — compromissos criados, editados, reatribuídos ou
                  cancelados são enviados sozinhos.
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => disconnectMut.mutate()}
                  disabled={disconnectMut.isPending}
                >
                  {disconnectMut.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Unlink2 className="size-3" />
                  )}
                  Desconectar
                </Button>
                <Button
                  size="sm"
                  variant={conn.last_error ? "default" : "ghost"}
                  onClick={() => connectMut.mutate()}
                  disabled={connectMut.isPending}
                >
                  {conn.last_error ? "Reconectar agora" : "Reconectar / trocar conta"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-0.5 text-[11px] text-foreground/60">
                Conecte sua conta Google e cada compromisso criado na Agenda será espelhado
                automaticamente no seu Google Calendar, com lembretes nativos (popup/e-mail) no
                horário configurado.
              </p>
              <div className="mt-3">
                <Button
                  size="sm"
                  onClick={() => connectMut.mutate()}
                  disabled={connectMut.isPending}
                >
                  {connectMut.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <ExternalLink className="size-3" />
                  )}
                  Conectar Google Agenda
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
