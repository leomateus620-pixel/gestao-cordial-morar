type GuardContext = {
  userId: string;
  supabase: {
    rpc: (
      fn: "has_role",
      args: { _user_id: string; _role: never },
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
};

export const ATTENDANCE_READ_ONLY_ERROR =
  "Perfil somente de consulta: não é possível alterar atendimentos.";

/**
 * Server-side refusal for the consulta-only profile. The database enforces the
 * same rule (RLS + RPC guards); this keeps the error clear and fails closed.
 */
export async function assertAttendanceWriter(context: unknown): Promise<void> {
  const ctx = context as GuardContext;
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "atendimentos_viewer" as never,
  });
  if (error) throw new Error("Não foi possível confirmar sua permissão.");
  if (data === true) throw new Error(ATTENDANCE_READ_ONLY_ERROR);
}
