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

function NovoImovelPage() {
  const navigate = useNavigate();
  const create = useCreateImovel();
  const facets = useImoveisFacets();
  const enqueue = useEnqueuePropertySync();
  const codes = usePropertyCodeReservation();
  const [destinos, setDestinos] = useState<PropertyCarteira[]>([]);
  const [publicar, setPublicar] = useState(false);
  // Rascunho criado sob demanda para que as fotos da etapa 6 tenham onde ser anexadas.
  const [draftId, setDraftId] = useState<string | null>(null);
  const update = useUpdateImovel(draftId ?? undefined);
  const reservationIds = useRef<string[]>([]);
  const latestValues = useRef<PropertyFormValues>(emptyPropertyValues());

  async function commitCodes(propertyId: string) {
    if (!reservationIds.current.length) return;
    try {
      await codes.commit.mutateAsync({ propertyId, reservationIds: reservationIds.current });
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

      if (publicar && destinos.length) {
        try {
          await enqueue.mutateAsync({ propertyId, providers: destinos, action: "publish" });
          toast.success("Imóvel cadastrado e enviado para publicação.");
        } catch (err) {
          toast.warning(
            `Imóvel salvo, mas a publicação falhou: ${(err as Error)?.message ?? "erro desconhecido"}`,
          );
        }
      } else {
        toast.success("Imóvel cadastrado no catálogo.");
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
        submitLabel={publicar && destinos.length ? "Cadastrar e publicar" : "Salvar rascunho"}
        pending={create.isPending || update.isPending || enqueue.isPending}
        destinos={destinos}
        onDestinosChange={setDestinos}
        propertyId={draftId}
        onRequestSave={ensureDraft}
        onValuesChange={(values) => {
          latestValues.current = values;
        }}
        onCodeReserved={(reservationId) => {
          reservationIds.current = [...reservationIds.current, reservationId];
        }}
        bairros={facets.data?.bairros ?? []}
        onCancel={() => navigate({ to: "/imoveis" })}
        onSubmit={handleSubmit}
      />

      <label className="glass-panel flex items-center gap-2 rounded-2xl px-4 py-3 text-xs font-semibold text-foreground/70">
        <input
          type="checkbox"
          checked={publicar}
          onChange={(e) => setPublicar(e.target.checked)}
          className="size-4 accent-[hsl(var(--primary))]"
        />
        Publicar nos sites selecionados logo após salvar
      </label>
    </div>
  );
}
