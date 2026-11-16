import { RefreshCw } from "lucide-react";
import type { BotBrand } from "@/lib/public-property-bot/contracts";

export type InsightQuery<T> = {
  data?: T;
  isLoading: boolean;
  isError: boolean;
  isFetching?: boolean;
  refetch: () => unknown;
};

export const botNames: Record<BotBrand, string> = {
  cordial: "Cordial Bot",
  morar: "Morar Bot",
};
export const number = (value: number) => value.toLocaleString("pt-BR");
export const dayLabel = (value: string) => value.slice(5).split("-").reverse().join("/");
export const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
export const localDate = (value: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export function InsightsNotice({
  children,
  retry,
  error = false,
}: {
  children: React.ReactNode;
  retry?: () => unknown;
  error?: boolean;
}) {
  return (
    <div className="pbi-notice" role={error ? "alert" : "status"}>
      <p>{children}</p>
      {retry && (
        <button className="pbi-button" type="button" onClick={retry}>
          <RefreshCw size={16} aria-hidden="true" /> Tentar novamente
        </button>
      )}
    </div>
  );
}
