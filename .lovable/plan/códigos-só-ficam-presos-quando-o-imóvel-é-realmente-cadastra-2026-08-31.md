# Códigos só ficam presos quando o imóvel é realmente cadastrado

## O que acontece hoje (verificado no código)

- Ao gerar, o número fica "reservado" por 120 minutos. Se o usuário fechar a aba,
  clicar em Cancelar ou simplesmente sair, ninguém devolve o número: ele só volta
  a ficar livre quando o prazo expira.
- Pior: quando o wizard cria o **rascunho** (isso acontece automaticamente na etapa
  de fotos e na etapa do Google Drive, para ter onde anexar arquivos), o sistema já
  marca o código como **confirmado** e vinculado a esse rascunho. Ou seja, mesmo que
  o cadastro nunca seja concluído, o número fica queimado para sempre.

## Solução

1. **Rascunho não confirma código.** Os códigos passam a ficar apenas reservados
   enquanto o cadastro estiver em andamento. A confirmação definitiva acontece só
   quando o usuário clica em "Publicar imóvel" / "Salvar imóvel".
2. **Sair devolve o número.** Ao cancelar o cadastro, voltar para o catálogo ou
   fechar/recarregar a aba, as reservas ainda não confirmadas são liberadas na hora
   e o número volta para a fila (o próximo cadastro pega o mesmo número).
3. **Trocar de destino também devolve.** Se o usuário desmarcar Cordial ou Morar na
   Etapa 1, a reserva daquele destino é liberada.
4. **Rede de segurança.** Uma rotina periódica libera reservas que ficaram penduradas
   sem imóvel vinculado (aba fechada abruptamente, queda de conexão), sem tocar em
   códigos já confirmados ou já publicados.

## Detalhes técnicos

**Frontend**
- `_app.imoveis.novo.tsx` e `_app.imoveis.$imovelId.editar.tsx`: remover
  `commitCodes` de `ensureDraft`; manter a confirmação apenas no `handleSubmit`.
- Novo `releaseAllCodes()` nos dois containers, chamado em:
  - `onCancel` do `PropertyForm`;
  - `useEffect` de desmontagem da rota (quando não houve submit bem-sucedido);
  - `beforeunload`/`pagehide` via `navigator.sendBeacon` para uma rota
    `src/routes/api/public/hooks/release-property-codes.ts` (valida o token do
    usuário no corpo antes de liberar) — sem beacon, o fechamento de aba não
    conseguiria devolver o número.
- `PropertyForm.tsx`: ao desmarcar um destino, chamar `release` com o
  `reservationId` daquele provedor e limpar o campo de código.
- Guard `committedRef` para nunca liberar reservas que já viraram imóvel salvo.

**Banco**
- `release_expired_provider_codes()`: incluir reservas com `status='reserved'`,
  `property_id IS NULL` e `reserved_at` mais antigo que o TTL, marcando `released`.
- Reduzir o TTL padrão da reserva de 120 para 30 minutos (tempo real de um cadastro),
  acelerando o retorno do número em caso de aba fechada.
- Agendamento periódico (pg_cron a cada 5 minutos) chamando a função de liberação.

**Validação**
- Gerar Cordial/Morar, avançar até a etapa de fotos (cria rascunho), cancelar:
  conferir no banco que as duas reservas ficam `released` e que um novo cadastro
  recebe **os mesmos números** (1340 / 3336).
- Gerar, fechar a aba: conferir liberação via beacon.
- Gerar e concluir o cadastro: conferir que as reservas ficam `committed` com
  `property_id` preenchido e que o próximo cadastro avança para 1341 / 3337.
- Teste de desmarcar destino na Etapa 1 e typecheck.
