# Plano — E-mail automático no cadastro de atendimento

## Pré-requisito (ação do usuário antes de tudo)

Hoje o projeto **não tem domínio de e-mail configurado** (`email_domain_status = not_started`). Sem domínio verificado, nada envia. Como o requisito exige envio pelo domínio oficial `cordialgestao.com`, o primeiro passo é configurar o subdomínio de envio (recomendado: `notify.cordialgestao.com`) pela tela de setup do Lovable Emails. Isso é feito por você no clique do botão; eu cuido do resto do código no mesmo turno.

Após configurar o domínio (mesmo com DNS ainda propagando), eu sigo com a implementação. O envio só passa a sair de fato quando o DNS for verificado (até 72h), mas todo o fluxo de cadastro + enfileiramento continua funcionando.

<presentation-actions>
<presentation-open-email-setup>Configurar domínio de e-mail</presentation-open-email-setup>
</presentation-actions>

## O que será construído

1. **Infraestrutura de e-mail Lovable (fila + cron + tabelas de envio/supressão)** via setup automático. Sem chaves manuais, sem Resend/SendGrid avulso, sem expor segredos no frontend.
2. **Template React Email** `first-attendance-thank-you` em `src/lib/email-templates/`, registrado no `registry.ts`. Conteúdo personalizado por imobiliária (Cordial/Morar), finalidade (compra→"compra", aluguel→"locação"), tipo de imóvel (apartamento/casa/sítio/imóvel) e região, com fallback elegante quando campo está vazio. Inclui bloco resumo e CTA `mailto:` para o remetente (não criamos link para rota inexistente).
3. **Tabela `email_logs`** (migration) com idempotência por `(attendance_id, email_type)` para garantir 1 envio por atendimento. Campos: `id, attendance_id, recipient_email, email_type, subject, status (pending|sent|failed|skipped), provider, provider_message_id, error_message, sent_at, created_at, created_by`. RLS por dono do atendimento + admin; INSERT/UPDATE liberados ao `service_role` para a server function.
4. **Server function autenticada** `sendFirstAttendanceEmail` em `src/lib/attendances/email.functions.ts` (`createServerFn` + `requireSupabaseAuth`):
   - Recebe `{ attendanceId }`, busca o atendimento via RLS do usuário.
   - Valida e-mail (formato + não vazio). Inválido/ausente → grava `skipped` e retorna.
   - Verifica duplicidade em `email_logs` (status `sent`) → retorna sem reenviar.
   - Cria linha `pending`, chama helper interno de envio via fila Lovable (`enqueue_email` → template `first-attendance-thank-you`), atualiza para `sent` com `provider_message_id` ou `failed` com `error_message`.
   - Nunca lança para o cliente de forma a quebrar o cadastro: erros são logados e retornados como `{ status }`.
5. **Integração no fluxo de cadastro** em `src/routes/_app.atendimentos.tsx` (e `src/components/sheets/novo-atendimento.tsx`): após `addAtendimento` resolver com sucesso, dispara `sendFirstAttendanceEmail({ attendanceId })` em fire-and-forget com tratamento de erro silencioso. Toast adapta a mensagem:
   - sucesso + enviado: "Atendimento cadastrado e e-mail enviado ao cliente."
   - sem e-mail: "Atendimento cadastrado. E-mail automático não enviado (cliente sem e-mail)."
   - falha de envio: "Atendimento cadastrado. Não foi possível enviar o e-mail automático agora."
6. **Sem mudanças** em rotas, autenticação, ou no schema de `attendances`. Sem `localStorage`, sem chave de API no browser, sem `console.log` como substituto.

## Arquitetura (alto nível)

```text
UI (modal Novo Atendimento)
   │
   ▼
addAtendimento  ──►  Supabase: insert em attendances
   │ (sucesso)
   ▼
sendFirstAttendanceEmail (server fn, requireSupabaseAuth)
   │
   ├─ valida e-mail / idempotência (email_logs)
   ├─ renderiza template first-attendance-thank-you
   ├─ enqueue_email (fila pgmq Lovable)
   └─ atualiza email_logs (sent | failed | skipped)
            │
            ▼
   process-email-queue (cron) → entrega via domínio cordialgestao.com
```

## Detalhes técnicos

- **Provider**: Lovable Emails (infra gerenciada). Não usamos Resend/SendGrid avulso — atende ao requisito de "reutilizar provider já disponível no projeto" assim que o domínio for ativado.
- **Remetente**: `Gestão Cordial & Morar <atendimento@cordialgestao.com>` (configurado no template/registry; subdomínio técnico de DNS pode ser `notify.cordialgestao.com`, mas o From visível usa o root quando `display_from_root` estiver disponível).
- **Variáveis de ambiente**: nada novo a pedir ao usuário. `LOVABLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` já existem.
- **Idempotência**: índice único parcial `UNIQUE (attendance_id, email_type) WHERE status = 'sent'` em `email_logs` + checagem prévia na server fn.
- **Personalização**: helpers `formatFinalidade`, `formatTipoImovel`, `formatRegiao`, `formatImobiliaria` aplicam fallback para não gerar "undefined"/"null"/"A definir".
- **Validação de e-mail**: regex RFC simples + trim; vazio/placeholder/"A definir" → `skipped`.
- **Segurança**: server fn roda com RLS do usuário; `email_logs` tem políticas escopadas; service role só dentro da fn quando necessário para gravar log de falha.

## Arquivos a criar/alterar

- **Migration** (via supabase--migration): cria `email_logs` + GRANTs + RLS + índice de idempotência.
- **Novo**: `src/lib/email-templates/first-attendance-thank-you.tsx` (React Email).
- **Editar**: `src/lib/email-templates/registry.ts` (registrar template).
- **Novo**: `src/lib/attendances/email.functions.ts` (`sendFirstAttendanceEmail`).
- **Editar**: `src/routes/_app.atendimentos.tsx` e `src/components/sheets/novo-atendimento.tsx` (chamar a server fn após criar atendimento, adaptar toasts).

## Limitações e itens externos pendentes

- **DNS de `cordialgestao.com`**: você precisa adicionar os registros NS que o setup do Lovable mostrar (delega o subdomínio `notify.cordialgestao.com`). SPF/DKIM/DMARC ficam sob esse subdomínio gerenciados pelo Lovable; nada manual.
- Enquanto o DNS não verifica, o atendimento salva e o e-mail fica enfileirado/log `pending`/`failed` — sem quebra de cadastro.
- Reenvio manual de falhas não está no escopo deste plano (pode ser adicionado depois como ação no card).

## Validação ao concluir

- Build + typecheck.
- Cadastro com e-mail válido (Cordial e Morar; apartamento/casa/sítio; compra/aluguel) → log `sent`.
- Cadastro sem e-mail → log `skipped`, toast adequado.
- Cadastro com e-mail inválido → log `skipped`, sem tentativa de envio.
- Refresh da página não reenvia (idempotência).
- Falha simulada do provider não quebra o insert do atendimento.

Aprove o plano (e clique em "Configurar domínio de e-mail" acima) para eu implementar.
