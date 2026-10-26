import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampaignStatusBadge } from "@/components/marketing/CampaignStatusBadge";
import type { AdConnectionPublic } from "@/lib/ads/ads.functions";
import type { AdPlatform } from "@/lib/ads/types";
import { axisTick, chartSuccess, chartSystem, gridStroke, tooltipStyle } from "@/lib/chart-palette";
import { cn } from "@/lib/utils";
import type {
  CampaignPeriodStats,
  Insight,
  PeriodKpis,
  TrendPoint,
} from "@/services/marketing-insights";
import { delta } from "@/services/marketing-insights";
const PLATFORM_LABEL = { meta: "Meta Ads", google: "Google Ads" };
export function PlatformMark({
  platform,
  className,
}: {
  platform?: AdPlatform | null;
  className?: string;
}) {
  return (
    <span
      title={platform ? PLATFORM_LABEL[platform] : "Campanha manual"}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold",
        platform === "google" ? "bg-emerald-500/10 text-emerald-800" : "bg-primary/10 text-primary",
        className,
      )}
    >
      {platform === "meta" ? "f" : platform === "google" ? "G" : "M"}
    </span>
  );
}
export function ConnectionsStrip({
  connections,
  loading,
}: {
  connections: AdConnectionPublic[];
  loading: boolean;
  onConnect?: (p: AdPlatform) => void;
}) {
  if (!loading && connections.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-xs text-foreground/65"
      aria-live="polite"
    >
      {loading
        ? "Consultando conexões…"
        : connections.map((c, i) => (
            <span
              key={c.id ?? `${c.platform}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-2 ring-1 ring-border/60"
            >
              <PlatformMark platform={c.platform} className="size-5" />
              {PLATFORM_LABEL[c.platform]}
              {c.imobiliaria ? ` · ${c.imobiliaria}` : ""}
              <span
                className={c.status === "connected" ? "text-emerald-800" : "text-foreground/55"}
              >
                {c.status === "connected" ? (
                  <>
                    <CheckCircle2 className="mr-1 inline size-3" />
                    Credencial vinculada
                  </>
                ) : c.status === "expired" ? (
                  "Token expirado"
                ) : c.status === "error" ? (
                  "Requer atenção"
                ) : (
                  "Não configurado"
                )}
              </span>
            </span>
          ))}
    </div>
  );
}
const compact = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    notation: v >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(v);
const amount = (v: number | null, currency = "BRL") =>
  v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency });
type MetricKey =
  | "spend"
  | "leads"
  | "cpl"
  | "ctr"
  | "cpc"
  | "cpm"
  | "reach"
  | "frequency"
  | "impressions"
  | "clicks"
  | "activeCampaigns";
type Def = {
  key: MetricKey;
  label: string;
  help: string;
  money?: boolean;
  percent?: boolean;
  lower?: boolean;
};
export function KpiGrid({
  curr,
  prev,
  showFinancial,
}: {
  curr: PeriodKpis;
  prev: PeriodKpis;
  showFinancial: boolean;
}) {
  const primary: Def[] = showFinancial
    ? [
        {
          key: "spend",
          label: "Investimento",
          help: "Gasto reportado no período e na moeda da conta.",
          money: true,
        },
        {
          key: "leads",
          label: "Leads reportados",
          help: "Contagem da plataforma. Não equivale às submissões recebidas ou aos clientes únicos do CRM.",
        },
        {
          key: "cpl",
          label: "Custo por lead",
          help: "Investimento dividido pelos leads reportados.",
          money: true,
          lower: true,
        },
        {
          key: "activeCampaigns",
          label: "Campanhas ativas",
          help: "Campanhas com status ativo no conjunto exibido.",
        },
      ]
    : [
        {
          key: "leads",
          label: "Leads reportados",
          help: "Contagem da plataforma, independente dos leads recebidos no CRM.",
        },
        {
          key: "activeCampaigns",
          label: "Campanhas ativas",
          help: "Campanhas com status ativo no conjunto exibido.",
        },
        {
          key: "clicks",
          label: "Cliques",
          help: "Cliques reportados; não são visitas à página de destino.",
        },
        { key: "impressions", label: "Impressões", help: "Quantidade de exibições dos anúncios." },
      ];
  const secondary: Def[] = [
    {
      key: "reach",
      label: "Alcance no período",
      help: "Disponível somente com um agregado da API no mesmo período. Não somamos alcance diário nem entre campanhas.",
    },
    {
      key: "frequency",
      label: "Frequência",
      help: "Exibições por pessoa no mesmo agregado de alcance.",
    },
    ...(showFinancial
      ? ([
          { key: "impressions", label: "Impressões", help: "Quantidade de exibições." },
          { key: "clicks", label: "Cliques", help: "Cliques reportados, sem presumir visitas." },
        ] as Def[])
      : []),
    { key: "ctr", label: "CTR", help: "Cliques / impressões × 100.", percent: true },
    ...(showFinancial
      ? ([
          { key: "cpc", label: "CPC", help: "Investimento / cliques.", money: true },
          { key: "cpm", label: "CPM", help: "Investimento / impressões × 1.000.", money: true },
        ] as Def[])
      : []),
  ];
  function value(def: Def) {
    const v = curr[def.key];
    return (curr.hasData === false && def.key !== "activeCampaigns") || v === null
      ? "—"
      : def.money
        ? amount(v, curr.currency ?? "BRL")
        : def.percent
          ? `${v.toFixed(2)}%`
          : def.key === "frequency"
            ? v.toFixed(2)
            : compact(v);
  }
  function mobileValue(def: Def) {
    const metric = curr[def.key];
    if (def.money && metric !== null && Math.abs(metric) >= 10_000 && curr.hasData !== false) {
      return metric.toLocaleString("pt-BR", {
        style: "currency",
        currency: curr.currency ?? "BRL",
        notation: "compact",
        maximumFractionDigits: 1,
      });
    }
    return value(def);
  }
  return (
    <section aria-label="Resultados do período" className="space-y-3">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {primary.map((def) => {
          const d = def.key === "activeCampaigns" ? null : delta(curr[def.key], prev[def.key]);
          return (
            <article
              key={def.key}
              className="min-w-0 rounded-3xl bg-card p-4 ring-1 ring-border/60 sm:p-5"
            >
              <p className="text-xs font-semibold text-foreground/65" title={def.help}>
                {def.label}
              </p>
              <p
                title={value(def)}
                className={cn(
                  "mt-3 min-w-0 font-display font-semibold tabular-nums tracking-tight",
                  def.money
                    ? "text-[clamp(1.0625rem,4.9vw,1.5rem)] sm:text-3xl"
                    : "text-2xl sm:text-3xl",
                )}
              >
                <span className="sm:hidden">{mobileValue(def)}</span>
                <span className="hidden sm:inline">{value(def)}</span>
              </p>
              <p className="mt-2 flex min-h-4 items-center gap-1 text-[11px] text-foreground/60">
                {d === null ? (
                  def.key === "activeCampaigns" ? (
                    "Status atual das campanhas"
                  ) : (
                    "Sem base comparável"
                  )
                ) : (
                  <>
                    {d >= 0 ? (
                      <TrendingUp className="size-3.5" />
                    ) : (
                      <TrendingDown className="size-3.5" />
                    )}
                    {d > 0 ? "+" : ""}
                    {d.toLocaleString("pt-BR")}% no período equivalente
                  </>
                )}
              </p>
            </article>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-3xl bg-card p-4 ring-1 ring-border/60 sm:grid-cols-4 xl:grid-cols-7">
        {secondary.map((def) => (
          <div key={def.key} className="min-w-0" title={def.help}>
            <p className="text-[11px] text-foreground/65">{def.label}</p>
            <p className="mt-1 font-mono text-sm font-semibold tabular-nums">{value(def)}</p>
          </div>
        ))}
      </div>
      {curr.mixedCurrencies && (
        <p className="flex items-center gap-2 text-xs text-amber-800">
          <AlertTriangle className="size-4 shrink-0" />
          Selecione uma conta/moeda para consultar os valores financeiros. Moedas distintas não são
          somadas.
        </p>
      )}
    </section>
  );
}
export function InsightsBlock({ insights }: { insights: Insight[] }) {
  return (
    <section className="rounded-3xl bg-card p-4 ring-1 ring-border/60 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-primary" />
        Leitura do período
      </h2>
      <ul className="mt-3 space-y-3">
        {insights.map((i) => (
          <li
            key={i.text}
            className="rounded-2xl bg-muted/50 p-3 text-sm leading-relaxed text-foreground/75"
          >
            {i.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <section className="min-w-0 rounded-3xl bg-card p-4 ring-1 ring-border/60 sm:p-5">
      <h2 className="text-sm font-semibold">Leads e cliques ao longo do período</h2>
      <p className="mt-1 text-xs text-foreground/60">
        Contagens diárias reportadas pelas plataformas.
      </p>
      <div className="mt-4 h-60 min-w-0">
        {data.length === 0 ? (
          <div className="grid h-full place-items-center rounded-2xl border border-dashed px-4 text-center text-sm text-foreground/60">
            Sem métricas diárias persistidas neste período.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis
                dataKey="label"
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                minTickGap={25}
              />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Area
                dataKey="leads"
                name="Leads reportados"
                stroke={chartSuccess}
                fill={chartSuccess}
                fillOpacity={0.12}
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Area
                dataKey="clicks"
                name="Cliques"
                stroke={chartSystem}
                fill="transparent"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
function SyncState({ stat }: { stat: CampaignPeriodStats }) {
  const c = stat.campaign;
  if (c.syncStatus === "error")
    return (
      <span className="text-red-800" title={c.syncError ?? undefined}>
        Falha recuperável
      </span>
    );
  if (c.syncStatus === "partial") return <span className="text-amber-800">Dados parciais</span>;
  if (c.syncStatus === "queued" || c.syncStatus === "syncing")
    return (
      <span className="text-primary">
        {c.syncStatus === "queued" ? "Na fila" : "Sincronizando"}
      </span>
    );
  if (!c.platform) return <span>Manual</span>;
  if (!c.lastSyncedAt) return <span>Aguardando dados</span>;
  const stale = Date.now() - new Date(c.lastSyncedAt).getTime() > 48 * 60 * 60 * 1000;
  return (
    <span>
      {stale ? "Desatualizado · " : "Atualizado · "}
      {new Date(c.lastSyncedAt).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })}
    </span>
  );
}
export function CampaignTable({
  stats,
  showFinancial,
  syncingId,
  onOpen,
  onSync,
}: {
  stats: CampaignPeriodStats[];
  showFinancial: boolean;
  syncingId: string | null;
  onOpen: (id: string, trigger?: HTMLElement) => void;
  onSync: (id: string) => void;
}) {
  const syncButton = (s: CampaignPeriodStats) =>
    s.campaign.externalCampaignId ? (
      <Button
        size="icon"
        variant="ghost"
        className="size-11 shrink-0 rounded-xl"
        aria-label={`Agendar sincronização de ${s.campaign.name}`}
        disabled={
          syncingId === s.campaign.id || ["queued", "syncing"].includes(s.campaign.syncStatus ?? "")
        }
        onClick={(e) => {
          e.stopPropagation();
          onSync(s.campaign.id);
        }}
      >
        <RefreshCw className={cn("size-4", syncingId === s.campaign.id && "animate-spin")} />
      </Button>
    ) : null;
  return (
    <section
      className="overflow-hidden rounded-3xl bg-card ring-1 ring-border/60"
      aria-label="Campanhas"
    >
      <div className="divide-y md:hidden">
        {stats.map((s) => (
          <article key={s.campaign.id} className="p-4">
            <div className="flex items-start gap-3">
              <PlatformMark platform={s.campaign.platform} />
              <button
                type="button"
                onClick={(event) => onOpen(s.campaign.id, event.currentTarget)}
                className="min-h-11 min-w-0 flex-1 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="block break-words">{s.campaign.name}</span>
                <span className="mt-1 block text-xs font-normal capitalize text-foreground/60">
                  {s.campaign.imobiliaria} ·{" "}
                  {s.campaign.platform ? PLATFORM_LABEL[s.campaign.platform] : s.campaign.channel}
                </span>
              </button>
              {syncButton(s)}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <CampaignStatusBadge status={s.campaign.status} />
              <span className="text-xs text-foreground/65">
                <SyncState stat={s} />
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <span>
                <span className="block text-foreground/60">Leads</span>
                <strong className="mt-1 block font-mono">{s.leads}</strong>
              </span>
              {showFinancial && (
                <>
                  <span>
                    <span className="block text-foreground/60">Investimento</span>
                    <strong className="mt-1 block font-mono">
                      {amount(s.spend, s.currency ?? "BRL")}
                    </strong>
                  </span>
                  <span>
                    <span className="block text-foreground/60">CPL</span>
                    <strong className="mt-1 block font-mono">
                      {amount(s.cpl, s.currency ?? "BRL")}
                    </strong>
                  </span>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-semibold text-foreground/60">
              <th className="px-4 py-4">Campanha / marca</th>
              <th className="px-3 py-4">Status</th>
              <th className="px-3 py-4 text-right">Leads</th>
              {showFinancial && (
                <>
                  <th className="px-3 py-4 text-right">Investimento</th>
                  <th className="px-3 py-4 text-right">CPL</th>
                </>
              )}
              <th className="px-3 py-4">Sincronização</th>
              <th className="px-3 py-4">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.campaign.id} className="border-b last:border-0 hover:bg-muted/40">
                <td className="max-w-72 px-4 py-3">
                  <button
                    type="button"
                    className="flex min-h-11 items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={(event) => onOpen(s.campaign.id, event.currentTarget)}
                  >
                    <PlatformMark platform={s.campaign.platform} />
                    <span className="min-w-0">
                      <span className="block break-words font-semibold">{s.campaign.name}</span>
                      <span className="text-xs capitalize text-foreground/60">
                        {s.campaign.imobiliaria} · {s.campaign.startDate} a {s.campaign.endDate}
                      </span>
                    </span>
                  </button>
                </td>
                <td className="px-3 py-3">
                  <CampaignStatusBadge status={s.campaign.status} />
                </td>
                <td className="px-3 py-3 text-right font-mono">{s.leads}</td>
                {showFinancial && (
                  <>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono">
                      {amount(s.spend, s.currency ?? "BRL")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono">
                      {amount(s.cpl, s.currency ?? "BRL")}
                    </td>
                  </>
                )}
                <td className="px-3 py-3 text-xs text-foreground/65">
                  <SyncState stat={s} />
                </td>
                <td className="px-3 py-3">{syncButton(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
