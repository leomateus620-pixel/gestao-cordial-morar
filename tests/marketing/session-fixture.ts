export function useSession() {
  const role = new URLSearchParams(location.search).get("role");
  return {
    id: "20000000-0000-4000-8000-000000000001",
    nome: "Pessoa de teste",
    iniciais: "PT",
    perfil:
      role === "meta_reviewer"
        ? "meta_reviewer"
        : ["secretaria", "bianca"].includes(role ?? "")
          ? "secretaria"
          : "admin_owner",
    modules: ["marketing", "integracoes"],
    permissions: [],
  };
}
