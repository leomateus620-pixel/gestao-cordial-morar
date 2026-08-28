import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import {
  PropertyForm,
  emptyPropertyValues,
  type PropertyFormValues,
} from "@/components/imoveis/PropertyForm";
import { useCreateImovel, useImoveisFacets, useUpdateImovel } from "@/hooks/useImoveis";
import { useFinalizePropertyAgency } from "@/hooks/usePropertyAgency";
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
import { useEnqueuePropertySync } from "@/hooks/usePropertySync";
import { usePropertyCodeReservation } from "@/hooks/usePropertyCode";
import type { PropertyCarteira } from "@/types/property";

export const Route = createFileRoute("/_app/imoveis/novo")({
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
      <NovoImovelPage />
    </RequireModuleAccess>
  ),
});

const carteiraLabels: Record<string, string> = { cordial: "Cordial", morar: "Morar" };

function destinosLabel(destinos: PropertyCarteira[]) {
  return destinos.map((d) => carteiraLabels[d] ?? d).join(" e ");
}

function NovoImovelPage() {
  const navigate = useNavigate();
  const create = useCreateImovel();
  const facets = useImoveisFacets();
  const enqueue = useEnqueuePropertySync();
  const codes = usePropertyCodeReservation();
  const session = useSession();
  const finalizeAgency = useFinalizePropertyAgency();
  const canRegisterAgency = !!session && canAccessModule(session, "agenciamentos");
  const [agency, setAgency] = useState<AgencyStepState>(() => emptyAgencyStepState("venda"));
  const [destinos, setDestinos] = useState<PropertyCarteira[]>([]);
  /** Publicar é a ação padrão da última etapa: os destinos vêm da Etapa 1. */
  const publicar = destinos.length > 0;
  // Rascunho criado sob demanda para que as fotos da etapa 6 tenham onde ser anexadas.
  const [draftId, setDraftId] = useState<string | null>(null);
  const images = usePropertyImages(draftId ?? undefined);
  const fotosProntas = (images.data ?? []).filter(
    (image) => image.processingStatus === "ready" || image.processingStatus === "legacy",
  ).length;
  const update = useUpdateImovel(draftId ?? undefined);
  const drive = usePropertyDrive(draftId ?? undefined);
  /** Uma reserva ativa por provedor: retry/duplo clique substitui, nunca duplica. */
  const reservationIds = useRef<Partial<Record<PropertyCarteira, string>>>({});
  const latestValues = useRef<PropertyFormValues>(emptyPropertyValues());

  async function commitCodes(propertyId: string) {
    const ids = Object.values(reservationIds.current).filter(Boolean) as string[];
    if (!ids.length) return;
    try {
      await codes.commit.mutateAsync({ propertyId, reservationIds: ids });
    } catch {
      // A reserva expira sozinha; não travamos o cadastro por isso.
    }
  }

  async function ensureDraft(): Promise<string | null> {
    if (draftId) return draftId;
    try {
      const property = await create.mutateAsync({ ...latestValues.current });
      setDraftId(property.id);
      await commitCodes(property.id);
      toast.info("Rascunho salvo para receber as fotos.");
      return property.id;
    } catch (err) {
      toast.error((err as Error)?.message ?? "Não foi possível salvar o rascunho.");
      return null;
    }
  }

  async function handleSubmit(values: PropertyFormValues) {
    try {
      const existing = draftId;
      const propertyId = existing
        ? ((await update.mutateAsync({ id: existing, ...values })).property?.id ?? existing)
        : (await create.mutateAsync({ ...values })).id;

      await commitCodes(propertyId);

      if (agency.enabled && canRegisterAgency) {
        try {
          await finalizeAgency.mutateAsync({
            propertyId,
            finalidade: agency.finalidade,
            providers: destinos.length ? destinos : [values.carteira],
            checklist: agency.checklist,
            descricao: agency.descricao,
          });
          toast.success("Agenciamento registrado e vinculado ao imóvel.");
        } catch (err) {
          toast.warning(
            `Imóvel salvo, mas o agenciamento não foi registrado: ${(err as Error)?.message ?? "erro desconhecido"}`,
          );
        }
      }

      if (publicar) {
        try {
          await enqueue.mutateAsync({ propertyId, providers: destinos, action: "publish" });
          toast.success(`Imóvel enviado para publicação: ${destinosLabel(destinos)}.`);
        } catch (err) {
          toast.warning(
            `Imóvel salvo, mas a publicação falhou: ${(err as Error)?.message ?? "erro desconhecido"}`,
          );
        }
      } else {
        toast.success("Imóvel cadastrado no catálogo.");
      }
      // Falha no Drive nunca bloqueia o cadastro nem a publicação.
      try {
        await drive.sync.mutateAsync();
      } catch {
        // a fila persistente retoma em segundo plano
      }

      navigate({ to: "/imoveis/$imovelId", params: { imovelId: propertyId } });
    } catch (err) {
      toast.error((err as Error)?.message ?? "Não foi possível salvar o imóvel.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          to="/imoveis"
          className="glass-panel inline-flex size-9 items-center justify-center rounded-full"
          aria-label="Voltar para o catálogo"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-lg font-bold">Novo imóvel</h1>
          <p className="text-[12px] text-foreground/55">
            Cadastro completo, com destino de publicação Cordial e/ou Morar.
          </p>
        </div>
      </div>

      <PropertyForm
        initial={emptyPropertyValues()}
        submitLabel={publicar ? "Publicar imóvel" : "Salvar imóvel"}
        pending={
          create.isPending || update.isPending || enqueue.isPending || finalizeAgency.isPending
        }
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
        propertyId={draftId}
        onRequestSave={ensureDraft}
        onValuesChange={(values) => {
          latestValues.current = values;
        }}
        onCodeReserved={(reservationId, provider) => {
          reservationIds.current = { ...reservationIds.current, [provider]: reservationId };
        }}
        bairros={facets.data?.bairros ?? []}
        onCancel={() => navigate({ to: "/imoveis" })}
        onSubmit={handleSubmit}
      />

    </div>
  );
}
