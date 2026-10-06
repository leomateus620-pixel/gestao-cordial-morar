import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createImovelCore,
  updateImovelCore,
  type CreateImovelInput,
} from "@/lib/imoveis/imoveis.functions";
import { enqueuePropertySyncCore } from "@/lib/imoveis/publish.functions";
import {
  finalizePropertyAgencyCore,
  type FinalizePropertyAgencyInput,
} from "@/lib/agenciamentos/property-link.functions";
import {
  isFinalizeCompleted,
  keepDraftBroker,
  resolveFinalizeAgencyBroker,
} from "@/lib/imoveis/registration-rules";
import {
  prepareOwnedMorarRegistration,
  type OwnedMorarDecision,
} from "@/lib/morar-site/registration-workflow";

export type FinalizeRegistrationInput = {
  /** Rascunho já criado (fotos). Sem ele, o imóvel é criado pela chave de intenção. */
  propertyId?: string | null;
  clientIntentKey: string;
  values: CreateImovelInput;
  reservationIds?: string[];
  /** Dados da etapa de agenciamento; ausente = só o automático na publicação. */
  agency?: Omit<FinalizePropertyAgencyInput, "propertyId"> | null;
  /** Destinos para publicar; vazio = só catálogo. */
  publishProviders?: string[];
  /** Canal próprio independente do provedor ImobiBrasil. */
  publishOwnedMorar?: boolean;
};

export type StepStatus = "ok" | "skipped" | "error";
export type FinalizeRegistrationResult = {
  propertyId: string;
  agenciamentoId: string | null;
  steps: {
    save: StepStatus;
    codes: StepStatus;
    agency: StepStatus;
    publish: StepStatus;
    ownedMorar: StepStatus;
  };
  messages: string[];
  skippedImages?: number;
  /** Mesmo critério usado para marcar o cadastro como concluído. */
  completed: boolean;
  ownedMorarPublication?: OwnedMorarDecision;
};

/**
 * Conclusão do cadastro numa única chamada idempotente: salva, confirma
 * códigos, registra o agenciamento, envia aos sites e só então marca o
 * cadastro como concluído. Repetir (duplo clique, retry, aba fechada) nunca
 * duplica imóvel, código, agenciamento nem envio.
 */
export const finalizePropertyRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: FinalizeRegistrationInput) => {
    if (!data?.clientIntentKey && !data?.propertyId) throw new Error("Cadastro sem identificação.");
    const descricao = (data.agency?.descricao ?? "").trim();
    if (descricao.length > 800) throw new Error("A descrição deve ter no máximo 800 caracteres.");
    if (data.publishOwnedMorar !== undefined && typeof data.publishOwnedMorar !== "boolean")
      throw new Error("Intenção de publicação Morar inválida.");
    return data;
  })
  .handler(async ({ data, context }): Promise<FinalizeRegistrationResult> => {
    const messages: string[] = [];
    const steps: FinalizeRegistrationResult["steps"] = {
      save: "ok",
      codes: "skipped",
      agency: "skipped",
      publish: "skipped",
      ownedMorar: "skipped",
    };

    // Número acima do limite dos sites nunca conclui o cadastro.
    assertAddressNumber(data.values.numero);
    // 1) Salvar: rascunho existente é atualizado; senão, criado pela chave.
    let propertyId = data.propertyId ?? null;
    if (propertyId) {
      const { clientIntentKey: _k, asDraft: _d, ...rest } = data.values;
      // Corretor vazio no formulário não apaga o corretor gravado no rascunho.
      await updateImovelCore(context, { id: propertyId, ...keepDraftBroker(rest) });
    } else {
      const created = await createImovelCore(context, {
        ...data.values,
        clientIntentKey: data.clientIntentKey,
        asDraft: true,
      });
      propertyId = created.id;
    }

    const { data: state } = await context.supabase
      .from("properties")
      .select("id, registration_completed_at, corretor_id, created_by, revision")
      .eq("id", propertyId)
      .maybeSingle();
    if (!state) throw new Error("Imóvel não encontrado ou sem permissão.");

    // 2) Códigos: confirmar reservas (idempotente). Códigos que faltarem são
    // atribuídos na publicação, como no painel.
    const ids = (data.reservationIds ?? []).filter(Boolean);
    if (ids.length) {
      const { error } = await context.supabase
        .from("provider_code_reservations")
        .update({
          status: "committed",
          property_id: propertyId,
          committed_at: new Date().toISOString(),
        })
        .in("id", ids)
        .in("status", ["reserved", "committed"]);
      steps.codes = error ? "error" : "ok";
      if (error)
        messages.push(
          "Os códigos reservados não foram confirmados; serão atribuídos na publicação.",
        );
    }

    // 3) Agenciamento da etapa do assistente (mesma chave idempotente).
    // Admin/secretária concluindo: corretor do imóvel ou criador corretor,
    // nunca quem clicou. Sem candidato, não cria e o cadastro fica pendente.
    let agenciamentoId: string | null = null;
    let agencyPending = false;
    let brokerId: string | null = null;
    if (data.agency) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const row = state as { corretor_id: string | null; created_by: string | null };
      const ids = [context.userId, row.created_by].filter(Boolean) as string[];
      const { data: roleRows } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", ids);
      const roleMap = new Map<string, string[]>();
      for (const r of (roleRows ?? []) as Array<{ user_id: string; role: string }>) {
        roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
      }
      brokerId = resolveFinalizeAgencyBroker({
        actorId: context.userId,
        explicitCorretorId: data.agency.corretorId,
        propertyCorretorId: row.corretor_id,
        createdBy: row.created_by,
        rolesOf: (id) => roleMap.get(id) ?? [],
      });
      if (!brokerId) {
        agencyPending = true;
        steps.agency = "skipped";
        messages.push(
          "Agenciamento pendente: imóvel sem corretor definido. Defina o corretor e conclua de novo.",
        );
      }
    }
    if (data.agency && !agencyPending) {
      try {
        const saved = await finalizePropertyAgencyCore(context, {
          ...data.agency,
          corretorId: brokerId,
          descricao: (data.agency.descricao ?? "").trim(),
          propertyId,
        });
        agenciamentoId = saved.id;
        steps.agency = "ok";
      } catch (err) {
        steps.agency = "error";
        messages.push(`Agenciamento não registrado: ${(err as Error)?.message ?? "erro"}`);
      }
    }

    // 4) A própria Morar guarda a intenção ainda inativa. Só a marca durável
    // de conclusão permite ativação pelo servidor, sem depender de fila externa.
    let ownedMorarPublication: OwnedMorarDecision | undefined;
    if (data.publishOwnedMorar === true) {
      try {
        const { assertProviderScope } = await import("@/lib/imoveis/sync-helpers.server");
        await assertProviderScope(context.supabase as never, context.userId, ["morar"]);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { ensureAutoAgency } = await import("@/lib/imoveis/registration.server");
        const result = await prepareOwnedMorarRegistration({
          persistIntent: async () => {
            const { data: decision, error } = await supabaseAdmin.rpc(
              "morar_site_request_publication" as never,
              {
                _property_id: propertyId,
                _requested_by: context.userId,
                _publish: true,
                _expected_revision: state.revision,
                _review_media: true,
                _areas_m2: false,
              } as never,
            );
            if (error) throw new Error(error.message);
            return decision as OwnedMorarDecision;
          },
          ensureAgency: () =>
            ensureAutoAgency({
              propertyId: propertyId!,
              publisherId: context.userId,
              providers: [
                ...new Set([
                  ...(data.publishProviders ?? []).filter((p) => p === "cordial" || p === "morar"),
                  "morar",
                ]),
              ],
            }),
        });
        ownedMorarPublication = result.decision;
        agenciamentoId = agenciamentoId ?? result.agency.id ?? null;
        if (steps.agency !== "error") {
          steps.agency = "ok";
          agencyPending = false;
        }
        steps.ownedMorar = "ok";
        try {
          const { enqueueImageJobs } = await import("@/lib/imoveis/image-pipeline.server");
          const images = await enqueueImageJobs(supabaseAdmin, propertyId);
          if (images.enqueued > 0) {
            messages.push(
              "Fotos do site Morar aguardando processamento da marca. Elas só aparecem quando o arquivo final for confirmado.",
            );
            const { kickOwnedMorarImageWorker } =
              await import("@/lib/morar-site/image-worker.server");
            await kickOwnedMorarImageWorker();
          }
        } catch {
          // The transaction stored the destination intent. The existing
          // private worker recovers it; never enqueue an external provider.
          messages.push(
            "A intenção das fotos Morar foi salva; processamento pendente. Confira as fotos no Gestão antes de divulgar.",
          );
        }
        if (result.decision.pendingReview)
          messages.push(
            "A intenção do site Morar foi salva. Publicação aguardando confirmação de autorização ou disponibilidade em Configurações → Site público Morar.",
          );
      } catch (err) {
        steps.ownedMorar = "error";
        messages.push(`Site próprio Morar pendente: ${(err as Error)?.message ?? "erro"}`);
      }
    }

    // Publicação externa continua no fluxo existente.
    const providers = (data.publishProviders ?? []).filter((p) => p === "cordial" || p === "morar");
    let skippedImages: number | undefined;
    if (providers.length) {
      try {
        const result = (await enqueuePropertySyncCore(context, {
          propertyId,
          providers,
          action: "publish",
        })) as { agency?: { status: string; reason?: string } | null; skippedImages?: number };
        steps.publish = "ok";
        skippedImages = result.skippedImages;
        if (!agenciamentoId && result.agency) {
          if (result.agency.status === "created" || result.agency.status === "exists") {
            steps.agency = "ok";
            agencyPending = false;
          } else if (result.agency.reason)
            messages.push(`Agenciamento pendente: ${result.agency.reason}`);
        }
      } catch (err) {
        steps.publish = "error";
        messages.push(`Publicação não enviada: ${(err as Error)?.message ?? "erro"}`);
      }
    }

    // 5) Concluído só quando nada falhou. Só estas duas colunas: não dispara envio.
    let completed = isFinalizeCompleted(steps, agencyPending);
    if (completed) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: completionError } = await supabaseAdmin
        .from("properties")
        .update({
          is_draft: false,
          registration_completed_at: state.registration_completed_at ?? new Date().toISOString(),
        } as never)
        .eq("id", propertyId)
        .select("id,registration_completed_at")
        .single();
      if (completionError) {
        completed = false;
        steps.save = "error";
        messages.push(
          "Cadastro salvo, mas a conclusão não foi confirmada. Tente concluir novamente; a intenção Morar permanece inativa.",
        );
      } else if (data.publishOwnedMorar === true) {
        // Apenas leitura: o trigger é dono da ativação; não repetimos uma
        // decisão de publicação que poderia desfazer uma retirada concorrente.
        const { data: publication, error } = await supabaseAdmin
          .from("morar_site_publications" as never)
          .select("public_id,state")
          .eq("property_id", propertyId)
          .maybeSingle();
        if (error || !publication) {
          ownedMorarPublication = {
            ...ownedMorarPublication,
            ok: true,
            active: false,
            confirmationError: true,
          };
          messages.push(
            "Cadastro concluído, mas não foi possível confirmar o estado do site Morar. Confira a administração do site antes de divulgar o link.",
          );
        } else {
          const confirmed = publication as { public_id: string; state: string };
          ownedMorarPublication = {
            ...ownedMorarPublication,
            ok: true,
            publicId: confirmed.public_id,
            state: confirmed.state,
            active: confirmed.state === "published",
          };
        }
      }
    }

    return {
      propertyId,
      agenciamentoId,
      steps,
      messages,
      skippedImages,
      completed,
      ownedMorarPublication,
    };
  });

export type IncompleteRegistration = {
  id: string;
  codigoCordial: string | null;
  codigoMorar: string | null;
  tipo: string | null;
  bairro: string | null;
  cidade: string | null;
  createdAt: string;
  createdBy: string | null;
  criadorNome: string | null;
  corretorNome: string | null;
  isDraft: boolean;
  hasPublication: boolean;
  hasAgenciamento: boolean;
};

/** Cadastros não concluídos (admin/secretária: todos; corretor: os próprios). */
export const listIncompleteRegistrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IncompleteRegistration[]> => {
    const { data, error } = await context.supabase.rpc("list_incomplete_registrations" as never);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      codigoCordial: (r.codigo_cordial as string) ?? null,
      codigoMorar: (r.codigo_morar as string) ?? null,
      tipo: (r.tipo as string) ?? null,
      bairro: (r.bairro as string) ?? null,
      cidade: (r.cidade as string) ?? null,
      createdAt: String(r.created_at),
      createdBy: (r.created_by as string) ?? null,
      criadorNome: (r.criador_nome as string) ?? null,
      corretorNome: (r.corretor_nome as string) ?? null,
      isDraft: Boolean(r.is_draft),
      hasPublication: Boolean(r.has_publication),
      hasAgenciamento: Boolean(r.has_agenciamento),
    }));
  });
