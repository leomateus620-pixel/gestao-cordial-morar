import { Star, MessageSquareQuote, Users, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { StarRating } from "./StarRating";
import { useSatisfactionStats } from "@/hooks/useSatisfaction";

function formatMonth(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
  });
}

function Kpi({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SurveyDashboard() {
  const { data, isLoading } = useSatisfactionStats();

  if (isLoading) {
    return (
      <div className="grid gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/60" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-muted/60" />
      </div>
    );
  }

  const stats = data;
  if (!stats || stats.totalEnviadas === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-card p-8 text-center">
        <Star className="mx-auto mb-3 size-8 text-muted-foreground" />
        <h3 className="text-base font-semibold">Sem avaliações ainda</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Crie um link na aba <strong>Novo link</strong> e envie ao cliente para começar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Média geral"
          value={stats.mediaGeral.toFixed(2)}
          icon={Star}
          hint={`${stats.totalRespondidas} avaliações`}
        />
        <Kpi
          label="Respostas"
          value={String(stats.totalRespondidas)}
          icon={MessageSquareQuote}
        />
        <Kpi label="Enviadas" value={String(stats.totalEnviadas)} icon={Users} />
        <Kpi
          label="Taxa de resposta"
          value={`${Math.round(stats.taxaResposta * 100)}%`}
          icon={TrendingUp}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Evolução mensal</h3>
            <span className="text-xs text-muted-foreground">Média por mês</span>
          </div>
          {stats.evolucao.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sem dados suficientes.
            </p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={stats.evolucao.map((e) => ({ ...e, mesLabel: formatMonth(e.mes) }))}
                  margin={{ top: 8, right: 16, bottom: 8, left: -8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mesLabel" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis domain={[0, 5]} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                    }}
                    formatter={(v: number) => v.toFixed(2)}
                  />
                  <Line
                    type="monotone"
                    dataKey="media"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">Ranking de corretores</h3>
          {stats.porCorretor.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sem respostas ainda.</p>
          ) : (
            <ul className="space-y-2">
              {stats.porCorretor.map((c, i) => (
                <li
                  key={c.corretor_id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border/40 bg-background p-3"
                >
                  <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.corretor_nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.respostas} {c.respostas === 1 ? "avaliação" : "avaliações"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StarRating value={Math.round(c.media)} size={12} readOnly />
                    <span className="text-sm font-bold tabular-nums">
                      {c.media.toFixed(1)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">Comentários recentes</h3>
        {stats.comentarios.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum comentário registrado.
          </p>
        ) : (
          <ul className="space-y-3">
            {stats.comentarios.map((c) => (
              <li key={c.id} className="rounded-xl border border-border/40 bg-background p-3">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.client_nome}</p>
                    <p className="text-xs text-muted-foreground">
                      sobre <strong>{c.corretor_nome}</strong> ·{" "}
                      {new Date(c.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <StarRating value={c.rating} size={12} readOnly />
                </div>
                <p className="text-sm leading-relaxed text-foreground/85">{c.comentario}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
