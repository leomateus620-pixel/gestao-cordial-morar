/** Synthetic records exclusively for tests and the explicitly labeled local preview. */
import type {
  BotInsights,
  BotConversation,
  BotConversationList,
  BotConversationDetail,
  InsightDays,
} from "../../src/lib/public-bot-insights/contracts";
import type { BotBrand } from "../../src/lib/public-property-bot/contracts";

export function overviewFixture(days: InsightDays = 7): BotInsights {
  const dates = Array.from({ length: days }, (_, i) => {
    const day = new Date("2026-11-16T12:00:00Z");
    day.setUTCDate(day.getUTCDate() - days + i + 1);
    return day.toISOString().slice(0, 10);
  });
  return {
    trackingSince: "2026-11-14T13:30:00Z",
    period: { days, from: dates[0], to: dates[dates.length - 1], timezone: "America/Sao_Paulo" },
    brands: (["cordial", "morar"] as const).map((brand, index) => {
      const daily = dates.map((date, i) => {
        const sessions = date < "2026-11-14" ? 0 : ((i + index * 3) % 11) + 5;
        return {
          date,
          opens: sessions * 2,
          sessions,
          conversations: Math.max(0, sessions - 2),
          messages: sessions * 3,
          whatsapp: sessions ? Math.max(0, sessions - 5) : 0,
        };
      });
      const sum = (key: "opens" | "sessions" | "conversations" | "messages" | "whatsapp") =>
        daily.reduce((total, day) => total + day[key], 0);
      return {
        brand,
        opens: sum("opens"),
        sessions: sum("sessions"),
        conversations: sum("conversations"),
        messages: sum("messages"),
        whatsapp: sum("whatsapp"),
        daily,
      };
    }),
  };
}

export function conversationFixture(brand: BotBrand = "cordial", index = 0): BotConversation {
  return {
    id: `00000000-0000-4000-8000-${String((brand === "cordial" ? 100 : 200) + index).padStart(12, "0")}`,
    brand,
    startedAt: `2026-11-16T${String(15 - (index % 8)).padStart(2, "0")}:10:00Z`,
    lastActivityAt: `2026-11-16T${String(15 - (index % 8)).padStart(2, "0")}:24:00Z`,
    messages: index === 2 ? 0 : 2,
    whatsapp: index % 3 === 0 ? 1 : 0,
    initialFilters:
      index === 2
        ? {}
        : {
            operation: index === 1 ? "aluguel" : "venda",
            type: index === 1 ? "Apartamento" : "Casa",
            bedrooms: { op: index === 1 ? "gte" : "eq", value: index === 1 ? 2 : 3 },
            budget: { min: null, max: { inclusive: true, value: index === 1 ? 2000 : 650000 } },
          },
    latestFilters:
      index === 2
        ? {}
        : {
            operation: index === 1 ? "aluguel" : "venda",
            type: index === 1 ? "Apartamento" : "Casa",
            city: "Santa Rosa",
            district: index === 1 ? "Jardim das Palmeiras e Recanto das Flores" : "Centro",
            bedrooms: { op: index === 1 ? "gte" : "eq", value: index === 1 ? 2 : 3 },
            budget: { min: null, max: { inclusive: true, value: index === 1 ? 2500 : 700000 } },
            features:
              index === 1
                ? []
                : [{ name: "piscina", scope: "private", state: "present", required: true }],
          },
    resultCount: index === 2 ? 0 : 3,
  };
}
export function listFixture(brand: BotBrand = "cordial", page = 1): BotConversationList {
  return {
    items: Array.from({ length: page === 3 ? 3 : 10 }, (_, index) =>
      conversationFixture(brand, (page - 1) * 10 + index),
    ),
    total: 23,
    page,
    pageSize: 10,
  };
}
export function detailFixture(item = conversationFixture()): BotConversationDetail {
  if (!item.messages)
    return { ...item, evolution: [], evolutionTotal: 0, evolutionTruncated: false };
  const common = {
    requestId: "10000000-0000-4000-8000-000000000001",
    state: "completed" as const,
    source: null,
    publicIds: [],
    revision: 1,
    resultCount: 3,
  };
  const rental = item.latestFilters.operation === "aluguel";
  const detail: BotConversationDetail = {
    ...item,
    evolutionTotal: item.messages + item.whatsapp,
    evolutionTruncated: false,
    evolution: [
      {
        ...common,
        at: item.startedAt,
        kind: "turn",
        question: rental
          ? "Quero alugar um apartamento com pelo menos 2 quartos até R$ 2 mil por mês."
          : "Quero comprar uma casa de 3 quartos até 650 mil.",
        answer: "Encontrei 3 opções para sua busca.",
        filters: item.initialFilters,
        outcome: "results",
      },
      {
        ...common,
        requestId: "10000000-0000-4000-8000-000000000002",
        revision: 2,
        at: item.lastActivityAt,
        kind: "turn",
        question: rental
          ? "Pode ser até R$ 2.500 por mês, no Jardim das Palmeiras e Recanto das Flores, em Santa Rosa."
          : "Pode ser até 700 mil, no Centro e com piscina.",
        answer: "Estas opções atendem aos critérios.",
        filters: item.latestFilters,
        outcome: "results",
      },
      {
        ...common,
        requestId: null,
        state: null,
        revision: null,
        at: item.lastActivityAt,
        kind: "whatsapp",
        question: null,
        answer: null,
        filters: null,
        resultCount: null,
        outcome: null,
        source: "card",
      },
    ],
  };
  if (!item.whatsapp)
    detail.evolution = detail.evolution.filter((event) => event.kind !== "whatsapp");
  return detail;
}
