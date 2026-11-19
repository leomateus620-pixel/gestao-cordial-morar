# Boletos Sicredi — 3 correções antes de publicar (sobre 5c5f6757)

Nada será publicado. Sem alteração de dados, sem tocar sync Imobi, crons, NFS-e ou recibos.

## 1. Migração 0102 — privilégios (aditiva, via ferramenta, journal preservado)
- `REVOKE ALL` de `anon` em `billing_accounts`, `billing_account_events`, `rental_boletos`, `rental_boleto_events`.
- `REVOKE INSERT, UPDATE, DELETE, TRUNCATE` de `authenticated` nas mesmas 4 (fica só SELECT + RLS atual). `service_role` intacto.
- `REVOKE TRUNCATE ON rental_emissions FROM authenticated` (e de `anon`); INSERT/UPDATE/DELETE de recibos/NFS-e não mudam.
- Conferência: `information_schema.role_table_grants` antes e depois (comparação registrada no resumo).

## 2. Secretária e admin emitem para qualquer contrato da marca
Como a marca é determinada hoje: tabela `user_agencies` (user_id, agency = cordial/morar). Hoje há 1 secretária vinculada à Cordial e 1 à Morar; admins estão nas duas.

Regra proposta (mais segura):
- Admin: qualquer contrato, qualquer marca.
- Secretária: só contratos cuja marca está em `user_agencies` dela; contrato `ambas` conta se ela tiver qualquer marca (o boleto já sai pela marca do contrato). Secretária sem vínculo = negada.
- Corretor, financeiro, meta_reviewer, atendimentos_viewer: negados (como hoje).

Implementação:
- Novo `authorizeBoletoContract(ctx, contractId)` no servidor: checa papel e marcas pela sessão do usuário (`user_roles`/`user_agencies`), depois lê o contrato com o cliente de serviço (carregado dentro do handler) e confere a marca.
- `computePreview`, emitir, atualizar, conciliar, PDF e a lista de boletos do contrato passam a ler contrato, inquilino, imóvel, recibos e `rental_boletos` pelo cliente de serviço sempre filtrados pelo id do contrato autorizado.
- PDF: URL assinada gerada pelo cliente de serviço após a autorização.
- Nenhuma policy de aluguel ou de `rental_boletos` é ampliada.
- O cartão de Emissões já usa as funções do servidor; ele passa a funcionar para a secretária sem mudança de policy.

## 3. Homologação com pagador fictício
- Novo `SANDBOX_PAGADOR` fixo em `sicredi/body.ts` (nome "PAGADOR TESTE HOMOLOGACAO", CPF de teste válido, endereço/CEP de teste do manual).
- Em sandbox, o corpo enviado ao Sicredi usa sempre esse pagador. Em produção, segue o inquilino real.
- O snapshot grava `pagadorEnviado: "ficticio"` e mantém só o id do inquilino real como referência interna.
- Modal: em homologação, aviso "Pagador fictício de teste será enviado". As falhas de CPF/CEP do inquilino aparecem como aviso, sem bloquear. Em produção elas continuam bloqueando.

## Testes
- Privilégios: teste que lê os grants (sem escrita) e confirma que `authenticated` e `anon` só têm SELECT ou nada. Mais um teste de que o navegador recebe 42501 ao tentar inserir em `rental_boletos`. Os testes de recibos seguem verdes.
- Permissões: admin ok; secretária ok em contrato da marca dela que não criou (sandbox); secretária de outra marca negada; secretária sem vínculo negada; corretor, financeiro, meta_reviewer e atendimentos_viewer negados.
- Sandbox: o corpo nunca contém nome, documento ou endereço do inquilino. Produção contém. Aviso no lugar do bloqueio só em sandbox.
- Rodar build, typecheck, `test:boleto`, `test:receipts` e a suíte completa. Um ensaio real na homologação com a secretária num contrato que ela não criou.
- Atualizar `src/lib/boleto/AGENTS.md` (regra de leitura via cliente de serviço depois da autorização, e o pagador fictício).

## Riscos
- O cliente de serviço ignora a RLS; mitigado por autorização prévia e filtro obrigatório por contrato/marca (coberto por teste).
- Revogar TRUNCATE em `rental_emissions` não afeta o app (ele não usa TRUNCATE).

## Pergunta
- Contratos de marca "ambas": a secretária com uma só marca pode emitir? Proposta: sim, pela marca do contrato definida no servidor. Se preferir, posso negar e deixar só para o admin.
