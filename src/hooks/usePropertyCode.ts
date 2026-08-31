import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  commitPropertyCodes,
  releasePendingPropertyCodes,
  releasePropertyCode,
  reservePropertyCode,
  type PropertyCodeReservation,
} from "@/lib/imoveis/codes.functions";
import type { PropertyCarteira } from "@/types/property";

export type { PropertyCodeReservation };

export function usePropertyCodeReservation() {
  const reserve = useServerFn(reservePropertyCode);
  const release = useServerFn(releasePropertyCode);
  const releasePending = useServerFn(releasePendingPropertyCodes);
  const commit = useServerFn(commitPropertyCodes);

  return {
    reserve: useMutation({
      mutationFn: (provider: PropertyCarteira) => reserve({ data: { provider } }),
    }),
    release: useMutation({
      mutationFn: (reservationId: string) => release({ data: { reservationId } }),
    }),
    /** Devolve à fila as reservas ainda não vinculadas a um imóvel salvo. */
    releasePending: (reservationIds?: string[]) => releasePending({ data: { reservationIds } }),
    commit: useMutation({
      mutationFn: (input: { propertyId: string; reservationIds: string[] }) => commit({ data: input }),
    }),
  };
}
