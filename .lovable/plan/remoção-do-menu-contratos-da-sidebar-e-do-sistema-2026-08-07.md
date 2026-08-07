# Remoção do menu "Contratos" da sidebar e do sistema

## Objetivo
Remover o item **Contratos** da navegação lateral (sidebar) e do menu "Mais", já que o módulo não será mais utilizado. Como ele deixa de ser usado, o plano também limpa as permissões, rotas e links diretos relacionados, evitando telas órfãs ou acessíveis apenas por URL.

## Escopo

### 1. Remover da navegação
- Remover o objeto `Contratos` do array `moduleItems` em `src/components/shared/module-menu.ts`.
- Isso automaticamente o retira da sidebar e do menu `/mais`.
- Atualizar `src/components/shared/module-menu.test.ts` para refletir a nova ordem e ausência de `/contratos`.

### 2. Limpar permissões e papéis
- Remover `"contratos"` de `AppModule` e as permissões `"contratos:read"` / `"contratos:write"` de `Permission` em `src/lib/mock/permissions.ts`.
- Remover `"contratos"` dos arrays `modules` e `permissions` de cada `RoleDefinition`.
- Remover `"contratos"` de `allModules` e `allPermissions`.
- Ajustar `src/lib/access-control.test.ts` se houver asserções sobre essas permissões.

### 3. Remover rotas e páginas
- Excluir `src/routes/_app.contratos.tsx`.
- Excluir `src/routes/_app.contratos.$contratoId.tsx`.
- O `routeTree.gen.ts` é gerado automaticamente; não editar manualmente.

### 4. Remover links diretos para contratos
- Em `src/routes/_app.imoveis.$imovelId.tsx`, remover a seção que lista/links contratos do imóvel.
- Em `src/routes/_app.busca.tsx`, ajustar textos descritivos que mencionam contratos.
- Verificar outros componentes que façam `Link to="/contratos/..."` e remover ou redirecionar.

### 5. Limpar dados mock (se necessário)
- Verificar `src/lib/mock/data.ts` e `src/store/app-store.ts` para remover `contratosSeed` e o campo `contratos` do store, caso não seja mais consumido por relatórios ou outros módulos.
- Se vendas/aluguéis ainda referenciarem `contratoId` em lógica local, manter o tipo mínimo ou migrar para referência direta ao negócio (venda/aluguel).

### 6. Validação
- Executar `bun test` para garantir que testes de sidebar e permissões passam.
- Verificar visualmente a sidebar para confirmar que "Contratos" desapareceu.
- Garantir que `/contratos` e `/contratos/:id` não carreguem mais (404).

## Não incluído
- Não serão removidas tabelas ou dados reais do backend neste plano (a remoção é de navegação e permissões de frontend).
- Se o usuário desejar apenas ocultar da sidebar sem remover rotas/permisões, o plano deve ser reduzido ao passo 1.
