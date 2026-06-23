import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2, Unlink2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  startGoogleOAuth,
  getMyGoogleConnection,
  disconnectGoogleCalendar,
} from "@/lib/google-calendar/google-calendar.functions";
import googleCalendarLogo from "@/assets/google-calendar.svg";

const QK = ["google-calendar", "connection"] as const;

export function GoogleCalendarCard() {
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
      toast.success("Google Agenda conectada com sucesso");
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
              {conn.last_error && (
                <p className="mt-1 rounded-md bg-rose-500/10 px-2 py-1 text-[11px] text-rose-800">
                  {conn.last_error}
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
                  variant="ghost"
                  onClick={() => connectMut.mutate()}
                  disabled={connectMut.isPending}
                >
                  Reconectar / trocar conta
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-0.5 text-[11px] text-foreground/60">
                Conecte sua conta Google e cada compromisso criado na Agenda será
                espelhado automaticamente no seu Google Calendar, com lembretes
                nativos (popup/e-mail) no horário configurado.
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
