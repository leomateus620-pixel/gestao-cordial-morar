## Objetivo
Liberar o menu "Agenciamentos" para o perfil `secretaria` (Bianca), com acesso total às features operacionais, exceto ações restritas ao admin.

## Mudanças

### 1. `src/lib/mock/permissions.ts`
Adicionar `"agenciamentos"` à lista de `modules` do perfil `secretaria` e incluir as permissões:
- `agenciamentos:read`
- `agenciamentos:write`

Não incluir `agenciamentos:manage` (permanece exclusivo do admin — usada para ações administrativas como exclusão em massa/validações).

### 2. `src/lib/access-control.ts`
Atualizar `getPrimaryMobileModulesForProfile` para `secretaria` incluir `agenciamentos` na bottom-nav mobile (substituindo ou complementando itens conforme fizer sentido — proponho manter: `dashboard`, `atendimentos`, `clientes`, `agenciamentos`, e mover `marketing` para "Mais").

### 3. `src/components/shared/module-menu.ts`
Adicionar `"secretaria"` ao `primaryFor` do item `agenciamentos` para aparecer na navegação principal dela.

### 4. Verificação de UI/servidor
Revisar `_app.agenciamentos.tsx`, `AgenciamentoFormModal`, `AgenciamentoDetailDrawer` e `agenciamentos.functions.ts` para garantir que:
- Nenhum bloqueio hard-coded a `admin_owner` impeça a secretária de criar/editar.
- Ações que exigirem `agenciamentos:manage` (se existirem — ex.: excluir agenciamento, aprovar captação) permaneçam ocultas via `PermissionGuard`.
- Filtros por ownership no servidor não escondam dados dela (secretaria deve ver todos os agenciamentos da agência, como já ocorre em Atendimentos/Clientes para esse perfil).

## Resultado
Bianca passa a ver "Agenciamentos" na sidebar/bottom-nav e pode ler/criar/editar registros. Ações administrativas (se houver) continuam restritas ao admin.
