# Ordem "Mais recentes" na lista de imóveis

## O problema
Hoje "Mais recentes" ordena pela data da última alteração de qualquer tipo. Essa data também muda quando o próprio sistema mexe no imóvel sozinho (envio aos sites, importação, fotos, conferências). Por isso imóveis antigos, cadastrados em agosto, sobem para o topo junto com os novos — ninguém os editou, foi o sistema.

## O que vai mudar
- Cada imóvel passa a guardar a data da última edição feita por uma pessoa (salvar no formulário de edição).
- "Mais recentes" ordena pela data mais nova entre: cadastro e última edição feita por pessoa. Novos cadastrados e recém-editados aparecem juntos no topo; mexidas automáticas do sistema deixam de contar.
- Vale igual em Todas, Cordial e Morar (cada filtro só mostra os imóveis daquela imobiliária, na mesma ordem).
- Imóveis já existentes começam com a data de cadastro (não há como saber quem editou antes). A partir de agora, toda edição salva conta.
- Nada muda em fotos, envio aos sites, códigos, proprietário ou corretor.

## Detalhes técnicos
- Migração aditiva: coluna `properties.last_user_edit_at timestamptz`, preenchida com `created_at` para os existentes (sem alterar `updated_at`), e coluna gerada/índice `recent_sort_at = greatest(created_at, coalesce(last_user_edit_at, created_at))` com índice desc.
- Server functions de criar e salvar edição do imóvel gravam `last_user_edit_at = now()`; workers de sync/importação/mídia não tocam nessa coluna.
- `imoveis.functions.ts` caso `recentes`: `order("recent_sort_at", desc)` + desempate por `id`.
- Teste: conferir que um imóvel antigo alterado só pelo sistema não sobe, e que um editado pelo formulário sobe, nos três filtros.
