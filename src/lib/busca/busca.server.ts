import type {
  BuscaCategoria,
  BuscaCategoriaFiltro,
  BuscaResultado,
  BuscaTimeline,
  BuscaTimelineEvento,
} from "@/types/busca";
import { formatBuscaCurrency } from "@/types/busca";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = { from: (table: string) => any };

export async function assertAdminAccess(supabase: Db, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = ((data ?? []) as Array<{ role: string }>).map((r) => r.role);
  if (!roles.includes("admin")) {
    throw new Error("A busca global é restrita aos administradores.");
  }
}

function ilikeOr(fields: string[], term: string) {
  const safe = term.replace(/[%,()]/g, " ").trim();
  return fields.map((field) => `${field}.ilike.%${safe}%`).join(",");
}

function joinParts(parts: Array<string | null | undefined>, sep = " · ") {
  return parts.filter((p) => Boolean(p && String(p).trim())).join(sep);
}

const LIMIT_PER_CATEGORY = 8;

export async function runGlobalSearch(
  supabase: Db,
  query: string,
  categoria: BuscaCategoriaFiltro,
): Promise<BuscaResultado[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const wants = (c: BuscaCategoria) => categoria === "todos" || categoria === c;
  const tasks: Array<Promise<BuscaResultado[]>> = [];

  if (wants("atendimento")) {
    tasks.push(
      supabase
        .from("attendances")
        .select(
          "id, cliente_nome, telefone, email, corretor_nome, status, pipeline_stage, imobiliaria, finalidade, imovel_descricao, updated_at",
        )
        .or(ilikeOr(["cliente_nome", "telefone", "email", "corretor_nome"], term))
        .order("updated_at", { ascending: false })
        .limit(LIMIT_PER_CATEGORY)
        .then(({ data, error }: any) => {
          if (error) throw new Error(error.message);
          return (data ?? []).map(
            (row: any): BuscaResultado => ({
              id: row.id,
              categoria: "atendimento",
              titulo: row.cliente_nome ?? "Atendimento",
              subtitulo: joinParts([row.telefone, row.corretor_nome && `Corretor: ${row.corretor_nome}`]),
              detalhe: joinParts([row.finalidade, row.imovel_descricao]),
              status: row.pipeline_stage ?? row.status,
              data: row.updated_at,
              rota: "/atendimentos",
            }),
          );
        }),
    );
  }

  if (wants("cliente")) {
    tasks.push(
      supabase
        .from("clients")
        .select(
          "id, full_name, phone, email, status, purpose, assigned_broker_name, neighborhood, updated_at",
        )
        .or(ilikeOr(["full_name", "phone", "email"], term))
        .order("updated_at", { ascending: false })
        .limit(LIMIT_PER_CATEGORY)
        .then(({ data, error }: any) => {
          if (error) throw new Error(error.message);
          return (data ?? []).map(
            (row: any): BuscaResultado => ({
              id: row.id,
              categoria: "cliente",
              titulo: row.full_name,
              subtitulo: joinParts([
                row.phone,
                row.assigned_broker_name && `Corretor: ${row.assigned_broker_name}`,
              ]),
              detalhe: joinParts([row.purpose, row.neighborhood]),
              status: row.status,
              data: row.updated_at,
              rota: "/atendimentos",
            }),
          );
        }),
    );
  }

  if (wants("venda")) {
    tasks.push(
      supabase
        .from("real_estate_sales")
        .select(
          "id, property_name, property_address, buyer_name, responsible_agent, sale_value, sale_status, sale_date, updated_at",
        )
        .or(
          ilikeOr(
            ["property_name", "property_address", "buyer_name", "responsible_agent"],
            term,
          ),
        )
        .order("updated_at", { ascending: false })
        .limit(LIMIT_PER_CATEGORY)
        .then(({ data, error }: any) => {
          if (error) throw new Error(error.message);
          return (data ?? []).map(
            (row: any): BuscaResultado => ({
              id: row.id,
              categoria: "venda",
              titulo: row.property_name,
              subtitulo: joinParts([
                row.buyer_name && `Comprador: ${row.buyer_name}`,
                formatBuscaCurrency(row.sale_value),
              ]),
              detalhe: joinParts([row.property_address, row.responsible_agent]),
              status: row.sale_status,
              data: row.updated_at,
              rota: "/vendas",
            }),
          );
        }),
    );
  }

  if (wants("agenciamento")) {
    tasks.push(
      supabase
        .from("agenciamentos")
        .select(
          "id, endereco, bairro, cidade, codigo_morar, codigo_cordial, proprietario_nome, proprietario_telefone, corretor_nome, status, finalidade, tipo_imovel, updated_at",
        )
        .or(
          ilikeOr(
            [
              "endereco",
              "bairro",
              "codigo_morar",
              "codigo_cordial",
              "proprietario_nome",
              "proprietario_telefone",
              "corretor_nome",
            ],
            term,
          ),
        )
        .order("updated_at", { ascending: false })
        .limit(LIMIT_PER_CATEGORY)
        .then(({ data, error }: any) => {
          if (error) throw new Error(error.message);
          return (data ?? []).map(
            (row: any): BuscaResultado => ({
              id: row.id,
              categoria: "agenciamento",
              titulo: joinParts([
                row.codigo_morar && `Morar ${row.codigo_morar}`,
                row.codigo_cordial && `Cordial ${row.codigo_cordial}`,
              ])
                ? `${joinParts([
                    row.codigo_morar && `Morar ${row.codigo_morar}`,
                    row.codigo_cordial && `Cordial ${row.codigo_cordial}`,
                  ])} · ${row.endereco}`
                : row.endereco,
              subtitulo: joinParts([
                row.proprietario_nome && `Proprietário: ${row.proprietario_nome}`,
                row.corretor_nome && `Corretor: ${row.corretor_nome}`,
              ]),
              detalhe: joinParts([row.tipo_imovel, row.bairro, row.cidade, row.finalidade]),
              status: row.status,
              data: row.updated_at,
              rota: "/agenciamentos",
            }),
          );
        }),

    );
  }

  if (wants("imovel")) {
    tasks.push(
      supabase
        .from("rental_properties")
        .select(
          "id, apelido, logradouro, numero, bairro, cidade, proprietario_nome, status, tipo, updated_at",
        )
        .or(ilikeOr(["apelido", "logradouro", "bairro", "proprietario_nome"], term))
        .order("updated_at", { ascending: false })
        .limit(LIMIT_PER_CATEGORY)
        .then(({ data, error }: any) => {
          if (error) throw new Error(error.message);
          return (data ?? []).map(
            (row: any): BuscaResultado => ({
              id: row.id,
              categoria: "imovel",
              titulo: row.apelido,
              subtitulo: joinParts([
                joinParts([row.logradouro, row.numero], ", "),
                row.bairro,
                row.cidade,
              ]),
              detalhe: joinParts([
                row.tipo,
                row.proprietario_nome && `Proprietário: ${row.proprietario_nome}`,
              ]),
              status: row.status,
              data: row.updated_at,
              rota: "/alugueis",
            }),
          );
        }),
    );
  }

  if (wants("inquilino")) {
    tasks.push(
      supabase
        .from("rental_tenants")
        .select("id, nome, telefone, email, cpf_cnpj, profissao, updated_at")
        .or(ilikeOr(["nome", "telefone", "email", "cpf_cnpj"], term))
        .order("updated_at", { ascending: false })
        .limit(LIMIT_PER_CATEGORY)
        .then(({ data, error }: any) => {
          if (error) throw new Error(error.message);
          return (data ?? []).map(
            (row: any): BuscaResultado => ({
              id: row.id,
              categoria: "inquilino",
              titulo: row.nome,
              subtitulo: joinParts([row.telefone, row.email]),
              detalhe: joinParts([row.cpf_cnpj, row.profissao]),
              data: row.updated_at,
              rota: "/alugueis",
            }),
          );
        }),
    );
  }

  if (wants("contrato")) {
    tasks.push(
      supabase
        .from("rental_contracts")
        .select(
          "id, valor_mensal, status, payment_status, data_inicio, data_fim, proximo_vencimento, updated_at, rental_properties(apelido, logradouro, bairro, cidade), rental_tenants(nome, telefone)",
        )
        .order("updated_at", { ascending: false })
        .limit(250)
        .then(({ data, error }: any) => {
          if (error) throw new Error(error.message);
          const needle = normalize(term);
          return (data ?? [])
            .filter((row: any) => {
              const hay = normalize(
                joinParts([
                  row.rental_properties?.apelido,
                  row.rental_properties?.logradouro,
                  row.rental_properties?.bairro,
                  row.rental_tenants?.nome,
                  row.rental_tenants?.telefone,
                ]),
              );
              return hay.includes(needle);
            })
            .slice(0, LIMIT_PER_CATEGORY)
            .map(
              (row: any): BuscaResultado => ({
                id: row.id,
                categoria: "contrato",
                titulo: row.rental_properties?.apelido ?? "Contrato de locação",
                subtitulo: joinParts([
                  row.rental_tenants?.nome && `Inquilino: ${row.rental_tenants.nome}`,
                  formatBuscaCurrency(row.valor_mensal),
                ]),
                detalhe: joinParts([
                  row.rental_properties?.logradouro,
                  row.rental_properties?.bairro,
                ]),
                status: row.status,
                data: row.updated_at,
                rota: "/contratos",
              }),
            );
        }),
    );
  }

  const settled = await Promise.allSettled(tasks);
  const results: BuscaResultado[] = [];
  for (const item of settled) {
    if (item.status === "fulfilled") results.push(...item.value);
  }
  return results;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function evt(
  id: string,
  data: string | null,
  titulo: string,
  descricao?: string,
  tag?: string,
): BuscaTimelineEvento {
  return { id, data, titulo, descricao, tag };
}

function sortEvents(events: BuscaTimelineEvento[]) {
  return events.sort((a, b) => {
    const ta = a.data ? new Date(a.data).getTime() : 0;
    const tb = b.data ? new Date(b.data).getTime() : 0;
    return tb - ta;
  });
}

export async function buildRecordTimeline(
  supabase: Db,
  categoria: BuscaCategoria,
  id: string,
): Promise<BuscaTimeline> {
  switch (categoria) {
    case "atendimento":
      return atendimentoTimeline(supabase, id);
    case "cliente":
      return clienteTimeline(supabase, id);
    case "venda":
      return vendaTimeline(supabase, id);
    case "contrato":
      return contratoTimeline(supabase, id);
    case "agenciamento":
      return agenciamentoTimeline(supabase, id);
    case "imovel":
      return imovelTimeline(supabase, id);
    case "inquilino":
      return inquilinoTimeline(supabase, id);
    default:
      throw new Error("Categoria não suportada.");
  }
}

async function single(supabase: Db, table: string, select: string, id: string) {
  const { data, error } = await supabase.from(table).select(select).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Registro não encontrado.");
  return data as any;
}

async function atendimentoTimeline(supabase: Db, id: string): Promise<BuscaTimeline> {
  const row = await single(supabase, "attendances", "*", id);
  const [{ data: history }, { data: assignments }] = await Promise.all([
    supabase
      .from("attendance_history")
      .select("id, event_type, description, actor_name, created_at")
      .eq("attendance_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("attendance_assignments")
      .select("id, broker_id, status, assigned_at, first_opened_at, response_time_seconds")
      .eq("attendance_id", id)
      .order("assigned_at", { ascending: false }),
  ]);

  const events: BuscaTimelineEvento[] = [];
  for (const h of history ?? []) {
    events.push(
      evt(
        `h-${h.id}`,
        h.created_at,
        h.description ?? h.event_type,
        h.actor_name ? `Por ${h.actor_name}` : undefined,
        h.event_type,
      ),
    );
  }
  for (const a of assignments ?? []) {
    events.push(
      evt(`a-${a.id}`, a.assigned_at, "Corretor vinculado", undefined, "atribuição"),
    );
    if (a.first_opened_at) {
      const secs = a.response_time_seconds;
      events.push(
        evt(
          `o-${a.id}`,
          a.first_opened_at,
          "Atendimento aberto pelo corretor",
          secs ? `Tempo de resposta: ${formatDuration(secs)}` : undefined,
          "resposta",
        ),
      );
    }
  }
  events.push(evt("created", row.created_at, "Atendimento criado", row.criado_por_nome ? `Por ${row.criado_por_nome}` : undefined, "criação"));

  return {
    categoria: "atendimento",
    id,
    titulo: row.cliente_nome,
    subtitulo: joinParts([row.telefone, row.email]),
    status: row.pipeline_stage ?? row.status,
    rota: "/atendimentos",
    campos: [
      { label: "Corretor responsável", valor: row.corretor_nome ?? "Não atribuído" },
      { label: "Imobiliária", valor: row.imobiliaria ?? "—" },
      { label: "Finalidade", valor: row.finalidade ?? "—" },
      { label: "Origem", valor: row.origem ?? "—" },
      { label: "Fonte de prospecção", valor: row.fonte_prospeccao ?? "—" },
      { label: "Prioridade", valor: row.prioridade ?? "—" },
      { label: "Imóvel de interesse", valor: row.imovel_descricao ?? row.imovel_endereco ?? "—" },
      { label: "Próximo passo", valor: row.proximo_passo ?? "—" },
    ],
    eventos: sortEvents(events),
  };
}

async function clienteTimeline(supabase: Db, id: string): Promise<BuscaTimeline> {
  const row = await single(supabase, "clients", "*", id);
  const { data: atendimentos } = await supabase
    .from("attendances")
    .select("id, cliente_nome, pipeline_stage, corretor_nome, created_at")
    .eq("cliente_id", id)
    .order("created_at", { ascending: false })
    .limit(30);

  const events: BuscaTimelineEvento[] = [
    evt("created", row.created_at, "Cliente cadastrado", undefined, "criação"),
  ];
  if (row.updated_at && row.updated_at !== row.created_at) {
    events.push(evt("updated", row.updated_at, "Cadastro atualizado", undefined, "atualização"));
  }
  for (const a of atendimentos ?? []) {
    events.push(
      evt(
        `at-${a.id}`,
        a.created_at,
        "Atendimento vinculado",
        joinParts([a.pipeline_stage, a.corretor_nome && `Corretor: ${a.corretor_nome}`]),
        "atendimento",
      ),
    );
  }

  return {
    categoria: "cliente",
    id,
    titulo: row.full_name,
    subtitulo: joinParts([row.phone, row.email]),
    status: row.status,
    rota: "/atendimentos",
    campos: [
      { label: "Tipo", valor: row.client_type ?? "—" },
      { label: "Finalidade", valor: row.purpose ?? "—" },
      { label: "Corretor", valor: row.assigned_broker_name ?? "—" },
      { label: "Imobiliária", valor: row.brand ?? "—" },
      { label: "Bairro de interesse", valor: row.neighborhood ?? "—" },
      {
        label: "Orçamento",
        valor:
          row.min_budget || row.max_budget
            ? `${formatBuscaCurrency(row.min_budget)} — ${formatBuscaCurrency(row.max_budget)}`
            : "—",
      },
    ],
    eventos: sortEvents(events),
  };
}

async function vendaTimeline(supabase: Db, id: string): Promise<BuscaTimeline> {
  const row = await single(supabase, "real_estate_sales", "*", id);
  const [{ data: payments }, { data: commissions }, { data: docs }] = await Promise.all([
    supabase
      .from("sale_payments")
      .select("id, kind, sequence, amount, due_date, paid, paid_at")
      .eq("sale_id", id)
      .order("due_date", { ascending: true }),
    supabase
      .from("sale_commission_installments")
      .select("id, sequence, amount, due_date, paid, paid_at")
      .eq("sale_id", id)
      .order("due_date", { ascending: true }),
    supabase
      .from("sale_documents")
      .select("id, file_name, category, created_at")
      .eq("sale_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const events: BuscaTimelineEvento[] = [
    evt("created", row.created_at, "Venda registrada", row.responsible_agent ? `Responsável: ${row.responsible_agent}` : undefined, "criação"),
  ];
  if (row.sale_date) {
    events.push(evt("saledate", `${row.sale_date}T12:00:00Z`, "Data da venda", formatBuscaCurrency(row.sale_value), "venda"));
  }
  if (row.updated_at && row.updated_at !== row.created_at) {
    events.push(evt("updated", row.updated_at, "Registro atualizado", undefined, "atualização"));
  }
  for (const p of payments ?? []) {
    events.push(
      evt(
        `p-${p.id}`,
        p.paid && p.paid_at ? p.paid_at : `${p.due_date}T12:00:00Z`,
        p.paid ? `Parcela ${p.sequence} paga` : `Parcela ${p.sequence} prevista`,
        `${formatBuscaCurrency(p.amount)} · vencimento ${p.due_date}`,
        "pagamento",
      ),
    );
  }
  for (const c of commissions ?? []) {
    events.push(
      evt(
        `c-${c.id}`,
        c.paid && c.paid_at ? c.paid_at : `${c.due_date}T12:00:00Z`,
        c.paid ? `Comissão ${c.sequence} paga` : `Comissão ${c.sequence} prevista`,
        `${formatBuscaCurrency(c.amount)} · vencimento ${c.due_date}`,
        "comissão",
      ),
    );
  }
  for (const d of docs ?? []) {
    events.push(evt(`d-${d.id}`, d.created_at, "Documento anexado", `${d.file_name} (${d.category})`, "documento"));
  }

  return {
    categoria: "venda",
    id,
    titulo: row.property_name,
    subtitulo: joinParts([row.property_address, row.property_neighborhood]),
    status: row.sale_status,
    rota: "/vendas",
    campos: [
      { label: "Comprador", valor: row.buyer_name ?? "—" },
      { label: "Contato", valor: joinParts([row.buyer_phone, row.buyer_email]) || "—" },
      { label: "Valor da venda", valor: formatBuscaCurrency(row.sale_value) },
      { label: "Comissão", valor: formatBuscaCurrency(row.commission_value) },
      { label: "Responsável", valor: row.responsible_agent ?? "—" },
      { label: "Documentação", valor: row.document_status ?? "—" },
      { label: "Imobiliária", valor: row.imobiliaria ?? "—" },
    ],
    eventos: sortEvents(events),
  };
}

async function contratoTimeline(supabase: Db, id: string): Promise<BuscaTimeline> {
  const row = await single(
    supabase,
    "rental_contracts",
    "*, rental_properties(apelido, logradouro, bairro, cidade, proprietario_nome), rental_tenants(nome, telefone, email)",
    id,
  );
  const { data: docs } = await supabase
    .from("rental_contract_documents")
    .select("id, file_name, category, created_at")
    .eq("contract_id", id)
    .order("created_at", { ascending: false });

  const events: BuscaTimelineEvento[] = [
    evt("created", row.created_at, "Contrato cadastrado", undefined, "criação"),
  ];
  if (row.data_inicio) {
    events.push(evt("start", `${row.data_inicio}T12:00:00Z`, "Início da vigência", undefined, "vigência"));
  }
  if (row.data_fim) {
    events.push(evt("end", `${row.data_fim}T12:00:00Z`, "Fim da vigência", undefined, "vigência"));
  }
  if (row.proximo_vencimento) {
    events.push(
      evt(
        "next",
        `${row.proximo_vencimento}T12:00:00Z`,
        "Próximo vencimento",
        `${formatBuscaCurrency(row.valor_mensal)} · ${row.payment_status ?? ""}`.trim(),
        "financeiro",
      ),
    );
  }
  if (row.data_encerramento) {
    events.push(evt("closed", `${row.data_encerramento}T12:00:00Z`, "Contrato encerrado", undefined, "encerramento"));
  }
  if (row.updated_at && row.updated_at !== row.created_at) {
    events.push(evt("updated", row.updated_at, "Contrato atualizado", undefined, "atualização"));
  }
  for (const d of docs ?? []) {
    events.push(evt(`d-${d.id}`, d.created_at, "Documento anexado", `${d.file_name} (${d.category})`, "documento"));
  }

  return {
    categoria: "contrato",
    id,
    titulo: row.rental_properties?.apelido ?? "Contrato de locação",
    subtitulo: joinParts([
      row.rental_tenants?.nome && `Inquilino: ${row.rental_tenants.nome}`,
      row.rental_properties?.logradouro,
    ]),
    status: row.status,
    rota: "/contratos",
    campos: [
      { label: "Valor mensal", valor: formatBuscaCurrency(row.valor_mensal) },
      { label: "Comissão mensal", valor: formatBuscaCurrency(row.comissao_mensal) },
      { label: "Garantia", valor: row.garantia_tipo ?? "—" },
      { label: "Status de pagamento", valor: row.payment_status ?? "—" },
      { label: "Dia de vencimento", valor: String(row.dia_vencimento ?? "—") },
      { label: "Proprietário", valor: row.rental_properties?.proprietario_nome ?? "—" },
      { label: "Contato do inquilino", valor: row.rental_tenants?.telefone ?? "—" },
      { label: "Imobiliária", valor: row.brand ?? "—" },
    ],
    eventos: sortEvents(events),
  };
}

async function agenciamentoTimeline(supabase: Db, id: string): Promise<BuscaTimeline> {
  const row = await single(supabase, "agenciamentos", "*", id);
  const { data: bonuses } = await supabase
    .from("agenciamento_bonuses")
    .select("id, categoria, nivel, status, listings_count, placas_count, achieved_at")
    .eq("corretor_id", row.corretor_id)
    .order("achieved_at", { ascending: false })
    .limit(20);

  const events: BuscaTimelineEvento[] = [
    evt("created", row.created_at, "Agenciamento cadastrado", row.criado_por_nome ? `Por ${row.criado_por_nome}` : undefined, "criação"),
  ];
  if (row.data_agenciamento) {
    events.push(evt("date", `${row.data_agenciamento}T12:00:00Z`, "Data do agenciamento", row.origem, "captação"));
  }
  if (row.validado && row.validado_em) {
    events.push(
      evt("valid", row.validado_em, "Agenciamento validado", row.validado_por_nome ? `Por ${row.validado_por_nome}` : undefined, "validação"),
    );
  }
  if (row.updated_at && row.updated_at !== row.created_at) {
    events.push(
      evt(
        "updated",
        row.updated_at,
        "Registro atualizado",
        `Classificação atual: ${row.finalidade ?? "sem classificação"}`,
        "atualização",
      ),
    );
  }
  for (const b of bonuses ?? []) {
    events.push(
      evt(
        `b-${b.id}`,
        b.achieved_at,
        `Bonificação nível ${b.nivel} (${b.categoria})`,
        `${b.listings_count} agenciamentos · ${b.placas_count} placas · ${b.status}`,
        "bonificação",
      ),
    );
  }

  const marcos = [
    ["Fotos realizadas", row.fotos_realizadas],
    ["Fotos no Drive", row.fotos_drive],
    ["Placa instalada", row.placa_instalada],
    ["Cadastrado no site", row.cadastrado_site],
    ["Vídeo realizado", row.video_realizado],
  ] as Array<[string, boolean]>;

  return {
    categoria: "agenciamento",
    id,
    titulo: row.endereco,
    subtitulo: joinParts([row.bairro, row.cidade, row.tipo_imovel]),
    status: row.status,
    rota: "/agenciamentos",
    campos: [
      { label: "Código Morar", valor: row.codigo_morar ?? "—" },
      { label: "Código Cordial", valor: row.codigo_cordial ?? "—" },
      { label: "Classificação", valor: row.finalidade ?? "Sem classificação" },
      { label: "Corretor", valor: row.corretor_nome ?? "—" },
      { label: "Proprietário", valor: row.proprietario_nome ?? "—" },
      { label: "Contato", valor: row.proprietario_telefone ?? "—" },
      { label: "Imobiliária", valor: row.imobiliaria ?? "—" },
      { label: "Validado", valor: row.validado ? "Sim" : "Não" },
      ...marcos.map(([label, done]) => ({ label, valor: done ? "Concluído" : "Pendente" })),
    ],
    eventos: sortEvents(events),
  };
}

async function imovelTimeline(supabase: Db, id: string): Promise<BuscaTimeline> {
  const row = await single(supabase, "rental_properties", "*", id);
  const { data: contracts } = await supabase
    .from("rental_contracts")
    .select("id, status, data_inicio, data_fim, valor_mensal, created_at, rental_tenants(nome)")
    .eq("property_id", id)
    .order("created_at", { ascending: false });

  const events: BuscaTimelineEvento[] = [
    evt("created", row.created_at, "Imóvel cadastrado", undefined, "criação"),
  ];
  if (row.updated_at && row.updated_at !== row.created_at) {
    events.push(evt("updated", row.updated_at, "Cadastro atualizado", undefined, "atualização"));
  }
  for (const c of contracts ?? []) {
    events.push(
      evt(
        `c-${c.id}`,
        c.created_at,
        "Contrato vinculado",
        joinParts([
          c.rental_tenants?.nome && `Inquilino: ${c.rental_tenants.nome}`,
          formatBuscaCurrency(c.valor_mensal),
          c.status,
        ]),
        "contrato",
      ),
    );
  }

  return {
    categoria: "imovel",
    id,
    titulo: row.apelido,
    subtitulo: joinParts([row.logradouro, row.numero, row.bairro, row.cidade], ", "),
    status: row.status,
    rota: "/alugueis",
    campos: [
      { label: "Tipo", valor: row.tipo ?? "—" },
      { label: "Proprietário", valor: row.proprietario_nome ?? "—" },
      { label: "Contato", valor: row.proprietario_telefone ?? "—" },
      { label: "Valor sugerido", valor: formatBuscaCurrency(row.valor_sugerido) },
      { label: "Quartos", valor: String(row.quartos ?? "—") },
      { label: "Imobiliária", valor: row.brand ?? "—" },
    ],
    eventos: sortEvents(events),
  };
}

async function inquilinoTimeline(supabase: Db, id: string): Promise<BuscaTimeline> {
  const row = await single(supabase, "rental_tenants", "*", id);
  const { data: contracts } = await supabase
    .from("rental_contracts")
    .select("id, status, valor_mensal, created_at, rental_properties(apelido)")
    .eq("tenant_id", id)
    .order("created_at", { ascending: false });

  const events: BuscaTimelineEvento[] = [
    evt("created", row.created_at, "Inquilino cadastrado", undefined, "criação"),
  ];
  if (row.updated_at && row.updated_at !== row.created_at) {
    events.push(evt("updated", row.updated_at, "Cadastro atualizado", undefined, "atualização"));
  }
  for (const c of contracts ?? []) {
    events.push(
      evt(
        `c-${c.id}`,
        c.created_at,
        "Contrato vinculado",
        joinParts([c.rental_properties?.apelido, formatBuscaCurrency(c.valor_mensal), c.status]),
        "contrato",
      ),
    );
  }

  return {
    categoria: "inquilino",
    id,
    titulo: row.nome,
    subtitulo: joinParts([row.telefone, row.email]),
    rota: "/alugueis",
    campos: [
      { label: "CPF/CNPJ", valor: row.cpf_cnpj ?? "—" },
      { label: "Profissão", valor: row.profissao ?? "—" },
      { label: "Renda aproximada", valor: formatBuscaCurrency(row.renda_aproximada) },
      { label: "Endereço", valor: row.endereco ?? "—" },
    ],
    eventos: sortEvents(events),
  };
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}min`;
}
