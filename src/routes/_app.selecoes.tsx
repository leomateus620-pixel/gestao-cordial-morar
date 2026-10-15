import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Copy, CopyPlus, ExternalLink, ListChecks, Loader2, Pencil, XCircle } from "lucide-react";
import { toast } from "sonner";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import { SectionHeader } from "@/components/section-header";
import { EmptyState } from "@/components/shared/empty-state";
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
import { copyText, selectionPublicUrl } from "@/components/selecoes/SelectionPanel";
import { useSession } from "@/lib/auth-mock";
import { bindSelectionDraft, selectionDraft, useSelectionDraft } from "@/lib/selecoes/draft-store";
import { selectionStatus } from "@/lib/selecoes/rules";
import {
  closeSelection,
  listSelections,
  saveSelection, listSelectionResponsibles,
  type SelectionRow,
} from "@/lib/selecoes/selecoes.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/selecoes")({
  head: () => ({
    meta: [
      { title: "Seleções compartilhadas — Gestão Cordial" },
      { name: "description", content: "Links de seleções de imóveis enviados aos clientes." },
      { property: "og:title", content: "Seleções compartilhadas — Gestão Cordial" },
      { property: "og:description", content: "Links de seleções de imóveis enviados aos clientes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireModuleAccess module="imoveis">
      <SelecoesPage />
    </RequireModuleAccess>
  ),
});

const STATUS_LABEL = { ativa: "Ativa", encerrada: "Encerrada", expirada: "Expirada" } as const;

function SelecoesPage() {
  const session = useSession();
  useEffect(() => bindSelectionDraft(session?.id ?? null), [session?.id]);
  const draft = useSelectionDraft();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchList = useServerFn(listSelections);
  const close = useServerFn(closeSelection);
  const save = useServerFn(saveSelection);
  const list = useQuery({ queryKey: ["selecoes"], queryFn: () => fetchList() });
  const [closing, setClosing] = useState<SelectionRow | null>(null);
  const [replace, setReplace] = useState<SelectionRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fetchResp = useServerFn(listSelectionResponsibles);
  const resp = useQuery({ queryKey: ["selecoes-responsaveis"], queryFn: () => fetchResp(), staleTime: 60_000 });
  const canChoose = Boolean(resp.data?.canChoose);

  function startEdit(row: SelectionRow) {
    selectionDraft.edit(row.id, row.title, row.property_ids);
    navigate({ to: "/imoveis" });
    toast.success("Seleção aberta para edição na busca de imóveis.");
  }

  async function duplicate(row: SelectionRow) {
    setBusy(row.id);
    try {
      const res = await save({
        data: {
          id: null,
          requestId: `dup-${row.id}-${Date.now()}`,
          agency: row.agency,
          title: `${row.title} (cópia)`.slice(0, 120),
          message: row.public_message,
          clientName: row.internal_client_name,
          whatsapp: row.whatsapp,
          expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          propertyIds: row.property_ids,
          corretorId: canChoose ? row.corretor_id : null,
        },
      });
      if (!res.ok) {
        toast.error(
          res.error === "inelegiveis"
            ? "Há imóveis que não podem mais ser divulgados. Edite a seleção para retirá-los."
            : "Não foi possível duplicar.",
        );
        return;
      }
      toast.success("Seleção duplicada com um novo link.");
      qc.invalidateQueries({ queryKey: ["selecoes"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5 pt-2">
      <SectionHeader
        title="Seleções compartilhadas"
        description="Links de imóveis montados para clientes. Quem tiver o link consegue ver a seleção."
      />

      {list.isPending ? (
        <div className="premium-card flex items-center gap-2 p-6 text-sm text-foreground/60">
          <Loader2 className="size-4 animate-spin" /> Carregando seleções…
        </div>
      ) : list.isError ? (
        <EmptyState title="Não foi possível carregar" description={(list.error as Error).message} />
      ) : !list.data.length ? (
        <EmptyState
          icon={<ListChecks className="size-5" />}
          title="Nenhuma seleção ainda"
          description="Na busca de imóveis, use “Selecionar” nos cards e depois “Criar link”."
        />
      ) : (
        <ul className="space-y-2.5">
          {list.data.map((row) => {
            const st = selectionStatus(row);
            return (
              <li key={row.id} className="premium-card flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-[15px] font-semibold">{row.title}</h3>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                        st === "ativa" ? "bg-emerald-500/12 text-emerald-700" : "bg-foreground/[0.07] text-foreground/55",
                      )}
                    >
                      {STATUS_LABEL[st]}
                    </span>
                    <span className="text-[10.5px] font-semibold uppercase text-foreground/40">{row.agency}</span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-foreground/55">
                    {row.internal_client_name ? `${row.internal_client_name} · ` : ""}
                    {row.corretor_nome || "Responsável"} · {new Date(row.created_at).toLocaleDateString("pt-BR")} ·{" "}
                    {row.property_ids.length} {row.property_ids.length === 1 ? "imóvel" : "imóveis"}
                    {row.expires_at ? ` · válido até ${new Date(row.expires_at).toLocaleDateString("pt-BR")}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <IconBtn label="Copiar link" onClick={() => copyText(selectionPublicUrl(row.token))} disabled={st !== "ativa"}>
                    <Copy className="size-3.5" />
                  </IconBtn>
                  <a
                    href={`/s/${row.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="grid size-9 place-items-center rounded-full border border-foreground/10 text-foreground/65 hover:bg-foreground/5"
                    aria-label="Pré-visualizar"
                    title="Pré-visualizar"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                  <IconBtn
                    label="Editar"
                    disabled={row.status !== "ativa"}
                    onClick={() => (draft.ids.length && draft.editingId !== row.id ? setReplace(row) : startEdit(row))}
                  >
                    <Pencil className="size-3.5" />
                  </IconBtn>
                  <IconBtn label="Duplicar" disabled={busy === row.id} onClick={() => duplicate(row)}>
                    {busy === row.id ? <Loader2 className="size-3.5 animate-spin" /> : <CopyPlus className="size-3.5" />}
                  </IconBtn>
                  <IconBtn label="Encerrar" disabled={row.status !== "ativa"} onClick={() => setClosing(row)}>
                    <XCircle className="size-3.5" />
                  </IconBtn>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={!!closing} onOpenChange={(o) => !o && setClosing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar esta seleção?</AlertDialogTitle>
            <AlertDialogDescription>
              O link deixa de mostrar os imóveis imediatamente. Não é possível reativar; você pode duplicar para criar outro link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!closing) return;
                try {
                  await close({ data: { id: closing.id } });
                  toast.success("Seleção encerrada.");
                  qc.invalidateQueries({ queryKey: ["selecoes"] });
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!replace} onOpenChange={(o) => !o && setReplace(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir a seleção em andamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem {draft.ids.length} imóveis em um rascunho {draft.editingId ? `(editando “${draft.editingTitle}”)` : "novo"}. Abrir esta seleção para edição descarta esse rascunho.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter rascunho</AlertDialogCancel>
            <AlertDialogAction onClick={() => replace && startEdit(replace)}>Editar esta seleção</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full border border-foreground/10 text-foreground/65 hover:bg-foreground/5 disabled:opacity-35"
    >
      {children}
    </button>
  );
}
