import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardCheck, FileCheck2, ShieldCheck } from "lucide-react";
import { getContractEntryInspectionState } from "@/lib/rentals/rentals.functions";
import {
  entryInspectionAction,
  exitInspectionAction,
  type RentalInspectionKind,
} from "@/lib/rentals/entry-inspection";
import { STATUS_LABEL, type InspectionStatus } from "@/lib/vistoria/model";

/**
 * Termo de vistoria de entrada ou de saída de um aluguel. Regras puras em
 * entry-inspection.ts: entrada exige contrato salvo e conferido; saída exige a
 * entrada concluída com o termo registrado. Uma vistoria por tipo e contrato.
 */
export function RentalEntryInspection({
  contractId,
  sectionId,
  kind = "entrada",
}: {
  contractId: string;
  sectionId: string;
  kind?: RentalInspectionKind;
}) {
  const stateFn = useServerFn(getContractEntryInspectionState);
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["rental-entry-inspection", contractId],
    queryFn: () => stateFn({ data: { contractId } }),
  });
  const state = query.data;
  const isExit = kind === "saida";
  const word = isExit ? "saída" : "entrada";

  const action = !state
    ? null
    : isExit
      ? exitInspectionAction({
          contractId,
          entry: {
            id: state.existingInspectionId,
            status: state.existingInspectionStatus,
            hasDocument: state.entryHasDocument,
          },
          existingExitId: state.exitInspectionId,
        })
      : entryInspectionAction({
          contractId,
          gate: {
            unlocked: state.unlocked,
            reviewedDocumentId: null,
            reviewedAt: state.reviewedAt,
            missing: state.missing,
          },
          existingInspectionId: state.existingInspectionId,
        });

  const status = isExit ? state?.exitInspectionStatus : state?.existingInspectionStatus;
  const hasDoc = isExit ? state?.exitHasDocument : state?.entryHasDocument;
  const statusLabel =
    status && Object.prototype.hasOwnProperty.call(STATUS_LABEL, status)
      ? STATUS_LABEL[status as InspectionStatus]
      : null;
  const openLabel =
    status === "concluida" && hasDoc ? "Ver termo" : `Continuar vistoria de ${word}`;

  return (
    <section
      id={sectionId}
      data-rental-section={`vistoria-${kind}`}
      className="scroll-mt-16 rounded-[1.35rem] border border-foreground/[0.07] bg-card/60 p-4 shadow-sm sm:p-5"
      aria-labelledby={`${sectionId}-title`}
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
          {isExit ? <FileCheck2 className="size-4.5" /> : <ClipboardCheck className="size-4.5" />}
        </span>
        <div className="min-w-0">
          <h3 id={`${sectionId}-title`} className="text-[15px] font-extrabold leading-5 text-foreground">
            Termo de vistoria de {word}
          </h3>
          <p className="mt-0.5 text-[11px] leading-4 text-foreground/55">
            Uma única vistoria de {word} por contrato, ligada a ele.
          </p>
        </div>
      </div>

      {query.isLoading ? (
        <div className="h-14 animate-pulse rounded-2xl bg-foreground/[0.05] motion-reduce:animate-none" aria-label={`Carregando vistoria de ${word}`} />
      ) : query.isError || !state ? (
        <p className="rounded-2xl border border-dashed border-foreground/12 px-3.5 py-3 text-xs font-medium text-foreground/55">
          Não foi possível ler a situação da vistoria de {word}. Recarregue a tela.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {action?.kind === "open" && (
            <>
              <button
                type="button"
                onClick={() => navigate({ to: "/vistorias/$vistoriaId", params: { vistoriaId: action.inspectionId } })}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-bold text-primary-foreground hover:opacity-90"
              >
                <ClipboardCheck className="size-4" />
                {openLabel}
              </button>
              {statusLabel && (
                <span className="inline-flex min-h-8 items-center rounded-full bg-primary/10 px-3 text-[11px] font-bold text-primary">
                  {statusLabel}
                </span>
              )}
            </>
          )}
          {action?.kind === "start" && (
            <>
              <button
                type="button"
                onClick={() =>
                  navigate({
                    to: "/vistorias/nova",
                    search: isExit ? { contrato: contractId, tipo: "saida" } : { contrato: contractId },
                  })
                }
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-bold text-primary-foreground hover:opacity-90"
              >
                <ClipboardCheck className="size-4" />
                Iniciar vistoria de {word}
              </button>
              {!isExit && state.reviewedAt && (
                <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-primary/10 px-3 text-[11px] font-bold text-primary">
                  <ShieldCheck className="size-3.5" />
                  Contrato conferido em {new Date(state.reviewedAt).toLocaleDateString("pt-BR")}
                </span>
              )}
            </>
          )}
          {action?.kind === "blocked" && (
            <p className="flex min-w-0 items-start gap-2 rounded-2xl border border-dashed border-foreground/12 px-3.5 py-3 text-xs font-medium leading-5 text-foreground/55">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              {action.reason}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
