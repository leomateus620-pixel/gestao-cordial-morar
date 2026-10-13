import { useMemo, useState } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, Link2, Loader2, RefreshCw, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampaignStatusBadge } from "@/components/marketing/CampaignStatusBadge";
import { parseCampaignLink } from "@/lib/ads/link-parser";
import type { AdConnectionPublic } from "@/lib/ads/ads.functions";
import type { AdPlatform } from "@/lib/ads/types";
import { axisTick, chartSuccess, chartSystem, gridStroke, tooltipStyle } from "@/lib/chart-palette";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CampaignPeriodStats, Insight, PeriodKpis, TrendPoint } from "@/services/marketing-insights";
import { delta } from "@/services/marketing-insights";

const PLATFORM_LABEL: Record<AdPlatform, string> = { meta: "Meta Ads", google: "Google Ads" };

export function PlatformMark({ platform, className }: { platform?: AdPlatform | null; className?: string }) {
  if (!platform)
    return <span className={cn("grid size-6 place-items-center rounded-lg bg-muted text-[9px] font-bold text-foreground/50", className)}>M</span>;
  return (
    <span
      className={cn(
        "grid size-6 place-items-center rounded-lg text-[10px] font-black",
        platform === "meta" ? "bg-primary/12 text-primary" : "bg-emerald-500/12 text-emerald-700",
        className,
      )}
      title={PLATFORM_LABEL[platform]}
    >
      {platform === "meta" ? "f" : "G"}
    </span>
  );
}

export function LinkImportBar({
  onImport,
  importing,
  connections,
  onConnect,
}: {
  onImport: (url: string) => Promise<boolean>;
  importing: boolean;
  connections: AdConnectionPublic[];
  onConnect: (p: AdPlatform) => void;
}) {
  const [url, setUrl] = useState("");
  const parsed = useMemo(() => (url.trim() ? parseCampaignLink(url) : null), [url]);
  const conn = parsed?.platform ? connections.find((c) => c.platform === parsed.platform) : undefined;
  const needsConnect = conn && conn.status !== "connected";

  return (
    <section className="rounded-3xl bg-card p-3 ring-1 ring-border/60 sm:p-4">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!parsed?.campaignId || needsConnect) return;
          if (await onImport(url)) setUrl("");
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Link2 className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-foreground/40" />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Colar link da campanha"
            aria-label="Colar link da campanha"
            className="h-11 rounded-2xl pl-10"
          />
        </div>
        {needsConnect ? (
          <Button
            type="button"
            className="h-11 rounded-2xl"
            disabled={conn.status === "not_configured"}
            onClick={() => onConnect(conn.platform)}
          >
            {conn.status === "not_configured" ? "Integração não configurada" : `Conectar ${PLATFORM_LABEL[conn.platform]}`}
          </Button>
        ) : (
          <Button type="submit" className="h-11 rounded-2xl px-6" disabled={!parsed?.campaignId || importing}>
            {importing ? <Loader2 className="size-4 animate-spin" /> : null}
            Importar
          </Button>
        )}
      </form>
      {parsed && (
        <div className="mt-2 flex flex-wrap items-center gap-2 px-1 text-xs">
          {parsed.platform && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-semibold">
              <PlatformMark platform={parsed.platform} className="size-4 rounded" />
              {PLATFORM_LABEL[parsed.platform]}
            </span>
          )}
          {parsed.campaignId && (
            <span className="rounded-full bg-muted px-2.5 py-1 font-mono tabular-nums text-foreground/70">
              campanha {parsed.campaignId}
            </span>
          )}
          {parsed.accountId && (
            <span className="rounded-full bg-muted px-2.5 py-1 font-mono tabular-nums text-foreground/70">
              conta {parsed.accountId}
            </span>
          )}
          {parsed.error && <span className="text-destructive">{parsed.error}</span>}
        </div>
      )}
    </section>
  );
}

export function ConnectionsStrip({
  connections,
  loading,
  onConnect,
}: {
  connections: AdConnectionPublic[];
  loading: boolean;
  onConnect: (p: AdPlatform) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold text-foreground/45">Contas conectadas</span>
      {loading && <span className="h-7 w-40 animate-pulse rounded-full bg-muted" />}
      {connections.map((c) => {
        const label =
          c.status === "connected" ? "Conectado" : c.status === "expired" ? "Expirado" : c.status === "error" ? "Erro" : c.status === "not_configured" ? "Não configurado" : "Conectar";
        const actionable = c.status !== "connected" && c.status !== "not_configured";
        return (
          <button
            key={c.platform}
            type="button"
            disabled={!actionable}
            onClick={() => actionable && onConnect(c.platform)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full bg-card py-1 pl-1 pr-3 text-xs font-semibold ring-1 ring-border/70 transition",
              actionable && "hover:ring-primary/40",
            )}
          >
            <PlatformMark platform={c.platform} />
            {PLATFORM_LABEL[c.platform]}
            <span
              className={cn(
                "inline-flex items-center gap-1",
                c.status === "connected" && "text-emerald-700",
                (c.status === "expired" || c.status === "error") && "text-amber-700",
                (c.status === "not_connected" || c.status === "not_configured") && "text-foreground/45",
                c.status === "not_connected" && "text-primary",
              )}
            >
              {c.status === "connected" && <CheckCircle2 className="size-3.5" />}
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

type KpiDef = { key: keyof PeriodKpis; label: string; fmt: (v: number) => string; lowerIsBetter?: boolean; financial?: boolean };

const KPIS: KpiDef[] = [
  { key: "spend", label: "Investimento", fmt: (v) => brl(v, { compact: true }), financial: true },
  { key: "leads", label: "Leads", fmt: (v) => v.toLocaleString("pt-BR") },
  { key: "cpl", label: "CPL", fmt: (v) => (v ? brl(v) : "—"), lowerIsBetter: true, financial: true },
  { key: "ctr", label: "CTR", fmt: (v) => (v ? `${v.toFixed(2)}%` : "—") },
  { key: "cpc", label: "CPC", fmt: (v) => (v ? brl(v) : "—"), lowerIsBetter: true, financial: true },
  { key: "cpm", label: "CPM", fmt: (v) => (v ? brl(v) : "—"), lowerIsBetter: true, financial: true },
  { key: "reach", label: "Alcance", fmt: (v) => compact(v) },
  { key: "frequency", label: "Frequência", fmt: (v) => (v ? v.toFixed(2) : "—"), lowerIsBetter: true },
  { key: "impressions", label: "Impressões", fmt: (v) => compact(v) },
  { key: "clicks", label: "Cliques", fmt: (v) => compact(v) },
];

function compact(v: number) {
  return new Intl.NumberFormat("pt-BR", { notation: v >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(v);
}

export function KpiGrid({ curr, prev, showFinancial }: { curr: PeriodKpis; prev: PeriodKpis; showFinancial: boolean }) {
  const defs = KPIS.filter((k) => showFinancial || !k.financial);
  return (
    <section className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-border/60 ring-1 ring-border/60 sm:grid-cols-3 lg:grid-cols-5">
      {defs.map((k) => {
        const d = delta(curr[k.key], prev[k.key]);
        const good = d === null || d === 0 ? null : k.lowerIsBetter ? d < 0 : d > 0;
        return (
          <div key={k.key} className="bg-card p-4 sm:p-5">
            <p className="text-[11px] font-semibold text-foreground/50">{k.label}</p>
            <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums tracking-tight text-foreground">{k.fmt(curr[k.key])}</p>
            <p
              className={cn(
                "mt-1 inline-flex items-center gap-0.5 font-mono text-[11px] tabular-nums",
                good === true && "text-emerald-700",
                good === false && "text-red-700",
                good === null && "text-foreground/35",
              )}
            >
              {d === null ? "—" : (
                <>
                  {d > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {d > 0 ? "+" : ""}
                  {d.toLocaleString("pt-BR")}%
                </>
              )}
            </p>
          </div>
        );
      })}
    </section>
  );
}

export function InsightsBlock({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;
  return (
    <section className="rounded-3xl bg-card p-4 ring-1 ring-border/60 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-primary" /> Insights
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {insights.map((i) => (
          <li key={i.text} className="flex items-start gap-2.5 rounded-2xl bg-muted/50 px-3 py-2.5 text-sm leading-snug">
            <span
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                i.tone === "success" && "bg-emerald-500",
                i.tone === "warning" && "bg-amber-500",
                i.tone === "danger" && "bg-red-500",
                i.tone === "neutral" && "bg-foreground/30",
              )}
            />
            {i.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const [metric, setMetric] = useState<"cpl" | "ctr">("cpl");
  return (
    <section className="rounded-3xl bg-card p-4 ring-1 ring-border/60 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Investimento × Leads</h2>
        <div className="inline-flex rounded-full bg-muted p-0.5 text-[11px] font-semibold">
          {(["cpl", "ctr"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={cn("rounded-full px-3 py-1 transition", metric === m ? "bg-card shadow-sm" : "text-foreground/50")}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 h-60">
        {data.length === 0 ? (
          <div className="grid h-full place-items-center rounded-2xl border border-dashed text-sm text-foreground/45">
            Sem dados diários nesta competência
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis yAxisId="l" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis yAxisId="r" orientation="right" tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area yAxisId="l" dataKey="spend" name="Investimento" stroke={chartSystem} fill={chartSystem} fillOpacity={0.1} strokeWidth={2} />
              <Bar yAxisId="r" dataKey="leads" name="Leads" fill={chartSuccess} radius={[4, 4, 0, 0]} barSize={8} />
              <Line yAxisId="l" dataKey={metric} name={metric.toUpperCase()} stroke="#D6A437" dot={false} strokeWidth={1.5} strokeDasharray="4 3" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
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
  onOpen: (id: string) => void;
  onSync: (id: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-3xl bg-card ring-1 ring-border/60">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b text-left text-[11px] font-semibold text-foreground/45">
              <th className="px-4 py-3">Campanha</th>
              <th className="px-3 py-3">Status</th>
              {showFinancial && <th className="px-3 py-3 text-right">Investimento</th>}
              <th className="px-3 py-3 text-right">Leads</th>
              {showFinancial && <th className="px-3 py-3 text-right">CPL</th>}
              <th className="px-3 py-3 text-right">CTR</th>
              <th className="px-3 py-3">Sincronizado</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {stats.map(({ campaign: c, spend, leads, cpl, ctr }) => (
              <tr key={c.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/40" onClick={() => onOpen(c.id)}>
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <PlatformMark platform={c.platform} />
                    <span className="truncate font-semibold">{c.name}</span>
                  </div>
                </td>
                <td className="px-3 py-3"><CampaignStatusBadge status={c.status} /></td>
                {showFinancial && <td className="px-3 py-3 text-right font-mono tabular-nums">{brl(spend)}</td>}
                <td className="px-3 py-3 text-right font-mono tabular-nums">{leads}</td>
                {showFinancial && <td className="px-3 py-3 text-right font-mono tabular-nums">{cpl ? brl(cpl) : "—"}</td>}
                <td className="px-3 py-3 text-right font-mono tabular-nums">{ctr ? `${ctr.toFixed(2)}%` : "—"}</td>
                <td className="px-3 py-3 text-xs text-foreground/55">
                  {c.syncStatus === "error" ? (
                    <span className="inline-flex items-center gap-1 text-red-700" title={c.syncError ?? ""}>
                      <AlertTriangle className="size-3.5" /> Erro
                    </span>
                  ) : c.lastSyncedAt ? (
                    new Date(c.lastSyncedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                  ) : (
                    "Manual"
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  {c.externalCampaignId && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 rounded-xl"
                      aria-label={`Sincronizar ${c.name}`}
                      disabled={syncingId === c.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSync(c.id);
                      }}
                    >
                      <RefreshCw className={cn("size-4", syncingId === c.id && "animate-spin")} />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
