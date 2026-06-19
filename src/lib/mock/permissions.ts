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
  | "configuracoes";

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
    description: "Atendimento, agenda, clientes e imóveis sem permissões financeiras sensíveis.",
    modules: [
      "dashboard",
      "atendimentos",
      "clientes",
      "imoveis",
      "agenda",
      "documentos",
      "contratos",
    ],
    permissions: [
      "clientes:read",
      "clientes:write",
      "atendimentos:read",
      "atendimentos:write",
      "imoveis:read",
      "agenda:read",
      "agenda:write",
      "documentos:read",
      "documentos:write",
      "contratos:read",
    ],
  },
  corretor: {
    profile: "corretor",
    label: "Corretor",
    description: "Carteira comercial, visitas, propostas e acompanhamento do funil.",
    modules: [
      "dashboard",
      "atendimentos",
      "clientes",
      "imoveis",
      "agenciamentos",
      "agenda",
      "vendas",
      "alugueis",
      "contratos",
    ],
    permissions: [
      "clientes:read",
      "atendimentos:read",
      "atendimentos:write",
      "imoveis:read",
      "agenciamentos:read",
      "agenciamentos:write",
      "agenda:read",
      "agenda:write",
      "vendas:read",
      "vendas:write",
      "alugueis:read",
      "alugueis:write",
      "contratos:read",
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
