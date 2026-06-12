import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { login, useSession } from "@/lib/auth-mock";
import { MeshBackground } from "@/components/mesh-background";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — Gestão Cordial" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const session = useSession();
  const [usuario, setUsuario] = useState("ricardo");
  const [senha, setSenha] = useState("cordial");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (session) navigate({ to: "/" });
  }, [session, navigate]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const u = login(usuario, senha);
    if (!u) {
      setErro("Usuário ou senha inválidos.");
      return;
    }
    navigate({ to: "/" });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 font-sans text-foreground">
      <MeshBackground />
      <div className="glass-panel-strong w-full max-w-sm rounded-3xl p-7">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Building2 className="size-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
              Gestão Cordial
            </p>
            <h1 className="text-lg font-semibold tracking-tight">Bem-vindo de volta</h1>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wider text-foreground/55">
              Usuário
            </span>
            <input
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wider text-foreground/55">
              Senha
            </span>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/60 bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
          </label>
          {erro && <p className="text-xs text-destructive">{erro}</p>}
          <button
            type="submit"
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 active:scale-[0.99]"
          >
            Entrar
          </button>
          <p className="text-center text-[11px] text-foreground/50">
            Perfis demo: <strong>ricardo</strong>, <strong>clara</strong>, <strong>marcos</strong>{" "}
            ou <strong>daniela</strong> · senha <strong>cordial</strong>
          </p>
        </form>
      </div>
    </div>
  );
}
