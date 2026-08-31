# Geração de códigos Cordial/Morar: corrigir o erro e a fuga de números

## O que está acontecendo (verificado no banco)

Dois defeitos independentes, os dois confirmados nos dados:

1. **Erro "duplicate key ... provider_code_reservations_unique" (Cordial).**
   A tabela de reservas tem uma restrição única por (imobiliária, código) que vale
   para qualquer linha, inclusive as já liberadas/expiradas. O gerador, depois da
   última correção, passou a reaproveitar números vagos — o próximo livre da Cordial
   é **1340**, que já existe como reserva *expirada*. Ele tenta criar uma linha nova
   com o mesmo número e o banco recusa. Por isso o campo Cordial mostra erro em todo
   clique, enquanto a Morar (que só tem números novos) funciona.

2. **Cada clique em "Gerar" queima um número (Morar 3336 → 3337 → 3338 → 3339 → 3340).**
   O formulário pede um código novo e nunca devolve o anterior: as reservas antigas
   ficam com status "reservado" até expirar, então o número anterior "some" e a
   sequência avança sozinha. Hoje há cinco reservas Morar penduradas sem imóvel.

## Solução

1. **Reaproveitar a linha vaga em vez de criar outra.** Quando o número escolhido já
   existir como reserva liberada/expirada, o gerador reativa aquela linha (novo dono,
   novo prazo) em vez de inserir uma duplicada. Fim do erro de chave duplicada.
2. **Clicar em "Gerar" de novo não avança a sequência.** Antes de reservar, o gerador
   libera a reserva anterior do próprio usuário para aquela imobiliária que ainda não
   está vinculada a um imóvel. Resultado prático: regerar devolve o mesmo número livre,
   e só avança de verdade quando o número está ocupado no site da imobiliária.
3. **Limpar as reservas de teste penduradas** (Morar 3336–3340) para a sequência voltar
   a 3336 e Cordial a 1340.
4. **Tela**: o botão "Gerar" fica bloqueado enquanto uma geração está em andamento e a
   troca de destino não dispara reserva duplicada.

## Detalhes técnicos

**Migração — `public.reserve_provider_code`**
- Substituir o `INSERT` final por `INSERT ... ON CONFLICT (provider, code) DO UPDATE`
  com `WHERE provider_code_reservations.status IN ('released','expired','taken_remote')`,
  atualizando `status='reserved'`, `reserved_by`, `reserved_at`, `expires_at`, `property_id`,
  e `RETURNING id`. Se o conflito for com uma reserva ativa (corrida), repetir a varredura
  do menor livre (loop curto sob o `pg_advisory_xact_lock` já existente).
- Antes da varredura: `UPDATE ... SET status='released'` nas reservas do próprio
  `auth.uid()` com `status='reserved'`, mesmo provedor e `property_id IS NULL`, para
  o clique repetido não queimar número.
- Manter `release_expired_provider_codes()`, o piso por provedor, a exclusão do campo
  legado `codigo` e a assinatura atual `(code, reservation_id, expires_at)`.

**Limpeza de dados**
- Liberar as reservas Morar 3336–3340 (`status='released'`), todas sem imóvel vinculado.

**Frontend (`PropertyForm.tsx`)**
- Em `reserveCode`, guardar o `reservationId` anterior e limpar o estado de erro antes
  de nova tentativa; manter o guard de `status === "generating"` e o `autoReserved` por
  destino para evitar reservas em duplicidade ao alternar Cordial/Morar.
- Nenhuma mudança de assinatura em `codes.functions.ts` nem em `usePropertyCode`.

**Validação**
- Rodar `reserve_provider_code('cordial')` e conferir retorno **1340** sem erro,
  chamando duas vezes seguidas e confirmando que continua 1340.
- Idem para `morar` → **3336** estável.
- Conferir que nenhum código já publicado (500 Cordial / 304 Morar) é reemitido.
- Teste real no wizard com os dois destinos e typecheck.
