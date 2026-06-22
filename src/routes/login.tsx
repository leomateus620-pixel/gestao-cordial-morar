import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  LogIn,
  Mail,
  UserPlus,
  UserRound,
} from "lucide-react";
import { z } from "zod";
import {
  login,
  requestPasswordReset,
  signUp,
  useSession,
} from "@/lib/auth-mock";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — Gestão Cordial & Morar" }] }),
  component: LoginPage,
});

const LOGO_SRC = "/logo-gestao-cordial-morar.svg";

type Mode = "signin" | "signup" | "reset";

const emailSchema = z.string().trim().email("Informe um e-mail válido").max(255);
const passwordSchema = z.string().min(8, "A senha deve ter ao menos 8 caracteres").max(72);
const nameSchema = z.string().trim().min(2, "Informe seu nome completo").max(120);

function LoginPage() {
  const navigate = useNavigate();
  const session = useSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [logoDisponivel, setLogoDisponivel] = useState(true);

  useEffect(() => {
    if (session) navigate({ to: "/" });
  }, [session, navigate]);

  function resetMessages() {
    setErro(null);
    setInfo(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (carregando) return;
    resetMessages();

    try {
      if (mode === "reset") {
        emailSchema.parse(email);
      } else if (mode === "signup") {
        nameSchema.parse(nome);
        emailSchema.parse(email);
        passwordSchema.parse(senha);
      } else {
        emailSchema.parse(email);
        if (!senha) throw new z.ZodError([{ code: "custom", path: ["senha"], message: "Informe sua senha." } as never]);
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        setErro(err.errors[0]?.message ?? "Dados inválidos.");
      }
      return;
    }

    setCarregando(true);
    try {
      if (mode === "signin") {
        const { error } = await login(email, senha);
        if (error) {
          setErro("E-mail ou senha inválidos.");
          return;
        }
        navigate({ to: "/" });
        return;
      }
      if (mode === "signup") {
        const { ok, error } = await signUp(email, senha, nome);
        if (!ok) {
          setErro(error ?? "Não foi possível criar a conta.");
          return;
        }
        // Auto-confirm está ligado: tenta entrar direto.
        const { error: loginError } = await login(email, senha);
        if (loginError) {
          setInfo("Conta criada! Faça login para continuar.");
          setMode("signin");
          return;
        }
        navigate({ to: "/" });
        return;
      }
      // reset
      const { ok, error } = await requestPasswordReset(email);
      if (!ok) {
        setErro(error ?? "Não foi possível enviar o e-mail.");
        return;
      }
      setInfo("Se este e-mail estiver cadastrado, você receberá um link para redefinir a senha.");
    } finally {
      setCarregando(false);
    }
  }

  const titulo =
    mode === "signin" ? "Acessar sistema" : mode === "signup" ? "Criar conta" : "Recuperar acesso";
  const subtitulo =
    mode === "signin"
      ? "Entre com seu e-mail e senha para continuar."
      : mode === "signup"
        ? "Preencha seus dados para criar sua conta."
        : "Enviaremos um link para redefinir sua senha.";
  const botao = mode === "signin" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link";
  const IconeBotao = mode === "signup" ? UserPlus : mode === "reset" ? Mail : LogIn;

  return (
    <main className="login-shell relative min-h-svh overflow-x-hidden px-4 py-5 text-[#1E2329] sm:px-6 sm:py-8 lg:px-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="login-shell-glow login-shell-glow--primary" />
        <div className="login-shell-glow login-shell-glow--accent" />
        <div className="login-shell-vignette absolute inset-0" />
      </div>

      <section className="relative z-10 mx-auto flex min-h-[calc(100svh-2.5rem)] w-full max-w-[64rem] items-center justify-center pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.25rem,env(safe-area-inset-top))] sm:min-h-[calc(100svh-4rem)]">
        <div className="login-card-enter grid w-full overflow-hidden rounded-[1.5rem] ring-1 ring-white/10 shadow-[0_36px_90px_rgba(0,0,0,0.42)] sm:rounded-[1.75rem] lg:min-h-[37rem] lg:grid-cols-[1.05fr_1fr]">
          <aside className="login-brand relative flex items-center justify-center border-b border-white/8 px-6 py-9 sm:px-10 sm:py-11 lg:border-b-0 lg:border-r lg:px-12 lg:py-14">
            <div className="login-brand-sheen" aria-hidden="true" />
            <div className="relative flex w-full max-w-[24rem] flex-col items-center text-center">
              {logoDisponivel ? (
                <img
                  src={LOGO_SRC}
                  alt="Gestão Cordial & Morar"
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

          <div className="login-form-panel flex items-center px-5 py-8 sm:px-10 sm:py-12 lg:px-12">
            <div className="mx-auto w-full max-w-[23.5rem]">
              <header>
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#B95F20]">
                  Acesso integrado
                </p>
                <h1 className="mt-2.5 text-[1.75rem] font-bold leading-tight tracking-tight text-[#171B21] sm:text-3xl">
                  {titulo}
                </h1>
                <p className="mt-2.5 text-sm leading-6 text-[#6B7280]">{subtitulo}</p>
              </header>

              <div className="mt-5 inline-flex rounded-xl border border-[#E6DDD2] bg-white p-1 text-[13px] font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    resetMessages();
                  }}
                  className={`rounded-lg px-3 py-1.5 transition ${mode === "signin" ? "bg-[#1E647D] text-white" : "text-[#1E2329]"}`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    resetMessages();
                  }}
                  className={`rounded-lg px-3 py-1.5 transition ${mode === "signup" ? "bg-[#1E647D] text-white" : "text-[#1E2329]"}`}
                >
                  Criar conta
                </button>
              </div>

              <form onSubmit={submit} className="mt-6 space-y-4">
                {mode === "signup" && (
                  <label className="block">
                    <span className="text-sm font-semibold text-[#1E2329]">Nome completo</span>
                    <div className="login-input-wrap mt-2 flex items-center gap-3 rounded-xl border border-[#E6DDD2] bg-white px-4 transition">
                      <UserRound className="size-[18px] shrink-0 text-[#6B7280]" aria-hidden="true" />
                      <input
                        value={nome}
                        onChange={(e) => {
                          setNome(e.target.value);
                          resetMessages();
                        }}
                        autoComplete="name"
                        placeholder="Seu nome"
                        className="min-h-[3.25rem] w-full bg-transparent text-[15px] font-medium text-[#1E2329] outline-none placeholder:text-[#6B7280]/55"
                      />
                    </div>
                  </label>
                )}

                <label className="block">
                  <span className="text-sm font-semibold text-[#1E2329]">E-mail</span>
                  <div className="login-input-wrap mt-2 flex items-center gap-3 rounded-xl border border-[#E6DDD2] bg-white px-4 transition">
                    <Mail className="size-[18px] shrink-0 text-[#6B7280]" aria-hidden="true" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        resetMessages();
                      }}
                      autoComplete="email"
                      inputMode="email"
                      placeholder="voce@empresa.com"
                      className="min-h-[3.25rem] w-full bg-transparent text-[15px] font-medium text-[#1E2329] outline-none placeholder:text-[#6B7280]/55"
                    />
                  </div>
                </label>

                {mode !== "reset" && (
                  <label className="block">
                    <span className="text-sm font-semibold text-[#1E2329]">Senha</span>
                    <div className="login-input-wrap mt-2 flex items-center gap-3 rounded-xl border border-[#E6DDD2] bg-white px-4 transition">
                      <LockKeyhole className="size-[18px] shrink-0 text-[#6B7280]" aria-hidden="true" />
                      <input
                        type={senhaVisivel ? "text" : "password"}
                        value={senha}
                        onChange={(e) => {
                          setSenha(e.target.value);
                          resetMessages();
                        }}
                        autoComplete={mode === "signup" ? "new-password" : "current-password"}
                        placeholder={mode === "signup" ? "Crie uma senha (mín. 8)" : "Digite sua senha"}
                        className="min-h-[3.25rem] w-full bg-transparent text-[15px] font-medium text-[#1E2329] outline-none placeholder:text-[#6B7280]/55"
                      />
                      <button
                        type="button"
                        onClick={() => setSenhaVisivel((v) => !v)}
                        className="-mr-1.5 grid size-9 shrink-0 place-items-center rounded-full text-[#2A3038] transition hover:bg-[#1E647D]/8 hover:text-[#1E647D]"
                        aria-label={senhaVisivel ? "Ocultar senha" : "Visualizar senha"}
                      >
                        {senhaVisivel ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                      </button>
                    </div>
                  </label>
                )}

                {mode === "signin" && (
                  <div className="flex justify-end pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setMode("reset");
                        resetMessages();
                      }}
                      className="text-[13px] font-semibold text-[#1E647D] underline-offset-4 transition hover:text-[#174D61] hover:underline"
                    >
                      Esqueceu a senha?
                    </button>
                  </div>
                )}

                {mode === "reset" && (
                  <div className="flex justify-end pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signin");
                        resetMessages();
                      }}
                      className="text-[13px] font-semibold text-[#1E647D] underline-offset-4 transition hover:text-[#174D61] hover:underline"
                    >
                      Voltar para entrar
                    </button>
                  </div>
                )}

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
                  disabled={carregando}
                  className="login-submit mt-3 inline-flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <IconeBotao className="size-[18px]" aria-hidden="true" />
                  {carregando ? "Aguarde…" : botao}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
