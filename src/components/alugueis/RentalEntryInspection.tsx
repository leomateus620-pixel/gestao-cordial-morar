import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardCheck, Loader2, ShieldCheck } from "lucide-react";
import { getContractEntryInspectionState } from "@/lib/rentals/rentals.functions";
import { entryInspectionAction } from "@/lib/rentals/entry-inspection";
import { STATUS_LABEL, type InspectionStatus } from "@/lib/vistoria/model";
import { cn } from "@/lib/utils";

/**
 * Entry-inspection section of a rental contract. The rules live in
 * entry-inspection.ts: the attached contract must be reviewed, and only one
 * entry inspection may exist per contract.
 */
export function RentalEntryInspection({
  contractId,
  sectionId,
}: {
  contractId: string;
  sectionId: string;
}) {
  const stateFn = useServerFn(getContractEntryInspectionState);
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ["rental-entry-inspection", contractId],
    queryFn: () => stateFn({ data: { contractId } }),
  });

  const state = query.data;
  const action = state
    ? entryInspectionAction({
        contractId,
        gate: {
          unlocked: state.unlocked,
          reviewedDocumentId: null,
          reviewedAt: state.reviewedAt,
          missing: state.missing,
        },
        existingInspectionId: state.existingInspectionId,
      })
    : null;

  const statusLabel =
    state?.existingInspectionStatus &&
    Object.prototype.hasOwnProperty.call(STATUS_LABEL, state.existingInspectionStatus)
      ? STATUS_LABEL[state.existingInspectionStatus as InspectionStatus]
      : null;

  return (
    <section
      id={sectionId}
      data-rental-section="vistoria-entrada"
      className="scroll-mt-16 rounded-[1.35rem] border border-foreground/[0.07] bg-white/58 p-4 shadow-[0_18px_42px_-34px_rgba(22,56,70,0.4)] sm:p-5"
      aria-labelledby={`${sectionId}-title`}
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/9 text-primary ring-1 ring-primary/10">
          <ClipboardCheck className="size-4.5" />
        </span>
        <div className="min-w-0">
          <h3
            id={`${sectionId}-title`}
            className="text-[15px] font-extrabold leading-5 tracking-[-0.015em] text-foreground"
          >
            Vistoria de entrada
          </h3>
          <p className="mt-0.5 text-[11px] leading-4 text-foreground/55">
            Uma única vistoria de entrada por contrato, ligada a ele.
          </p>
        </div>
      </div>

      {query.isLoading ? (
        <div
          className="h-14 animate-pulse rounded-2xl bg-foreground/[0.05] motion-reduce:animate-none"
          aria-label="Carregando situação da vistoria de entrada"
        />
      ) : query.isError || !state ? (
        <p className="rounded-2xl border border-dashed border-foreground/12 bg-background/35 px-3.5 py-3 text-xs font-medium leading-5 text-foreground/55">
          Não foi possível ler a situação da vistoria de entrada. Recarregue a tela.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {action?.kind === "open" && (
            <>
              <button
                type="button"
                onClick={() =>
                  navigate({
                    to: "/vistorias/$vistoriaId",
                    params: { vistoriaId: action.inspectionId },
                  })
                }
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-bold text-primary-foreground transition duration-200 hover:opacity-92 motion-reduce:transition-none"
              >
                <ClipboardCheck className="size-4" />
                Abrir vistoria de entrada
              </button>
              {statusLabel && (
                <span className="inline-flex min-h-8 items-center rounded-full bg-emerald-500/10 px-3 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-500/14">
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
                  navigate({ to: "/vistorias/nova", search: { contrato: contractId } })
                }
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-bold text-primary-foreground transition duration-200 hover:opacity-92 motion-reduce:transition-none"
              >
                <ClipboardCheck className="size-4" />
                Iniciar vistoria de entrada
              </button>
              {state.reviewedAt && (
                <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-500/14">
                  <ShieldCheck className="size-3.5" />
                  Contrato conferido em{" "}
                  {new Date(state.reviewedAt).toLocaleDateString("pt-BR")}
                </span>
              )}
            </>
          )}

          {action?.kind === "blocked" && (
            <p className="flex min-w-0 items-start gap-2 rounded-2xl border border-dashed border-foreground/12 bg-background/35 px-3.5 py-3 text-xs font-medium leading-5 text-foreground/55">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              {action.reason}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
