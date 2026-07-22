## Objetivo

Melhorar o módulo Vendas com: (1) cálculo automático de % de comissão, (2) cadastro estruturado de formas de pagamento (entrada + parcelas com datas), e (3) notificações in-app + e-mail no dia do vencimento de cada parcela.

## Situação atual

- `real_estate_sales` guarda `commission_value` e `commission_percentage` como campos independentes, e `payment_details` é apenas texto livre.
- Não existe nenhuma tabela de parcelas nem dispatcher de vencimentos para Vendas.
- O template de e-mail de "vencimento" não existe.

## Mudanças

### 1. UI — cálculo automático da comissão (`SaleForm.tsx`)

- Ao digitar o valor da venda (`saleValue`) + valor da comissão (`commissionValue`), calcular `commissionPercentage = commissionValue / saleValue * 100` (2 casas) e vice-versa se o usuário digitar o %.
- Marcar os campos com um selo "auto" quando o valor foi derivado; usuário pode sobrescrever.
- Sem mudança no schema — os dois campos já persistem.

### 2. Formas de pagamento estruturadas

Nova seção "Plano de pagamento" no `SaleForm.tsx`:

- Campo "Entrada" (valor + data).
- Lista dinâmica de parcelas (valor + data de vencimento), botão "Adicionar parcela".
- Validação: soma (entrada + parcelas) deve bater com `saleValue` (aviso, não bloqueio).
- Mantém o select `paymentMethod` já existente (`À vista`, `Financiamento`, `Parcelado`, etc.).

Nova tabela:

```text
public.sale_payments
  id uuid PK
  sale_id uuid FK -> real_estate_sales (on delete cascade)
  kind text ('entrada' | 'parcela')
  sequence int              -- ordem da parcela (1..N)
  amount numeric NOT NULL
  due_date date NOT NULL
  paid boolean default false
  paid_at timestamptz
  notified_at timestamptz   -- controle de reenvio
  created_at / updated_at
```

RLS espelhando `real_estate_sales` (dono, admin, secretaria). Grants para authenticated + service_role.

Server functions em `sales.functions.ts`:
- `createSale` / `updateSale` aceitam `payments: Array<{ kind, amount, dueDate }>` e sincronizam a tabela (delete + reinsert na atualização).
- `listSalePayments(saleId)` para o drawer de detalhes.
- `markPaymentPaid(id)` para admin/secretaria marcar como pago.

`SaleDetailsDrawer.tsx` ganha uma seção "Plano de pagamento" mostrando parcelas com badge (Pago / A vencer / Vencido) e botão "Marcar como pago".

### 3. Notificações de vencimento (in-app + e-mail)

Reutilizar a infra já existente (dispatcher HTTP + `pg_cron` + `enqueue_email` + `notifications`), no mesmo modelo que a Agenda.

- Novo template `sale-payment-due` em `src/lib/email-templates/` + registro em `registry.ts`. Assunto: "Vencimento de parcela — <imóvel>". Corpo mostra comprador, imóvel, valor, data.
- Nova rota `src/routes/api/public/hooks/sale-payment-reminders.ts` que:
  - Busca `sale_payments` com `paid=false` e `due_date` = hoje (fuso America/Sao_Paulo) ou `due_date` = hoje+1 (aviso véspera).
  - Para cada parcela: cria `notifications` (destinatários = owner da venda + todos os admins) e enfileira e-mail via `supabase.rpc('enqueue_email', { queue_name: 'transactional_emails', payload })` para os mesmos e-mails.
  - Idempotência: usa `notified_at` (marca a linha depois de enviar) + `idempotencyKey` `sale-payment-<paymentId>-<yyyy-mm-dd>` para não duplicar em reruns.
- `pg_cron` diário às 08:00 BRT (11:00 UTC) chamando o hook. Também é seguro rodar a cada hora (idempotente).

### 4. Ordem de execução

1. Migração: `sale_payments` + RLS + grants; adicionar índice `(due_date, paid)`.
2. `sales.functions.ts`: aceitar/persistir/retornar `payments`.
3. `SaleForm.tsx`: seção de plano de pagamento + cálculo automático da comissão.
4. `SaleDetailsDrawer.tsx`: exibição + marcar pago.
5. Template + registry.
6. Dispatcher `sale-payment-reminders.ts`.
7. Agendar `pg_cron` (insert tool, não migração).

## Fora de escopo

- Alterar layout geral dos cards da lista de vendas.
- Sistema de recorrência automática (todos os pagamentos são cadastrados manualmente pelo usuário).
- Integração com boleto/gateway financeiro.
