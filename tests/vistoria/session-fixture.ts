export const useSession = () => ({
  id: "20000000-0000-4000-8000-000000000001",
  nome: "Corretora de demonstração",
  iniciais: "CD",
  perfil: new URLSearchParams(location.search).has("termQa") ? "secretaria" : "corretor",
  modules: ["vistorias"],
  permissions: [],
});
