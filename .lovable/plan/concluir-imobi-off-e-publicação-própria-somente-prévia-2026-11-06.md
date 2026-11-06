# Concluir Imobi OFF e publicação própria (somente prévia)

Situação conferida agora: 890 imóveis (873 ativos); 454 registros da Cordial ainda sem decisão própria (dependem do histórico Imobi); a listagem de imóveis ainda lê status/links do histórico Imobi; `expectedRevision` existe no servidor mas o chamador principal não envia.

## Etapas (executadas em sequência, sem pausas)

1. **Inventário antes** — retrato por imóvel com checksum de campos canônicos, estado público por marca e metadados de mídia (nomes reais das colunas), salvo em tabela de auditoria aditiva.
2. **Migrar decisões Cordial** — migração com trava e idempotência: grava decisão própria só para quem está efetivamente elegível/publicado agora, com origem `legacy_migrated`; retiradas, rascunhos e bloqueios preservados à parte. Depois, nova versão de `cordial_site_sync_property` sem ler o histórico Imobi. Gatilhos de agenciamento/checklist passam a reagir à publicação própria (chave idempotente existente, sem mexer em bônus).
3. **Fonte única de estado por marca** — função servidor `getOwnedChannelState` (decisão, elegibilidade igual à do catálogo público, motivo de bloqueio, revisão, fotos, URL própria). Listagem, cards, filtros, ficha, painel, cópia de link, conclusão e progresso de arquivamento passam a usá-la. Remove ações que consultam/reenviam à Imobi; histórico rotulado "ImobiBrasil: OFF".
4. **Concorrência e permissões** — revisão vista pelo usuário segue até a transação; conflito preserva o formulário e pede atualização; respostas `unchanged` retornam estado completo; identidade só da sessão; falha parcial entre marcas não gera sucesso nem conclui cadastro, e o "tentar de novo" atua só na marca pendente.
5. **Regras novas** — publicação nova exige autorização, disponibilidade, cadastro concluído, finalidade válida e mídia pronta; nulos nunca viram confirmação; legado mantém decisões sem preencher campos falsos; edição comum não desfaz retirada manual; mudanças sensíveis geram pendência visível.
6. **OFF, códigos, mídias, arquivamento** — OFF do código e do banco combinados em "desligado se qualquer um disser desligado ou falhar a leitura"; desativar crons só-Imobi e separar partes locais; impedir criação de jobs externos na origem (gatilho de cancelamento mantido); bloquear commits tardios; códigos com unicidade local por marca; marca d'água reconhece os dois canais; revisar `pending_remote_delete` sem apagar mídia; revisar retirar/arquivar/reativar e `getArchiveProgress`.
7. **Validação** — migrações aditivas pelo journal e conferência no banco; testes com fixtures para todos os cenários pedidos; análise das 2 falhas antigas da Morar; build; prévia em desktop e celular; inventário depois e comparação por registro; roteiro de publicação/verificação/recuperação.

## Limites
Sem publicar em produção, sem anúncios fictícios, sem retirar imóveis reais, sem tocar NFS-e/boleto. Atenção: o banco é compartilhado entre prévia e produção — a etapa 2 altera decisões reais (sem mudar o que aparece nos sites), por isso o inventário antes/depois.
