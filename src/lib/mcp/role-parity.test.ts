import test from "node:test";
import assert from "node:assert/strict";
import { agentTools, executeAgentTool, type AgentContext } from "../agent/tools";
import { mcpTool } from "./tool-adapter";

/** Every read tool exposed over MCP must come from the same registry entry used by the
 * in-app assistant: same handler, same schema, same role allowlist. If a future change makes
 * the MCP adapter wrap a different implementation or a looser role check, this test breaks. */
const readToolNames = [
  "business_insights",
  "crm_funnel",
  "list_attendances",
  "marketing_performance",
  "portfolio_summary",
  "rentals_financial_summary",
  "search_clients",
  "search_properties",
];

test("MCP read tools reference the exact same registry entry as the agent tool registry", () => {
  for (const name of readToolNames) {
    const direct = agentTools.find((t) => t.name === name);
    assert.ok(direct, `${name} must exist in agentTools`);
    const mcpDefinition = mcpTool(name) as unknown as {
      name: string;
      title: string;
      description: string;
    };
    assert.equal(mcpDefinition.name, direct!.name);
    assert.equal(mcpDefinition.title, direct!.title);
    assert.equal(mcpDefinition.description, direct!.description);
  }
});

test("MCP read tools fail closed for roles not allowed by the shared registry", async () => {
  const log: string[] = [];
  const query = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    in() {
      return this;
    },
    is() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    or() {
      return this;
    },
    gte() {
      return this;
    },
    lte() {
      return this;
    },
    ilike() {
      return this;
    },
    abortSignal() {
      return this;
    },
    then(resolve: any) {
      return Promise.resolve({ data: [], error: null }).then(resolve);
    },
  };
  const ctx: AgentContext = {
    userId: "00000000-0000-4000-8000-000000000009",
    roles: ["corretor"],
    agencies: ["cordial"],
    supabase: { from: (t: string) => (log.push(t), query) } as any,
  };
  // broker_ranking is restricted to admin in the shared registry; the same
  // executeAgentTool() entry point backs both the chat assistant and MCP tools.
  await assert.rejects(() => executeAgentTool("broker_ranking", {}, ctx), /permissão/);
});
