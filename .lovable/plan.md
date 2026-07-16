## Objetivo
Promover "Pesquisa de satisfação" a item de topo na seção **Gestão & Crescimento** da sidebar, saindo de dentro do grupo colapsável "Gestão".

## Alterações
**Arquivo:** `src/components/sidebar-menu.tsx`

1. Remover a entrada `{ to: "/pesquisa-satisfacao", ... }` de `children` do grupo "Gestão".
2. Adicionar uma nova entrada `type: "item"` na mesma seção ("Gestão & Crescimento"), posicionada logo após o grupo "Gestão" e antes do grupo "Crescimento":
   - `to: "/pesquisa-satisfacao"`
   - `label: "Pesquisa de satisfação"`
   - `desc: "Avaliações dos clientes"`
   - `icon: Star`
   - `module: "pesquisa_satisfacao"`
   - `accent: "amber"` (destaque próprio, distinto do violet de Gestão e rose de Crescimento)

Nenhuma outra alteração: rota, permissões (`module_menu`, `permissions.ts`) e página continuam como estão.

## Resultado
Na sidebar, dentro de "Gestão & Crescimento", o usuário verá:
- Grupo **Gestão** (Corretores, Financeiro, Relatórios)
- Item direto **Pesquisa de satisfação** (com ícone estrela âmbar)
- Grupo **Crescimento** (Marketing, Documentos, Integrações)
