import test from "node:test";
import assert from "node:assert/strict";
import { agentBots } from "./bots";
import {
  applyBotConfiguration,
  resolveAgentBots,
  publicAgentCatalog,
  oauthClientMetadata,
  assertPersonalAdmin,
} from "./bot-config.server";
import { botConfigInput, mcpClientInput } from "./bot-config.schemas";
const config = (id: string) => ({
  bot_id: id,
  enabled: true,
  instructions: "Responda com cordialidade.",
  suggestions: null,
  revision: 1,
  updated_at: null,
});
test("configuration overrides presentation only and preserves immutable permissions, tools and base rules", () => {
  const original = agentBots[0];
  const row = { ...config(original.id), enabled: false, suggestions: ["Resuma meu dia"] };
  const resolved = applyBotConfiguration(original, row);
  assert.equal(resolved.active, false);
  assert.deepEqual(resolved.roles, original.roles);
  assert.deepEqual(resolved.tools, original.tools);
  assert(resolved.instructions.startsWith(original.instructions));
  assert(resolved.instructions.includes("subordinadas"));
  assert.deepEqual(resolved.suggestions, row.suggestions);
  assert.equal(original.active, true);
  assert(
    !botConfigInput.safeParse({
      id: "agenda",
      expectedRevision: 1,
      enabled: true,
      instructions: "",
      suggestions: [],
      confirmed: true,
      tools: ["emitir_nfse"],
    }).success,
  );
  assert(
    !botConfigInput.safeParse({
      id: "custom",
      expectedRevision: 1,
      enabled: true,
      instructions: "",
      suggestions: [],
      confirmed: true,
    }).success,
  );
  assert(
    !mcpClientInput.safeParse({
      clientId: "*",
      name: "Global",
      approved: true,
      expectedRevision: 0,
      confirmed: true,
    }).success,
  );
});
test("catalog is filtered by actual role, strips prompts, and fails closed on missing or incomplete schema", async () => {
  for (const role of ["admin", "secretaria", "corretor"]) {
    const ctx = {
      userId: "fixture",
      roles: [role],
      agencies: ["cordial"],
      supabase: {
        from: () => ({
          select() {
            return this;
          },
          in() {
            return this;
          },
          limit: async () => ({
            data: agentBots.filter((b) => b.roles.includes(role as any)).map((b) => config(b.id)),
            error: null,
          }),
        }),
      },
    } as any;
    const out = await resolveAgentBots(ctx);
    assert(out.every((b) => b.roles.includes(role as any)));
    const dto = await publicAgentCatalog(ctx);
    assert(dto.every((b) => !("instructions" in b)));
  }
  const ctx = {
    userId: "fixture",
    roles: ["corretor"],
    agencies: [],
    supabase: {
      from: () => ({
        select() {
          return this;
        },
        in() {
          return this;
        },
        limit: async () => ({ data: [], error: null }),
      }),
    },
  } as any;
  await assert.rejects(() => resolveAgentBots(ctx), /indisponível/);
});
test("admin configuration rejects delegated sessions and OAuth DTO removes every secret/provider field", () => {
  const ctx = { userId: "fixture", roles: ["admin"], agencies: [] } as any;
  assertPersonalAdmin(ctx, {});
  for (const claims of [{ client_id: "client" }, { azp: "client" }])
    assert.throws(() => assertPersonalAdmin(ctx, claims), /sessão pessoal/);
  assert.throws(() => assertPersonalAdmin({ ...ctx, roles: ["corretor"] }, {}), /sessão pessoal/);
  const dto = oauthClientMetadata({
    client_id: "client-fixture",
    client_name: "Aplicativo Fixture",
    client_secret: "NEVER_RETURN",
    refresh_token: "NEVER_RETURN",
    redirect_uris: ["https://private.invalid"],
  });
  assert.deepEqual(dto, { clientId: "client-fixture", name: "Aplicativo Fixture" });
  assert(!JSON.stringify(dto).includes("NEVER_RETURN"));
});
test("unknown and non-operational catalog roles expose no bots and cannot query configuration", async () => {
  for (const roles of [[], ["unknown"], ["financeiro"]]) {
    const ctx = {
      userId: "fixture",
      roles,
      agencies: ["cordial"],
      supabase: {
        from() {
          throw new Error("must not query configuration");
        },
      },
    } as any;
    assert.deepEqual(await resolveAgentBots(ctx), []);
    assert.deepEqual(await publicAgentCatalog(ctx), []);
  }
});
