import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import {
  PropertyForm,
  emptyPropertyValues,
  type PropertyFormValues,
} from "@/components/imoveis/PropertyForm";
import {
  useCreateImovel,
  useFinalizeRegistration,
  useImoveisFacets,
  useIncompleteRegistrations,
  usePropertyDetail,
} from "@/hooks/useImoveis";
import { usePlacaPhotoActions } from "@/hooks/usePlacaPhoto";
import { usePropertyImages } from "@/hooks/usePropertyMedia";
import {
  PropertyAgencyStep,
  emptyAgencyStepState,
  type AgencyStepState,
} from "@/components/imoveis/PropertyAgencyStep";
import { PropertyDriveStep } from "@/components/imoveis/PropertyDriveStep";
import { usePropertyDrive } from "@/hooks/usePropertyDrive";

import { useSession } from "@/lib/auth-mock";
import { canAccessModule } from "@/lib/access-control";
import { usePropertyCodeReservation } from "@/hooks/usePropertyCode";
import type { PropertyCarteira, PropertyDetail } from "@/types/property";

export const Route = createFileRoute("/_app/imoveis/novo")({
  validateSearch: (search: Record<string, unknown>): { rascunho?: string } =>
    typeof search.rascunho === "string" && search.rascunho ? { rascunho: search.rascunho } : {},
  head: () => ({
    meta: [
      { title: "Novo imóvel — Gestão Cordial" },
      {
        name: "description",
        content: "Cadastro completo de imóvel com publicação nos sites Cordial e Morar.",
      },
      { property: "og:title", content: "Novo imóvel — Gestão Cordial" },
      {
        property: "og:description",
        content: "Cadastro completo de imóvel com publicação nos sites Cordial e Morar.",
      },
    ],
  }),
  component: () => (
    <RequireModuleAccess module="imoveis">
      <NovoImovelEntry />
    </RequireModuleAccess>
  ),
});

const carteiraLabels: Record<string, string> = { cordial: "Cordial", morar: "Morar" };

function destinosLabel(destinos: PropertyCarteira[]) {
  return destinos.map((d) => carteiraLabels[d] ?? d).join(" e ");
}

function toFormValues(detail: PropertyDetail): PropertyFormValues {
  const base = emptyPropertyValues();
  const values = { ...base };
  for (const key of Object.keys(base) as Array<keyof PropertyFormValues>) {
    const value = (detail as unknown as Record<string, unknown>)[key];
    if (value !== undefined && value !== null) (values as Record<string, unknown>)[key] = value;
  }
  return values;
}

/** "Concluir cadastro": reabre o assistente sobre o rascunho existente. */
function NovoImovelEntry() {
  const { rascunho } = Route.useSearch();
  const detail = usePropertyDetail(rascunho);
  if (!rascunho) return <NovoImovelPage key="novo" />;
  if (detail.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-foreground/60">
        <Loader2 className="size-4 animate-spin" /> Abrindo o cadastro…
      </div>
    );
  }
  if (!detail.data) return <NovoImovelPage key="novo" />;
  return <NovoImovelPage key={detail.data.id} resume={detail.data} />;
}

function NovoImovelPage({ resume }: { resume?: PropertyDetail } = {}) {
  const navigate = useNavigate();
  const create = useCreateImovel();
  const facets = useImoveisFacets();
  const finalize = useFinalizeRegistration();
  const pendentes = useIncompleteRegistrations(!resume);
  const codes = usePropertyCodeReservation();
  const session = useSession();
  const placaPhoto = usePlacaPhotoActions();
  const canRegisterAgency = !!session && canAccessModule(session, "agenciamentos");
  const [agency, setAgency] = useState<AgencyStepState>(() => emptyAgencyStepState("venda"));
  const [destinos, setDestinos] = useState<PropertyCarteira[]>([]);
  const [publishOwnedMorar, setPublishOwnedMorar] = useState(false);
  /** Publicar é a ação padrão da última etapa: os destinos vêm da Etapa 1. */
  const publicar = destinos.length > 0;
  // Rascunho criado sob demanda para que as fotos da etapa 6 tenham onde ser anexadas.
  const [draftId, setDraftId] = useState<string | null>(resume?.id ?? null);
  const initialValues = useRef<PropertyFormValues>(
    resume ? toFormValues(resume) : emptyPropertyValues(),
  );
  /** Concluído: não avisa mais ao sair. */
  const finished = useRef(false);
  /** Chave da intenção de cadastro: vale para todo este formulário aberto. */
  const intentKey = useRef<string>(crypto.randomUUID());
  /** Criação em andamento: duplo clique reaproveita a mesma chamada. */
  const draftPromise = useRef<Promise<string | null> | null>(null);
  const images = usePropertyImages(draftId ?? undefined);
  const fotosProntas = (images.data ?? []).filter(
    (image) => image.processingStatus === "ready" || image.processingStatus === "legacy",
  ).length;
  const drive = usePropertyDrive(draftId ?? undefined);
  /** Uma reserva ativa por provedor: retry/duplo clique substitui, nunca duplica. */
  const reservationIds = useRef<Partial<Record<PropertyCarteira, string>>>({});
  const latestValues = useRef<PropertyFormValues>(initialValues.current);
  /** Enquanto o imóvel não é salvo de verdade, as reservas continuam devolvíveis. */
  const committed = useRef(false);
  const releasePending = codes.releasePending;

  /** Sair do cadastro sem concluir devolve os códigos para a fila. */
  function releaseCodesIfPending() {
    if (committed.current) return;
    const ids = Object.values(reservationIds.current).filter(Boolean) as string[];
    if (!ids.length) return;
    reservationIds.current = {};
    void releasePending(ids).catch(() => {
      // A rotina periódica devolve o número mesmo se esta chamada falhar.
    });
  }

  useEffect(() => releaseCodesIfPending, []);

  useEffect(() => {
    const handler = () => releaseCodesIfPending();
    window.addEventListener("pagehide", handler);
    return () => window.removeEventListener("pagehide", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ensureDraft(): Promise<string | null> {
    if (draftId) return draftId;
    // Uma única promessa em andamento: dois cliques compartilham a mesma criação.
    if (draftPromise.current) return draftPromise.current;
    draftPromise.current = (async () => {
      try {
        // O rascunho existe só para anexar fotos/arquivos: ele nunca guarda o
        // código da imobiliária, senão um cadastro abandonado queimaria o número.
        // `clientIntentKey` garante que retry/repetição devolva o MESMO imóvel.
        const property = await create.mutateAsync({
          ...latestValues.current,
          codigoCordial: null,
          codigoMorar: null,
          clientIntentKey: intentKey.current,
          asDraft: true,
        });
        setDraftId(property.id);
        toast.info("Rascunho salvo para receber as fotos.");
        return property.id;
      } catch (err) {
        toast.error((err as Error)?.message ?? "Não foi possível salvar o rascunho.");
        draftPromise.current = null;
        return null;
      }
    })();
    return draftPromise.current;
  }

  /** Aviso ao fechar/recarregar a aba com cadastro pendente. */
  useEffect(() => {
    if (!draftId) return;
    const handler = (event: BeforeUnloadEvent) => {
      if (finished.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [draftId]);

  function confirmLeave(): boolean {
    if (!draftId || finished.current) return true;
    return window.confirm(
      'Este cadastro ainda não foi concluído: o imóvel fica como rascunho, sem agenciamento e sem ir para os sites. Sair mesmo assim? Você pode continuar depois pelo botão "Concluir cadastro".',
    );
  }

  async function handleSubmit(values: PropertyFormValues) {
    try {
      // Uma única chamada no servidor, idempotente pela chave de intenção e
      // pelo ID do rascunho: duplo clique/retry nunca duplica nada.
      const result = await finalize.mutateAsync({
        propertyId: draftId,
        clientIntentKey: intentKey.current,
        values: { ...values, clientIntentKey: intentKey.current },
        reservationIds: Object.values(reservationIds.current).filter(Boolean) as string[],
        agency:
          agency.enabled && canRegisterAgency
            ? {
                finalidade: agency.finalidade,
                providers: [
                  ...new Set([...destinos, ...(publishOwnedMorar ? ["morar" as const] : [])]),
                ].length
                  ? [...new Set([...destinos, ...(publishOwnedMorar ? ["morar" as const] : [])])]
                  : [values.carteira],
                checklist: agency.checklist,
                descricao: agency.descricao,
              }
            : null,
        publishProviders: publicar ? destinos : [],
        publishOwnedMorar,
      });
      const propertyId = result.propertyId;
      committed.current = true;
      setDraftId(propertyId);

      if (result.agenciamentoId && agency.checklist.placaInstalada && agency.placaFile) {
        try {
          await placaPhoto.apply(result.agenciamentoId, { kind: "upload", file: agency.placaFile });
        } catch (err) {
          toast.warning(
            `Agenciamento registrado, mas a foto da placa não subiu (placa segue pendente): ${(err as Error)?.message ?? "erro"}`,
          );
        }
      }

      for (const message of result.messages) toast.warning(message);
      // Mesmo critério do servidor: falha só nos códigos não deixa "não concluído".
      const ok = result.completed;
      if (ok) {
        finished.current = true;
        if (result.steps.agency === "ok")
          toast.success("Agenciamento registrado e vinculado ao imóvel.");
        toast.success(
          result.ownedMorarPublication?.active
            ? "Imóvel publicado no site próprio Morar."
            : result.steps.publish === "ok"
              ? `Imóvel enviado para publicação: ${destinosLabel(destinos)}.`
              : "Imóvel cadastrado no catálogo.",
        );
        if ((result.skippedImages ?? 0) > 0) {
          toast.warning(
            `${result.skippedImages} foto(s) não subiram e ficaram de fora do envio. Reenvie na Etapa 6 — Fotos.`,
          );
        }
      } else {
        toast.warning(
          'Cadastro salvo, mas ainda não concluído. Use "Concluir cadastro" na ficha do imóvel.',
        );
      }
      // Drive roda em segundo plano: nunca segura a saída da tela de cadastro.
      void drive.sync.mutateAsync().catch(() => {
        // a fila persistente retoma sozinha
      });

      finished.current = true;
      navigate({ to: "/imoveis/$imovelId", params: { imovelId: propertyId } });
    } catch (err) {
      toast.error((err as Error)?.message ?? "Não foi possível salvar o imóvel.");
    }
  }

  const meusRascunhos = (pendentes.data ?? []).filter(
    (item) => item.isDraft && item.createdBy === session?.id,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          to="/imoveis"
          onClick={(event) => {
            if (!confirmLeave()) event.preventDefault();
          }}
          className="glass-panel inline-flex size-9 items-center justify-center rounded-full"
          aria-label="Voltar para o catálogo"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-lg font-bold">{resume ? "Concluir cadastro" : "Novo imóvel"}</h1>
          <p className="text-[12px] text-foreground/55">
            Cadastro completo, com destino de publicação Cordial e/ou Morar.
          </p>
        </div>
      </div>

      {!resume && !draftId && meusRascunhos.length > 0 ? (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3 text-[13px]">
          <p className="font-semibold">
            Você tem {meusRascunhos.length} cadastro(s) não concluído(s).
          </p>
          <ul className="mt-1.5 space-y-1">
            {meusRascunhos.slice(0, 5).map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-foreground/70">
                  {item.tipo ?? "Imóvel"}
                  {item.bairro ? ` · ${item.bairro}` : ""} ·{" "}
                  {new Date(item.createdAt).toLocaleDateString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}
                </span>
                <Link
                  to="/imoveis/novo"
                  search={{ rascunho: item.id }}
                  className="shrink-0 font-semibold text-primary hover:underline"
                >
                  Continuar cadastro
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <PropertyForm
        initial={initialValues.current}
        submitLabel={publicar ? "Publicar imóvel" : "Salvar imóvel"}
        pending={create.isPending || finalize.isPending}
        extraSteps={[
          {
            label: "Agenciamento",
            render: ({ values, goToStep }) => (
              <PropertyAgencyStep
                values={values}
                destinos={destinos.length ? destinos : [values.carteira]}
                state={agency}
                onChange={setAgency}
                onEditStep={goToStep}
                canRegister={canRegisterAgency}
                corretorNome={session?.nome ?? "Você"}
                fotosProntas={fotosProntas}
              />
            ),
          },
          {
            label: "Google Drive",
            render: ({ goToStep }) => (
              <PropertyDriveStep
                propertyId={draftId}
                onRequestSave={ensureDraft}
                onEditStep={goToStep}
              />
            ),
          },
        ]}
        destinos={destinos}
        onDestinosChange={setDestinos}
        publishOwnedMorar={publishOwnedMorar}
        onPublishOwnedMorarChange={setPublishOwnedMorar}
        propertyId={draftId}
        onRequestSave={ensureDraft}
        onValuesChange={(values) => {
          latestValues.current = values;
        }}
        onCodeReserved={(reservationId, provider) => {
          reservationIds.current = { ...reservationIds.current, [provider]: reservationId };
        }}
        bairros={facets.data?.bairros ?? []}
        onCancel={() => {
          if (!confirmLeave()) return;
          releaseCodesIfPending();
          navigate({ to: "/imoveis" });
        }}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
