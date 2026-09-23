# Destravar a fila de fotos sem reprocessar as 11.448 fotos antigas (opção 1)

## Antes de aplicar (só leitura)
1. **Efeito conjunto**: conferir juntos a migração 032000 (sem o UPDATE em massa), o scanner de recuperação (`property_image_recovery_candidates`) e `enqueueImageJobs`. Hoje `enqueueImageJobs` recusa o lote se alguma foto tiver `desired_destination_hash` diferente do destino atual. Com NULL em fotos antigas, o lote inteiro travaria. Vou confirmar isso com contagens reais por imóvel.
2. **Snapshot**: salvar em tabela de backup (só inserção) o estado atual das fotos, dos vínculos por site, das tarefas de fotos e das publicações dos imóveis afetados.
3. **Prévia das contagens**: quantas fotos vão entrar na fila, quantas vão ser reenviadas e quantas vão ser apagadas nos sites, separado por Cordial e Morar. **Se aparecer reprocessamento amplo ou exclusão remota, eu paro e te mostro antes.**

## Correção (nova migração, sem mexer nas que já foram aplicadas)
- Criar uma marcação explícita de **legado** (`legacy_unverified`) para fotos antigas sem destino gravado. Elas não entram na fila, não são reenviadas, não são dadas como convergidas e ficam com arquivos e vínculos como estão.
- O scanner e o enfileiramento ignoram fotos de legado. Uma foto de legado só entra na fila de novo se alguém mexer nela (trocar, reordenar ou mudar de destino) ou por uma recuperação pedida de propósito.
- **As 57 fotos com possível marca-d'água errada** vão para uma lista de análise separada. A recuperação delas é gradual e manual, poucas por vez, com conferência no site.
- A migração 230002 (agendamentos) **não será aplicada**.

## Retomar e acompanhar
- A fila volta a andar com o limite de pedidos de cada conta. Falha em um site não trava o outro.
- Vou acompanhar em janelas de alguns minutos: erros por tipo, idade da pendência mais antiga, tarefas concluídas, fotos confirmadas por site e duplicações (mesma foto enviada duas vezes).
- O imóvel 1384 da Cordial não será mexido fora do fluxo normal.

## Número do endereço (assunto separado, sem alterar dados)
- Listar os imóveis cujo número passa de 15 caracteres, mostrando o valor atual e como ele ficaria no envio: número + resto no complemento. Exemplo: "270" e "ap 103 Cancun".
- Nada é alterado até você aprovar.

## Relatório final com evidências
- Ajustes aplicados no banco (versão e horário), versão publicada do app e o que continua pendente.
- Progresso real de Cordial e Morar, conferido nos sites (quantidade de fotos e capa) nos imóveis prioritários 1384, 1381, 1373 e 1379. A ausência do erro não basta como prova.

## Detalhes técnicos
- Nova migração aditiva: coluna/estado de legado em `property_images` (ou tabela `property_image_legacy_review`), e a versão de `property_image_recovery_candidates` passa a excluir o legado. Se preciso, `enqueueImageJobs` filtra `desired_destination_hash IS NULL AND legacy` em vez de falhar.
- Tabela de revisão para as 57 fotos (`image_id`, `motivo`, `status_revisao`).
- Snapshot em `*_backup_20260923` só com INSERT...SELECT.
- Testes para: legado não bloqueia o lote, não é enfileirado e não é marcado como confirmado. Depois typecheck e publicação.
