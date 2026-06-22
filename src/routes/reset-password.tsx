import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Redefinir senha — Gestão Cordial & Morar" }] }),
  component: ResetPasswordPage,
});

const passwordSchema = z.string().min(8, "A senha deve ter ao menos 8 caracteres").max(72);

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [visivel, setVisivel] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    // Supabase processa o hash (#access_token=...&type=recovery) automaticamente
    // e dispara PASSWORD_RECOVERY. Validamos que há sessão de recuperação.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setPronto(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPronto(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setInfo(null);
    try {
      passwordSchema.parse(senha);
    } catch (err) {
      if (err instanceof z.ZodError) setErro(err.errors[0]?.message ?? "Senha inválida.");
      return;
    }
    if (senha !== senha2) {
      setErro("As senhas não coincidem.");
      return;
    }
    setCarregando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setCarregando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    setInfo("Senha redefinida com sucesso. Redirecionando…");
    setTimeout(() => navigate({ to: "/" }), 1200);
  }

  return (
    <main className="login-shell relative min-h-svh px-4 py-10 text-[#1E2329]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="login-shell-glow login-shell-glow--primary" />
        <div className="login-shell-glow login-shell-glow--accent" />
        <div className="login-shell-vignette absolute inset-0" />
      </div>
      <section className="relative z-10 mx-auto flex min-h-[80svh] w-full max-w-md items-center justify-center">
        <div className="w-full rounded-2xl bg-white p-8 shadow-[0_36px_90px_rgba(0,0,0,0.42)]">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#1E647D]/10 text-[#1E647D]">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#B95F20]">
                Recuperar acesso
              </p>
              <h1 className="text-xl font-bold text-[#171B21]">Definir nova senha</h1>
            </div>
          </div>

          {!pronto && (
            <p className="mt-6 rounded-xl border border-[#E6DDD2] bg-[#FAF6F0] px-4 py-3 text-sm text-[#6B7280]">
              Validando seu link de recuperação…
            </p>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold">Nova senha</span>
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-[#E6DDD2] bg-white px-4">
                <LockKeyhole className="size-[18px] text-[#6B7280]" />
                <input
                  type={visivel ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete="new-password"
                  className="min-h-[3rem] w-full bg-transparent text-[15px] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setVisivel((v) => !v)}
                  className="grid size-9 place-items-center rounded-full text-[#2A3038]"
                  aria-label={visivel ? "Ocultar" : "Mostrar"}
                >
                  {visivel ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                </button>
              </div>
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Confirmar senha</span>
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-[#E6DDD2] bg-white px-4">
                <LockKeyhole className="size-[18px] text-[#6B7280]" />
                <input
                  type={visivel ? "text" : "password"}
                  value={senha2}
                  onChange={(e) => setSenha2(e.target.value)}
                  autoComplete="new-password"
                  className="min-h-[3rem] w-full bg-transparent text-[15px] outline-none"
                />
              </div>
            </label>

            {erro && (
              <p className="rounded-xl border border-[#C94C4C]/25 bg-[#C94C4C]/8 px-4 py-3 text-sm font-medium text-[#9B3A3A]">
                {erro}
              </p>
            )}
            {info && (
              <p className="rounded-xl border border-[#1E647D]/16 bg-[#1E647D]/8 px-4 py-3 text-sm font-medium text-[#174D61]">
                {info}
              </p>
            )}

            <button
              type="submit"
              disabled={carregando || !pronto}
              className="login-submit inline-flex min-h-[3rem] w-full items-center justify-center rounded-xl px-5 text-[15px] font-bold text-white disabled:opacity-60"
            >
              {carregando ? "Salvando…" : "Redefinir senha"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
