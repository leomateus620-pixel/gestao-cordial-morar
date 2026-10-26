import test from "node:test";
import assert from "node:assert/strict";
import { agentTools, executeAgentTool, getAllowedTools } from "./index.ts";
import { loadAgentContext, type AgentContext } from "../security.ts";
import { safePublicCover, saoPauloDay } from "./common.ts";
import { scoreProperty } from "./match-client-properties.ts";
const ids = {
  admin: "00000000-0000-4000-8000-000000000001",
  secretaria: "00000000-0000-4000-8000-000000000002",
  cordial: "00000000-0000-4000-8000-000000000003",
  morar: "00000000-0000-4000-8000-000000000004",
  other: "00000000-0000-4000-8000-000000000005",
  property: "00000000-0000-4000-8000-000000000006",
};
const now = new Date().toISOString(),
  old = "2025-01-01T12:00:00Z";
type Row = Record<string, any>;
const fixture: Record<string, Row[]> = {
  properties: [
    {
      id: ids.property,
      codigo: "GC-TESTE",
      tipo: "casa",
      finalidade: "venda",
      bairro: "Centro",
      cidade: "Santa Rosa",
      valor: 300000,
      dormitorios: 3,
      disponibilidade: "sim",
      exibir_imovel: true,
      is_draft: false,
      archived_at: null,
      created_at: now,
      proprietario_nome: "PRIVATE OWNER",
      proprietario_telefone: "(55) 99999-1234",
    },
  ],
  clients: ["cordial", "morar"].flatMap((brand) => [
    {
      id: ids[brand as "cordial" | "morar"],
      full_name: `Cliente ${brand}`,
      created_by: ids[brand as "cordial" | "morar"],
      assigned_broker_id: ids[brand as "cordial" | "morar"],
      brand,
      status: "novo",
      purpose: "compra",
      property_type: "casa",
      neighborhood: "Centro",
      min_budget: 200000,
      max_budget: 400000,
      bedrooms: "3",
      phone: "55999991234",
      document: "123.456.789-09",
      email: "privado@example.com",
      updated_at: now,
    },
    {
      id: ids.other,
      full_name: `Outro ${brand}`,
      created_by: ids.other,
      assigned_broker_id: ids.other,
      brand,
      status: "novo",
      updated_at: now,
    },
  ]),
  attendances: ["cordial", "morar"].flatMap((imobiliaria) => [
    {
      id: ids[imobiliaria as "cordial" | "morar"],
      created_by: ids[imobiliaria as "cordial" | "morar"],
      corretor_id: ids[imobiliaria as "cordial" | "morar"],
      cliente_nome: `Cliente ${imobiliaria}`,
      corretor_nome: `Corretor ${imobiliaria}`,
      imobiliaria,
      status: "novo",
      pipeline_stage: "novo",
      created_at: old,
      updated_at: old,
      telefone: "55999991234",
    },
    {
      id: ids.other,
      created_by: ids.other,
      corretor_id: ids.other,
      cliente_nome: `Outro ${imobiliaria}`,
      imobiliaria,
      status: "novo",
      created_at: old,
      updated_at: old,
    },
  ]),
  agenciamentos: ["cordial", "morar"].map((imobiliaria) => ({
    id: ids[imobiliaria as "cordial" | "morar"],
    created_by: ids[imobiliaria as "cordial" | "morar"],
    corretor_id: ids[imobiliaria as "cordial" | "morar"],
    imobiliaria,
    status: "novo",
    data_agenciamento: "2025-01-01",
    proprietario_nome: "PRIVATE OWNER",
  })),
  rental_contracts: ["cordial", "morar"].map((brand) => ({
    id: ids[brand as "cordial" | "morar"],
    brand,
    status: "ativo",
    payment_status: "atrasado",
    valor_mensal: 2000,
    comissao_mensal: 200,
    proximo_vencimento: "2025-01-01",
    data_inicio: "2024-01-01",
    data_fim: "2027-01-01",
  })),
  rental_nfse_emissions: [],
  agenda_events: [],
  marketing_campaigns: [
    {
      id: ids.secretaria,
      user_id: ids.secretaria,
      imobiliaria: "cordial",
      nome: "Campanha teste",
      status: "ativa",
      platform: "meta",
    },
    {
      id: ids.other,
      user_id: ids.other,
      imobiliaria: "morar",
      nome: "Outra campanha",
      status: "ativa",
    },
  ],
  marketing_daily_metrics: [
    {
      campaign_id: ids.secretaria,
      user_id: ids.secretaria,
      data: now.slice(0, 10),
      leads: 2,
      clicks: 5,
      views: 10,
      impressions: 20,
      investimento: 100,
    },
  ],
};
class Query {
  filters: ((r: Row) => boolean)[] = [];
  columns = "*";
  maximum = Infinity;
  constructor(
    readonly table: string,
    readonly db: Record<string, Row[]>,
    readonly log: string[],
  ) {}
  select(columns: string) {
    this.columns = columns;
    this.log.push(`${this.table}:${columns}`);
    return this;
  }
  eq(k: string, v: any) {
    this.filters.push((r) => r[k] === v);
    return this;
  }
  neq(k: string, v: any) {
    this.filters.push((r) => r[k] !== v);
    return this;
  }
  is(k: string, v: any) {
    this.filters.push((r) => (r[k] ?? null) === v);
    return this;
  }
  in(k: string, values: any[]) {
    if (k === "brand" && ["rental_contracts", "rental_nfse_emissions"].includes(this.table))
      assert.ok(
        values.every((v) => ["cordial", "morar"].includes(v)),
        "rental_brand enum must never receive ambas or a fabricated sentinel",
      );
    this.filters.push((r) => values.includes(r[k]));
    return this;
  }
  not(k: string, op: string, v: string) {
    assert.equal(op, "in");
    return this.neqIn(k, v.slice(1, -1).split(","));
  }
  neqIn(k: string, vs: any[]) {
    this.filters.push((r) => !vs.includes(r[k]));
    return this;
  }
  gt(k: string, v: string) {
    this.filters.push((r) => r[k] > v);
    return this;
  }
  gte(k: string, v: string) {
    this.filters.push((r) => r[k] >= v);
    return this;
  }
  lt(k: string, v: string) {
    this.filters.push((r) => r[k] < v);
    return this;
  }
  lte(k: string, v: string) {
    this.filters.push((r) => r[k] <= v);
    return this;
  }
  ilike(k: string, v: string) {
    this.filters.push((r) =>
      String(r[k] ?? "")
        .toLowerCase()
        .includes(v.replaceAll("%", "").toLowerCase()),
    );
    return this;
  }
  or(expr: string) {
    const terms = expr.split(",");
    this.filters.push((r) =>
      terms.some((t) => {
        const [k, op, ...parts] = t.split(".");
        const v = parts.join(".");
        if (op === "eq") return r[k] === v;
        if (op === "ilike")
          return String(r[k] ?? "")
            .toLowerCase()
            .includes(v.replaceAll("%", "").toLowerCase());
        throw new Error(`Unsupported test filter ${op}`);
      }),
    );
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.log.push(`${this.table}:order:${column}:${options?.ascending ?? true}`);
    return this;
  }
  limit(n: number) {
    this.log.push(`${this.table}:limit:${n}`);
    this.maximum = n;
    return this;
  }
  abortSignal() {
    return this;
  }
  then(resolve: any, reject: any) {
    try {
      const data = (this.db[this.table] ?? [])
        .filter((r) => this.filters.every((f) => f(r)))
        .slice(0, this.maximum)
        .map((r) =>
          this.columns === "*"
            ? { ...r }
            : Object.fromEntries(
                this.columns
                  .split(",")
                  .filter((k) => k in r)
                  .map((k) => [k, r[k]]),
              ),
        );
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    } catch (e) {
      return Promise.reject(e).then(resolve, reject);
    }
  }
}
function context(role: string, agency = "cordial", db = fixture): AgentContext & { log: string[] } {
  const log: string[] = [];
  const userId =
    role === "corretor"
      ? ids[agency as "cordial" | "morar"]
      : (ids[role as "admin" | "secretaria"] ?? ids.other);
  return {
    userId,
    roles: [role],
    agencies: [agency],
    log,
    supabase: {
      from: (table: string) => new Query(table, db, log),
      rpc: async (
        name: string,
        input: {
          p_imobiliaria?: string | null;
          p_since: string;
          p_until: string;
          p_owned_only?: boolean;
        },
      ) => {
        assert.equal(name, "marketing_campaigns_safe");
        log.push(`rpc:${name}:owned:${input.p_owned_only}:agency:${input.p_imobiliaria ?? "all"}`);
        const campaigns = (db.marketing_campaigns ?? []).filter(
          (c) =>
            (role === "admin" || c.imobiliaria === agency) &&
            (!input.p_imobiliaria || c.imobiliaria === input.p_imobiliaria) &&
            (!input.p_owned_only || c.user_id === userId),
        );
        const items = campaigns.map((c) => ({
          ...c,
          investimento: role === "admin" ? (c.investimento ?? 0) : null,
          daily_metrics: (db.marketing_daily_metrics ?? [])
            .filter(
              (m) =>
                m.campaign_id === c.id &&
                m.data >= input.p_since &&
                m.data <= input.p_until &&
                (!input.p_owned_only || m.user_id === userId),
            )
            .map((m) => {
              const { investimento, spend, cpc, cpm, ...safe } = m;
              return { ...safe, ...(role === "admin" ? { investimento, spend, cpc, cpm } : {}) };
            }),
        }));
        return {
          data: { items, total: items.length, financial_visible: role === "admin" },
          error: null,
        };
      },
    } as any,
  };
}
const operational = [
  "search_properties",
  "search_clients",
  "list_attendances",
  "portfolio_summary",
  "crm_funnel",
  "business_insights",
  "agenda_today",
  "stale_attendances",
  "match_client_properties",
  "expiring_agenciamentos",
  "get_record_context",
];
const schemas: Record<string, unknown> = {
  match_client_properties: { clientId: ids.cordial },
  get_record_context: { kind: "property", id: ids.property },
  web_research: { topic: "ipca", region: "brasil" },
};
for (const [role, agency] of [
  ["admin", "cordial"],
  ["secretaria", "cordial"],
  ["corretor", "cordial"],
  ["corretor", "morar"],
])
  test(`role × tool allowlist: ${role}/${agency}`, async () => {
    const ctx = context(role, agency);
    for (const tool of agentTools) {
      // Preparation has its own confirmation/transaction matrix; this matrix exercises reads.
      if (tool.name.startsWith("prepare_")) continue;
      const allowed =
        operational.includes(tool.name) ||
        ([
          "rentals_financial_summary",
          "marketing_performance",
          "rentals_overdue",
          "rental_nfse_alerts",
        ].includes(tool.name) &&
          role !== "corretor") ||
        (["broker_ranking", "web_research", "broker_bonus_summary"].includes(tool.name) &&
          role === "admin");
      assert.equal(
        getAllowedTools(ctx).some((t) => t.name === tool.name),
        allowed,
        tool.name,
      );
      if (tool.name === "web_research") continue;
      if (allowed)
        await assert.doesNotReject(
          () => executeAgentTool(tool.name, schemas[tool.name] ?? {}, ctx),
          tool.name,
        );
      else await assert.rejects(() => executeAgentTool(tool.name, {}, ctx), /permissão/);
    }
  });
for (const agency of ["cordial", "morar"])
  test(`broker ${agency}: other broker and other agency records are excluded`, async () => {
    const ctx = context("corretor", agency);
    for (const [name, key] of [
      ["search_clients", "clients"],
      ["list_attendances", "attendances"],
      ["stale_attendances", "attendances"],
      ["expiring_agenciamentos", "agenciamentos"],
    ]) {
      const output = await executeAgentTool(name, {}, ctx);
      const records = output.structuredContent[key] as Row[];
      assert.equal(records.length, 1, name);
      assert.equal(records[0].id, ids[agency as "cordial" | "morar"]);
      assert.ok(records[0].href);
    }
    const denied = await executeAgentTool(
      "get_record_context",
      { kind: "client", id: ids.other },
      ctx,
    );
    assert.equal(denied.structuredContent.record, null);
    const crossAgency = await executeAgentTool(
      "match_client_properties",
      { clientId: ids[agency === "cordial" ? "morar" : "cordial"] },
      ctx,
    );
    assert.equal(crossAgency.structuredContent.total, 0);
  });
test("shared property catalog stays visible to both broker agencies, no owner information", async () => {
  for (const agency of ["cordial", "morar"]) {
    const out = await executeAgentTool("search_properties", {}, context("corretor", agency));
    assert.equal(out.structuredContent.total, 1);
    assert.ok(!JSON.stringify(out).includes("PRIVATE OWNER"));
    assert.ok(!JSON.stringify(out).includes("proprietario"));
  }
});
test("secretary never receives monetary aggregates or queries their columns", async () => {
  const ctx = context("secretaria");
  for (const name of ["rentals_financial_summary", "marketing_performance", "rentals_overdue"]) {
    const out = await executeAgentTool(name, {}, ctx);
    assert.doesNotMatch(
      JSON.stringify(out),
      /investimento|comissao|Comissoes|Alugueis|cpl|"valor"/,
    );
  }
  assert.ok(
    ctx.log.every(
      (s) =>
        !s.includes("valor_mensal") &&
        !s.includes("comissao_mensal") &&
        !s.includes("investimento"),
    ),
  );
});
test("marketing Bot narrows RPC to owned campaigns and owned metrics in server-loaded agencies", async () => {
  const db = {
    ...fixture,
    marketing_campaigns: [
      {
        id: ids.secretaria,
        user_id: ids.secretaria,
        imobiliaria: "cordial",
        nome: "Própria",
        platform: "meta",
      },
      { id: ids.other, user_id: ids.other, imobiliaria: "cordial", nome: "Outro proprietário" },
      { id: ids.morar, user_id: ids.secretaria, imobiliaria: "morar", nome: "Outra marca" },
    ],
    marketing_daily_metrics: [
      {
        campaign_id: ids.secretaria,
        user_id: ids.secretaria,
        data: saoPauloDay(),
        leads: 2,
        impressions: 10,
      },
      {
        campaign_id: ids.secretaria,
        user_id: ids.other,
        data: saoPauloDay(),
        leads: 999,
        impressions: 999,
      },
      {
        campaign_id: ids.other,
        user_id: ids.other,
        data: saoPauloDay(),
        leads: 888,
        impressions: 888,
      },
    ],
  };
  const secretary = context("secretaria", "cordial", db);
  const output = await executeAgentTool("marketing_performance", {}, secretary);
  const campaigns = output.structuredContent.campanhas as Row[];
  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0].id, ids.secretaria);
  assert.equal(campaigns[0].mesAtual.leads, 2);
  assert.deepEqual(secretary.log, ["rpc:marketing_campaigns_safe:owned:true:agency:cordial"]);
  const admin = context("admin", "cordial", db);
  await executeAgentTool("marketing_performance", {}, admin);
  assert.deepEqual(admin.log, ["rpc:marketing_campaigns_safe:owned:false:agency:all"]);
});
test("marketing Bot fails closed without agency scope or with a foreign agency argument", async () => {
  const secretary = context("secretaria");
  secretary.agencies = [];
  await assert.rejects(() => executeAgentTool("marketing_performance", {}, secretary), /permissão/);
  assert.equal(secretary.log.length, 0);
  const cordial = context("secretaria");
  await assert.rejects(
    () => executeAgentTool("marketing_performance", { imobiliaria: "morar" }, cordial),
    /permissão/,
  );
  assert.equal(cordial.log.length, 0);
});
test("marketing Bot uses one explicit call for each allowed agency", async () => {
  const secretary = context("secretaria");
  secretary.agencies = ["cordial", "morar"];
  await executeAgentTool("marketing_performance", {}, secretary);
  assert.deepEqual(secretary.log.sort(), [
    "rpc:marketing_campaigns_safe:owned:true:agency:cordial",
    "rpc:marketing_campaigns_safe:owned:true:agency:morar",
  ]);
});
test("financeiro uses frontend priority and cannot inherit secretary module access", async () => {
  const ctx = context("financeiro");
  ctx.roles.push("secretaria");
  assert.deepEqual(
    getAllowedTools(ctx).map((t) => t.name),
    ["search_clients", "get_record_context", "prepare_memory"],
  );
  await assert.rejects(
    () => executeAgentTool("get_record_context", { kind: "rental", id: ids.cordial }, ctx),
    /permissão/,
  );
});
test("empty agency fails closed for operational records, admin preserves database scope", async () => {
  const ctx = context("corretor");
  ctx.agencies = [];
  assert.equal((await executeAgentTool("search_clients", {}, ctx)).structuredContent.total, 0);
  const admin = context("admin");
  admin.agencies = [];
  assert.equal((await executeAgentTool("search_clients", {}, admin)).structuredContent.total, 4);
});
test("unknown and mutating tools cannot run; invalid input cannot reach database", async () => {
  const ctx = context("admin");
  for (const name of [
    "emit_nfse",
    "publish_property",
    "delete_client",
    "confirm_action",
    "execute_sql",
  ])
    await assert.rejects(() => executeAgentTool(name, {}, ctx), /disponível/);
  await assert.rejects(
    () => executeAgentTool("get_record_context", { kind: "property", id: "not-a-uuid" }, ctx),
    /inválidos/,
  );
  await assert.rejects(
    () => executeAgentTool("search_clients", { limit: 10000 }, ctx),
    /inválidos/,
  );
  assert.equal(ctx.log.length, 0);
});
test("record context rechecks module permission for every kind", async () => {
  const ctx = context("corretor");
  await assert.rejects(
    () => executeAgentTool("get_record_context", { kind: "rental", id: ids.cordial }, ctx),
    /permissão/,
  );
  assert.equal(ctx.log.length, 0);
});
test("match score has explicit reasons and no inferred fields", () => {
  assert.deepEqual(
    scoreProperty(
      {
        property_type: "casa",
        min_budget: 200,
        max_budget: 400,
        neighborhood: "Centro",
        bedrooms: "3",
      },
      { tipo: "casa", valor: 300, bairro: "centro", dormitorios: 3 },
    ),
    {
      score: 100,
      motivos: [
        "Tipo de imóvel solicitado",
        "Dentro do orçamento informado",
        "Bairro de interesse",
        "Quantidade de dormitórios compatível",
      ],
    },
  );
  assert.equal(scoreProperty({}, {}).score, 0);
});
test("expired agenciamento dates are not invented", async () => {
  const out = await executeAgentTool("expiring_agenciamentos", {}, context("admin"));
  assert.equal(out.structuredContent.expirationAvailable, false);
  assert.match(out.content[0].text, /não informa vencimento/);
});
test("authorization fails closed on mismatched identity or role lookup failure", async () => {
  await assert.rejects(
    () =>
      loadAgentContext(
        {
          auth: { getUser: async () => ({ data: { user: { id: ids.other } }, error: null }) },
        } as any,
        ids.admin,
      ),
    /Sessão inválida/,
  );
  const query = {
    select() {
      return this;
    },
    eq() {
      return Promise.resolve({ data: [], error: { message: "private@example.com" } });
    },
  };
  await assert.rejects(
    () =>
      loadAgentContext(
        {
          auth: { getUser: async () => ({ data: { user: { id: ids.admin } }, error: null }) },
          from: () => query,
        } as any,
        ids.admin,
      ),
    /validar suas permissões/,
  );
});
test("aborted request never performs a database query", async () => {
  const ctx = context("admin");
  ctx.signal = AbortSignal.abort();
  await assert.rejects(() => executeAgentTool("search_properties", {}, ctx));
  assert.equal(ctx.log.length, 0);
});
test("registry names are unique and exposes reads/preparations, never execution", () => {
  assert.equal(new Set(agentTools.map((t) => t.name)).size, agentTools.length);
  assert.ok(
    agentTools.every((t) => !/(confirm|execute|write|delete|emit|publish|send)_/.test(t.name)),
  );
});
test("property type matching normalizes accents, spaces, underscores and case", () => {
  assert.equal(
    scoreProperty({ property_type: "sala_comercial" }, { tipo: "Sala Comercial" }).score,
    30,
  );
  assert.equal(
    scoreProperty({ property_type: "sitio_chacara" }, { tipo: "Sítio / Chácara" }).score,
    30,
  );
});
test("rental clients match property_finalidade locacao, not nonexistent aluguel enum", async () => {
  const db = {
    ...fixture,
    clients: [{ ...fixture.clients[0], purpose: "aluguel" }],
    properties: [{ ...fixture.properties[0], finalidade: "locacao" }],
  };
  const out = await executeAgentTool(
    "match_client_properties",
    { clientId: ids.cordial },
    context("corretor", "cordial", db),
  );
  assert.equal(out.structuredContent.total, 1);
});
test("photo cards only receive bounded already published public cover URL", async () => {
  const db = {
    ...fixture,
    property_images: [
      { id: ids.other, property_id: ids.property, position: 0, storage_path: "private.jpg" },
    ],
    property_image_provider_publications: [
      {
        image_id: ids.other,
        remote_url: "https://cdn.imobibrasil.com.br/imagens/casa.jpg",
        status: "synced",
        desired_state: "present",
        deleted_at: null,
      },
    ],
  };
  const ctx = context("corretor", "cordial", db);
  const out = await executeAgentTool("search_properties", {}, ctx);
  assert.equal(
    (out.structuredContent.properties as Row[])[0].photoUrl,
    "https://cdn.imobibrasil.com.br/imagens/casa.jpg",
  );
  assert.doesNotMatch(JSON.stringify(out), /storage_path|private\.jpg|token=/);
});

test("signed, private, arbitrary-host and non-raster cover URLs are rejected", () => {
  for (const url of [
    "https://cdn.imobibrasil.com.br/casa.jpg?token=secret",
    "http://cdn.imobibrasil.com.br/casa.jpg",
    "https://127.0.0.1/casa.jpg",
    "https://evil.example/casa.jpg",
    "https://cdn.imobibrasil.com.br/casa.svg",
    "https://cdn.imobibrasil.com.br/storage/v1/object/sign/casa.jpg",
    "https://user:password@cdn.imobibrasil.com.br/casa.jpg",
  ]) {
    assert.equal(safePublicCover(url), null, url);
  }
});
test("free text next steps retain the MCP field while masking contacts", async () => {
  const db = {
    ...fixture,
    clients: [{ ...fixture.clients[0], next_step: "Ligar 99999-1234 e ana@example.com" }],
    attendances: [{ ...fixture.attendances[0], proximo_passo: "Documento 123.456.789-09" }],
  };
  const ctx = context("corretor", "cordial", db);
  const clients = await executeAgentTool("search_clients", {}, ctx);
  const attendances = await executeAgentTool("list_attendances", {}, ctx);
  assert.match((clients.structuredContent.clients as Row[])[0].proximoPasso, /oculto|\*/);
  assert.match((attendances.structuredContent.attendances as Row[])[0].proximoPasso, /\*/);
  assert.doesNotMatch(
    JSON.stringify([clients, attendances]),
    /99999-1234|ana@example.com|123\.456\.789/,
  );
});
test("attendance context reads bounded safe history only after visible parent", async () => {
  const histories = Array.from({ length: 30 }, (_, n) => ({
    id: `event-${n}`,
    attendance_id: ids.cordial,
    event_type: n === 0 ? "stage_change" : "PRIVATE UNKNOWN EVENT TYPE",
    actor_name: "Equipe ana@imóveis.com.br (55) 99999-1234",
    created_at: `2026-10-15T12:${String(n).padStart(2, "0")}:00Z`,
    description: "PRIVATE OWNER AND DESCRIPTION",
    metadata: { owner: "PRIVATE OWNER" },
    previous_value: "PRIVATE",
    new_value: "PRIVATE",
  }));
  const db = {
    ...fixture,
    attendance_history: [
      ...histories,
      { ...histories[0], id: "foreign-history", attendance_id: ids.other },
    ],
  };
  const ctx = context("corretor", "cordial", db);
  const out = await executeAgentTool(
    "get_record_context",
    { kind: "attendance", id: ids.cordial },
    ctx,
  );
  const history = out.structuredContent.history as Row[];
  assert.equal(history.length, 20);
  assert.equal(out.structuredContent.historyLimited, true);
  assert.equal(history[0].titulo, "Etapa alterada");
  assert.equal(history[1].titulo, "Atualização do atendimento");
  assert.equal(history[0].criadoEm, histories[0].created_at);
  assert.equal(history[0].href, `/atendimentos?id=${ids.cordial}`);
  assert.doesNotMatch(JSON.stringify(history), /PRIVATE|ana@imóveis|99999-1234|foreign-history/);
  assert.ok(ctx.log.includes("attendance_history:id,event_type,actor_name,created_at"));
  assert.ok(ctx.log.includes("attendance_history:order:created_at:false"));
  assert.ok(ctx.log.includes("attendance_history:limit:21"));
});
test("attendance history is never queried for a foreign or absent parent", async () => {
  const ctx = context("corretor", "cordial");
  for (const id of [ids.other, ids.morar]) {
    const out = await executeAgentTool("get_record_context", { kind: "attendance", id }, ctx);
    assert.equal(out.structuredContent.record, null);
    assert.deepEqual(out.structuredContent.history, []);
  }
  assert.ok(ctx.log.every((entry) => !entry.startsWith("attendance_history:")));
});
test("short attendance history reports complete data and rejects unknown type as raw text", async () => {
  const ctx = context("corretor", "cordial", {
    ...fixture,
    attendance_history: [
      {
        id: "history",
        attendance_id: ids.cordial,
        event_type: "constructor",
        actor_name: "Equipe",
        created_at: now,
      },
    ],
  });
  const out = await executeAgentTool(
    "get_record_context",
    { kind: "attendance", id: ids.cordial },
    ctx,
  );
  assert.equal(out.structuredContent.historyLimited, false);
  assert.equal((out.structuredContent.history as Row[])[0].titulo, "Atualização do atendimento");
});

test("kitnet sugere apartamento com nota menor", () => {
  const k = scoreProperty({ property_type: "kitnet" }, { tipo: "Kitnet" }).score;
  const a = scoreProperty({ property_type: "kitnet" }, { tipo: "Apartamento" }).score;
  assert.equal(k, 30);
  assert.equal(a, 15);
  assert.equal(scoreProperty({ property_type: "apartamento" }, { tipo: "Kitnet" }).score, 0);
  assert.equal(scoreProperty({ property_type: "kitnet" }, { tipo: "Casa" }).score, 0);
});
