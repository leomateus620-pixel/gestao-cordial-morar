
# Pesquisa de Satisfação — Plano

## Visão geral
Novo menu **Pesquisa de satisfação** onde admins geram um link público único por atendimento/corretor, enviam ao cliente (WhatsApp/e-mail), e o cliente responde uma avaliação simples (1–5 estrelas + comentário) sem precisar logar. As respostas alimentam um dashboard restrito a admins com média por corretor, ranking, evolução no tempo e lista de comentários.

## Banco de dados (nova migração)

Duas tabelas em `public`:

**`satisfaction_surveys`** (link gerado pelo admin)
- `token` (text, único, ~24 chars, usado na URL pública)
- `corretor_id` (uuid → profiles.id)
- `client_id` (uuid → clients.id, opcional)
- `client_nome` (text) / `client_contato` (text, opcional) — snapshot para quando não há cliente cadastrado
- `contexto` (text, opcional — ex.: "Visita imóvel X")
- `status` ('pendente' | 'respondida' | 'expirada')
- `expires_at` (timestamptz, default now()+30 dias)
- `created_by` (uuid), `created_at`, `updated_at`, `responded_at`

**`satisfaction_responses`**
- `survey_id` (uuid → satisfaction_surveys, único — 1 resposta por link)
- `rating` (int, 1–5, NOT NULL)
- `comentario` (text, max 1000)
- `created_at`

### RLS + GRANTs
- `satisfaction_surveys`: admin faz tudo (has_role admin); `anon` pode SELECT apenas por token via função SECURITY DEFINER (não policy aberta); autenticados que não são admin: sem acesso.
- `satisfaction_responses`: admin SELECT; INSERT público via função SECURITY DEFINER `submit_satisfaction_response(token, rating, comentario)` que valida token, status='pendente', não expirado, e atualiza survey para 'respondida'.
- Função `get_satisfaction_survey_by_token(token)` (SECURITY DEFINER) devolve apenas dados seguros: nome do corretor, contexto, status — nada de PII do cliente para o próprio cliente.
- GRANTs: `authenticated` full CRUD nas duas (gate por policy admin); `anon` só EXECUTE nas duas funções.

## Backend — server functions

`src/lib/satisfaction/satisfaction.functions.ts`:
- `createSurvey({ corretor_id, client_id?, client_nome, contexto? })` → admin-only, gera token e retorna URL pública.
- `listSurveys({ status?, corretor_id?, periodo? })` → admin-only, lista com join em profiles + resposta.
- `deleteSurvey(id)` / `resendSurvey(id)` (regenera token/expira).
- `getSurveyStats({ periodo? })` → agregações: média geral, média por corretor, ranking, série mensal, últimas respostas com comentário.

Todas usam `requireSupabaseAuth` + verificação `has_role('admin')`.

Rota pública (form do cliente) — server function pública (sem auth):
- `getPublicSurvey({ token })` chama RPC `get_satisfaction_survey_by_token`.
- `submitPublicResponse({ token, rating, comentario })` chama RPC `submit_satisfaction_response` com validação Zod (rating 1–5, comentário ≤1000).

## Rotas e UI

### Menu interno (admin)
- `src/routes/_authenticated/pesquisa-satisfacao.tsx` → layout com abas.
- Adicionar item no sidebar (menu lateral existente) visível **apenas para admin**.
- 3 seções em Tabs:
  1. **Dashboard** — KPIs (média geral, total de respostas, taxa de resposta), gráfico de linha (evolução mensal, recharts), ranking de corretores (tabela com média + nº respostas + estrelas), lista de comentários recentes com filtro por corretor/nota/período.
  2. **Links enviados** — tabela de surveys (corretor, cliente, contexto, status, criado em, ação: copiar link/WhatsApp/reenviar/excluir). Filtros por status/corretor.
  3. **Novo link** — modal/drawer com select de corretor, select opcional de cliente ou nome livre, contexto; ao criar, mostra URL + botões Copiar / WhatsApp / QR.

### Rota pública (cliente responde)
- `src/routes/avaliar.$token.tsx` — top-level, SSR on, sem auth.
- Layout centralizado, mobile-first: logo/nome da imobiliária, "Como foi seu atendimento com **{corretor}**?", 5 estrelas grandes (tocáveis), textarea opcional, botão enviar.
- Estados: form → enviando → sucesso ("Obrigado!"), link inválido/expirado, já respondida.
- `head()` com título/description próprios e `robots: noindex`.

## Responsividade
- Padrão do projeto (grid + min-w-0 + shrink-0). Cards KPI: 1 col mobile → 2 col sm → 4 col lg.
- Tabela vira lista de cards em <sm.
- Estrelas 44px mínimo (touch target); textarea full-width.

## Fora de escopo
- Envio automático de e-mail/WhatsApp (só gera link + botões de copiar/compartilhar).
- Múltiplos critérios, NPS, respostas anônimas sem token.
- Exportar CSV (pode vir depois).

## Arquivos a criar/editar
- Migração: `supabase/migrations/<ts>_satisfaction.sql` (enums, tabelas, GRANTs, RLS, funções SECURITY DEFINER).
- `src/types/satisfaction.ts`
- `src/lib/satisfaction/satisfaction.functions.ts`
- `src/lib/satisfaction/satisfaction-public.functions.ts` (endpoints públicos)
- `src/hooks/useSatisfaction.ts`
- `src/routes/_authenticated/pesquisa-satisfacao.tsx`
- `src/routes/avaliar.$token.tsx`
- `src/components/satisfaction/*` (SurveyDashboard, SurveyList, NewSurveyDialog, StarRating, PublicSurveyForm)
- Editar sidebar existente para incluir o item (visível apenas para admin).
