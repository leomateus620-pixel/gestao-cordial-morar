import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  canManageAgenciamentos,
  getUserDisplayName,
  getUserRoles,
  inputToPayload,
  patchToPayload,
  rowToAgenciamento,
  validateAgenciamentoInput,
  type AgenciamentoDbRow,
} from "@/lib/agenciamentos/agenciamentos.server";
import type { AgenciamentoInput } from "@/types/agenciamento";

export const listAgenciamentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await getUserRoles(context.supabase, context.userId);
    const canManage = canManageAgenciamentos(roles);

    let query = context.supabase
      .from("agenciamentos")
      .select("*")
      .order("created_at", { ascending: false });

    if (!canManage) {
      query = query.or(`created_by.eq.${context.userId},corretor_id.eq.${context.userId}`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => rowToAgenciamento(row as unknown as AgenciamentoDbRow));
  });

export const createAgenciamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: AgenciamentoInput) => data)
  .handler(async ({ data, context }) => {
    const roles = await getUserRoles(context.supabase, context.userId);
    const canManage = canManageAgenciamentos(roles);
    const userName = await getUserDisplayName(context.supabase, context.userId);
    const safeData = canManage ? data : { ...data, corretorId: context.userId, corretorNome: userName };

    validateAgenciamentoInput(safeData);

    const { data: inserted, error } = await context.supabase
      .from("agenciamentos")
      .insert(inputToPayload(safeData, context.userId, userName, canManage) as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToAgenciamento(inserted as unknown as AgenciamentoDbRow);
  });

type UpdatePatch = Partial<AgenciamentoInput>;

export const updateAgenciamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; patch: UpdatePatch }) => data)
  .handler(async ({ data, context }) => {
    const roles = await getUserRoles(context.supabase, context.userId);
    const canManage = canManageAgenciamentos(roles);
    const patch = patchToPayload(data.patch, canManage);

    const { data: updated, error } = await context.supabase
      .from("agenciamentos")
      .update(patch as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToAgenciamento(updated as unknown as AgenciamentoDbRow);
  });

export const validateAgenciamentoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; validadoPorNome?: string }) => data)
  .handler(async ({ data, context }) => {
    const roles = await getUserRoles(context.supabase, context.userId);
    if (!canManageAgenciamentos(roles)) {
      throw new Error("Somente administradores e secretaria podem validar agenciamentos.");
    }

    const { data: updated, error } = await context.supabase
      .from("agenciamentos")
      .update({
        validado: true,
        status: "validado",
        validado_por_id: context.userId,
        validado_por_nome: data.validadoPorNome?.trim() || null,
        validado_em: new Date().toISOString(),
      } as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToAgenciamento(updated as unknown as AgenciamentoDbRow);
  });

export const deleteAgenciamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("agenciamentos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });