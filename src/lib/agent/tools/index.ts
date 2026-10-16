import { AgentAccessError, assertAgentRole, effectiveRole, type AgentContext } from "../security";
import { maskAgentOutput } from "../masking";
import { webResearchTool } from "../web-research";
import searchProperties from "./search-properties";
import searchClients from "./search-clients";
import listAttendances from "./list-attendances";
import portfolioSummary from "./portfolio-summary";
import rentalsFinancialSummary from "./rentals-financial-summary";
import crmFunnel from "./crm-funnel";
import marketingPerformance from "./marketing-performance";
import businessInsights from "./business-insights";
import agendaToday from "./agenda-today";
import staleAttendances from "./stale-attendances";
import matchClientProperties from "./match-client-properties";
import expiringAgenciamentos from "./expiring-agenciamentos";
import rentalsOverdue from "./rentals-overdue";
import brokerRanking from "./broker-ranking";
import getRecordContext from "./get-record-context";
import type { AgentTool, AgentToolResult } from "./types";
export { loadAgentContext } from "../security";
export type { AgentContext } from "../security";
export type { AgentTool, AgentToolResult } from "./types";
/** This is the only tool registry. No generated SQL, mutations or prepare_* tools in phases 0/1. */
export const agentTools: readonly AgentTool[] = Object.freeze([
  searchProperties,
  searchClients,
  listAttendances,
  portfolioSummary,
  rentalsFinancialSummary,
  crmFunnel,
  marketingPerformance,
  businessInsights,
  agendaToday,
  staleAttendances,
  matchClientProperties,
  expiringAgenciamentos,
  rentalsOverdue,
  brokerRanking,
  getRecordContext,
  webResearchTool,
]);
export function getAllowedTools(ctx: AgentContext): AgentTool[] {
  const role = effectiveRole(ctx);
  return ctx.userId && role ? agentTools.filter((tool) => tool.roles.includes(role)) : [];
}
export async function executeAgentTool(
  name: string,
  input: unknown,
  ctx: AgentContext,
): Promise<AgentToolResult> {
  const tool = agentTools.find((t) => t.name === name);
  if (!tool) throw new AgentAccessError("Esta ferramenta não está disponível.");
  assertAgentRole(ctx, tool.roles);
  const parsed = tool.inputSchema.safeParse(input);
  if (!parsed.success)
    throw new Error("Os dados dessa consulta são inválidos. Revise os campos informados.");
  const output = await tool.handler(parsed.data, ctx);
  ctx.signal?.throwIfAborted();
  return maskAgentOutput(output);
}
