import { useQuery } from "@tanstack/react-query";
import { Timer, Clock3, Zap } from "lucide-react";
import { useSession } from "@/lib/auth-mock";
import { getCorretoresResponseMetrics } from "@/lib/attendances/assignments.functions";
import { formatElapsedSeconds } from "@/lib/time/elapsed";

const MANAGEMENT_ROLES = new Set(["admin", "secretaria"]);

/**
 * Response-time performance card — visible only to admin/secretaria.
 * The backend RPC also gates the read, so brokers who somehow render this
 * component receive an empty payload.
 */
export function CorretoresResponseTimeCard() {
  const user = useSession();
  const isManagement = user ? MANAGEMENT_ROLES.has(user.perfil) : false;

  const q = useQuery({
    queryKey: ["corretores-response-metrics", { start: null, end: null, imobiliaria: null }],
    queryFn: () =>
      getCorretoresResponseMetrics({ data: { start: null, end: null, imobiliaria: null } }),
    enabled: isManagement,
    staleTime: 60_000,
  });

  if (!isManagement) return null;

  const rows = (q.data ?? []).filter((r) => (r.completed_count ?? 0) > 0 || (r.pending_count ?? 0) > 0);
  if (rows.length === 0) return null;

  const ranked = [...rows]
    .filter((r) => r.avg_seconds != null && (r.completed_count ?? 0) > 0)
    .sort((a, b) => (a.avg_seconds ?? 0) - (b.avg_seconds ?? 0));

  const fastest = ranked[0] ?? null;
  const totalPending = rows.reduce((sum, r) => sum + (Number(r.pending_count) || 0), 0);

  return (
    <article className="premium-card min-w-0 p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary/70">
            Tempo de resposta
          </p>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight">
            Tempo médio para abertura
          </h2>
          <p className="mt-1 text-[11px] text-foreground/55">
            Da atribuição do corretor até a primeira abertura efetiva do detalhe do atendimento.
          </p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Timer className="size-5" />
        </span>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <MiniStat
          icon={<Zap className="size-3.5 text-primary/70" />}
          label="Abertura mais rápida"
          name={fastest?.broker_nome ?? "-"}
          value={fastest?.avg_seconds != null ? formatElapsedSeconds(Math.round(fastest.avg_seconds)) : "-"}
        />
        <MiniStat
          icon={<Clock3 className="size-3.5 text-primary/70" />}
          label="Aguardando abertura agora"
          name="Total pendente"
          value={String(totalPending).padStart(2, "0")}
        />
      </div>

      <div className="space-y-2">
        {ranked.slice(0, 6).map((r, index) => (
          <div
            key={r.broker_id}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-white/[0.55] px-3 py-2.5 ring-1 ring-white/60"
          >
            <span className="grid size-8 place-items-center rounded-full bg-primary/10 font-mono text-xs font-bold text-primary">
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">
                {r.broker_nome ?? "Sem nome"}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-foreground/52">
                {Number(r.completed_count)} abert.
                {r.fastest_seconds != null
                  ? ` · min ${formatElapsedSeconds(r.fastest_seconds)}`
                  : ""}
                {r.slowest_seconds != null
                  ? ` · máx ${formatElapsedSeconds(r.slowest_seconds)}`
                  : ""}
                {Number(r.pending_count) > 0 ? ` · ${Number(r.pending_count)} pendentes` : ""}
              </span>
            </span>
            <span className="font-mono text-xs font-bold text-primary">
              {r.avg_seconds != null ? formatElapsedSeconds(Math.round(r.avg_seconds)) : "-"}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function MiniStat({
  icon,
  label,
  name,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  name: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.55] p-3 ring-1 ring-white/60">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/45">
        {icon}
        {label}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold">{name}</p>
        <p className="shrink-0 font-mono text-base font-bold text-primary">{value}</p>
      </div>
    </div>
  );
}
