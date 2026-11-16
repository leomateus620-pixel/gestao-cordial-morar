import { useState } from "react";
import { useSession } from "@/lib/auth-mock";
import {
  usePublicBotInsights,
  usePublicBotConversations,
  usePublicBotConversation,
} from "@/hooks/usePublicBotInsights";
import type { InsightDays } from "@/lib/public-bot-insights/contracts";
import type { BotBrand } from "@/lib/public-property-bot/contracts";
import { PublicBotInsightsView } from "./PublicBotInsightsView";

/** The server enforces this role too; other profiles do not mount or query this section. */
export function PublicBotInsightsSection() {
  const session = useSession();
  return session?.perfil === "admin_owner" ? <ConnectedInsights /> : null;
}

function ConnectedInsights() {
  const [days, setDays] = useState<InsightDays>(7);
  const [brand, setBrand] = useState<BotBrand | null>(null);
  const [page, setPage] = useState(1);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const overview = usePublicBotInsights(days);
  const conversations = usePublicBotConversations(brand, days, page);
  const detail = usePublicBotConversation(brand, conversationId);
  return (
    <PublicBotInsightsView
      days={days}
      onDaysChange={(next) => {
        setDays(next);
        setPage(1);
        setConversationId(null);
      }}
      brand={brand}
      onBrandChange={(next) => {
        setBrand(next);
        setPage(1);
        setConversationId(null);
      }}
      page={page}
      onPageChange={setPage}
      conversationId={conversationId}
      onConversationChange={setConversationId}
      overview={overview}
      conversations={conversations}
      detail={detail}
    />
  );
}
