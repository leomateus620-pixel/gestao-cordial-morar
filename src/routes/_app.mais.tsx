import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Users, UserCog, FileText, Wallet, BarChart3, LogOut, Building2 } from "lucide-react";
import { useSession, logout } from "@/lib/auth-mock";

const items = [
  { to: "/clientes", label: "Clientes", desc: "Cadastro e histórico", icon: Users },
  { to: "/corretores", label: "Corretores", desc: "Equipe e performance", icon: UserCog },
  { to: "/contratos", label: "Contratos", desc: "Vendas e aluguéis", icon: FileText },
  { to: "/financeiro", label: "Financeiro", desc: "Receita e comissões", icon: Wallet },
  { to: "/relatorios", label: "Relatórios", desc: "Indicadores e ranking", icon: BarChart3 },
];

export const Route = createFileRoute("/_app/mais")({
  head: () => ({ meta: [{ title: "Mais — Gestão Cordial" }] }),
  component: Page,
});

function Page() {
  const session = useSession();
  const navigate = useNavigate();

  function sair() {
    logout();
    navigate({ to: "/login" });
  }

  return (
    <>
      <section className="glass-panel-strong mb-5 flex items-center gap-3 rounded-3xl p-4">
        <div className="grid size-12 place-items-center rounded-2xl bg-primary/15 text-base font-bold text-primary">
          {session?.iniciais}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{session?.nome}</p>
          <p className="text-[11px] text-foreground/55">{session?.cargo}</p>
        </div>
      </section>

      <section className="mb-5">
        <h3 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-foreground/55">Módulos</h3>
        <div className="glass-panel divide-y divide-white/50 overflow-hidden rounded-3xl">
          {items.map((i) => {
            const Icon = i.icon;
            return (
              <Link key={i.to} to={i.to as never} className="flex items-center gap-3 px-4 py-3.5 active:bg-white/50">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.label}</p>
                  <p className="truncate text-[11px] text-foreground/55">{i.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mb-5">
        <h3 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-foreground/55">Imobiliárias</h3>
        <div className="glass-panel rounded-3xl p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><Building2 className="size-4" /></div>
            <div>
              <p className="text-sm font-semibold">Cordial Imóveis</p>
              <p className="text-[11px] text-foreground/55">Operação completa</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3 border-t border-white/40 pt-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-700"><Building2 className="size-4" /></div>
            <div>
              <p className="text-sm font-semibold">Morar Imóveis</p>
              <p className="text-[11px] text-foreground/55">Operação completa</p>
            </div>
          </div>
        </div>
      </section>

      <button
        onClick={sair}
        className="glass-panel flex w-full items-center justify-center gap-2 rounded-2xl p-3.5 text-sm font-semibold text-destructive active:scale-[0.99]"
      >
        <LogOut className="size-4" /> Sair
      </button>
    </>
  );
}