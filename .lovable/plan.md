
## Objetivo

Na criação/edição de compromissos da Agenda, permitir adicionar **convidados externos por e-mail**. O evento é criado tanto na agenda do responsável (já existe) quanto na agenda de cada convidado, com convite enviado automaticamente pelo Google Calendar contendo título, descrição, tipo de evento e quem convidou.

## Como funciona

O Google Calendar já tem suporte nativo a convidados: ao incluir o campo `attendees` (lista de e-mails) no evento e usar `sendUpdates=all` no POST/PATCH, o Google dispara o e-mail de convite a partir da conta do responsável conectada. Os convidados recebem o convite na caixa de entrada e o evento aparece automaticamente na agenda deles (Google, Outlook, Apple etc., já que o convite segue padrão iCal).

Não é preciso provedor de e-mail próprio nem segundo OAuth — a conta Google já conectada do responsável faz o envio.

## Mudanças

### 1. Banco de dados (migration)

Nova tabela `agenda_event_guests`:
- `event_id` (FK → `agenda_events`, cascade delete)
- `email` (text, validado)
- `nome` (text, opcional)
- `response_status` (text default `needsAction`: needsAction/accepted/declined/tentative — preenchido depois do sync)
- `created_at`

GRANTs + RLS espelhando as policies atuais de `agenda_event_participants` (quem pode ver/editar o evento pode ver/editar seus convidados). SELECT incluso no select da agenda.

### 2. Tipos (`src/types/agenda.ts`)

Adicionar:
```ts
export interface AgendaGuest { email: string; nome?: string; responseStatus?: string }
```
e incluir `convidados: AgendaGuest[]` em `AgendaEvent` / `AgendaEventInput`.

### 3. Server function (`src/lib/agenda/agenda.functions.ts`)

- Incluir `agenda_event_guests(email,nome,response_status)` no `SELECT`.
- Mapear em `rowToEvent`.
- No `upsertAgendaEvent`: deletar + reinserir convidados igual aos demais filhos.
- Validar formato de e-mail.

### 4. Sync Google (`src/lib/google-calendar/google.server.ts`)

- Selecionar `agenda_event_guests(email,nome)` junto com o evento.
- No `buildEventPayload`:
  - adicionar `attendees: [{ email, displayName? }, ...]`
  - acrescentar à `description` uma linha com o tipo de evento e "Convidado por: <nome do responsável/criador>" (usar `responsavel_nome` ou `criado_por_nome`).
  - `guestsCanInviteOthers: false`, `guestsCanModify: false` (padrões seguros).
- Em `callCalendar` para POST/PATCH, anexar `?sendUpdates=all` na URL quando houver convidados (para o Google disparar o e-mail). Para DELETE também, para notificar cancelamento.
- Após o response, ler `attendees[].responseStatus` retornado e atualizar `response_status` em `agenda_event_guests` (best-effort).

### 5. UI (`src/components/agenda/AgendaFormModal.tsx`)

Nova seção "Convidados externos" (na coluna de Responsáveis ou logo abaixo), com:
- input de e-mail + input de nome (opcional) + botão "Adicionar"
- validação de e-mail
- lista em chips com botão remover
- texto auxiliar: "Receberão convite por e-mail e o compromisso será criado automaticamente na agenda deles."
- aviso discreto quando a conta Google do responsável não está conectada (sem conexão → convite não é enviado; o cadastro é salvo, mas com badge "convite pendente").

Estado `convidados: AgendaGuest[]` no `FormState`, refletido em `buildInput`.

### 6. Detalhe do evento (`AgendaEventCard` / `AgendaDetailDrawer` se houver)

Mostrar convidados com seu `responseStatus` (✓ aceito, ✕ recusou, ? talvez, • aguardando).

## Não muda

- Fluxo OAuth, rotas existentes, lógica de lembretes, layout geral do modal — apenas adições.
- Continua sem provedor de e-mail próprio: o envio é feito pelo Google a partir da conta conectada do responsável.

## Observações

- Se o responsável não tiver Google conectado, o evento é salvo normalmente, mas nenhum convite é disparado. UI sinaliza isso.
- Se o e-mail do convidado for inválido, o Google rejeita o POST → tratado no catch já existente, com mensagem clara.
