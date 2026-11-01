import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle, Check, CheckCircle2, Download, ImagePlus, Loader2, Plus, RotateCcw,
  Sparkles, SlidersHorizontal, Trash2, Upload, Wand2, X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  REALCE_MAX_FILES, inFlight, retryable, statusLabel, suggestSelection, suggestedCount, validateFile,
  type RealceStatus, type RealceTechnique, type RealceUiStatus,
} from "@/lib/realce/model";
import { applyNaturalPreset, downloadResult, downloadZip, preparePhoto, signedUrl, type PreparedPhoto } from "@/lib/realce/client";
import { realceProcessNow, realceStatus } from "@/lib/realce/realce.functions";
import { BeforeAfter } from "./BeforeAfter";

type LocalPhoto = {
  key: string;
  file: File;
  name: string;
  state: "preparando" | "pronta" | "erro" | "enviando";
  prepared?: PreparedPhoto;
  error?: string;
  selected: boolean;
};

type Item = {
  id: string; test_id: string; user_id: string; position: number; original_name: string; original_path: string;
  work_path: string; work_width: number; work_height: number; selected: boolean; technique: RealceTechnique | null;
  status: RealceStatus; result_path: string | null; result_width: number | null; result_height: number | null;
  result_note: string | null; error_message: string | null; decision: "realcada" | "original" | null; duration_ms: number | null;
};

const itemCols =
  "id,test_id,user_id,position,original_name,original_path,work_path,work_width,work_height,selected,technique,status,result_path,result_width,result_height,result_note,error_message,decision,duration_ms";

const extOf = (n: string) => (n.match(/\.([a-z0-9]+)$/i)?.[1] ?? "jpg").toLowerCase();

export function RealcePage({ testId }: { testId: string | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const statusFn = useServerFn(realceStatus);
  const processFn = useServerFn(realceProcessNow);
  const [local, setLocal] = useState<LocalPhoto[]>([]);
  const [technique, setTechnique] = useState<RealceTechnique>("ia");
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const kicking = useRef(false);
  const workBlobs = useRef(new Map<string, Blob>());

  const status = useQuery({ queryKey: ["realce", "status"], queryFn: () => statusFn(), staleTime: 60_000 });
  const aiReady = status.data?.aiConfigured === true;
  useEffect(() => { if (status.data && !aiReady) setTechnique("preset"); }, [status.data, aiReady]);

  const items = useQuery({
    queryKey: ["realce", "items", testId],
    enabled: !!testId,
    queryFn: async () => {
      const { data, error } = await supabase.from("realce_items").select(itemCols).eq("test_id", testId!).order("position");
      if (error) throw error;
      return (data ?? []) as Item[];
    },
    refetchInterval: (q) => ((q.state.data as Item[] | undefined)?.some((i) => inFlight(i.status)) ? 2500 : false),
  });
  const serverItems = useMemo(() => (testId ? items.data ?? [] : []), [testId, items.data]);

  const history = useQuery({
    queryKey: ["realce", "tests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("realce_tests").select("id,title,created_at,user_id,realce_items(count)").order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  // URLs assinadas curtas para miniaturas e resultados.
  const paths = useMemo(() => serverItems.flatMap((i) => [i.work_path, i.result_path].filter(Boolean) as string[]), [serverItems]);
  const urls = useQuery({
    queryKey: ["realce", "urls", paths],
    enabled: paths.length > 0,
    staleTime: 8 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.storage.from("realce").createSignedUrls(paths, 900);
      const map: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
      return map;
    },
  });
  const url = (p: string | null) => (p ? urls.data?.[p] : undefined);

  // Mantém o lote andando enquanto houver fila (a rotina do servidor também processa sozinha).
  useEffect(() => {
    if (!serverItems.some((i) => i.status === "na_fila" && i.technique === "ia") || kicking.current) return;
    kicking.current = true;
    processFn()
      .then((r) => { if (r.paused) toast.error("A IA pausou o processamento. Veja a mensagem na foto."); })
      .catch(() => undefined)
      .finally(() => { kicking.current = false; qc.invalidateQueries({ queryKey: ["realce", "items", testId] }); });
  }, [serverItems, processFn, qc, testId]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const list = Array.from(files);
    const room = REALCE_MAX_FILES - local.length - serverItems.length;
    if (list.length > room) toast.error(`Máximo de ${REALCE_MAX_FILES} fotos por teste.`);
    const accepted: LocalPhoto[] = [];
    for (const f of list.slice(0, Math.max(0, room))) {
      const err = validateFile(f);
      if (err) { toast.error(`${f.name}: ${err}`); continue; }
      accepted.push({ key: crypto.randomUUID(), file: f, name: f.name, state: "preparando", selected: true });
    }
    if (!accepted.length) return;
    setLocal((prev) => [...prev, ...accepted]);
    // Prepara uma por vez para não travar a tela.
    (async () => {
      for (const p of accepted) {
        await new Promise((r) => setTimeout(r, 0));
        try {
          const prepared = await preparePhoto(p.file);
          setLocal((prev) => prev.map((x) => (x.key === p.key ? { ...x, state: "pronta", prepared } : x)));
        } catch {
          setLocal((prev) => prev.map((x) => x.key === p.key ? { ...x, state: "erro", selected: false,
            error: /\.(heic|heif)$/i.test(p.name) ? "Este aparelho não abriu o HEIC. No iPhone, use Ajustes › Câmera › Formatos › Mais compatível." : "Não foi possível abrir esta foto." } : x));
        }
      }
    })();
  }, [local.length, serverItems.length]);

  const eligibleLocal = local.filter((l) => l.state === "pronta");
  const eligibleServer = serverItems.filter((i) => i.status === "rascunho");
  const selectedLocal = eligibleLocal.filter((l) => l.selected);
  const selectedServer = eligibleServer.filter((i) => i.selected);
  const totalEligible = eligibleLocal.length + eligibleServer.length;
  const toProcess = selectedLocal.length + selectedServer.length;
  const preparing = local.some((l) => l.state === "preparando");

  const simulate25 = async () => {
    const keys = [...eligibleLocal.map((l) => `l:${l.key}`), ...eligibleServer.map((i) => `s:${i.id}`)];
    const chosen = suggestSelection(keys);
    setLocal((prev) => prev.map((l) => (l.state === "pronta" ? { ...l, selected: chosen.has(`l:${l.key}`) } : l)));
    for (const i of eligibleServer) {
      const sel = chosen.has(`s:${i.id}`);
      if (sel !== i.selected) await supabase.from("realce_items").update({ selected: sel }).eq("id", i.id);
    }
    qc.invalidateQueries({ queryKey: ["realce", "items", testId] });
    toast.success(`${chosen.size} de ${keys.length} fotos sugeridas (25%, arredondado para cima). Ajuste à vontade.`);
  };

  const toggleServer = async (i: Item) => {
    await supabase.from("realce_items").update({ selected: !i.selected }).eq("id", i.id);
    qc.invalidateQueries({ queryKey: ["realce", "items", testId] });
  };

  const runPreset = async (ids: string[]) => {
    const { data } = await supabase.from("realce_items").select(itemCols).in("id", ids);
    for (const it of (data ?? []) as Item[]) {
      const t0 = performance.now();
      try {
        let work = workBlobs.current.get(it.id);
        if (!work) {
          const dl = await supabase.storage.from("realce").download(it.work_path);
          if (dl.error || !dl.data) throw new Error();
          work = dl.data;
        }
        const out = await applyNaturalPreset(work);
        const path = `${it.user_id}/${it.test_id}/result/${it.id}-preset-${Date.now()}.jpg`;
        const up = await supabase.storage.from("realce").upload(path, out.blob, { contentType: "image/jpeg" });
        if (up.error) throw new Error();
        await supabase.rpc("realce_save_preset", { p_item: it.id, p_path: path, p_width: out.width, p_height: out.height, p_duration_ms: Math.round(performance.now() - t0) });
      } catch {
        await supabase.rpc("realce_fail_preset", { p_item: it.id, p_message: "Não foi possível aplicar o preset." });
      }
      qc.invalidateQueries({ queryKey: ["realce", "items", it.test_id] });
    }
  };

  const enqueue = async (tid: string, ids: string[], tech: RealceTechnique) => {
    const { data, error } = await supabase.rpc("realce_enqueue", { p_item_ids: ids, p_technique: tech });
    if (error) {
      toast.error(error.message.includes("daily_limit") ? "Limite diário de fotos com IA atingido. Tente amanhã ou use o preset." : "Não foi possível iniciar o realce.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["realce", "items", tid] });
    const started = (data ?? []).map((r: { id: string }) => r.id);
    if (tech === "preset" && started.length) await runPreset(started);
  };

  const realcar = async () => {
    if (busy || toProcess === 0) return;
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Sessão expirada.");
      let tid = testId;
      if (!tid) {
        const { data, error } = await supabase.from("realce_tests").insert({ user_id: uid, title: `Teste de ${new Date().toLocaleDateString("pt-BR")}` }).select("id").single();
        if (error || !data) throw new Error("Não foi possível criar o teste.");
        tid = data.id as string;
        navigate({ to: "/realce", search: { teste: tid } });
      }
      const basePos = serverItems.length;
      const ids: string[] = selectedServer.map((i) => i.id);
      const queue = [...selectedLocal];
      let pos = basePos;
      const uploadOne = async (p: LocalPhoto, position: number) => {
        setLocal((prev) => prev.map((x) => (x.key === p.key ? { ...x, state: "enviando" } : x)));
        const id = crypto.randomUUID();
        const orig = `${uid}/${tid}/original/${id}.${extOf(p.name)}`;
        const work = `${uid}/${tid}/work/${id}.jpg`;
        const a = await supabase.storage.from("realce").upload(orig, p.file, { contentType: p.file.type || "application/octet-stream" });
        const b = await supabase.storage.from("realce").upload(work, p.prepared!.work, { contentType: "image/jpeg" });
        if (a.error || b.error) throw new Error("upload");
        const ins = await supabase.from("realce_items").insert({
          id, test_id: tid!, user_id: uid, position, original_name: p.name, original_path: orig, original_mime: p.file.type || "image/heic",
          original_bytes: p.file.size, work_path: work, work_width: p.prepared!.width, work_height: p.prepared!.height, selected: true,
        });
        if (ins.error) throw new Error("insert");
        workBlobs.current.set(id, p.prepared!.work);
        ids.push(id);
        setLocal((prev) => prev.filter((x) => x.key !== p.key));
      };
      // Envio com concorrência 3.
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
        for (let p = queue.shift(); p; p = queue.shift()) {
          try { await uploadOne(p, pos++); }
          catch { setLocal((prev) => prev.map((x) => (x.key === p!.key ? { ...x, state: "erro", error: "Falha no envio. Tente de novo." } : x))); }
        }
      }));
      if (ids.length) await enqueue(tid!, ids, technique);
      qc.invalidateQueries({ queryKey: ["realce", "tests"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível realçar.");
    } finally {
      setBusy(false);
    }
  };

  const deleteTest = async () => {
    if (!testId || !confirm("Excluir este teste e todos os arquivos dele?")) return;
    const uid = serverItems[0]?.user_id;
    const files = new Set<string>();
    for (const i of serverItems) for (const p of [i.original_path, i.work_path, i.result_path]) if (p) files.add(p);
    if (uid) {
      const { data } = await supabase.storage.from("realce").list(`${uid}/${testId}/result`);
      for (const f of data ?? []) files.add(`${uid}/${testId}/result/${f.name}`);
    }
    if (files.size) await supabase.storage.from("realce").remove([...files]);
    const { error } = await supabase.from("realce_tests").delete().eq("id", testId);
    if (error) { toast.error("Não foi possível excluir (fotos ainda em processamento?)."); return; }
    toast.success("Teste excluído.");
    qc.invalidateQueries({ queryKey: ["realce"] });
    navigate({ to: "/realce", search: {} });
  };

  const ready = serverItems.filter((i) => i.status === "pronta" && i.result_path);
  const processed = serverItems.filter((i) => i.status !== "rascunho");
  const viewing = serverItems.find((i) => i.id === viewer) ?? null;
  const hasContent = local.length > 0 || serverItems.length > 0;

  return (
    <div className="space-y-4 pb-28 md:pb-6">
      {/* Topo compacto */}
      <section className="relative overflow-hidden rounded-[1.4rem] bg-[linear-gradient(120deg,#123f4f_0%,#1a6b72_55%,#22414a_100%)] px-4 py-3.5 text-white ring-1 ring-white/10 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/12 ring-1 ring-white/15"><Wand2 className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-lg font-semibold leading-tight tracking-tight sm:text-xl">Realce</h1>
            <p className="truncate text-xs text-white/70">Adicionar → Realçar → Comparar → Baixar</p>
          </div>
          <span className={cn("hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 sm:inline-flex",
            aiReady ? "bg-white/10 ring-white/20" : "bg-amber-400/15 text-amber-100 ring-amber-300/30")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", aiReady ? "bg-emerald-300" : "bg-amber-300")} />
            {status.isLoading ? "Verificando IA…" : aiReady ? "IA ativa" : "IA não configurada"}
          </span>
          <Button size="sm" variant="secondary" className="shrink-0" onClick={() => fileInput.current?.click()}>
            <Plus className="h-4 w-4" /><span className="hidden sm:inline">Adicionar fotos</span>
          </Button>
        </div>
      </section>
      <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" className="hidden"
        onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />

      {status.data && !aiReady && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300/50 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          IA não configurada: falta a chave de IA do projeto. Enquanto isso, só o preset fotográfico (sem IA) está disponível.
        </div>
      )}

      {/* Área de envio */}
      {!hasContent ? (
        <button type="button" onClick={() => fileInput.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          className={cn("group flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition",
            dragOver ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50 hover:bg-muted/40")}>
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary transition group-hover:scale-105"><ImagePlus className="h-7 w-7" /></span>
          <span className="font-display text-lg font-semibold">Adicione as fotos do imóvel</span>
          <span className="text-sm text-muted-foreground">Arraste aqui ou toque para escolher · JPG, PNG, WebP ou HEIC · até {REALCE_MAX_FILES} fotos</span>
        </button>
      ) : (
        <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          className={cn("rounded-2xl transition", dragOver && "ring-2 ring-primary ring-offset-2")}>
          {processed.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="font-display text-base font-semibold">{ready.length} de {processed.length} fotos prontas</p>
              <div className="ml-auto flex gap-2">
                {ready.length > 1 && (
                  <Button size="sm" variant="outline" onClick={() => downloadZip(ready.map((i) => ({ path: i.result_path!, originalName: i.original_name })), "fotos-realce.zip").catch(() => toast.error("Falha ao montar o ZIP."))}>
                    <Download className="h-4 w-4" />Baixar prontas (ZIP)
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-destructive" aria-label="Excluir teste" onClick={deleteTest}><Trash2 className="h-4 w-4" /><span className="hidden sm:inline">Excluir teste</span></Button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {serverItems.map((i) => (
              <PhotoCard key={i.id} src={url(i.result_path) ?? url(i.work_path)} name={i.original_name} status={i.status}
                technique={i.technique} decision={i.decision}
                selectable={i.status === "rascunho"} selected={i.selected} onToggle={() => toggleServer(i)}
                error={i.error_message}
                onOpen={i.status === "pronta" ? () => setViewer(i.id) : undefined}
                onRetry={retryable(i.status) ? () => enqueue(i.test_id, [i.id], i.technique ?? technique) : undefined} />
            ))}
            {local.map((l) => (
              <PhotoCard key={l.key} src={l.prepared?.thumbUrl} name={l.name}
                status={l.state === "enviando" ? "enviando" : "local"} preparing={l.state === "preparando"}
                error={l.error} selectable={l.state === "pronta"} selected={l.selected}
                onToggle={() => setLocal((p) => p.map((x) => (x.key === l.key ? { ...x, selected: !x.selected } : x)))}
                onRemove={l.state !== "enviando" ? () => setLocal((p) => p.filter((x) => x.key !== l.key)) : undefined} />
            ))}
            <button type="button" onClick={() => fileInput.current?.click()}
              className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground">
              <Upload className="h-5 w-5" />Adicionar
            </button>
          </div>
        </div>
      )}

      {/* Barra de ação */}
      {totalEligible > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-30 px-3 md:static md:px-0">
          <div className="mx-auto flex max-w-3xl flex-col gap-2.5 rounded-2xl border bg-card/95 p-3 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.35)] backdrop-blur md:max-w-none md:flex-row md:items-center">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-display text-base font-semibold tabular-nums">{toProcess}</span>
              <span className="text-muted-foreground">de {totalEligible} {totalEligible === 1 ? "foto será realçada" : "fotos serão realçadas"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:ml-auto">
              <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-medium">
                <button type="button" disabled={!aiReady} onClick={() => setTechnique("ia")}
                  className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 transition disabled:opacity-40", technique === "ia" && "bg-background shadow-sm")}>
                  <Sparkles className="h-3.5 w-3.5" />Realce Natural · IA
                </button>
                <button type="button" onClick={() => setTechnique("preset")}
                  className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 transition", technique === "preset" && "bg-background shadow-sm")}>
                  <SlidersHorizontal className="h-3.5 w-3.5" />Preset · sem IA
                </button>
              </div>
              <Button size="sm" variant="ghost" onClick={simulate25} title={`Sugere ${suggestedCount(totalEligible)} foto(s)`}>Simular seleção de 25%</Button>
              <Button onClick={realcar} disabled={busy || preparing || toProcess === 0} className="min-w-[10rem]">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <span aria-hidden>✦</span>}
                {busy ? "Enviando…" : "Realçar fotos"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Histórico */}
      {(history.data?.length ?? 0) > 0 && (
        <section className="pt-2">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Testes recentes</h2>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button type="button" onClick={() => { setLocal([]); navigate({ to: "/realce", search: {} }); }}
              className={cn("shrink-0 rounded-xl border px-3 py-2 text-sm", !testId && "border-primary bg-primary/5")}>
              <Plus className="mr-1 inline h-3.5 w-3.5" />Novo
            </button>
            {history.data!.map((t) => (
              <button key={t.id} type="button" onClick={() => { setLocal([]); navigate({ to: "/realce", search: { teste: t.id } }); }}
                className={cn("shrink-0 rounded-xl border px-3 py-2 text-left text-sm transition hover:bg-muted/50", t.id === testId && "border-primary bg-primary/5")}>
                <span className="block font-medium">{new Date(t.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                <span className="text-xs text-muted-foreground">{(t.realce_items as unknown as { count: number }[])?.[0]?.count ?? 0} fotos</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewer(null)}>
        <DialogContent className="max-w-5xl gap-3 p-3 sm:p-5">
          {viewing && (
            <>
              <DialogTitle className="truncate pr-8 font-display text-base">{viewing.original_name}</DialogTitle>
              {url(viewing.work_path) && url(viewing.result_path) ? (
                <BeforeAfter before={url(viewing.work_path)!} after={url(viewing.result_path)!}
                  ratio={viewing.work_width / viewing.work_height}
                  afterLabel={viewing.technique === "ia" ? "Realçada · IA" : "Realçada · Preset"} />
              ) : (
                <div className="grid aspect-[4/3] place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
              )}
              {viewing.result_note && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{viewing.result_note}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {viewing.technique === "ia" ? "Edição por IA: confira se nada do imóvel foi alterado antes de usar." : "Preset fotográfico aplicado no aparelho, sem IA."}
                {viewing.result_width ? ` Resultado ${viewing.result_width}×${viewing.result_height}.` : ""}
                {viewing.duration_ms ? ` Tempo: ${(viewing.duration_ms / 1000).toFixed(1)} s.` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={async () => {
                  await supabase.from("realce_items").update({ decision: "realcada" }).eq("id", viewing.id);
                  downloadResult(viewing.result_path!, viewing.original_name).catch(() => toast.error("Falha no download."));
                  qc.invalidateQueries({ queryKey: ["realce", "items", testId] });
                }}><Download className="h-4 w-4" />Baixar foto realçada</Button>
                <Button variant="outline" onClick={async () => {
                  await supabase.from("realce_items").update({ decision: "original" }).eq("id", viewing.id);
                  qc.invalidateQueries({ queryKey: ["realce", "items", testId] });
                  setViewer(null);
                }}><Check className="h-4 w-4" />Manter original</Button>
                <Button variant="ghost" onClick={async () => {
                  if (!confirm("Gerar uma nova versão desta foto? Com IA, isso é uma nova cobrança.")) return;
                  await supabase.from("realce_items").update({ decision: null }).eq("id", viewing.id);
                  const { error } = await supabase.rpc("realce_redo", { p_item: viewing.id });
                  if (error) { toast.error("Não foi possível tentar novamente."); return; }
                  setViewer(null);
                  await enqueue(viewing.test_id, [viewing.id], viewing.technique ?? technique);
                }}><RotateCcw className="h-4 w-4" />Tentar novamente</Button>
                <a className="ml-auto self-center text-xs text-muted-foreground underline-offset-2 hover:underline" href="#"
                  onClick={async (e) => { e.preventDefault(); window.open(await signedUrl(viewing.original_path), "_blank", "noopener"); }}>
                  Abrir original
                </a>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PhotoCard(props: {
  src?: string; name: string; status: RealceUiStatus; technique?: RealceTechnique | null; decision?: string | null;
  preparing?: boolean; error?: string | null; selectable: boolean; selected: boolean;
  onToggle: () => void; onRemove?: () => void; onOpen?: () => void; onRetry?: () => void;
}) {
  const { status } = props;
  const tone =
    status === "pronta" ? "bg-emerald-500/90 text-white" :
    status === "falha" || status === "incerto" ? "bg-destructive/90 text-destructive-foreground" :
    inFlight(status) ? "bg-primary/90 text-primary-foreground" : "bg-background/85 text-foreground";
  return (
    <div className={cn("group relative overflow-hidden rounded-xl bg-muted ring-1 ring-border transition",
      props.selectable && props.selected && "ring-2 ring-primary", props.selectable && !props.selected && "opacity-60")}>
      <button type="button" className="block aspect-[4/3] w-full" onClick={props.onOpen ?? (props.selectable ? props.onToggle : undefined)}>
        {props.src ? <img src={props.src} alt={props.name} loading="lazy" className="h-full w-full object-cover" />
          : <span className="grid h-full w-full place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></span>}
      </button>
      {props.selectable && (
        <button type="button" aria-label={props.selected ? "Desmarcar" : "Marcar"} onClick={props.onToggle}
          className={cn("absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full ring-2 ring-white shadow",
            props.selected ? "bg-primary text-primary-foreground" : "bg-black/30 text-transparent")}>
          <Check className="h-4 w-4" />
        </button>
      )}
      {props.onRemove && (
        <button type="button" aria-label="Remover foto" onClick={props.onRemove}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/45 text-white opacity-90 hover:bg-black/60">
          <X className="h-4 w-4" />
        </button>
      )}
      <div className="absolute inset-x-2 bottom-2 flex items-center gap-1.5">
        <span className={cn("inline-flex items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-medium backdrop-blur", tone)}>
          {inFlight(status) && <Loader2 className="h-3 w-3 animate-spin" />}
          {status === "pronta" && <CheckCircle2 className="h-3 w-3" />}
          {props.preparing ? "Preparando" : statusLabel[status]}
          {status === "pronta" && props.technique && <span className="opacity-80">· {props.technique === "ia" ? "IA" : "Preset"}</span>}
        </span>
        {props.decision === "original" && <span className="rounded-full bg-background/85 px-2 py-0.5 text-[11px]">Original mantida</span>}
        {props.onRetry && (
          <button type="button" onClick={props.onRetry} className="ml-auto grid h-7 w-7 place-items-center rounded-full bg-background/90 text-foreground shadow" aria-label="Tentar novamente">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {props.error && <p className="line-clamp-2 bg-destructive/10 px-2 py-1 text-[11px] text-destructive" title={props.error}>{props.error}</p>}
    </div>
  );
}
