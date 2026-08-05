import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { globalSearch, getRecordTimeline } from "@/lib/busca/busca.functions";
import type {
  BuscaCategoria,
  BuscaCategoriaFiltro,
  BuscaResultado,
  BuscaTimeline,
} from "@/types/busca";

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useGlobalSearch(
  query: string,
  categoria: BuscaCategoriaFiltro = "todos",
  enabled = true,
) {
  const search = useServerFn(globalSearch);
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const active = enabled && debouncedQuery.length >= 2;

  const result = useQuery<BuscaResultado[]>({
    queryKey: ["busca-global", debouncedQuery, categoria],
    queryFn: () => search({ data: { query: debouncedQuery, categoria } }),
    enabled: active,
    staleTime: 15_000,
  });

  return {
    term: debouncedQuery,
    results: result.data ?? [],
    isLoading: active && (result.isLoading || result.isFetching),
    isError: result.isError,
    error: result.error as Error | null,
    hasQuery: active,
  };
}

export function useRecordTimeline(target: { categoria: BuscaCategoria; id: string } | null) {
  const fetchTimeline = useServerFn(getRecordTimeline);

  return useQuery<BuscaTimeline>({
    queryKey: ["busca-timeline", target?.categoria, target?.id],
    queryFn: () => fetchTimeline({ data: { categoria: target!.categoria, id: target!.id } }),
    enabled: Boolean(target),
    staleTime: 30_000,
  });
}
