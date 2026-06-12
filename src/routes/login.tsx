import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, LockKeyhole, LogIn, UserRound } from "lucide-react";
import { login, useSession } from "@/lib/auth-mock";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — Gestão Cordial & Morar" }] }),
  component: LoginPage,
});

const LOGO_SRC = "/logo-gestao-cordial-morar.svg";

/*
 * Perfis demo (uso interno de desenvolvimento — não exibir na interface):
 * usuários: ricardo, bruna, clara, marcos, daniela · senha: cordial
 */

function LoginPage() {
  const navigate = useNavigate();
  const session = useSession();
  const [usuario, setUsuario] = useState("ricardo");
  const [senha, setSenha] = useState("cordial");
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [logoDisponivel, setLogoDisponivel] = useState(true);

  useEffect(() => {
    if (session) navigate({ to: "/" });
  }, [session, navigate]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setInfo(null);
    const u = login(usuario, senha);
    if (!u) {
      setErro("Usuário ou senha inválidos.");
      return;
    }
    navigate({ to: "/" });
  }

  function solicitarRecuperacao() {
    setErro(null);
    setInfo("Solicite a redefinição de senha ao administrador do sistema.");
  }

  return (
    <main className="login-shell relative min-h-svh overflow-x-hidden px-4 py-5 text-[#1E2329] sm:px-6 sm:py-8 lg:px-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="login-shell-glow login-shell-glow--primary" />
        <div className="login-shell-glow login-shell-glow--accent" />
        <div className="login-shell-vignette absolute inset-0" />
      </div>

      <section className="relative z-10 mx-auto flex min-h-[calc(100svh-2.5rem)] w-full max-w-[64rem] items-center justify-center pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.25rem,env(safe-area-inset-top))] sm:min-h-[calc(100svh-4rem)]">
        <div className="login-card-enter grid w-full overflow-hidden rounded-[1.5rem] ring-1 ring-white/10 shadow-[0_36px_90px_rgba(0,0,0,0.42)] sm:rounded-[1.75rem] lg:min-h-[37rem] lg:grid-cols-[1.05fr_1fr]">
          {/* Painel institucional / branding */}
          <aside className="login-brand relative flex items-center justify-center border-b border-white/8 px-6 py-9 sm:px-10 sm:py-11 lg:border-b-0 lg:border-r lg:px-12 lg:py-14">
            <div className="login-brand-sheen" aria-hidden="true" />
            <div className="relative flex w-full max-w-[24rem] flex-col items-center text-center">
              {logoDisponivel ? (
                <img
                  src={LOGO_SRC}
                  alt="Gestão Cordial & Morar — Sistema Integrado de Gestão Imobiliária"
                  className="h-auto w-full max-w-[12.5rem] object-contain drop-shadow-[0_14px_28px_rgba(0,0,0,0.32)] sm:max-w-[15rem] lg:max-w-[18.5rem]"
                  onError={() => setLogoDisponivel(false)}
                />
              ) : (
                <div className="rounded-2xl border border-white/12 bg-white/8 px-6 py-5">
                  <p className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                    Gestão Cordial & Morar
                  </p>
                </div>
              )}

              <p className="mt-6 hidden text-sm font-medium leading-6 tracking-[0.01em] text-[#F5F1EB]/70 lg:block">
                Gestão imobiliária integrada
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-2 lg:mt-6">
                <span className="login-brand-badge">
                  <span className="size-1.5 rounded-full bg-[#5FAFC7]" aria-hidden="true" />
                  Cordial Imóveis
                </span>
                <span className="login-brand-badge">
                  <span className="size-1.5 rounded-full bg-[#D9782D]" aria-hidden="true" />
                  Morar Imóveis
                </span>
              </div>
            </div>
          </aside>

          {/* Painel do formulário */}
          <div className="login-form-panel flex items-center px-5 py-8 sm:px-10 sm:py-12 lg:px-12">
            <div className="mx-auto w-full max-w-[23.5rem]">
              <header>
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#B95F20]">
                  Acesso integrado
                </p>
                <h1 className="mt-2.5 text-[1.75rem] font-bold leading-tight tracking-tight text-[#171B21] sm:text-3xl">
                  Acessar sistema
                </h1>
                <p className="mt-2.5 text-sm leading-6 text-[#6B7280]">
                  Entre com seu usuário ou e-mail para continuar.
                </p>
              </header>

              <form onSubmit={submit} className="mt-7 space-y-4 sm:mt-8">
                <label className="block">
                  <span className="text-sm font-semibold text-[#1E2329]">Usuário ou e-mail</span>
                  <div
                    className={`login-input-wrap mt-2 flex items-center gap-3 rounded-xl border border-[#E6DDD2] bg-white px-4 transition ${erro ? "login-input-wrap--error" : ""}`}
                  >
                    <UserRound className="size-[18px] shrink-0 text-[#6B7280]" aria-hidden="true" />
                    <input
                      value={usuario}
                      onChange={(e) => {
                        setUsuario(e.target.value);
                        setErro(null);
                        setInfo(null);
                      }}
                      autoComplete="username"
                      inputMode="email"
                      placeholder="usuário ou e-mail"
                      aria-invalid={erro ? true : undefined}
                      className="min-h-[3.25rem] w-full bg-transparent text-[15px] font-medium text-[#1E2329] outline-none placeholder:text-[#6B7280]/55"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-[#1E2329]">Senha</span>
                  <div
                    className={`login-input-wrap mt-2 flex items-center gap-3 rounded-xl border border-[#E6DDD2] bg-white px-4 transition ${erro ? "login-input-wrap--error" : ""}`}
                  >
                    <LockKeyhole className="size-[18px] shrink-0 text-[#6B7280]" aria-hidden="true" />
                    <input
                      type={senhaVisivel ? "text" : "password"}
                      value={senha}
                      onChange={(e) => {
                        setSenha(e.target.value);
                        setErro(null);
                        setInfo(null);
                      }}
                      autoComplete="current-password"
                      placeholder="Digite sua senha"
                      aria-invalid={erro ? true : undefined}
                      className="min-h-[3.25rem] w-full bg-transparent text-[15px] font-medium text-[#1E2329] outline-none placeholder:text-[#6B7280]/55"
                    />
                    <button
                      type="button"
                      onClick={() => setSenhaVisivel((visivel) => !visivel)}
                      className="-mr-1.5 grid size-9 shrink-0 place-items-center rounded-full text-[#2A3038] transition hover:bg-[#1E647D]/8 hover:text-[#1E647D] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1E647D]/15"
                      aria-label={senhaVisivel ? "Ocultar senha" : "Visualizar senha"}
                    >
                      {senhaVisivel ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                    </button>
                  </div>
                </label>

                <div className="flex justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={solicitarRecuperacao}
                    className="text-[13px] font-semibold text-[#1E647D] underline-offset-4 transition hover:text-[#174D61] hover:underline focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1E647D]/15"
                  >
                    Esqueceu a senha?
                  </button>
                </div>

                {erro && (
                  <p
                    role="alert"
                    className="rounded-xl border border-[#C94C4C]/25 bg-[#C94C4C]/8 px-4 py-3 text-sm font-medium text-[#9B3A3A]"
                  >
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
                  className="login-submit mt-3 inline-flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-bold text-white transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1E647D]/25 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <LogIn className="size-[18px]" aria-hidden="true" />
                  Entrar
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
