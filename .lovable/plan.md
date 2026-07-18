## Objetivo
Quando o corretor **abrir** um atendimento vinculado a ele, todos os admins recebem uma notificação inteligente no sino avisando que o atendimento foi iniciado. Disparo único por atendimento (não repete a cada abertura).

## Definição de "abrir"
Considero "abrir o atendimento" como o corretor **acessar a página de Atendimentos com o card do atendimento carregado E ele ser o corretor atribuído**. Isto cobre tanto o fluxo "cliquei na notificação → cheguei no card" quanto "entrei no menu Atendimentos e vi o card na fila". A confirmação acontece 1x por atendimento (idempotente via coluna no banco).

Alternativa mais restritiva (posso trocar): disparar só quando o corretor **clicar em uma ação** (ligar, WhatsApp, agendar, converter). Diga se prefere essa.

## Banco
Migração:
- `ALTER TABLE public.attendances ADD COLUMN opened_at timestamptz, ADD COLUMN opened_by uuid`.
- Função `public.mark_attendance_opened(_id uuid)` (SECURITY DEFINER):
  - Verifica `auth.uid()` = `corretor_id` do atendimento; caso contrário, no-op.
  - Se `opened_at IS NULL`: seta `opened_at = now()`, `opened_by = auth.uid()`.
  - Para cada usuário com role `admin` (via `user_roles`), insere em `public.notifications`:
    - `tipo = 'atendimento_iniciado'`
    - `titulo = 'Atendimento iniciado por <nome do corretor>'`
    - `mensagem` com cliente, telefone, interesse e bairro
    - `link = '/atendimentos?id=<uuid>'`
  - Não notifica o próprio criador do atendimento se ele já for admin? Sim, notifica todos os admins (inclusive o criador admin) — é o comportamento pedido ("Ricardo, Bruna recebem").
- `GRANT EXECUTE ON FUNCTION public.mark_attendance_opened(uuid) TO authenticated`.

## Server function
Novo `markAttendanceOpened` em `src/lib/attendances/attendances.functions.ts` com `requireSupabaseAuth`, chamando o RPC acima. Idempotência garantida no banco; chamadas repetidas do cliente não geram spam.

## Frontend
Em `src/routes/_app.atendimentos.tsx`:
- `useEffect` que, quando `isLoading === false`, percorre `filteredAtendimentos` e, para cada um onde `corretorId === session.user.id` **e** `opened_at` ainda nulo no DTO, dispara `markAttendanceOpened({ data: { id } })` uma única vez por sessão (guardado em `useRef<Set<string>>`).
- Tipo `Atendimento` recebe `openedAt: string | null` e o mapper em `attendances.functions.ts` popula o campo.
- Como a chamada é idempotente no servidor, mesmo se o efeito rodar duas vezes em StrictMode não há duplicidade.

## Validação (pós-implementação)
1. Login como Bianca (secretária) → criar novo atendimento e vincular ao corretor Geandre (ou Felipe/Pablo) → salvar.
2. Verificar no sino do próprio Geandre: notificação "Novo atendimento atribuído" (já existente).
3. Login como Geandre → abrir menu Atendimentos → card aparece.
4. Verificar no sino de Ricardo e Bruna (admins): nova notificação "Atendimento iniciado por Geandre …" com link para o card.
5. Recarregar Geandre → não gera nova notificação para admins (idempotência).

## Detalhes técnicos
- RLS de `attendances`: SELECT já permite `corretor_id = auth.uid()::text` (feito na etapa anterior). O RPC roda como SECURITY DEFINER, então lê o registro mesmo se algo mudar em RLS.
- O RPC lê `profiles.nome` do corretor para compor a mensagem.
- `search_path = public` fixado na função.
- Notificações para admins usam a mesma tabela `public.notifications` — o sino já suporta `link` e navegação (implementado antes).
