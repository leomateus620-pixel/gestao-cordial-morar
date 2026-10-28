import type { UserProfile } from "../../src/lib/mock/permissions";

const requestedRole = new URLSearchParams(location.search).get("role");
const perfil: UserProfile = ["corretor", "secretaria", "meta_reviewer"].includes(
  requestedRole ?? "",
)
  ? (requestedRole as UserProfile)
  : "admin_owner";
const user = {
  id: "20000000-0000-4000-8000-000000000001",
  nome: "Pessoa de teste",
  iniciais: "PT",
  perfil,
  modules: perfil === "meta_reviewer" ? ["marketing", "integracoes"] : ["atendimentos", "agenda"],
  permissions: [],
};

export function useSession() {
  return user;
}
