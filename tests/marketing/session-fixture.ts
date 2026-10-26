export function useSession() {
  const secretaria = new URLSearchParams(location.search).get("role") === "secretaria";
  return {
    id: "20000000-0000-4000-8000-000000000001",
    nome: "Pessoa de teste",
    iniciais: "PT",
    perfil: secretaria ? "secretaria" : "admin_owner",
    modules: ["marketing", "integracoes"],
    permissions: [],
  };
}
