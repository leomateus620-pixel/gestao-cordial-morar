import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardCheck, FileCheck2, ShieldCheck } from "lucide-react";
import { startRentalInspection } from "@/lib/vistoria/vistoria.functions";
import { Button } from "@/components/ui/button";
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
  returnToForm = false,
  preventStart = false,
}: {
  contractId: string | null;
  returnToForm?: boolean;
  preventStart?: boolean;
  sectionId: string;
  kind?: RentalInspectionKind;
}) {
  const stateFn = useServerFn(getContractEntryInspectionState);
  const navigate = useNavigate();
  const start = useServerFn(startRentalInspection);
  const cache = useQueryClient();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestRooms, setSuggestRooms] = useState(true);
  const query = useQuery({
    queryKey: ["rental-entry-inspection", contractId],
    queryFn: () => stateFn({ data: { contractId: contractId! } }),
    enabled: !!contractId,
    staleTime: 0,
  });
  const state = query.data;
  const isExit = kind === "saida";
  const word = isExit ? "saída" : "entrada";

  const action =
    !state || !contractId
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
          <h3
            id={`${sectionId}-title`}
            className="text-[15px] font-extrabold leading-5 text-foreground"
          >
            Vistoria de {word}
          </h3>
        </div>
      </div>

      {!contractId ? (
        <p className="text-sm text-muted-foreground">
          {isExit
            ? "Conclua a entrada com o termo registrado para iniciar a saída."
            : "Confirme e salve o contrato para iniciar a vistoria."}
        </p>
      ) : query.isLoading ? (
        <div
          className="h-14 animate-pulse rounded-2xl bg-foreground/[0.05] motion-reduce:animate-none"
          aria-label={`Carregando vistoria de ${word}`}
        />
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
                onClick={() =>
                  navigate({
                    to: "/vistorias/$vistoriaId",
                    params: { vistoriaId: action.inspectionId },
                    search: { formulario: returnToForm ? true : undefined },
                  })
                }
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
          {action?.kind === "start" && !preventStart && (
            <div className="space-y-2">
              {isExit && state.entryRooms.length > 0 && (
                <label className="flex min-h-9 items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={suggestRooms}
                    onChange={(e) => setSuggestRooms(e.target.checked)}
                  />
                  Sugerir cômodos da entrada
                </label>
              )}
              <Button
                type="button"
                className="min-h-11 gap-2"
                disabled={busy}
                onClick={async () => {
                  if (inFlight.current || !contractId) return;
                  inFlight.current = true;
                  setBusy(true);
                  setError(null);
                  try {
                    const inspection = await start({ data: { contractId, kind, suggestRooms } });
                    void cache.invalidateQueries({
                      queryKey: ["rental-entry-inspection", contractId],
                    });
                    await navigate({
                      to: "/vistorias/$vistoriaId",
                      params: { vistoriaId: inspection.id },
                      search: { formulario: returnToForm ? true : undefined },
                    });
                  } catch (cause) {
                    setError(
                      cause instanceof Error ? cause.message : "Não foi possível abrir a vistoria.",
                    );
                  } finally {
                    inFlight.current = false;
                    setBusy(false);
                  }
                }}
              >
                <ClipboardCheck className="size-4" />
                {busy ? "Abrindo…" : `Iniciar vistoria de ${word}`}
              </Button>
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
          {preventStart && action?.kind === "start" && (
            <p className="text-sm text-muted-foreground">
              Salve os dados e confira a versão atual para iniciar a vistoria.
            </p>
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
