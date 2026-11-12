# Perfil "Consulta de Atendimentos" (atendimentos_viewer) — somente leitura

Papel novo, deny-dominant, no mesmo padrão do `meta_reviewer`. Nenhum usuário é criado, nenhuma senha, nada publicado.

## 1. Levantamento antes de codar (primeiro passo)
- Listar com SELECT todas as tabelas public com RLS (para as policies restritivas) e todas as funções SECURITY DEFINER executáveis por `authenticated` (para guardas).
- Mapear tudo que a tela Atendimentos consulta: `src/routes/_app.atendimentos.tsx`, `src/components/atendimentos/*`, `src/hooks/useAttendances.ts`, `src/lib/attendances/*` (já confirmado: `attendances`, `attendance_history`, `attendance_assignments`, `profiles`, `email_logs`, RPCs `has_role`, `mark_attendance_first_opened`, `attendance_add_note`, `find_attendance_contact_matches`, atribuição). Qualquer tabela extra necessária só para exibir o card entra na allowlist como SELECT; preferir campos já em `attendances`.
- O nome do corretor no card vem de `profiles`: liberar SELECT só de perfis de equipe necessários para o nome (via RPC/visão de leitura mínima se a policy atual de `profiles` não cobrir), sem expor o resto.

## 2. Migração aditiva (próximo número após 0089)
Em duas partes (enum precisa ser commitado antes de uso):
- A: `ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'atendimentos_viewer'`.
- B:
  - `is_atendimentos_viewer()` — SECURITY DEFINER, `search_path=public`, REVOKE PUBLIC/anon, GRANT authenticated/service_role.
  - `has_role` reescrita preservando a regra do `meta_reviewer`: se o usuário tem `atendimentos_viewer`, só retorna verdadeiro para `'atendimentos_viewer'`; idem meta_reviewer.
  - Policy RESTRICTIVE `atendimentos_viewer_block` FOR ALL em toda tabela com RLS, exceto allowlist: `USING/WITH CHECK (NOT is_atendimentos_viewer())`.
  - Allowlist (`profiles`, `user_roles`, `user_agencies`, `attendances`, `attendance_history`, `attendance_assignments`): RESTRICTIVE para INSERT, UPDATE e DELETE bloqueando o papel (SELECT segue as permissivas).
  - Nova permissiva SELECT em `attendances`: `is_atendimentos_viewer() AND current_user_has_notification_agency_access(imobiliaria)`; equivalente em history/assignments via `attendance_can_access`.
  - `attendance_can_access`: leitura permitida para o papel (mesmo filtro de agência). Funções de "pode editar" continuam falsas para ele.
  - Guardas `42501` no início das RPCs de escrita/side-effect: `attendance_add_note`, `mark_attendance_first_opened`, atribuição/assumir, `find_attendance_contact_matches`, e-mail, relatório de histórico, assistente e as demais do inventário que não sejam leitura do menu. Só a guarda; corpo inalterado; guardas do meta_reviewer mantidas.
  - `list_corretores` / `list_assignable_brokers`: excluir usuários com este papel.
  - `provision_atendimentos_viewer(_user_id uuid, _agencies text[])`: SECURITY DEFINER, EXECUTE só para service_role; valida agências (`cordial`,`morar`); em uma transação apaga outros papéis, grava só `atendimentos_viewer`, substitui `user_agencies`. Não aceita outro papel e não lê `raw_user_meta_data`.
  - Regra em `handle_new_user` não muda; uso futuro: criar o usuário pelo servidor e chamar a função logo em seguida (o papel deny-dominant anula o `corretor` padrão mesmo numa janela curta, e a função o remove).
  - Mesma política restritiva deve ser lembrada em tabelas futuras (registro no AGENTS.md).
- Grants: nenhum INSERT/UPDATE/DELETE novo.

## 3. Frontend
- `permissions.ts`: perfil `atendimentos_viewer`, rótulo "Consulta de Atendimentos", módulos `["atendimentos"]`, permissões `["atendimentos:read"]`.
- `auth-mock.ts`: `mapDbRole` reconhece o papel; `pickHighestRole` com `meta_reviewer`, `atendimentos_viewer` no início.
- `access-control.ts`: `canAccessModule` só "atendimentos"; os helpers listados no pedido retornam falso; novo `canWriteAttendances` (falso para o papel) usado na UI.
- Login/`_app`: rota inicial `/atendimentos` para o papel (como o landing do meta_reviewer); `RequireModuleAccess` bloqueia o resto.
- Menu lateral, móvel, busca do cabeçalho e "Mais": só Atendimentos. CORDIAL bot oculto, rota e funções do assistente recusam o papel.
- Tela Atendimentos: ocultar Novo/Editar/Excluir, nota, atribuir/assumir, etapa/status terminal, venda, e-mail, PDF; funil sem arrastar (DnD desligado); abrir card não chama `mark_attendance_first_opened`. Link do WhatsApp continua.
- Server functions de escrita em `src/lib/attendances/*` também recusam o papel (além do banco).

## 4. Testes
- Papel: só módulo e permissão de leitura; `pickHighestRole` com corretor/admin → viewer.
- Helpers de acesso falsos; menu só com Atendimentos; testes atuais (access-control, module-menu, attendance, reviewer/RPC) continuam passando.
- SQL (transação com rollback, `set local role authenticated` + claims de usuário fictício): `has_role` deny-dominant dos dois papéis; SELECT das duas agências; INSERT/UPDATE/DELETE negados; tabelas fora da allowlist sem linhas; RPCs de escrita → 42501; função de provisionamento negada para authenticated.
- UI (Playwright com usuário de teste só se existir; senão teste de componente): sem botões de escrita, sem arrastar, sem bot, login cai em `/atendimentos`, rota externa bloqueada, sem chamada de primeira abertura.
- Typecheck e lint dos arquivos alterados.

## Riscos
- `profiles`: precisa do nome do corretor sem abrir dados de equipe além do necessário.
- Tabelas novas futuras precisam da policy restritiva do papel.
- Não publico; migração entra no banco compartilhado só com aprovação deste plano.
