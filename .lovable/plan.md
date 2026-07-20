## Problema

A Bianca (secretaria) não vê nenhum agenciamento porque a camada cliente filtra tudo antes da renderização, mesmo com o backend/RLS já liberando o acesso completo para o perfil `secretaria`.

Verificado nos arquivos:

- `src/services/agenciamentos.ts`
  - `getAgenciamentosVisibleToUser`: só devolve dados para `admin_owner` ou `corretor`; qualquer outro perfil recebe `[]`. Por isso a lista da Bianca fica sempre vazia.
  - `canEditAgenciamento`: só permite edição para `admin_owner` e `corretor`, ignorando `secretaria`.
- `src/hooks/useAgenciamentos.ts`
  - `isAdmin = perfil === "admin_owner"`; como Bianca não passa nesse teste, `effectiveFilters.corretorId` é forçado para o id dela (`"__sem_corretor__"` no fallback), zerando a lista, o ranking, o filtro por corretor e o painel administrativo.
- Servidor (`listAgenciamentos`) já trata `secretaria` como admin (retorna todos os registros), então a correção é 100% na camada de apresentação/serviço, sem mexer em RLS.

## Correção

Tratar `secretaria` como perfil administrativo do módulo de Agenciamentos (mesmo escopo de visão do admin), mantendo a validação final restrita ao `admin_owner`.

1. `src/services/agenciamentos.ts`
   - `getAgenciamentosVisibleToUser`: retornar todos os registros também quando `user.perfil === "secretaria"`.
   - `canEditAgenciamento`: permitir edição total para `secretaria` (mesma regra do admin), mantendo corretor restrito ao próprio registro e não-validado.

2. `src/hooks/useAgenciamentos.ts`
   - Introduzir um flag `isAdminLike = perfil === "admin_owner" || perfil === "secretaria"` e usá-lo em:
     - `effectiveFilters.corretorId` (não forçar o filtro pelo próprio id quando for secretaria — ela deve poder filtrar por qualquer corretor ou ver todos).
     - `ranking` e `dashboardAgenciamentos`/`dashboardSummary`/`dashboardRanking` (secretaria enxerga o mesmo painel operacional do admin).
   - Manter `isAdmin` (validação) apenas para `admin_owner`, para não liberar o botão "Validar" à secretaria.
   - Manter `canManage` como está (já vem por permissão `agenciamentos:manage` que a secretaria possui) para operações de escrita/edição.

3. Sanidade
   - Rodar typecheck.
   - Validar no preview com a sessão da Bianca: lista carrega, filtros por corretor funcionam, botão de validar continua oculto/ bloqueado.

## Escopo fora

- Sem alterações em RLS, migrations, permissões do banco, layout ou fluxo de cadastro.
- Sem mudanças no comportamento de admin e corretor.