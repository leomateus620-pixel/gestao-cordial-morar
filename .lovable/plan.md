## Objetivo
Liberar o menu **Aluguéis** para o perfil `secretaria` (Bianca), com todas as funcionalidades do módulo (leitura e escrita), mantendo a mesma capacidade dos demais perfis operacionais.

## Alteração
Arquivo único: `src/lib/mock/permissions.ts` — bloco `secretaria`:
- Adicionar `"alugueis"` ao array `modules`.
- Adicionar `"alugueis:read"` e `"alugueis:write"` ao array `permissions`.

Isso é suficiente porque:
- `RequireModuleAccess` (usado em `/alugueis`) e o sidebar/mobile nav consultam `canAccessModule` → derivado de `roleDefinitions[perfil].modules`.
- Não há checagem server-side por perfil nas server functions de aluguéis; as RLS já autorizam usuários autenticados a criar/editar seus próprios registros, então a secretaria terá CRUD completo assim que o módulo for exposto.

## Fora de escopo
- Não altero navegação mobile primária (Aluguéis fica acessível via "Mais").
- Não altero permissões dos outros perfis.
- Nenhuma migração de banco.
