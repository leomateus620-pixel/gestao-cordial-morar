import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ATTENDANCES_QUERY_KEY } from "@/hooks/useAttendances";
import { listAttendances } from "@/lib/attendances/attendances.functions";
import { useSession } from "@/lib/auth-mock";
import { matchesTrack } from "@/lib/atendimentos/track";
import type { Atendimento } from "@/types/atendimento";

export type RentalVsSalePeriod = "mes" | "ano" | "custom";
export type RentalVsSaleAgency = "todas" | "cordial" | "morar";

export type RentalVsSalePoint = {
  key: string;
  label: string;
  aluguel: number;
  venda: number;
};

export type RentalVsSaleResult = {
  points: RentalVsSalePoint[];
  aluguel: number;
  venda: number;
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
};

const EMPTY: Atendimento[] = [];

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDateInput(value?: string) {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/**
 * Comparativo Aluguel x Venda derivado exclusivamente dos atendimentos.
 * Nada vem dos módulos Aluguéis ou Vendas.
 */
export function useRentalVsSale(options: {
  period: RentalVsSalePeriod;
  agency: RentalVsSaleAgency;
  from?: string;
  to?: string;
}): RentalVsSaleResult {
  const session = useSession();
  const query = useQuery({
    queryKey: ATTENDANCES_QUERY_KEY,
    queryFn: () => listAttendances(),
    enabled: Boolean(session),
    staleTime: 15_000,
  });

  const atendimentos = (query.data ?? EMPTY) as Atendimento[];
  const { period, agency, from, to } = options;

  const derived = useMemo(() => {
    const now = new Date();
    let rangeStart: Date;
    let rangeEnd: Date;

    if (period === "ano") {
      rangeStart = new Date(now.getFullYear(), 0, 1);
      rangeEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    } else if (period === "custom") {
      const parsedFrom = parseDateInput(from) ?? new Date(now.getFullYear(), now.getMonth(), 1);
      const parsedTo = parseDateInput(to) ?? now;
      rangeStart = startOfDay(parsedFrom);
      rangeEnd = new Date(
        parsedTo.getFullYear(),
        parsedTo.getMonth(),
        parsedTo.getDate(),
        23,
        59,
        59,
        999,
      );
      if (rangeEnd < rangeStart) {
        const swap = rangeStart;
        rangeStart = startOfDay(rangeEnd);
        rangeEnd = new Date(swap.getFullYear(), swap.getMonth(), swap.getDate(), 23, 59, 59, 999);
      }
    } else {
      rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
      rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    const dayCount = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000) + 1;
    const granularity: "dia" | "semana" | "mes" =
      period === "ano" || dayCount > 120 ? "mes" : dayCount > 16 ? "semana" : "dia";

    const pad = (value: number) => String(value).padStart(2, "0");
    const bucketKey = (date: Date) => {
      if (granularity === "mes") return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
      if (granularity === "dia") {
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      }
      const offset = Math.floor((startOfDay(date).getTime() - rangeStart.getTime()) / 86_400_000);
      return `w${Math.floor(offset / 7)}`;
    };

    const buckets = new Map<string, RentalVsSalePoint>();
    if (granularity === "mes") {
      const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
      while (cursor <= rangeEnd) {
        buckets.set(`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`, {
          key: `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`,
          label: MONTHS[cursor.getMonth()]!,
          aluguel: 0,
          venda: 0,
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    } else if (granularity === "dia") {
      const cursor = new Date(rangeStart);
      while (cursor <= rangeEnd) {
        const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
        buckets.set(key, {
          key,
          label: `${pad(cursor.getDate())}/${pad(cursor.getMonth() + 1)}`,
          aluguel: 0,
          venda: 0,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
    } else {
      const cursor = new Date(rangeStart);
      let index = 0;
      while (cursor <= rangeEnd) {
        const end = new Date(cursor);
        end.setDate(end.getDate() + 6);
        const last = end > rangeEnd ? rangeEnd : end;
        buckets.set(`w${index}`, {
          key: `w${index}`,
          label: `${pad(cursor.getDate())}–${pad(last.getDate())}`,
          aluguel: 0,
          venda: 0,
        });
        cursor.setDate(cursor.getDate() + 7);
        index += 1;
      }
    }

    let aluguel = 0;
    let venda = 0;

    for (const item of atendimentos) {
      const created = new Date(item.criadoEm);
      if (Number.isNaN(created.getTime())) continue;
      if (created < rangeStart || created > rangeEnd) continue;
      if (agency !== "todas" && item.imobiliaria !== agency && item.imobiliaria !== "ambas") {
        continue;
      }

      const isAluguel = matchesTrack(item, "aluguel");
      const isVenda = matchesTrack(item, "venda");
      if (!isAluguel && !isVenda) continue;

      const bucket = buckets.get(bucketKey(created));
      if (!bucket) continue;

      if (isAluguel) {
        bucket.aluguel += 1;
        aluguel += 1;
      } else {
        bucket.venda += 1;
        venda += 1;
      }
    }

    return {
      points: [...buckets.values()],
      aluguel,
      venda,
      total: aluguel + venda,
    };
  }, [atendimentos, agency, from, period, to]);

  return {
    ...derived,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
  };
}
