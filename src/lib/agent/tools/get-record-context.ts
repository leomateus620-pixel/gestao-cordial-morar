import { z } from "zod";
import { assertAgentRole, operationalRoles, scopeAgency } from "../security";
import {
  attendanceQuery,
  attendanceRecord,
  clientQuery,
  clientRecord,
  PROPERTY_COLUMNS,
  propertyRecord,
  rows,
  uuidSchema,
  withPublicCovers,
} from "./common";
import { AGENDA_COLUMNS, agendaRecord } from "./agenda-today";
import { agenciamentoQuery, agenciamentoRecord } from "./expiring-agenciamentos";
import { rentalColumns, rentalRecord } from "./rentals-overdue";
import { result, type AgentTool } from "./types";
const historyTitles = new Map([
  ["created", "Atendimento criado"],
  ["create", "Atendimento criado"],
  ["insert", "Atendimento criado"],
  ["stage_change", "Etapa alterada"],
  ["status_change", "Status alterado"],
  ["note", "Nova anotação"],
  ["note_added", "Nova anotação"],
  ["assignment", "Corretor vinculado"],
  ["assigned", "Corretor vinculado"],
  ["broker_change", "Corretor alterado"],
  ["first_open", "Aberto pelo corretor"],
  ["opened", "Atendimento aberto"],
  ["updated", "Atendimento atualizado"],
  ["update", "Atendimento atualizado"],
  ["converted", "Convertido em cliente"],
  ["conversion", "Convertido em cliente"],
  ["return_scheduled", "Retorno agendado"],
  ["lost", "Atendimento perdido"],
]);
export default {
  name: "get_record_context",
  title: "Consultar registro em foco",
  description:
    "Dados mínimos de um registro autorizado para o contexto da tela. Sem contatos, endereço preciso, observações privadas ou dados de proprietários.",
  roles: [...operationalRoles, "financeiro"],
  inputSchema: z
    .object({
      kind: z.enum(["property", "client", "attendance", "rental", "agenciamento", "agenda"]),
      id: uuidSchema,
    })
    .strict(),
  async handler({ kind, id }, ctx) {
    let query: any;
    let map: (row: any) => any;
    switch (kind) {
      case "property":
        assertAgentRole(ctx, operationalRoles);
        query = ctx.supabase.from("properties").select(PROPERTY_COLUMNS).is("archived_at", null);
        map = propertyRecord;
        break;
      case "client":
        query = clientQuery(ctx);
        map = clientRecord;
        break;
      case "attendance":
        assertAgentRole(ctx, operationalRoles);
        query = attendanceQuery(ctx);
        map = attendanceRecord;
        break;
      case "rental":
        assertAgentRole(ctx, ["admin", "secretaria"]);
        query = scopeAgency(
          ctx.supabase.from("rental_contracts").select(rentalColumns(ctx)),
          ctx,
          "brand",
          false,
        );
        map = (r) => rentalRecord(r, ctx);
        break;
      case "agenciamento":
        assertAgentRole(ctx, operationalRoles);
        query = agenciamentoQuery(ctx);
        map = agenciamentoRecord;
        break;
      case "agenda":
        assertAgentRole(ctx, operationalRoles);
        query = scopeAgency(
          ctx.supabase.from("agenda_events").select(AGENDA_COLUMNS).is("deleted_at", null),
          ctx,
          "imobiliaria",
        );
        map = agendaRecord;
        break;
      default:
        throw new Error("Tipo de registro inválido.");
    }
    const data = await rows(query.eq("id", id).limit(1), ctx);
    let record = data[0] ? { kind, ...map(data[0]) } : null;
    if (record && kind === "property") record = (await withPublicCovers([record], ctx))[0];
    // Query child data only after the caller has read the parent through the same
    // role, agency and ownership filters. Historic descriptions/metadata remain private.
    let historyData: any[] = [];
    if (record && kind === "attendance") {
      historyData = await rows(
        ctx.supabase
          .from("attendance_history")
          .select("id,event_type,actor_name,created_at")
          .eq("attendance_id", record.id)
          .order("created_at", { ascending: false })
          .limit(21),
        ctx,
      );
    }
    const history = historyData.slice(0, 20).map((event) => ({
      id: event.id,
      titulo: historyTitles.get(event.event_type) ?? "Atualização do atendimento",
      ator: event.actor_name,
      criadoEm: event.created_at,
      href: record!.href,
    }));
    return result(
      record
        ? "Registro encontrado no seu escopo de acesso."
        : "Não encontrei esse registro nos dados que você pode acessar.",
      {
        record,
        total: record ? 1 : 0,
        ...(kind === "attendance" ? { history, historyLimited: historyData.length >= 20 } : {}),
      },
    );
  },
} satisfies AgentTool;
