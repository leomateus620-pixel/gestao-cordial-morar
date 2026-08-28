import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { RequireModuleAccess } from "@/components/auth/RequireModuleAccess";
import {
  PropertyForm,
  emptyPropertyValues,
  type PropertyFormValues,
} from "@/components/imoveis/PropertyForm";
import { PropertyDriveStep } from "@/components/imoveis/PropertyDriveStep";
import { EmptyState } from "@/components/shared/empty-state";
import { useImoveisFacets, usePropertyDetail, useUpdateImovel } from "@/hooks/useImoveis";
import { usePropertyCodeReservation } from "@/hooks/usePropertyCode";
import type { PropertyCarteira, PropertyDetail } from "@/types/property";

export const Route = createFileRoute("/_app/imoveis/$imovelId/editar")({
  head: () => ({
    meta: [
      { title: "Editar imóvel — Gestão Cordial" },
      {
        name: "description",
        content: "Edite o imóvel e sincronize as alterações com os sites Cordial e Morar.",
      },
      { property: "og:title", content: "Editar imóvel — Gestão Cordial" },
      {
        property: "og:description",
        content: "Edite o imóvel e sincronize as alterações com os sites Cordial e Morar.",
      },
    ],
  }),
  component: () => (
    <RequireModuleAccess module="imoveis">
      <EditarImovelPage />
    </RequireModuleAccess>
  ),
});

function toFormValues(detail: PropertyDetail): PropertyFormValues {
  const base = emptyPropertyValues();
  const keys = Object.keys(base) as Array<keyof PropertyFormValues>;
  const values = { ...base };
  for (const key of keys) {
    const value = (detail as unknown as Record<string, unknown>)[key];
    if (value !== undefined) (values as Record<string, unknown>)[key] = value;
  }
  return values;
}

function EditarImovelPage() {
  const { imovelId } = Route.useParams();
  const navigate = useNavigate();
  const query = usePropertyDetail(imovelId);
  const update = useUpdateImovel(imovelId);
  const facets = useImoveisFacets();
  const codes = usePropertyCodeReservation();
  const reservationIds = useRef<Partial<Record<PropertyCarteira, string>>>({});

  if (query.isPending) {
    return (
      <div className="grid place-items-center py-20 text-foreground/45">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <EmptyState
        title="Imóvel indisponível"
        description={(query.error as Error)?.message ?? "Não foi possível carregar este imóvel."}
      />
    );
  }

  const detail = query.data;
  /** Sites já vinculados: a edição mantém o código e o ID externo de cada um. */
  const vinculados = Array.from(
    new Set<PropertyCarteira>([
      ...detail.publications.map((p) => p.provider),
      ...(detail.codigoCordial ? (["cordial"] as PropertyCarteira[]) : []),
      ...(detail.codigoMorar ? (["morar"] as PropertyCarteira[]) : []),
    ]),
  );

  async function handleSubmit(values: PropertyFormValues) {
    try {
      const result = await update.mutateAsync({ id: imovelId, ...values });
      const ids = Object.values(reservationIds.current).filter(Boolean) as string[];
      if (ids.length) {
        try {
          await codes.commit.mutateAsync({ propertyId: imovelId, reservationIds: ids });
        } catch {
          // A reserva expira sozinha; não travamos o salvamento por isso.
        }
      }
      toast.success(
        result.queued.length
          ? "Alterações salvas · sincronização pendente nos sites vinculados."
          : "Alterações salvas.",
      );
      navigate({ to: "/imoveis/$imovelId", params: { imovelId } });
    } catch (err) {
      toast.error((err as Error)?.message ?? "Não foi possível salvar as alterações.");
    }
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center gap-3">
        <Link
          to="/imoveis/$imovelId"
          params={{ imovelId }}
          className="glass-panel inline-flex size-9 items-center justify-center rounded-full"
          aria-label="Voltar para a ficha"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">
            Editar {detail.tipo ?? "imóvel"}
            {detail.codigoCordial ? ` · Cordial ${detail.codigoCordial}` : ""}
            {detail.codigoMorar ? ` · Morar ${detail.codigoMorar}` : ""}
          </h1>
          <p className="text-[12px] text-foreground/55">
            Ao salvar, as alterações são enfileiradas apenas para os sites já vinculados a este
            imóvel.
          </p>
        </div>
      </div>

      <PropertyForm
        initial={toFormValues(detail)}
        submitLabel="Salvar alterações"
        pending={update.isPending}
        showDestinos={false}
        destinos={vinculados}
        onCodeReserved={(reservationId, provider) => {
          reservationIds.current = { ...reservationIds.current, [provider]: reservationId };
        }}
        propertyId={imovelId}
        extraSteps={[
          {
            label: "Google Drive",
            render: ({ goToStep }) => (
              <PropertyDriveStep propertyId={imovelId} onEditStep={goToStep} />
            ),
          },
        ]}
        bairros={facets.data?.bairros ?? []}
        onCancel={() => navigate({ to: "/imoveis/$imovelId", params: { imovelId } })}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
