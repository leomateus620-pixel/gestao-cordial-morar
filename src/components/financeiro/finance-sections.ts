import {
  AlertTriangle,
  BadgeDollarSign,
  BarChart3,
  HandCoins,
  LayoutDashboard,
  ReceiptText,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

export const financeSections = [
  { id: "visao-geral", label: "Visão geral", icon: LayoutDashboard },
  { id: "receitas", label: "Receitas", icon: TrendingUp },
  { id: "despesas", label: "Despesas", icon: TrendingDown },
  { id: "fluxo-caixa", label: "Fluxo de caixa", icon: BarChart3 },
  { id: "dre", label: "DRE", icon: ReceiptText },
  { id: "comissoes", label: "Comissões", icon: BadgeDollarSign },
  { id: "repasses", label: "Repasses", icon: HandCoins },
  { id: "inadimplencia", label: "Inadimplência", icon: AlertTriangle },
] as const;

export type FinanceSection = (typeof financeSections)[number]["id"];

export function isFinanceSection(value: unknown): value is FinanceSection {
  return financeSections.some((section) => section.id === value);
}
