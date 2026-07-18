## Objetivo
Permitir que a Bianca (secretária) cadastre atendimentos vinculando um corretor responsável. Ao finalizar o cadastro, o corretor recebe uma notificação inteligente com os dados essenciais do atendimento e passa a enxergar o registro no seu próprio painel.

## Situação atual
- A tabela `attendances` já tem `corretor_id` e o modal de cadastro já permite selecionar o corretor.
- **Problema 1 (RLS):** políticas de `SELECT/UPDATE` em `attendances` só liberam para `created_by` ou admin. Se a Bianca cria e atribui ao Pablo, o Pablo não vê o atendimento.
- **Problema 2 (Notificação):** não existe gatilho que crie um registro em `notifications` para o corretor atribuído. A RLS de `notifications` só permite `INSERT` do próprio usuário, então precisa ser via trigger `SECURITY DEFINER`.
- Já existem: tabela `notifications`, `notification-bell.tsx`, `listMyNotifications`, `markNotificationRead`.

## Mudanças

### 1. Banco (migração única)
- **RLS `attendances`:** adicionar `corretor_id = auth.uid()` às cláusulas de `SELECT` e `UPDATE` (mantendo created_by e admin). Corretor atribuído passa a ler e atualizar status/próximo passo do próprio atendimento. `DELETE` continua restrito a criador/admin.
- **Trigger `notify_atendimento_corretor`** (`AFTER INSERT OR UPDATE OF corretor_id ON attendances`, `SECURITY DEFINER`):
  - Dispara quando `NEW.corretor_id IS NOT NULL` e (`INSERT` ou `corretor_id` mudou) e `NEW.corretor_id <> NEW.created_by`.
  - Insere em `notifications` para o corretor:
    - `tipo`: `atendimento_atribuido`
    - `titulo`: `Novo atendimento atribuído a você`
    - `mensagem`: monta string inteligente com cliente, telefone, finalidade, tipo de imóvel, bairro, orçamento e próximo passo (campos disponíveis no NEW).
    - `link`: `/atendimentos?id={id}` para deep-link.

### 2. Frontend
- **`AtendimentoFormModal.tsx`:** quando o usuário logado é `secretaria` (ou `admin`) e seleciona um corretor diferente de si, mostrar um aviso discreto abaixo do seletor: "O corretor será notificado ao salvar." Nenhuma alteração no fluxo de submit.
- **`notification-bell.tsx`:** já lista notificações; garantir que ao clicar em uma notificação do tipo `atendimento_atribuido` o app navegue para `link` (usar `useNavigate` com o caminho salvo). Marcar como lida no clique.
- **Rota `/_app/atendimentos`:** ao receber `?id=<uuid>` na query, rolar/destacar o card correspondente (usar `Route.useSearch` + `scrollIntoView`), abrindo o `AtendimentoActionsDialog` se possível.

### 3. Sem mudanças
- Estrutura visual do modal, permissões de menu, hidratação de corretores — permanecem intactas.

## Detalhes técnicos
- Trigger precisa `SET search_path = public` e `SECURITY DEFINER` para poder gravar em `notifications` (RLS bloquearia inserts cross-user).
- Migração fará `DROP POLICY ... IF EXISTS` + `CREATE POLICY` para `SELECT` e `UPDATE` de `attendances`.
- Mensagem da notificação será construída em SQL com `concat_ws` e `NULLIF/trim` para omitir campos vazios sem gerar linhas soltas.
- Sem novos GRANTs necessários (tabelas já existem).

## Verificação
- Login como Bianca → criar atendimento atribuindo ao Pablo → conferir que aparece toast normal.
- Login como Pablo → sino mostra badge, notificação com dados do cliente; clicar navega para o atendimento; atendimento aparece na lista dele.
- Login como Pablo → criar atendimento para si mesmo → NÃO gera notificação (evitar auto-notify).