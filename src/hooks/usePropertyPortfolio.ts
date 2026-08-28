import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPropertyPortfolioAnalytics } from "@/lib/imoveis/portfolio.functions";
import type {
  PortfolioAnalytics,
  PortfolioOperationFilter,
  PortfolioProviderFilter,
} from "@/types/portfolio";

export function usePropertyPortfolioAnalytics(filters: {
  provider: PortfolioProviderFilter;
  operation: PortfolioOperationFilter;
}) {
  const fetchAnalytics = useServerFn(getPropertyPortfolioAnalytics);
  return useQuery<PortfolioAnalytics>({
    queryKey: ["imoveis-portfolio", filters.provider, filters.operation],
    queryFn: () => fetchAnalytics({ data: filters }),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}
