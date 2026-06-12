import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, LockKeyhole, LogIn, UserRound } from "lucide-react";
import { login, useSession } from "@/lib/auth-mock";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — Gestão Cordial & Morar" }] }),
  component: LoginPage,
});

const LOGO_SRC = "/logo-gestao-cordial-morar.svg";

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
    <main className="login-premium-shell min-h-svh overflow-x-hidden px-4 py-6 text-[#1E2329] sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="login-premium-grid absolute inset-0" />
        <div className="animate-mesh absolute -left-24 top-[-18%] h-80 w-80 rounded-full bg-[#5FAFC7]/25 blur-[92px] sm:h-[32rem] sm:w-[32rem]" />
        <div
          className="animate-mesh absolute bottom-[-18%] right-[-18%] h-96 w-96 rounded-full bg-[#D9782D]/22 blur-[104px] sm:h-[34rem] sm:w-[34rem]"
          style={{ animationDelay: "-8s" }}
        />
        <div className="absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FBF8F4]/8 blur-[120px]" />
      </div>

      <section className="relative z-10 mx-auto flex min-h-[calc(100svh-3rem)] w-full max-w-5xl flex-col items-center justify-center gap-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(0rem,env(safe-area-inset-top))] sm:gap-7">
        <header className="login-premium-logo flex w-full max-w-[28rem] flex-col items-center text-center">
          <div className="flex min-h-20 w-full items-center justify-center sm:min-h-24">
            {logoDisponivel ? (
              <img
                src={LOGO_SRC}
                alt="Gestão Cordial & Morar — Sistema Integrado de Gestão Imobiliária"
                className="h-auto max-h-24 w-full max-w-[21rem] object-contain drop-shadow-[0_18px_34px_rgba(0,0,0,0.22)] sm:max-h-28 sm:max-w-[26rem]"
                onError={() => setLogoDisponivel(false)}
              />
            ) : (
              <div className="rounded-[1.75rem] border border-white/18 bg-white/10 px-5 py-4 shadow-2xl backdrop-blur-xl">
                <p className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                  Gestão Cordial & Morar
                </p>
                <p className="mt-1 text-xs font-medium uppercase tracking-[0.22em] text-[#F5F1EB]/70">
                  Sistema Integrado de Gestão Imobiliária
                </p>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs font-semibold text-[#F5F1EB]/82">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/9 px-3 py-1.5 backdrop-blur-md">
              <span className="size-2 rounded-full bg-[#2B7FA3] shadow-[0_0_0_4px_rgba(43,127,163,0.16)]" />
              Cordial Imóveis
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/9 px-3 py-1.5 backdrop-blur-md">
              <span className="size-2 rounded-full bg-[#E07A2E] shadow-[0_0_0_4px_rgba(224,122,46,0.16)]" />
              Morar Imóveis
            </span>
          </div>
        </header>

        <div className="login-card-enter w-full max-w-[27.5rem] rounded-[2rem] border border-white/45 bg-[#FBF8F4]/88 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.62)] backdrop-blur-[18px] sm:p-8">
          <div className="mb-6 text-center sm:mb-7">
            <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-[#1E647D]/10 text-[#1E647D] shadow-inner ring-1 ring-[#1E647D]/10">
              <LockKeyhole className="size-5" aria-hidden="true" />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#D9782D]">
              Acesso integrado
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#171B21] sm:text-4xl">
              Acessar sistema
            </h1>
            <p className="mx-auto mt-3 max-w-[21rem] text-sm leading-6 text-[#6B7280]">
              Informe seu usuário ou e-mail para acessar o painel integrado das imobiliárias.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-[#1E2329]">Usuário ou e-mail</span>
              <div className="login-input-wrap mt-2 flex items-center gap-3 rounded-2xl border border-[#E6DDD2] bg-white/66 px-4 transition">
                <UserRound className="size-5 shrink-0 text-[#6B7280]" aria-hidden="true" />
                <input
                  value={usuario}
                  onChange={(e) => {
                    setUsuario(e.target.value);
                    setErro(null);
                    setInfo(null);
                  }}
                  autoComplete="username"
                  inputMode="email"
                  placeholder="ex: ricardo ou ricardo@email.com"
                  className="min-h-14 w-full bg-transparent text-base font-medium text-[#1E2329] outline-none placeholder:text-[#6B7280]/58"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[#1E2329]">Senha</span>
              <div className="login-input-wrap mt-2 flex items-center gap-3 rounded-2xl border border-[#E6DDD2] bg-white/66 px-4 transition">
                <LockKeyhole className="size-5 shrink-0 text-[#6B7280]" aria-hidden="true" />
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
                  className="min-h-14 w-full bg-transparent text-base font-medium text-[#1E2329] outline-none placeholder:text-[#6B7280]/58"
                />
                <button
                  type="button"
                  onClick={() => setSenhaVisivel((visivel) => !visivel)}
                  className="-mr-1 grid size-10 shrink-0 place-items-center rounded-full text-[#2A3038] transition hover:bg-[#1E647D]/8 hover:text-[#1E647D] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1E647D]/12"
                  aria-label={senhaVisivel ? "Ocultar senha" : "Visualizar senha"}
                >
                  {senhaVisivel ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={solicitarRecuperacao}
                className="text-sm font-semibold text-[#1E647D] transition hover:text-[#B95F20] focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1E647D]/12"
              >
                Esqueceu a senha?
              </button>
            </div>

            {erro && (
              <p className="rounded-2xl border border-[#F0A86D]/35 bg-[#F0A86D]/14 px-4 py-3 text-sm font-medium text-[#8E4718]">
                {erro}
              </p>
            )}

            {info && (
              <p className="rounded-2xl border border-[#1E647D]/16 bg-[#1E647D]/8 px-4 py-3 text-sm font-medium text-[#174D61]">
                {info}
              </p>
            )}

            <button
              type="submit"
              className="login-submit group relative mt-2 flex min-h-14 w-full items-center justify-center overflow-hidden rounded-2xl px-5 text-base font-bold text-white shadow-[0_16px_35px_rgba(30,100,125,0.28)] transition active:scale-[0.99]"
            >
              <span className="absolute inset-y-0 right-0 w-24 translate-x-10 bg-[#D9782D]/22 blur-2xl transition group-hover:translate-x-0" />
              <LogIn className="relative mr-2 size-5" aria-hidden="true" />
              <span className="relative">Entrar no sistema</span>
            </button>

            <p className="px-2 text-center text-xs leading-5 text-[#6B7280]">
              Acesso restrito aos usuários autorizados da Cordial Imóveis e Morar Imóveis.
            </p>
          </form>

          <div className="mt-6 rounded-2xl border border-[#E6DDD2]/80 bg-white/46 px-4 py-3 text-center text-[11px] leading-5 text-[#6B7280]">
            Perfis demo: <strong className="text-[#1E2329]">ricardo</strong>,{" "}
            <strong className="text-[#1E2329]">bruna</strong>,{" "}
            <strong className="text-[#1E2329]">clara</strong>,{" "}
            <strong className="text-[#1E2329]">marcos</strong> ou{" "}
            <strong className="text-[#1E2329]">daniela</strong> · senha{" "}
            <strong className="text-[#1E2329]">cordial</strong>
          </div>
        </div>
      </section>
    </main>
  );
}
