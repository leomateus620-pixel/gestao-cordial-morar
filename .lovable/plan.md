# Boletos Sicredi — contratos de marca "ambas" (sobre 7a4b552a)

## O que muda para o operador
- Contrato **Cordial** ou **Morar**: nada muda. A conta é a da marca do contrato, sem escolha.
- Contrato **ambas**: a janela de confirmação mostra "Emitir pela conta: Cordial / Morar". Sem escolha, o botão Emitir fica bloqueado com aviso.
- **Secretária**: só vê as marcas a que está vinculada (com uma marca só, ela já vem marcada). **Admin**: vê as duas.
- Depois de escolher, a prévia recarrega e mostra o ambiente (produção se liberada, senão homologação), como hoje.

## Regra no servidor (a interface não decide nada)
- Nova função pura `resolveIssuingBrand(flags, contractBrand, escolhida)` em `rules.ts`:
  - contrato cordial/morar + escolha ausente ou igual → marca do contrato; escolha diferente → **recusada** ("marca forçada").
  - contrato ambas + sem escolha → bloqueio "Escolha a conta de emissão".
  - contrato ambas + escolha → admin qualquer; secretária só se a marca está nos vínculos dela; senão **negada** (42501).
  - outro valor de marca → bloqueio, como hoje.
- `boletoContractAccess` mantém o acesso de leitura ao contrato "ambas" para secretária com alguma marca (já é assim); a emissão passa a depender também de `resolveIssuingBrand`.
- Também passa a ser usada em `marcasPermitidas(flags, contractBrand)`, retornada na prévia para a janela montar as opções.

## Arquivos
- `src/lib/boleto/rules.ts` — `resolveIssuingBrand`, `marcasPermitidas`; comentário de `boletoContractAccess` atualizado.
- `src/lib/boleto/preview.ts` — recebe a marca resolvida (ou o bloqueio) em vez de ler `c.brand` direto; snapshot ganha `conta.brand` (já existe) e `marcaContrato` + `marcaEscolhida: boolean`.
- `src/lib/boleto/boletos.functions.ts` — `previewInput`/`issueInput` ganham `brand` opcional (`cordial|morar`); `computePreview` chama `resolveIssuingBrand` com os papéis/vínculos já lidos em `authorizeContract` e só então `pickIssuingAccount(brand)`; `issueBoleto` exige que a marca do preview seja a mesma enviada (como já faz com total e ambiente). Prévia devolve `marcasPermitidas` e `precisaEscolherMarca`.
- `src/components/alugueis/BoletoConfirmModal.tsx` — seletor Cordial/Morar só para contratos "ambas", com as opções vindas do servidor; reenvia a prévia ao trocar.
- `src/components/alugueis/RentalEmissions.tsx` — só repassa a marca escolhida, se necessário.
- `src/lib/boleto/AGENTS.md` — substituir a regra da marca: "brand comes from the contract; 'ambas' contracts take an operator choice validated on the server against user_agencies".

## Migração 0103 (aditiva, só `CREATE OR REPLACE FUNCTION`)
- `rental_boleto_prepare`: a checagem de marca passa a aceitar `c.brand = acc.brand` **ou** `c.brand = 'ambas'` (com conta cordial ou morar). Cordial→conta Morar e o inverso continuam recusados (42501).
- Resto idêntico: mesma assinatura, `SECURITY DEFINER`, mesmos grants; trava e regra de um boleto ativo continuam por contrato × competência × ambiente, **sem a marca** — um boleto ativo pela Cordial impede outro pela Morar na mesma competência e ambiente.
- Evento "Boleto preparado" ganha em `detalhe`: `marca_conta` e `marca_contrato`.
- Conferência antes/depois: assinatura, dono, grants e `prosecdef` iguais. Nenhum dado alterado; journal Drizzle preservado.

## Testes
- Puros (`test:boleto`): secretária Cordial em contrato ambas pela Cordial → ok (homologação); mesma pela Morar → negada; secretária sem marca → negada; admin Cordial e Morar → ok; contrato cordial sem escolha → cordial; contrato cordial com escolha "morar" → recusada; contrato ambas sem escolha → bloqueio; snapshot registra marca escolhida.
- Banco (SELECT/transação revertida no teste existente de 0100, ou via função de verificação sem gravar): prepare aceita ambas+cordial e ambas+morar; recusa contrato cordial→conta morar; segundo prepare na mesma competência/ambiente por outra marca devolve o boleto existente.
- Rodar build, typecheck, `test:boleto`, `test:receipts` e a suíte completa (NFS-e, Emissões).

## Riscos
- Dois operadores escolhendo marcas diferentes ao mesmo tempo: resolvido pela trava, que ignora a marca (o segundo recebe o boleto do primeiro).
- Boleto já ativo pela marca A e operador escolhendo B: a tela mostrará o boleto existente, sem emitir outro. Trocar de marca exige baixa/rejeição do atual.
- Liberação de produção é por marca: em "ambas", Cordial pode sair em produção e Morar em homologação; o ambiente aparece sempre na confirmação.

## Perguntas
1. O teste de banco pode criar uma linha de homologação num contrato "ambas" e revertê-la na mesma transação (nada fica gravado)? Se não, cubro só a regra da função por leitura do código e testes puros.
2. A escolha deve ficar memorizada por contrato (pré-selecionada na próxima competência) ou sempre começar vazia? Proposta: sempre vazia, exceto quando a secretária tem uma única marca.
