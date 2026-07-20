export type UserProfile = "admin_owner" | "secretaria" | "corretor" | "financeiro_admin";

export type AppModule =
  | "dashboard"
  | "clientes"
  | "atendimentos"
  | "imoveis"
  | "agenciamentos"
  | "alugueis"
  | "vendas"
  | "agenda"
  | "corretores"
  | "contratos"
  | "financeiro"
  | "relatorios"
  | "marketing"
  | "documentos"
  | "integracoes"
  | "configuracoes"
  | "pesquisa_satisfacao";

export type Permission =
  | "clientes:read"
  | "clientes:write"
  | "atendimentos:read"
  | "atendimentos:write"
  | "imoveis:read"
  | "imoveis:write"
  | "agenciamentos:read"
  | "agenciamentos:write"
  | "agenciamentos:manage"
  | "alugueis:read"
  | "alugueis:write"
  | "vendas:read"
  | "vendas:write"
  | "agenda:read"
  | "agenda:write"
  | "corretores:read"
  | "corretores:manage"
  | "contratos:read"
  | "contratos:write"
  | "financeiro:read"
  | "financeiro:write"
  | "relatorios:read"
  | "marketing:read"
  | "marketing:write"
  | "documentos:read"
  | "documentos:write"
  | "integracoes:read"
  | "integracoes:manage"
  | "configuracoes:manage";

export type RoleDefinition = {
  profile: UserProfile;
  label: string;
  description: string;
  modules: AppModule[];
  permissions: Permission[];
};

const allModules: AppModule[] = [
  "dashboard",
  "clientes",
  "atendimentos",
  "imoveis",
  "agenciamentos",
  "alugueis",
  "vendas",
  "agenda",
  "corretores",
  "contratos",
  "financeiro",
  "relatorios",
  "marketing",
  "documentos",
  "integracoes",
  "configuracoes",
  "pesquisa_satisfacao",
];

const allPermissions: Permission[] = [
  "clientes:read",
  "clientes:write",
  "atendimentos:read",
  "atendimentos:write",
  "imoveis:read",
  "imoveis:write",
  "agenciamentos:read",
  "agenciamentos:write",
  "agenciamentos:manage",
  "alugueis:read",
  "alugueis:write",
  "vendas:read",
  "vendas:write",
  "agenda:read",
  "agenda:write",
  "corretores:read",
  "corretores:manage",
  "contratos:read",
  "contratos:write",
  "financeiro:read",
  "financeiro:write",
  "relatorios:read",
  "marketing:read",
  "marketing:write",
  "documentos:read",
  "documentos:write",
  "integracoes:read",
  "integracoes:manage",
  "configuracoes:manage",
];

export const roleDefinitions: Record<UserProfile, RoleDefinition> = {
  admin_owner: {
    profile: "admin_owner",
    label: "Administrador/Proprietário",
    description: "Visão completa das duas imobiliárias, configurações e integrações futuras.",
    modules: allModules,
    permissions: allPermissions,
  },
  secretaria: {
    profile: "secretaria",
    label: "Secretária",
    description: "Atendimento, clientes e campanhas de marketing operacionais.",
    modules: ["dashboard", "atendimentos", "clientes", "marketing", "alugueis", "agenciamentos", "agenda"],
    permissions: [
      "atendimentos:read",
      "atendimentos:write",
      "clientes:read",
      "clientes:write",
      "marketing:read",
      "marketing:write",
      "alugueis:read",
      "alugueis:write",
      "agenciamentos:read",
      "agenciamentos:write",
      "agenda:read",
      "agenda:write",

    ],
  },
  corretor: {
    profile: "corretor",
    label: "Corretor",
    description: "Atendimentos, clientes, agenciamentos e vendas da própria carteira.",
    modules: ["dashboard", "atendimentos", "clientes", "agenciamentos", "agenda", "vendas"],
    permissions: [
      "atendimentos:read",
      "atendimentos:write",
      "clientes:read",
      "clientes:write",
      "agenciamentos:read",
      "agenciamentos:write",
      "agenda:read",
      "agenda:write",
      "vendas:read",
      "vendas:write",
    ],
  },

  financeiro_admin: {
    profile: "financeiro_admin",
    label: "Financeiro/Administrativo",
    description: "Contratos, cobranças, comissões, relatórios e integração contábil mockada.",
    modules: [
      "dashboard",
      "clientes",
      "contratos",
      "financeiro",
      "relatorios",
      "documentos",
      "integracoes",
    ],
    permissions: [
      "clientes:read",
      "contratos:read",
      "contratos:write",
      "financeiro:read",
      "financeiro:write",
      "relatorios:read",
      "documentos:read",
      "documentos:write",
      "integracoes:read",
      "integracoes:manage",
    ],
  },
};

export function canAccessModule(profile: UserProfile, module: AppModule) {
  return roleDefinitions[profile].modules.includes(module);
}

export function hasPermission(profile: UserProfile, permission: Permission) {
  return roleDefinitions[profile].permissions.includes(permission);
}
