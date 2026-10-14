import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  GripVertical,
  Link2,
  Loader2,
  MessageCircle,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-mock";
import { selectionDraft, useSelectionDraft } from "@/lib/selecoes/draft-store";
import {
  SELECTION_DEFAULT_DAYS,
  SELECTION_VALIDITY_OPTIONS,
  buildBrokerShareText,
  expiresAtFor,
  isValidWhatsapp,
  normalizeWhatsapp,
  whatsappUrl,
} from "@/lib/selecoes/rules";
import {
  getSelectionCandidates,
  listSelections,
  saveSelection,
  type SelectionCandidate,
} from "@/lib/selecoes/selecoes.functions";

const WA_KEY = "cordial:selecao:whatsapp";

export function selectionPublicUrl(token: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/s/${token}`;
}

export async function copyText(text: string, ok = "Link copiado.") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(ok);
  } catch {
    toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
  }
}

/** Barra compacta que aparece após a primeira escolha. */
export function SelectionBar({ onReview }: { onReview: (mode: "review" | "create") => void }) {
  const draft = useSelectionDraft();
  const [confirmClear, setConfirmClear] = useState(false);
  if (!draft.ids.length && !draft.editingId) return null;
  const n = draft.ids.length;
  return (
    <>
      <div
        role="region"
        aria-label="Seleção de imóveis"
        className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-40 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-2xl border border-white/70 bg-white/92 p-2 pl-4 shadow-[0_18px_44px_-18px_rgba(23,27,33,0.45)] backdrop-blur-xl lg:bottom-5"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">
            {n} {n === 1 ? "imóvel selecionado" : "imóveis selecionados"}
          </p>
          {draft.editingId ? (
            <p className="truncate text-[11px] text-foreground/55">
              Editando: {draft.editingTitle ?? "seleção"}
            </p>
          ) : (
            <p className="text-[11px] text-foreground/55">Nova seleção · continua ao mudar filtros</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onReview("review")}
          className="h-9 rounded-full border border-primary/25 px-3 text-[12px] font-semibold text-primary hover:bg-primary/10"
        >
          Revisar seleção
        </button>
        <button
          type="button"
          disabled={!n}
          onClick={() => onReview("create")}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[12px] font-semibold text-primary-foreground shadow-sm disabled:opacity-50"
        >
          <Link2 className="size-3.5" />
          {draft.editingId ? "Salvar link" : "Criar link"}
        </button>
        <button
          type="button"
          aria-label="Limpar seleção"
          title="Limpar seleção"
          onClick={() => setConfirmClear(true)}
          className="grid size-9 place-items-center rounded-full text-foreground/50 hover:bg-foreground/5 hover:text-destructive"
        >
          <X className="size-4" />
        </button>
      </div>
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {draft.editingId ? "Descartar a edição?" : "Limpar a seleção?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {draft.editingId
                ? "As mudanças não salvas serão descartadas. O link já enviado continua como estava."
                : `Os ${n} imóveis escolhidos serão retirados do rascunho. Os filtros da busca não mudam.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => selectionDraft.clear()}>
              {draft.editingId ? "Descartar" : "Limpar seleção"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type Done = { id: string; token: string; title: string; clientName: string };

export function SelectionReviewSheet({
  open,
  onOpenChange,
  initialStep,
  suggestedTitle,
  defaultAgency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStep: "review" | "create";
  suggestedTitle: string;
  defaultAgency: "cordial" | "morar";
}) {
  const draft = useSelectionDraft();
  const session = useSession();
  const qc = useQueryClient();
  const fetchCandidates = useServerFn(getSelectionCandidates);
  const fetchList = useServerFn(listSelections);
  const save = useServerFn(saveSelection);

  const [step, setStep] = useState<"review" | "create">(initialStep);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [clientName, setClientName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [days, setDays] = useState<number>(SELECTION_DEFAULT_DAYS);
  const [agency, setAgency] = useState<"cordial" | "morar">(defaultAgency);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [done, setDone] = useState<Done | null>(null);
  const [shareText, setShareText] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep(initialStep);
      setDone(null);
      setBlocked([]);
    }
  }, [open, initialStep]);

  const candidates = useQuery({
    queryKey: ["selection-candidates", draft.ids],
    queryFn: () => fetchCandidates({ data: { ids: draft.ids } }),
    enabled: open && draft.ids.length > 0,
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });

  const editing = useQuery({
    queryKey: ["selecoes"],
    queryFn: () => fetchList(),
    enabled: open && !!draft.editingId,
  });

  // Preenche o formulário ao abrir (edição usa os dados salvos).
  useEffect(() => {
    if (!open) return;
    const existing = draft.editingId ? editing.data?.find((s) => s.id === draft.editingId) : null;
    if (draft.editingId && !existing) return;
    if (existing) {
      setTitle(existing.title);
      setMessage(existing.public_message);
      setClientName(existing.internal_client_name);
      setWhatsapp(existing.whatsapp);
      setAgency(existing.agency);
      setDays(existing.expires_at ? SELECTION_DEFAULT_DAYS : 0);
    } else {
      setTitle((t) => t || suggestedTitle);
      setAgency(defaultAgency);
      try {
        setWhatsapp((w) => w || window.localStorage.getItem(WA_KEY) || "");
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft.editingId, editing.data]);

  const byId = useMemo(
    () => new Map((candidates.data ?? []).map((c) => [c.id, c])),
    [candidates.data],
  );
  const rows = draft.ids.map((id) => byId.get(id)).filter(Boolean) as SelectionCandidate[];
  const ineligible = rows.filter((r) => !r.eligible).map((r) => r.id);
  const toFix = new Set([...ineligible, ...blocked]);

  async function submit() {
    if (!draft.ids.length) return;
    if (!title.trim()) return toast.error("Informe um título.");
    if (!isValidWhatsapp(whatsapp)) return toast.error("WhatsApp inválido. Use DDD + número.");
    if (toFix.size) return toast.error("Retire os imóveis indisponíveis antes de concluir.");
    setSaving(true);
    try {
      const wa = normalizeWhatsapp(whatsapp);
      const res = await save({
        data: {
          id: draft.editingId,
          requestId: draft.requestId || `${Date.now()}-retry`,
          agency,
          title: title.trim(),
          message: message.trim(),
          clientName: clientName.trim(),
          whatsapp: wa,
          expiresAt: expiresAtFor(days),
          propertyIds: draft.ids,
        },
      });
      if (!res.ok) {
        if (res.error === "inelegiveis") {
          setBlocked(res.ineligible ?? []);
          setStep("review");
          toast.error("Alguns imóveis não podem ser divulgados agora. Retire-os para concluir.");
        } else if (res.error === "encerrada") {
          toast.error("Esta seleção foi encerrada e não pode mais ser editada.");
        } else {
          toast.error("A seleção precisa ter entre 1 e 60 imóveis.");
        }
        return;
      }
      try {
        if (wa) window.localStorage.setItem(WA_KEY, wa);
      } catch {
        // ignore
      }
      const result = { id: res.id, token: res.token, title: title.trim(), clientName: clientName.trim() };
      setDone(result);
      setShareText(
        buildBrokerShareText({ title: result.title, link: selectionPublicUrl(res.token), clientName: result.clientName }),
      );
      selectionDraft.finish();
      qc.invalidateQueries({ queryKey: ["selecoes"] });
    } catch (error) {
      // O rascunho é mantido; repetir usa a mesma chave e não duplica.
      toast.error((error as Error).message || "Falha de conexão. Tente novamente — nada foi perdido.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-foreground/[0.06] p-4">
          <SheetTitle>
            {done ? "Link pronto" : draft.editingId ? "Editar seleção" : step === "review" ? "Revisar seleção" : "Criar link"}
          </SheetTitle>
          <SheetDescription>
            {done
              ? "Quem tiver o link consegue ver a seleção."
              : `${draft.ids.length} ${draft.ids.length === 1 ? "imóvel" : "imóveis"} · preço e disponibilidade atuais`}
          </SheetDescription>
        </SheetHeader>

        {done ? (
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-[13px] text-emerald-800">
              <Check className="size-4" /> Seleção salva. O mesmo link vale para futuras edições.
            </div>
            <div className="flex gap-2">
              <Input readOnly value={selectionPublicUrl(done.token)} aria-label="Link da seleção" onFocus={(e) => e.currentTarget.select()} />
              <button
                type="button"
                onClick={() => copyText(selectionPublicUrl(done.token))}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[12px] font-semibold"
              >
                <Copy className="size-3.5" /> Copiar link
              </button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="share-text">Mensagem para o cliente (editável)</Label>
              <Textarea id="share-text" rows={4} value={shareText} onChange={(e) => setShareText(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={whatsappUrl("", shareText)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#1f8f4e] px-4 text-[13px] font-semibold text-white"
              >
                <MessageCircle className="size-4" /> Compartilhar no WhatsApp
              </a>
              <a
                href={`/s/${done.token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[13px] font-semibold"
              >
                <ExternalLink className="size-4" /> Pré-visualizar
              </a>
              <Link to="/selecoes" className="inline-flex h-10 items-center rounded-full px-3 text-[13px] font-semibold text-primary">
                Ver seleções
              </Link>
            </div>
            <p className="text-[11px] text-foreground/50">
              O WhatsApp abre com a mensagem para você escolher o contato e enviar. Nada é enviado automaticamente.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4">
              {step === "review" ? (
                <ol className="space-y-2">
                  {!draft.ids.length ? (
                    <li className="rounded-xl border border-dashed p-6 text-center text-[13px] text-foreground/55">
                      Nenhum imóvel na seleção. Use “Selecionar” nos cards da busca.
                    </li>
                  ) : null}
                  {candidates.isError ? (
                    <li className="rounded-xl bg-destructive/10 p-3 text-[12px] text-destructive">
                      Não foi possível conferir os imóveis agora.{" "}
                      <button type="button" className="underline" onClick={() => candidates.refetch()}>
                        Tentar de novo
                      </button>
                    </li>
                  ) : null}
                  {draft.ids.map((id, i) => {
                    const c = byId.get(id);
                    const bad = toFix.has(id);
                    return (
                      <li
                        key={id}
                        draggable
                        onDragStart={() => setDragId(id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (!dragId || dragId === id) return;
                          const next = draft.ids.filter((x) => x !== dragId);
                          next.splice(next.indexOf(id) + (draft.ids.indexOf(dragId) < i ? 1 : 0), 0, dragId);
                          selectionDraft.reorder(next);
                          setDragId(null);
                        }}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border bg-white/70 p-2",
                          bad && "border-destructive/50 bg-destructive/5",
                        )}
                      >
                        <GripVertical className="size-4 shrink-0 cursor-grab text-foreground/30" aria-hidden />
                        <span className="w-5 text-center text-[11px] font-semibold tabular-nums text-foreground/45">{i + 1}</span>
                        <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-foreground/5">
                          {c?.coverUrl ? <img src={c.coverUrl} alt="" className="size-full object-cover" loading="lazy" /> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold">
                            {c ? c.title : "Carregando…"} {c?.reference ? <span className="font-mono text-[11px] text-foreground/50">{c.reference}</span> : null}
                          </p>
                          <p className="truncate text-[11.5px] text-foreground/55">
                            {c ? (c.price != null ? `${brl(c.price)}${c.operation === "aluguel" ? "/mês" : ""}` : "Sob consulta") : ""}
                            {c?.location ? ` · ${c.location}` : ""}
                          </p>
                          {bad ? (
                            <p className="flex items-center gap-1 text-[11px] font-semibold text-destructive">
                              <AlertTriangle className="size-3" /> Indisponível para divulgação — retire para concluir
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center">
                          <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => selectionDraft.move(id, -1)} className="grid size-8 place-items-center rounded-full hover:bg-foreground/5 disabled:opacity-30">
                            <ArrowUp className="size-3.5" />
                          </button>
                          <button type="button" aria-label="Descer" disabled={i === draft.ids.length - 1} onClick={() => selectionDraft.move(id, 1)} className="grid size-8 place-items-center rounded-full hover:bg-foreground/5 disabled:opacity-30">
                            <ArrowDown className="size-3.5" />
                          </button>
                          <button type="button" aria-label="Remover da seleção" onClick={() => selectionDraft.remove(id)} className="grid size-8 place-items-center rounded-full text-destructive/70 hover:bg-destructive/10">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="space-y-3.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="sel-title">Título</Label>
                    <Input id="sel-title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sel-msg">Mensagem de apresentação (opcional)</Label>
                    <Textarea id="sel-msg" rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sel-client">Nome do cliente (interno, não aparece no link)</Label>
                    <Input id="sel-client" maxLength={120} value={clientName} onChange={(e) => setClientName(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Corretor responsável</Label>
                      <Input readOnly value={session?.nome ?? ""} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sel-wa">WhatsApp do corretor</Label>
                      <Input id="sel-wa" inputMode="tel" placeholder="(55) 99999-0000" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sel-agency">Imobiliária</Label>
                      <select id="sel-agency" value={agency} onChange={(e) => setAgency(e.target.value as "cordial" | "morar")} className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
                        <option value="cordial">Cordial</option>
                        <option value="morar">Morar</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sel-days">Validade do link</Label>
                      <select id="sel-days" value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
                        {SELECTION_VALIDITY_OPTIONS.map((d) => (
                          <option key={d} value={d}>{d ? `${d} dias` : "Sem validade"}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="text-[11px] text-foreground/50">
                    {draft.editingId
                      ? "Salvar mantém o mesmo link e conta a validade a partir de hoje."
                      : "A validade conta a partir de hoje. Quem tiver o link consegue ver a seleção."}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-foreground/[0.06] p-3">
              {step === "review" ? (
                <>
                  <span className="text-[11px] text-foreground/50">Arraste ou use as setas para reorganizar.</span>
                  <button type="button" disabled={!draft.ids.length} onClick={() => setStep("create")} className="h-10 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">
                    Continuar
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setStep("review")} className="h-10 rounded-full px-3 text-[13px] font-semibold text-primary">
                    Voltar à lista
                  </button>
                  <button type="button" disabled={saving || !draft.ids.length || toFix.size > 0} onClick={submit} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
                    {draft.editingId ? "Salvar alterações" : "Criar link"}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
