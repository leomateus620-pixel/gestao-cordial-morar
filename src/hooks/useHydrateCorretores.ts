import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCorretores, type CorretorProfile } from "@/lib/corretores/corretores.functions";
import { useSession } from "@/lib/auth-mock";
import { useApp } from "@/store/app-store";
import { normalizeCorretores } from "@/services/corretores";
import type { CorretorImobiliaria } from "@/types/corretor";

function toIniciais(nome: string, fallback?: string | null): string {
  if (fallback && fallback.trim()) return fallback.trim().toUpperCase().slice(0, 2);
  const parts = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function toCorretor(profile: CorretorProfile) {
  const imobiliaria: CorretorImobiliaria = "cordial";
  return {
    id: profile.id,
    nome: profile.nome,
    iniciais: toIniciais(profile.nome, profile.iniciais),
    imobiliaria,
    creci: "",
  };
}

export function useHydrateCorretores() {
  const session = useSession();
  const list = useServerFn(listCorretores);
  const query = useQuery({
    queryKey: ["corretores", "profiles"],
    queryFn: () => list(),
    enabled: Boolean(session),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!query.data) return;
    // Admins também atuam como corretores na prática: mantê-los na lista para
    // que possam ser vinculados nos cadastros (agenciamentos, agenda, vendas...).
    const onlyCorretores = query.data.filter(
      (profile) => profile.role === "corretor" || profile.role === "admin",
    );
    const corretores = normalizeCorretores(onlyCorretores.map(toCorretor));
    useApp.setState({ corretores });
  }, [query.data]);
}
