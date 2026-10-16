import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { auth, defineMcp } from "@lovable.dev/mcp-js";
import { createMcpProtocolHandler } from "@lovable.dev/mcp-js/protocols/mcp";
import {
  externalMcpTools,
  safeExternalToolError,
  externalProposalNotice,
  externalCatalogContext,
  type McpAppContext,
} from "./external-tools";
import { externalActionTypes, externalIdentity } from "../agent/external-actions.server";
import { mcpTool } from "./tool-adapter";
const user = "10000000-0000-4000-8000-000000000001",
  client = "20000000-0000-4000-8000-000000000001",
  requestId = "30000000-0000-4000-8000-000000000001";
const reads = [
  "business_insights",
  "portfolio_summary",
  "rentals_financial_summary",
  "crm_funnel",
  "marketing_performance",
  "search_properties",
  "search_clients",
  "list_attendances",
];
test("real MCP OAuth transport: signed JWT, conditional discovery, direct-call denial and current-approval recheck", async () => {
  const keys = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(keys.publicKey)), kid: "test-key", alg: "ES256", use: "sig" };
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const issuer = `http://127.0.0.1:${address.port}`;
  let schemaUnavailable = false;
  let approved = true,
    visible = true,
    prepareCalls = 0;
  let seen: unknown;
  const context: any = {
    userId: user,
    roles: ["corretor"],
    agencies: ["cordial"],
    supabase: {
      rpc: async () => ({ data: [{ client_id: client, revision: 1, approved }], error: null }),
    },
  };
  const definition = defineMcp<McpAppContext>({
    name: "test-cordial",
    title: "Gestão test",
    version: "1",
    instructions: "Testes",
    metrics: false,
    auth: auth.oauth.issuer({
      issuer,
      jwksUri: `${issuer}/jwks`,
      acceptedAudiences: "authenticated",
    }),
    createAppContext: async ({ auth }) => {
      let identity;
      try {
        identity = externalIdentity(auth);
      } catch {
        return { allowedPrepareTools: [], canReadExternalActions: false };
      }
      if (schemaUnavailable)
        return externalCatalogContext(context, identity, async () => {
          throw new Error("schema missing");
        });
      return {
        context,
        identity,
        allowedPrepareTools: visible ? Object.keys(externalActionTypes) : [],
        canReadExternalActions: visible,
      };
    },
    tools: [
      ...reads.map(mcpTool),
      ...externalMcpTools({
        prepare: async (ctx, identity, name, input) => {
          prepareCalls++;
          seen = { ctxUser: ctx.userId, identity, name, input };
          return {
            action: { id: requestId, status: "pending" },
            confirmationUrl: `https://gestao.example/assistente?action=${requestId}`,
          };
        },
        status: async () => ({ status: "pending" }),
      }),
    ],
  });
  const handle = createMcpProtocolHandler(definition, { resourcePath: "/mcp" });
  const token = await new SignJWT({ client_id: client })
    .setProtectedHeader({ alg: "ES256", kid: "test-key", typ: "at+jwt" })
    .setIssuer(issuer)
    .setAudience("authenticated")
    .setSubject(user)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(keys.privateKey);
  async function call(method: string, params: any = {}, bearer: string | null = token) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-03-26",
    };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const response = await handle(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
    );
    const text = await response.text();
    const data =
      text.startsWith("event:") || text.startsWith("data:")
        ? JSON.parse(
            text
              .split("\n")
              .find((line) => line.startsWith("data:"))!
              .slice(5),
          )
        : JSON.parse(text);
    return { response, data };
  }
  try {
    assert.equal((await call("tools/list", {}, null)).response.status, 401);
    const unsigned = token.slice(0, -8) + "forgedxx";
    assert.equal((await call("tools/list", {}, unsigned)).response.status, 401);
    const appSession = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: "test-key", typ: "at+jwt" })
      .setIssuer(issuer)
      .setAudience("authenticated")
      .setSubject(user)
      .setExpirationTime("5m")
      .sign(keys.privateKey);
    assert.equal((await call("tools/list", {}, appSession)).response.status, 401);
    let listing = await call("tools/list");
    assert.equal(listing.response.status, 200, JSON.stringify(listing.data));
    const names = listing.data.result.tools.map((t: any) => t.name);
    assert.deepEqual(
      new Set(names),
      new Set([...reads, ...Object.keys(externalActionTypes), "get_action_status"]),
    );
    assert(!names.some((name: string) => /confirm|execute|cancel|edit/.test(name)));
    const prepare = listing.data.result.tools.find(
      (t: any) => t.name === "prepare_attendance_note",
    );
    assert.equal(prepare.annotations.readOnlyHint, false);
    assert.equal(prepare.annotations.idempotentHint, true);
    const args = { attendanceId: user, text: "Fixture", requestId };
    const sent = await call("tools/call", { name: "prepare_attendance_note", arguments: args });
    assert(!sent.data.result.isError, JSON.stringify(sent.data));
    assert.equal(prepareCalls, 1);
    assert.deepEqual(seen, {
      ctxUser: user,
      identity: { userId: user, clientId: client },
      name: "prepare_attendance_note",
      input: { requestId, payload: { attendanceId: user, text: "Fixture" } },
    });
    visible = false;
    listing = await call("tools/list");
    assert.deepEqual(new Set(listing.data.result.tools.map((t: any) => t.name)), new Set(reads));
    const hidden = await call("tools/call", { name: "prepare_attendance_note", arguments: args });
    assert(hidden.data.error || hidden.data.result?.isError);
    assert.equal(prepareCalls, 1);
    visible = true;
    approved = false;
    const revoked = await call("tools/call", { name: "prepare_attendance_note", arguments: args });
    assert.equal(revoked.data.result.isError, true);
    assert.equal(prepareCalls, 1);
    assert.match(revoked.data.result.content[0].text, /administrador/);
    approved = true;
    schemaUnavailable = true;
    const unavailable = await call("tools/list");
    assert.equal(unavailable.response.status, 200);
    assert.deepEqual(
      new Set(unavailable.data.result.tools.map((t: any) => t.name)),
      new Set(reads),
    );
    const unavailableCall = await call("tools/call", {
      name: "prepare_attendance_note",
      arguments: args,
    });
    assert(unavailableCall.data.error || unavailableCall.data.result?.isError);
    assert.equal(prepareCalls, 1);
    schemaUnavailable = false;
    const forgedField = await call("tools/call", {
      name: "prepare_attendance_note",
      arguments: { ...args, client_id: "other", execute: true },
    });
    assert(forgedField.data.error || forgedField.data.result?.isError);
    assert.equal(prepareCalls, 1);
    assert(!JSON.stringify(sent.data).includes(token));
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("MCP notices reflect replayed state and never expose raw or sensitive exceptions", () => {
  assert.equal(
    safeExternalToolError(
      new Error("SQL failed: owner Maria private@example.invalid"),
      "Falha segura",
    ),
    "Falha segura",
  );
  const message = safeExternalToolError(
    new Error(
      "Não encontrei contato private@example.invalid <b>https://evil.example</b> " +
        "x".repeat(400),
    ),
    "Falha segura",
  );
  assert(!message.includes("private@example.invalid"));
  assert(!message.includes("https://"));
  assert(!message.includes("<b>"));
  assert(message.length <= 300);
  assert.match(externalProposalNotice({ action: { status: "executed" } }), /já foi executada/);
  assert.match(externalProposalNotice({ action: { status: "pending" }, expired: true }), /expirou/);
  assert.match(externalProposalNotice({ action: { status: "cancelled" } }), /cancelada/);
});
