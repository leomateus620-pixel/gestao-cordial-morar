import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSession } from "@/lib/auth-mock";
import {
  getPublicBotInsights,
  getPublicBotConversations,
  getPublicBotConversation,
} from "@/lib/public-bot-insights/insights.functions";
import type { InsightDays } from "@/lib/public-bot-insights/contracts";
import type { BotBrand } from "@/lib/public-property-bot/contracts";

export function usePublicBotInsights(days: InsightDays) {
  const session = useSession(),
    fetch = useServerFn(getPublicBotInsights);
  return useQuery({
    queryKey: ["public-bot-insights", session?.id, days],
    queryFn: () => fetch({ data: { days } }),
    enabled: session?.perfil === "admin_owner",
    staleTime: 30_000,
  });
}
export function usePublicBotConversations(brand: BotBrand | null, days: InsightDays, page: number) {
  const session = useSession(),
    fetch = useServerFn(getPublicBotConversations);
  return useQuery({
    queryKey: ["public-bot-conversations", session?.id, brand, days, page],
    queryFn: () => fetch({ data: { brand: brand!, days, page, pageSize: 10 } }),
    enabled: session?.perfil === "admin_owner" && brand != null,
    staleTime: 15_000,
  });
}
export function usePublicBotConversation(brand: BotBrand | null, id: string | null) {
  const session = useSession(),
    fetch = useServerFn(getPublicBotConversation);
  return useQuery({
    queryKey: ["public-bot-conversation", session?.id, brand, id],
    queryFn: () => fetch({ data: { brand: brand!, id: id! } }),
    enabled: session?.perfil === "admin_owner" && brand != null && id != null,
    staleTime: 15_000,
  });
}
