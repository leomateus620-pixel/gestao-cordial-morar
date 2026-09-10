# Contatos de proprietário sumidos: apurar e recuperar

## O que já está confirmado

- No Gestão, os campos de proprietário (nome, celular, e-mail) **nunca** foram preenchidos nos imóveis importados: hoje, dos 806 importados, 1 tem nome e 1 tem telefone. Só os 24 cadastrados manualmente têm contato (17 nomes, 16 telefones). Não houve apagamento no banco do Gestão — não existe registro anterior a restaurar aqui.
- Onde esses dados sempre viveram é no painel do Imobi (tela "RESPONSÁVEL" do print), como vínculo do imóvel com um cadastro de proprietário.
- Entre 08/09 e 09/09 o sistema enviou **535 atualizações bem-sucedidas** de imóveis para os dois sites (Cordial e Morar), pela rota de alteração do Imobi. Nessas alterações o campo de proprietário é **omitido** sempre que o Gestão não tem nome do dono — o que é o caso de praticamente todos os imóveis.
- Suspeita principal (ainda não comprovada): a rota de alteração do Imobi grava o registro inteiro, e campos omitidos são zerados. Isso explicaria o sumiço simultâneo em todos os imóveis dos dois sites.
- Ainda há **292 envios na fila** (pendentes/retentativa) que, se rodarem, repetem a mesma alteração em mais imóveis.

## Plano

### 1. Conter agora (antes de qualquer outra coisa)
- Cancelar/pausar os 292 envios pendentes de atualização, para não atingir mais imóveis.
- Bloquear temporariamente novos envios automáticos de atualização até a causa estar confirmada.

### 2. Comprovar a causa
- Escolher imóveis de controle: alguns que receberam atualização em 08–09/09 e, se existir, algum que **não** recebeu.
- Comparar no painel/API do Imobi se o vínculo de proprietário sobreviveu nos não atualizados e sumiu nos atualizados.
- Registrar a evidência (data do envio x estado do campo) em documento para encaminhar ao suporte do Imobi.

### 3. Impedir que volte a acontecer
- Ajustar o envio para **nunca** sobrescrever/zerar campos de responsável quando o Gestão não tem esse dado: enviar somente o que o Gestão realmente controla, preservando o que já está no site.
- Testar em 1 imóvel de cada site antes de liberar a fila novamente.

### 4. Recuperar os dados
Nós não temos cópia desses contatos, então a recuperação tem dois caminhos, nesta ordem:
- **a) Restauração pelo Imobi:** pedir ao suporte ImobiBrasil o restore dos vínculos de proprietário a partir do backup deles, com a data e a lista dos imóveis afetados que vamos entregar prontas.
- **b) Reconstrução parcial:** o cadastro de clientes/proprietários do Imobi continua existindo (49 na Cordial, 34 na Morar). Se o suporte não restaurar, dá para religar imóvel↔proprietário manualmente, com uma tela de apoio no Gestão para a equipe fazer isso em lote. Isso é trabalho manual e só vale se o restore falhar.

### 5. Guardar daqui em diante
- Passar a salvar o contato do proprietário também no Gestão (nome, celular, e-mail), para nunca mais depender só do site.
- Dependência conhecida: hoje a API do Imobi devolve o código do proprietário zerado (evidência em `docs/IMOBI-PROPRIETARIO-CONTATO.md`), então esse item depende do suporte liberar o campo — vai no mesmo chamado do item 4a.

## Detalhes técnicos

- Fila: `property_sync_jobs` (264 `pending`, 25 `retry`, 3 `processing`) — cancelar via update de status.
- Envio: `src/lib/imobibrasil/sync.server.ts` → `POST /imovel/alterar/{externalId}`; payload montado em `serializers.ts` (`assign(payload, "codigoProprietario", ...)`, omitido quando nulo) com códigos resolvidos em `catalogs.server.ts` (`resolveProviderCodes`, domínio `owner`).
- Comprovação: ler `/imovel/dados/{id}` antes/depois não serve (a API mascara `codigoProprietario`); a checagem precisa ser feita no painel do Imobi, com prints.
- Correção do item 3: no builder de update, enviar apenas o subconjunto de campos gerenciados pelo Gestão, ou preencher `codigoProprietario`/`codigoCorretor` com o valor remoto atual quando o local estiver vazio.
