# Consistência ImobiBrasil — etapas restantes, executadas em sequência com teste a cada passo

Já concluído: salvamento + fila numa transação com união dos campos; comparação numérica por formato; importação sem preencher campos vazios; registro de divergências compatível com histórico.

Cada etapa abaixo termina com: testes novos (que falham antes da correção), `bun run test`, verificação de tipos. Nada destrutivo em imóveis de clientes; validação real só no imóvel de teste 1381/3380, ao final.

## Etapa A — Posse do trabalho antes de cada envio
- Conferir no código atual renovação de lease e `property_media_finish_job`.
- Checar posse (token + lease) antes de cada chamada ao site; perda de posse interrompe sem gravar nada.
- Trava por imóvel+site para efeitos externos.
- Finalização e agendamento de acompanhamento só com token válido; resposta tardia de rotina antiga é descartada.
- Testes: rotina antiga voltando após outra assumir; finalização sem posse não agenda nada.

## Etapa B — Pedido / enviado / visto no site / confirmado
- Snapshot confirmado só avança campo a campo após leitura igual; valor enviado fica em "tentado".
- Campo recusado segue pendente; campo que a leitura não mostra fica "não verificável".
- Trabalho só marca a revisão como confirmada sem pendências; reconciliação de existência não limpa divergência.
- Estados separados para cadastro, características e fotos.
- Testes: campo recusado, não verificável, reenvio após divergência não conclui "nada mudou".

## Etapa C — Fotos recuperáveis
- Conferir associação por posição e ordem de exclusão no código atual.
- ID do site ligado à foto só com evidência (lista antes/depois, diferença única); sem evidência fica pendente e nenhuma exclusão é feita.
- Plano de troca/reconstrução salvo com passo e resultado; retomada após queda.
- Validar todos os arquivos antes da primeira exclusão.
- Galeria vazia/menor/com fotos desconhecidas nunca é "completa".
- Testes: upload ambíguo sem duplicar, arquivo ausente antes de reconstruir, interrupção após cada passo.

## Etapa D — Importação e conflito Cordial x Morar
- Se as duas contas divergem entre si no mesmo campo, mantém o Gestão e registra conflito; ordem de importação não decide.
- Importação com revisão esperada; atualização + confirmação + conflito numa rotina transacional no banco.
- Referência de entrada atualizada após envio confirmado.
- Testes: limpeza local preservada, conflito entre contas com histórico.

## Etapa E — Paginação, características, retirada
- Leitura completa e retomável de ativos e inativos; página falha = leitura inconclusiva, nunca ausência.
- Características por conta com recuperação de falha parcial.
- Ocultar / retirar / excluir separados na documentação e na tela.
- Testes: paginação interrompida, características parciais.

## Etapa F — Limites e novas tentativas
- Limitador consultado antes de cada tentativa; Retry-After (segundos ou data) respeitado; espera longa reagenda o trabalho.
- Limitador fora do ar → espera conservadora; envio de inclusão nunca repetido automaticamente.
- Testes: Retry-After 60 não repete antes; falha de uma conta não afeta a outra.

## Etapa G — Tela e registros
- Por site: cadastro, características e fotos com estado, "salvo no Gestão em" e "confirmado em".
- Repetir apenas o componente/site pendente; nunca cria outro anúncio.
- Registros com operação, revisão, site e tentativa, sem tokens ou dados pessoais.

## Etapa H — Validação real e relatório
- No imóvel de teste: editar preço e descrição em seguida, limpar campo, trocar característica, trocar foto, conferir nos dois sites.
- Relatório: problemas confirmados, arquivos, migrações, testes, evidência por site, limites da API, pendências, antes/depois.

## Detalhes técnicos
- Migrações apenas aditivas; nenhuma migração aplicada é reescrita.
- Arquivos: sync.server.ts, media-sync.server.ts, gallery-rebuild.ts, import.server.ts, remote-changes.server.ts, read.server.ts, client.server.ts, rate-limit.server.ts, PropertyPublishPanel.tsx, ProviderOpsPanel.tsx, novos testes incluídos em `bun run test`.
