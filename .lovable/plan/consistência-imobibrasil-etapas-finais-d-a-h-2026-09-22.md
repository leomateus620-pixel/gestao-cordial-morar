# Consistência ImobiBrasil: etapas finais (D a H)

Continuação do plano já aprovado. As etapas A a C e a confirmação campo a campo estão prontas (277 testes passando). Cada etapa abaixo termina com testes novos, a suíte completa e a verificação de tipos. Uma etapa só começa quando a anterior estiver aprovada nessas checagens.

## D. Divergência entre Cordial e Morar
- Quando as duas imobiliárias mudam o mesmo campo com valores diferentes, o Gestão mantém o valor que já tem. As duas versões ficam registradas como conflito, com o valor de cada site.
- Sem uma regra de preferência entre as duas contas, a ordem em que as importações rodam não decide quem vence.
- A importação passa a conferir a revisão esperada. Se alguém salvou no Gestão durante a importação, a importação não sobrescreve essa edição e registra o conflito.
- Três gravações passam a acontecer juntas, numa única operação: atualização do imóvel, histórico e registro do conflito.
- Resolver um conflito guarda o histórico da decisão.
- Testes: conflito Cordial x Morar, histórico preservado, importação concorrente com uma edição.

## E. Leitura completa, características e retirada
- Leitura paginada até o fim, cobrindo imóveis ativos e inativos.
- A leitura distingue "lista vazia válida" de "resposta incompleta ou inválida". Uma página que falha nunca é tratada como ausência do imóvel.
- Características por conta: ligar e desligar só no imóvel, nunca mexendo no catálogo geral. Uma falha parcial fica pendente só para as características que faltaram.
- Três ações separadas na tela e no código, com os textos alinhados:
  - **Ocultar:** tira o anúncio da vista no site.
  - **Retirar publicação:** marca o anúncio como fora do ar, mantendo o cadastro remoto.
  - **Excluir cadastro remoto:** fica fora do escopo. Não será feito automaticamente.
- Testes: paginação interrompida, falha parcial de características.

## F. Limite de chamadas e retentativas
- O limitador libera a vez antes de CADA tentativa, inclusive nas repetições. Cada conta tem seu próprio limite, compartilhado por todos os processos daquela conta.
- Retry-After é respeitado nos formatos em segundos e em data. Esperas longas voltam para a fila com horário marcado, sem prender o processo.
- Repetições usam espera crescente com variação e têm um número máximo de tentativas.
- Se o limitador estiver indisponível, o sistema adia a operação em vez de chamar o site.
- A tentativa já mandada para espera não é repetida antes da hora.
- Inclusão de imóvel ou foto nunca é repetida às cegas.
- Testes: Retry-After longo, limitador indisponível, falha em uma única conta.

## G. Situação por imobiliária na tela
- Cordial e Morar em blocos separados, cada um mostrando cadastro, características e fotos. Os estados possíveis são: pendente, em processamento, confirmado, parcial, divergente, não verificável e erro.
- Cada bloco mostra quando foi salvo no Gestão e quando cada site confirmou.
- Um botão "tentar de novo" por componente e por destino, sempre reaproveitando o anúncio existente.
- Sucesso em uma imobiliária não esconde falha na outra.

## H. Validação real e relatório
- Testes reais só no imóvel de teste autorizado (Cordial 4355160, Morar 4355161):
  - alterar preço e descrição em sequência;
  - limpar um campo;
  - alterar características;
  - ocultar e reexibir o anúncio;
  - conferir, pela leitura dos sites, que as mudanças chegaram.
- Não haverá exclusão de fotos válidas nem de cadastros.
- Relatório final com:
  - problemas encontrados;
  - correções e arquivos alterados;
  - migrações aplicadas;
  - testes e resultados;
  - evidências separadas de Cordial e Morar;
  - limitações da API;
  - comparação de antes e depois.

## Detalhes técnicos
- Principais arquivos: import.server.ts, remote-changes.server.ts, read.server.ts, sync.server.ts, rate-limit.server.ts, client.server.ts, PropertyPublishPanel.tsx e os painéis de Integrações.
- Migrações novas apenas aditivas: uma RPC de importação com revisão esperada e registro de conflito na mesma operação, e uma forma de inserir conflitos compatível com o índice único parcial. Nenhuma migração já aplicada será alterada.
- Novos testes entram no comando normal de testes.
