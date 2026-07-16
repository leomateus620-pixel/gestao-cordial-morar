import { Clock3, Home, ShoppingBag, Users, UserRoundCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type ClientStats = {
  total: number;
  newThisMonth: number;
  rental: number;
  purchase: number;
  waiting: number;
};

const items = [
  { key: "total", label: "Total", icon: Users },
  { key: "newThisMonth", label: "Novos mês", icon: UserRoundCheck },
  { key: "rental", label: "Aluguel", icon: Home },
  { key: "purchase", label: "Compra", icon: ShoppingBag },
  { key: "waiting", label: "Retorno", icon: Clock3 },
] as const;

export function ClientSummaryCards({ stats }: { stats: ClientStats }) {
  return (
    <section
      className="premium-stagger grid grid-cols-2 gap-2 sm:grid-cols-5"
      aria-label="Resumo da carteira de clientes"
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <div
            key={item.key}
            className={cn(
              "glass-panel rounded-2xl px-3 py-3",
              index === 0 && "col-span-2 border-teal-700/10 bg-teal-700/[0.06] sm:col-span-1",
              item.key === "waiting" &&
                stats.waiting > 0 &&
                "border-amber-500/20 bg-amber-500/[0.07]",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-foreground/52">
                {item.label}
              </span>
              <Icon
                className={cn(
                  "size-3.5 text-teal-700/70",
                  item.key === "waiting" && stats.waiting > 0 && "text-amber-700/80",
                )}
                aria-hidden="true"
              />
            </div>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              {stats[item.key]}
            </p>
          </div>
        );
      })}
    </section>
  );
}
