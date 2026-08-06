import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildCorretoresOperationalModel,
  getCorretorPeriodRange,
  type AgencyFilter,
  type CorretorAgendaRecord,
  type CorretorAssignmentRecord,
  type CorretorAttendanceHistoryRecord,
  type CorretorAttendanceRecord,
  type CorretorCommissionInstallmentRecord,
  type CorretorListingRecord,
  type CorretorRentalRecord,
  type CorretorResponseRecord,
  type CorretorRosterRecord,
  type CorretorSaleRecord,
  type CorretoresOperationalSources,
} from "@/services/corretores";
import type {
  CorretorPeriodFilter,
  CorretorSourceKey,
  CorretorSourceStatus,
  CorretoresOperationalResult,
} from "@/types/corretor";

export type EquipePeriodo = CorretorPeriodFilter;
export type EquipeAgencyFilter = AgencyFilter;

export type EquipePerformanceRow = CorretoresOperationalResult["rows"][number];
export type EquipePerformanceResult = CorretoresOperationalResult;

type EquipeInput = {
  periodo?: EquipePeriodo;
  imobiliaria?: EquipeAgencyFilter;
};

type QueryResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type ResponseRpcRow = {
  broker_id: string;
  avg_seconds: number | null;
  median_seconds: number | null;
  fastest_seconds: number | null;
  slowest_seconds: number | null;
  completed_count: number;
  pending_count: number;
};

function normalizeInput(data: EquipeInput | undefined): {
  periodo: EquipePeriodo;
  imobiliaria: EquipeAgencyFilter;
} {
  const periodo: EquipePeriodo =
    data?.periodo === "ultimos_30" ||
    data?.periodo === "trimestre" ||
    data?.periodo === "ano" ||
    data?.periodo === "mes"
      ? data.periodo
      : "mes";
  const imobiliaria: EquipeAgencyFilter =
    data?.imobiliaria === "cordial" || data?.imobiliaria === "morar" ? data.imobiliaria : "todas";
  return { periodo, imobiliaria };
}

function sourceStatus(): CorretorSourceStatus {
  return {
    atendimentos: "ready",
    agenda: "ready",
    agenciamentos: "ready",
    vendas: "ready",
    alugueis: "ready",
    respostas: "ready",
  };
}

function resultData<T>(result: PromiseSettledResult<QueryResult<T>>, source: CorretorSourceKey) {
  if (result.status === "rejected" || result.value.error) {
    const message =
      result.status === "rejected"
        ? result.reason instanceof Error
          ? result.reason.message
          : "consulta rejeitada"
        : result.value.error?.message;
    console.error(`[corretores] fonte ${source} indisponível: ${message ?? "erro desconhecido"}`);
    return { rows: [] as T[], failed: true };
  }
  return { rows: result.value.data ?? [], failed: false };
}

function mergeResponseRows(groups: ResponseRpcRow[][]): CorretorResponseRecord[] {
  const merged = new Map<
    string,
    {
      completed: number;
      pending: number;
      weightedSeconds: number;
      fastest: number | null;
      slowest: number | null;
      medians: number[];
    }
  >();
  for (const group of groups) {
    for (const row of group) {
      const completed = Number(row.completed_count) || 0;
      const pending = Number(row.pending_count) || 0;
      const current = merged.get(row.broker_id) ?? {
        completed: 0,
        pending: 0,
        weightedSeconds: 0,
        fastest: null,
        slowest: null,
        medians: [],
      };
      current.completed += completed;
      current.pending += pending;
      if (row.avg_seconds != null && completed > 0) {
        current.weightedSeconds += Number(row.avg_seconds) * completed;
      }
      if (row.fastest_seconds != null && row.fastest_seconds >= 0) {
        current.fastest =
          current.fastest == null
            ? row.fastest_seconds
            : Math.min(current.fastest, row.fastest_seconds);
      }
      if (row.slowest_seconds != null && row.slowest_seconds >= 0) {
        current.slowest =
          current.slowest == null
            ? row.slowest_seconds
            : Math.max(current.slowest, row.slowest_seconds);
      }
      if (row.median_seconds != null) current.medians.push(Number(row.median_seconds));
      merged.set(row.broker_id, current);
    }
  }
  return Array.from(merged.entries()).map(([brokerId, value]) => ({
    brokerId,
    averageSeconds:
      value.completed > 0 ? Math.max(0, value.weightedSeconds / value.completed) : null,
    medianSeconds: value.medians.length === 1 && groups.length === 1 ? value.medians[0] : null,
    fastestSeconds: value.fastest,
    slowestSeconds: value.slowest,
    completedCount: value.completed,
    pendingCount: value.pending,
  }));
}

export const getEquipePerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data?: EquipeInput) => data ?? {})
  .handler(async ({ data, context }): Promise<EquipePerformanceResult> => {
    const { periodo, imobiliaria } = normalizeInput(data);
    const now = new Date();
    const range = getCorretorPeriodRange(periodo, now);
    const startIso = range.start.toISOString();
    const endIso = range.end.toISOString();
    const startDate = startIso.slice(0, 10);
    const endDate =
      periodo === "ultimos_30"
        ? new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Sao_Paulo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(now.getTime() + 86_400_000))
        : endIso.slice(0, 10);

    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin) {
      return buildCorretoresOperationalModel({
        periodo,
        agency: imobiliaria,
        sources: {
          roster: [],
          attendances: [],
          assignments: [],
          attendanceHistory: [],
          agenda: [],
          listings: [],
          sales: [],
          commissionInstallments: [],
          rentals: [],
          responses: [],
        },
        now,
      });
    }

    const [profilesResult, assignableResult, callerAgenciesResult] = await Promise.all([
      context.supabase.rpc("list_corretores"),
      context.supabase.rpc("list_assignable_brokers", {
        _agency: imobiliaria === "todas" ? undefined : imobiliaria,
      }),
      context.supabase.from("user_agencies").select("agency").eq("user_id", context.userId),
    ]);
    if (profilesResult.error) throw new Error(profilesResult.error.message);
    if (assignableResult.error) throw new Error(assignableResult.error.message);
    if (callerAgenciesResult.error) throw new Error(callerAgenciesResult.error.message);
    const callerAgencies = Array.from(
      new Set(
        (callerAgenciesResult.data ?? [])
          .map((row) => row.agency)
          .filter(
            (agency): agency is "cordial" | "morar" => agency === "cordial" || agency === "morar",
          ),
      ),
    );
    const scopeAgencies: Array<"cordial" | "morar" | "ambas"> =
      imobiliaria === "todas"
        ? [...callerAgencies, "ambas"]
        : callerAgencies.includes(imobiliaria)
          ? [imobiliaria, "ambas"]
          : [];

    const brokerProfiles = new Map(
      (profilesResult.data ?? [])
        .filter((profile) => profile.role === "corretor" || profile.role === "admin")
        .map((profile) => [profile.id, profile]),
    );
    const roster: CorretorRosterRecord[] = (assignableResult.data ?? [])
      .filter((profile) => brokerProfiles.has(profile.id))
      .map((profile) => {
        const details = brokerProfiles.get(profile.id);
        return {
          id: profile.id,
          nome: profile.nome,
          iniciais: details?.iniciais ?? null,
          cargo: details?.cargo ?? null,
          agencies: profile.agencies ?? [],
        };
      });
    const brokerIds = roster.map((profile) => profile.id);
    if (brokerIds.length === 0 || scopeAgencies.length === 0) {
      return buildCorretoresOperationalModel({
        periodo,
        agency: imobiliaria,
        sources: {
          roster,
          attendances: [],
          assignments: [],
          attendanceHistory: [],
          agenda: [],
          listings: [],
          sales: [],
          commissionInstallments: [],
          rentals: [],
          responses: [],
        },
        now,
      });
    }

    // The notification security model intentionally revokes direct SELECT on
    // attendance_assignments. Current operational state comes from the same
    // safe attendance columns used by Atendimentos, while assignment cycles
    // are reconstructed from persisted history and the management timing RPC.
    const attendancesQuery = context.supabase
      .from("attendances")
      .select("id,corretor_id,cliente_nome,status,pipeline_stage,imobiliaria,created_at,updated_at")
      .in("corretor_id", brokerIds)
      .in("imobiliaria", scopeAgencies)
      .or(
        `and(created_at.gte.${startIso},created_at.lt.${endIso}),and(updated_at.gte.${startIso},updated_at.lt.${endIso})`,
      );

    const assignmentHistoryQuery = context.supabase
      .from("attendance_history")
      .select("id,attendance_id,event_type,new_value,created_at")
      .eq("event_type", "assignment_created")
      .gte("created_at", startIso)
      .lt("created_at", endIso);

    const stageHistoryQuery = context.supabase
      .from("attendance_history")
      .select("id,attendance_id,actor_id,event_type,new_value,created_at")
      .eq("event_type", "stage_change")
      .in("actor_id", brokerIds)
      .gte("created_at", startIso)
      .lt("created_at", endIso);

    const agendaQuery = context.supabase
      .from("agenda_events")
      .select(
        "id,titulo,tipo,status,inicio,concluido_em,owner_user_id,imobiliaria,agenda_event_participants(user_id)",
      )
      .is("deleted_at", null)
      .in("imobiliaria", scopeAgencies)
      .or(
        `and(inicio.gte.${startIso},inicio.lt.${endIso}),and(concluido_em.gte.${startIso},concluido_em.lt.${endIso})`,
      );

    const listingsQuery = context.supabase
      .from("agenciamentos")
      .select(
        "id,corretor_id,created_by,endereco,status,data_agenciamento,imobiliaria,fotos_realizadas,fotos_drive,placa_instalada,cadastrado_site,video_realizado,validado",
      )
      .in("imobiliaria", scopeAgencies)
      .gte("data_agenciamento", startDate)
      .lt("data_agenciamento", endDate);

    const salesQuery = context.supabase
      .from("real_estate_sales")
      .select(
        "id,user_id,property_name,sale_status,sale_value,commission_value,sale_date,imobiliaria",
      )
      .in("imobiliaria", scopeAgencies)
      .gte("sale_date", startDate)
      .lt("sale_date", endDate);

    const rentalsQuery = context.supabase
      .from("rental_contracts")
      .select(
        "id,created_by,status,brand,valor_mensal,created_at,data_inicio,data_fim,data_encerramento",
      )
      .in("brand", scopeAgencies);

    const responseAgencies = imobiliaria === "todas" ? [null] : ([imobiliaria, "ambas"] as const);
    const responsePromise = Promise.all(
      responseAgencies.map((agency) =>
        context.supabase.rpc("get_corretores_response_metrics", {
          _start: startIso,
          _end: endIso,
          _imobiliaria: agency ?? undefined,
        }),
      ),
    ).then((results): QueryResult<ResponseRpcRow[]> => {
      const error = results.find((result) => result.error)?.error ?? null;
      return {
        data: error ? null : results.map((result) => (result.data ?? []) as ResponseRpcRow[]),
        error,
      };
    });

    const firstStage = await Promise.allSettled([
      attendancesQuery as unknown as PromiseLike<QueryResult<unknown>>,
      assignmentHistoryQuery as unknown as PromiseLike<QueryResult<unknown>>,
      stageHistoryQuery as unknown as PromiseLike<QueryResult<unknown>>,
      agendaQuery as unknown as PromiseLike<QueryResult<unknown>>,
      listingsQuery as unknown as PromiseLike<QueryResult<unknown>>,
      salesQuery as unknown as PromiseLike<QueryResult<unknown>>,
      rentalsQuery as unknown as PromiseLike<QueryResult<unknown>>,
      responsePromise,
    ]);

    const attendancesRaw = resultData(firstStage[0], "atendimentos");
    const assignmentsRaw = resultData(firstStage[1], "atendimentos");
    const historyRaw = resultData(firstStage[2], "atendimentos");
    const agendaRaw = resultData(firstStage[3], "agenda");
    const listingsRaw = resultData(firstStage[4], "agenciamentos");
    const salesRaw = resultData(firstStage[5], "vendas");
    const rentalsRaw = resultData(firstStage[6], "alugueis");
    const responsesRaw = resultData(firstStage[7], "respostas");
    const statuses = sourceStatus();
    if (attendancesRaw.failed || assignmentsRaw.failed || historyRaw.failed) {
      statuses.atendimentos = "error";
    }
    if (agendaRaw.failed) statuses.agenda = "error";
    if (listingsRaw.failed) statuses.agenciamentos = "error";
    if (salesRaw.failed) statuses.vendas = "error";
    if (rentalsRaw.failed) statuses.alugueis = "error";
    if (responsesRaw.failed) statuses.respostas = "error";

    const mappedAttendances: CorretorAttendanceRecord[] = attendancesRaw.rows.map((value) => {
      const row = value as {
        id: string;
        corretor_id: string | null;
        cliente_nome: string;
        status: string;
        pipeline_stage: string;
        imobiliaria: string;
        created_at: string;
        updated_at: string;
      };
      return {
        id: row.id,
        corretorId: row.corretor_id,
        clienteNome: row.cliente_nome,
        status: row.status,
        pipelineStage: row.pipeline_stage,
        imobiliaria: row.imobiliaria,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
    const historyAttendanceIds = Array.from(
      new Set(
        [...assignmentsRaw.rows, ...historyRaw.rows]
          .map((value) => (value as { attendance_id?: unknown }).attendance_id)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      ),
    );
    const saleIds = salesRaw.rows.map((value) => (value as { id: string }).id);

    const historyAgencyPromise: PromiseLike<QueryResult<unknown>> =
      historyAttendanceIds.length > 0
        ? (context.supabase
            .from("attendances")
            .select("id,imobiliaria")
            .in("id", historyAttendanceIds)
            .in("imobiliaria", scopeAgencies) as unknown as PromiseLike<QueryResult<unknown>>)
        : Promise.resolve({ data: [], error: null });
    const installmentsPromise: PromiseLike<QueryResult<unknown>> =
      saleIds.length > 0
        ? (context.supabase
            .from("sale_commission_installments")
            .select("id,sale_id,amount,paid,paid_at")
            .in("sale_id", saleIds) as unknown as PromiseLike<QueryResult<unknown>>)
        : Promise.resolve({ data: [], error: null });

    const secondStage = await Promise.allSettled([historyAgencyPromise, installmentsPromise]);
    const historyAgenciesRaw = resultData(secondStage[0], "atendimentos");
    const installmentsRaw = resultData(secondStage[1], "vendas");
    if (historyAgenciesRaw.failed) statuses.atendimentos = "error";
    if (installmentsRaw.failed) statuses.vendas = "error";

    const attendanceAgency = new Map(
      mappedAttendances.map((attendance) => [attendance.id, attendance.imobiliaria]),
    );
    for (const value of historyAgenciesRaw.rows) {
      const row = value as { id: string; imobiliaria: string };
      attendanceAgency.set(row.id, row.imobiliaria);
    }
    const assignments: CorretorAssignmentRecord[] = assignmentsRaw.rows.flatMap((value) => {
      const row = value as {
        id: string;
        attendance_id: string;
        new_value: unknown;
        created_at: string;
      };
      const next =
        row.new_value && typeof row.new_value === "object" && !Array.isArray(row.new_value)
          ? (row.new_value as Record<string, unknown>)
          : null;
      const brokerId = typeof next?.broker_id === "string" ? next.broker_id : null;
      const persistedAgency = attendanceAgency.get(row.attendance_id);
      if (!brokerId || !brokerIds.includes(brokerId) || !persistedAgency) return [];
      return [
        {
          id: row.id,
          attendanceId: row.attendance_id,
          brokerId,
          assignedAt: row.created_at,
          status: "persisted",
          imobiliaria: persistedAgency,
        } satisfies CorretorAssignmentRecord,
      ];
    });

    const sources: CorretoresOperationalSources = {
      roster,
      assignments,
      attendances: mappedAttendances,
      attendanceHistory: historyRaw.rows.flatMap((value) => {
        const row = value as {
          id: string;
          attendance_id: string;
          actor_id: string | null;
          event_type: string;
          new_value: unknown;
          created_at: string;
        };
        const persistedAgency = attendanceAgency.get(row.attendance_id);
        if (!persistedAgency) return [];
        return [
          {
            id: row.id,
            attendanceId: row.attendance_id,
            actorId: row.actor_id,
            eventType: row.event_type,
            newValue: row.new_value,
            createdAt: row.created_at,
            imobiliaria: persistedAgency,
          } satisfies CorretorAttendanceHistoryRecord,
        ];
      }),
      agenda: agendaRaw.rows.map((value) => {
        const row = value as {
          id: string;
          titulo: string;
          tipo: string;
          status: string;
          inicio: string;
          concluido_em: string | null;
          owner_user_id: string | null;
          imobiliaria: string;
          agenda_event_participants: Array<{ user_id: string }> | null;
        };
        return {
          id: row.id,
          title: row.titulo,
          type: row.tipo,
          status: row.status,
          startsAt: row.inicio,
          completedAt: row.concluido_em,
          ownerId: row.owner_user_id,
          participants: (row.agenda_event_participants ?? []).map((participant) => ({
            userId: participant.user_id,
          })),
          imobiliaria: row.imobiliaria,
        } satisfies CorretorAgendaRecord;
      }),
      listings: listingsRaw.rows.map((value) => {
        const row = value as {
          id: string;
          corretor_id: string | null;
          created_by: string | null;
          endereco: string;
          status: string;
          data_agenciamento: string;
          imobiliaria: string;
          fotos_realizadas: boolean;
          fotos_drive: boolean;
          placa_instalada: boolean;
          cadastrado_site: boolean;
          video_realizado: boolean;
          validado: boolean;
        };
        return {
          id: row.id,
          brokerId: row.corretor_id,
          createdBy: row.created_by,
          address: row.endereco,
          status: row.status,
          date: row.data_agenciamento,
          imobiliaria: row.imobiliaria,
          checklist: [
            row.fotos_realizadas,
            row.fotos_drive,
            row.placa_instalada,
            row.cadastrado_site,
            row.video_realizado,
            row.validado,
          ],
        } satisfies CorretorListingRecord;
      }),
      sales: salesRaw.rows.map((value) => {
        const row = value as {
          id: string;
          user_id: string;
          property_name: string;
          sale_status: string;
          sale_value: number;
          commission_value: number | null;
          sale_date: string;
          imobiliaria: string;
        };
        return {
          id: row.id,
          ownerId: row.user_id,
          propertyName: row.property_name,
          status: row.sale_status,
          value: Number(row.sale_value) || 0,
          commissionValue: row.commission_value == null ? null : Number(row.commission_value) || 0,
          date: row.sale_date,
          imobiliaria: row.imobiliaria,
        } satisfies CorretorSaleRecord;
      }),
      commissionInstallments: installmentsRaw.rows.map((value) => {
        const row = value as {
          id: string;
          sale_id: string;
          amount: number;
          paid: boolean;
          paid_at: string | null;
        };
        return {
          id: row.id,
          saleId: row.sale_id,
          amount: Number(row.amount) || 0,
          paid: row.paid,
          paidAt: row.paid_at,
        } satisfies CorretorCommissionInstallmentRecord;
      }),
      rentals: rentalsRaw.rows.map((value) => {
        const row = value as {
          id: string;
          created_by: string;
          status: string;
          brand: string;
          valor_mensal: number;
          created_at: string;
          data_inicio: string;
          data_fim: string;
          data_encerramento: string | null;
        };
        return {
          id: row.id,
          createdBy: row.created_by,
          status: row.status,
          brand: row.brand,
          monthlyValue: Number(row.valor_mensal) || 0,
          createdAt: row.created_at,
          startsAt: row.data_inicio,
          endsAt: row.data_fim,
          closedAt: row.data_encerramento,
        } satisfies CorretorRentalRecord;
      }),
      responses: mergeResponseRows(responsesRaw.rows as ResponseRpcRow[][]),
    };

    try {
      return buildCorretoresOperationalModel({
        periodo,
        agency: imobiliaria,
        sources,
        sourceStatus: statuses,
        now,
      });
    } catch (error) {
      console.error(
        `[corretores] falha ao normalizar fontes: ${error instanceof Error ? error.message : "erro desconhecido"}`,
      );
      throw error;
    }
  });
