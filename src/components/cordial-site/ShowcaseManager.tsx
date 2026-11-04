import { useState, type PointerEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { showcaseAction, showcaseSnapshot, searchShowcaseCandidates } from "@/lib/cordial-site/showcase.functions";
import { STATE_LABEL, activateAt, addWeeks, liveWeek, type ShowcaseState } from "@/lib/cordial-site/showcase";

const btn = "rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50";
const ghost = "rounded-lg border px-3 py-2 text-sm disabled:opacity-50";
const DOW = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const EST_COST = "≈ 0,8 crédito de IA por edição";
const fmtWeek = (w: string) => new Date(`${w}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

type ActionInput = Record<string, unknown> & { action: string };
type Snap = Awaited<ReturnType<typeof showcaseSnapshot>>;
type Week = Snap["weeks"][number];

export function ShowcaseManager({ brand = "cordial" }: { brand?: "cordial" | "morar" } = {}) {
  const load = useServerFn(showcaseSnapshot);
  const act = useServerFn(showcaseAction);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [`${brand}-showcase`], queryFn: () => load({ data: { brand } }), refetchInterval: (s) => (s.state.data?.weeks.some((w) => w.state === "gerando" || w.lease_until) ? 5000 : false) });
  const m = useMutation({
    mutationFn: (data: ActionInput) => act({ data: { ...data, brand } as never }) as Promise<{ message: string }>,
    onSuccess: (r) => {
      toast.success(r.message);
      void qc.invalidateQueries({ queryKey: [`${brand}-showcase`] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (q.isPending) return <p role="status">Carregando vitrine…</p>;
  if (q.error || !q.data) return <p role="alert">Não foi possível carregar a vitrine.</p>;
  const { settings, weeks, attempts, activeWeekId } = q.data;
  const sched = { prepareDow: settings?.prepare_dow ?? 0, prepareHour: settings?.prepare_hour ?? 18, activateHour: settings?.activate_hour ?? 6 };
  const live = liveWeek(new Date(q.data.now), sched);
  const next = addWeeks(live, 1);
  const current = (w: string) => weeks.find((x) => x.week_start === w && x.state !== "recusado" && x.state !== "substituido");
  const liveRow = current(live);
  const nextRow = current(next);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm">
        <div>
          <p className="font-semibold">Imagem da semana na abertura do site</p>
          <p className="text-muted-foreground">
            Preparo: {DOW[sched.prepareDow]} às {sched.prepareHour}h · Troca: segunda às {sched.activateHour}h (São Paulo) ·{" "}
            {settings?.paused ? <strong className="text-destructive">Automação pausada</strong> : "Automação ligada"}
          </p>
          {settings?.last_run_at && (
            <p className="text-xs text-muted-foreground">
              Última execução: {new Date(settings.last_run_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} — {settings.last_run_summary}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={ghost} disabled={m.isPending} onClick={() => m.mutate({ action: "pause", paused: !settings?.paused })}>
            {settings?.paused ? "Retomar automação" : "Pausar automação"}
          </button>
          <button className={ghost} disabled={m.isPending} onClick={() => m.mutate({ action: "run" })}>
            Executar rotina agora
          </button>
        </div>
      </div>

      <WeekCard title="Esta semana" week={live} row={liveRow} live activeWeekId={activeWeekId} busy={m.isPending} act={m.mutate} nextChange={activateAt(next, sched)} />
      <WeekCard title="Próxima semana" week={next} row={nextRow} activeWeekId={activeWeekId} busy={m.isPending} act={m.mutate} />

      <ScheduleForm sched={sched} busy={m.isPending} onSave={(s) => m.mutate({ action: "schedule", ...s })} />

      <section className="rounded-xl border bg-card p-4">
        <h3 className="mb-2 font-semibold">Histórico</h3>
        <ul className="divide-y text-sm">
          {weeks.map((w) => (
            <li key={w.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span>
                Semana de {fmtWeek(w.week_start)} · Ref. {w.property?.public_reference ?? "fora do site"} · {w.source === "manual" ? "escolha manual" : "automático"}
              </span>
              <span className="text-muted-foreground">
                {STATE_LABEL[w.state as ShowcaseState]}
                {w.error ? ` — ${w.error}` : ""}
              </span>
            </li>
          ))}
          {!weeks.length && <li className="py-2 text-muted-foreground">Nenhuma semana registrada ainda.</li>}
        </ul>
        {attempts.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Últimas edições: {attempts.slice(0, 5).map((a) => `${new Date(a.started_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (${a.outcome ?? "em andamento"})`).join(" · ")}
          </p>
        )}
      </section>
    </div>
  );
}

function WeekCard({ title, week, row, live, activeWeekId, busy, act, nextChange }: {
  title: string;
  week: string;
  row?: Week;
  live?: boolean;
  activeWeekId: string | null;
  busy: boolean;
  act: (d: ActionInput) => void;
  nextChange?: Date;
}) {
  const [picking, setPicking] = useState(false);
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const generating = row?.state === "gerando" || !!(row?.lease_until && new Date(row.lease_until) > new Date());
  const showingEdited = row && !row.use_original && row.approved_at && row.storage_path;
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{title} · {fmtWeek(week)}</h3>
          {row ? (
            <p className="text-sm text-muted-foreground">
              Ref. {row.property?.public_reference ?? "—"} · {row.property?.tipo ?? "Imóvel"} {row.property?.bairro ? `no ${row.property.bairro}` : ""} ·{" "}
              <strong>{generating ? "Gerando edição…" : STATE_LABEL[row.state as ShowcaseState]}</strong>
              {live && (activeWeekId === row.id ? (showingEdited ? " · no ar com a edição aprovada" : " · no ar com a foto original") : " · fora do ar")}
              {nextChange && ` · próxima troca ${nextChange.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{live ? "Nenhum imóvel no ar: a abertura usa o primeiro destaque." : "Ainda não preparada. A rotina escolhe no horário de preparo."}</p>
          )}
          {row?.score != null && <p className="text-xs text-muted-foreground">Nota da foto: {Number(row.score).toFixed(1)}/10 — {row.score_reason}</p>}
          {row?.error && <p className="text-sm text-destructive">{row.error}</p>}
        </div>
        <button className={ghost} onClick={() => setPicking((v) => !v)}>Trocar imóvel/foto</button>
      </div>

      {picking && <Picker brand={brand} onPick={(p) => { act({ action: "choose", target: live ? "live" : "next", ...p }); setPicking(false); }} />}

      {row?.preview && (
        <div className="grid gap-3 md:grid-cols-2">
          <figure>
            <figcaption className="mb-1 text-xs font-medium text-muted-foreground">Original</figcaption>
            {row.preview.original ? <img src={row.preview.original} alt="Foto original" className="aspect-[3/2] w-full rounded-lg object-cover" /> : <div className="aspect-[3/2] rounded-lg bg-muted" />}
          </figure>
          <figure>
            <figcaption className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Edição por IA {row.approved_at && !row.use_original ? "· aprovada" : ""}</span>
              {row.preview.edited && (
                <span className="flex gap-1">
                  {(["desktop", "mobile"] as const).map((v) => (
                    <button key={v} className={`rounded px-2 py-0.5 ${view === v ? "bg-primary text-primary-foreground" : "border"}`} onClick={() => setView(v)}>
                      {v === "desktop" ? "Computador" : "Celular"}
                    </button>
                  ))}
                </span>
              )}
            </figcaption>
            {row.preview.edited ? (
              <FocalPreview url={row.preview.edited} view={view} x={Number(row.focal_x)} y={Number(row.focal_y)} onSet={(x, y) => act({ action: "focal", weekId: row.id, x, y })} />
            ) : (
              <div className="grid aspect-[3/2] place-items-center rounded-lg bg-muted text-sm text-muted-foreground">{generating ? "Gerando…" : "Sem edição"}</div>
            )}
          </figure>
        </div>
      )}

      {row && (
        <div className="flex flex-wrap items-center gap-2">
          <button className={btn} disabled={busy || generating || !row.storage_path || (!!row.approved_at && !row.use_original)} onClick={() => act({ action: "approve", weekId: row.id })}>
            {live ? "Aprovar e ativar" : "Aprovar"}
          </button>
          <button className={ghost} disabled={busy || generating} onClick={() => act({ action: "use_original", weekId: row.id })}>Usar original</button>
          <button
            className={ghost}
            disabled={busy || generating}
            onClick={() => {
              if (confirm(`Gerar nova edição? Custo estimado: ${EST_COST}.`)) act({ action: "regenerate", weekId: row.id });
            }}
          >
            {row.storage_path ? "Gerar nova edição" : "Gerar edição"}
          </button>
          <button className={ghost} disabled={busy || generating} onClick={() => act({ action: "reject", weekId: row.id })}>Recusar</button>
          <span className="text-xs text-muted-foreground">{EST_COST}</span>
        </div>
      )}
    </section>
  );
}

function FocalPreview({ url, view, x, y, onSet }: { url: string; view: "desktop" | "mobile"; x: number; y: number; onSet: (x: number, y: number) => void }) {
  const click = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSet(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
  };
  return (
    <div className="space-y-1">
      <div className={`relative mx-auto overflow-hidden rounded-lg ${view === "desktop" ? "aspect-[16/7] w-full" : "aspect-[9/7] w-1/2"}`}>
        <img src={url} alt="Prévia da abertura" className="h-full w-full object-cover" style={{ objectPosition: `${x * 100}% ${y * 100}%` }} />
      </div>
      <div className="relative cursor-crosshair overflow-hidden rounded" onPointerDown={click} title="Clique para definir o ponto de foco">
        <img src={url} alt="" className="w-full opacity-80" />
        <span className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary-foreground bg-primary" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">Clique na foto acima para definir o ponto de foco do recorte.</p>
    </div>
  );
}

function Picker({ onPick, brand }: { brand: "cordial" | "morar"; onPick: (p: { publicId: string; mediaId: string; mediaVersion: string }) => void }) {
  const search = useServerFn(searchShowcaseCandidates);
  const [ref, setRef] = useState("");
  const q = useMutation({ mutationFn: () => search({ data: { reference: ref, brand } }) });
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (ref.trim()) q.mutate(); }}>
        <input className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm" placeholder="Referência do imóvel publicado" value={ref} onChange={(e) => setRef(e.target.value)} />
        <button className={btn} disabled={q.isPending}>Buscar</button>
      </form>
      {q.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum imóvel publicado com essa referência.</p>}
      {q.data?.map((p) => (
        <div key={p.public_id}>
          <p className="mb-1 text-sm font-medium">Ref. {p.public_reference} · {p.tipo} {p.bairro ? `no ${p.bairro}` : ""}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {p.photos.map((ph) => (
              <button key={ph.id} type="button" className="overflow-hidden rounded border hover:ring-2 hover:ring-primary" onClick={() => onPick({ publicId: p.public_id, mediaId: ph.id, mediaVersion: ph.version })} title={ph.width && ph.height && ph.width < ph.height ? "Foto vertical: recorte maior na abertura" : "Escolher esta foto"}>
                {ph.url ? <img src={ph.url} alt="" className="aspect-[3/2] w-full object-cover" /> : <div className="aspect-[3/2] bg-muted" />}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScheduleForm({ sched, busy, onSave }: { sched: { prepareDow: number; prepareHour: number; activateHour: number }; busy: boolean; onSave: (s: { prepareDow: number; prepareHour: number; activateHour: number }) => void }) {
  const [s, setS] = useState(sched);
  const sel = "mt-1 block rounded-lg border bg-background px-2 py-1.5 text-sm";
  const hours = Array.from({ length: 24 }, (_, h) => h);
  return (
    <section className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 text-sm">
      <label>Preparo (dia)
        <select className={sel} value={s.prepareDow} onChange={(e) => setS({ ...s, prepareDow: +e.target.value })}>
          {DOW.map((d, i) => i !== 1 && <option key={d} value={i}>{d}</option>)}
        </select>
      </label>
      <label>Preparo (hora)
        <select className={sel} value={s.prepareHour} onChange={(e) => setS({ ...s, prepareHour: +e.target.value })}>{hours.map((h) => <option key={h} value={h}>{h}h</option>)}</select>
      </label>
      <label>Troca na segunda (hora)
        <select className={sel} value={s.activateHour} onChange={(e) => setS({ ...s, activateHour: +e.target.value })}>{hours.map((h) => <option key={h} value={h}>{h}h</option>)}</select>
      </label>
      <button className={btn} disabled={busy} onClick={() => onSave(s)}>Salvar horários</button>
    </section>
  );
}
