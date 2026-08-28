import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  EMPTY_PORTFOLIO_ANALYTICS,
  type PortfolioAnalytics,
  type PortfolioOperationFilter,
  type PortfolioProviderFilter,
} from "@/types/portfolio";

export type PortfolioAnalyticsInput = {
  provider: PortfolioProviderFilter;
  operation: PortfolioOperationFilter;
};

/**
 * Análise do portfólio real publicado na Cordial e na Morar.
 * A contagem é sempre por imóvel único; Cordial + Morar nunca são somados.
 */
export const getPropertyPortfolioAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PortfolioAnalyticsInput): PortfolioAnalyticsInput => {
    const providers: PortfolioProviderFilter[] = ["todos", "cordial", "morar", "ambos"];
    const operations: PortfolioOperationFilter[] = ["todos", "venda", "aluguel"];
    return {
      provider: providers.includes(input?.provider) ? input.provider : "todos",
      operation: operations.includes(input?.operation) ? input.operation : "todos",
    };
  })
  .handler(async ({ data, context }): Promise<PortfolioAnalytics> => {
    const { data: result, error } = await context.supabase.rpc("get_property_portfolio_analytics", {
      _provider_filter: data.provider,
      _operation_filter: data.operation,
    });

    if (error) throw new Error(error.message);
    if (!result) return EMPTY_PORTFOLIO_ANALYTICS;
    return result as unknown as PortfolioAnalytics;
  });
