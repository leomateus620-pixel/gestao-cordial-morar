# Aplicar a migração 0035 da Vistoria Inteligente

## Situação conferida (somente leitura)
- Banco alvo: o único banco Lovable Cloud ligado a este projeto (atende prévia e site publicado). Não há outro ambiente configurado.
- Código no ambiente: os arquivos 0033, 0034 e 0035 existem e já estão no journal, sem alterações.
- Banco: as funções criadas pela 0033/0034 existem (`inspection_finalize`, `inspection_reopen`, `inspection_touch_root`, etc.) e há 1 vistoria (a Nº 1). As funções exclusivas da 0035 (`inspection_snapshot`, `inspection_finalize_server`, `inspection_list`, `inspection_create`, `inspection_reorder_media`, `inspection_media_position`, `inspection_touch_aggregate`) **não existem** — portanto só a 0035 está pendente.
- Pendência a reportar: o documento `docs/vistoria-migracao-0035.md` citado não existe neste checkout; o estado da PR #34 no GitHub não é visível daqui. Sigo pelo conteúdo do arquivo 0035 presente no journal.
- A tabela interna de histórico do Drizzle não é legível pelo acesso de leitura; a confirmação do histórico vem do resultado do aplicador.

## Passos
1. Aplicar a 0035 pelo aplicador oficial, enviando o conteúdo do arquivo **byte a byte** (o aplicador reconhece SQL idêntico como a mesma migração; nada é copiado para `supabase/migrations`, sem alterar hashes nem journal). 0033/0034 não são reaplicadas.
2. Se falhar: ler o erro, verificar o estado real (o aplicador desfaz a transação inteira), não repetir às cegas e relatar o bloqueio.
3. Verificações posteriores (somente leitura):
   - funções novas presentes, `SECURITY DEFINER` com `search_path` fixo; `inspection_finalize`/`inspection_finalize_server` sem EXECUTE para anon/authenticated/PUBLIC;
   - RLS ativo nas 7 tabelas `inspection_*` e políticas presentes;
   - gatilhos de revisão agregada nas tabelas filhas;
   - FKs compostas (ambiente/item da mesma vistoria) intactas;
   - política do bucket privado `inspection-media`;
   - vistoria Nº 1, mídias e documento emitido inalterados (contagens/hash antes e depois).
4. Rodar testes locais da vistoria (`tests/vistoria`), reportados separadamente da evidência do banco.
5. Sem deploy, merge, publicação ou mudança em imóveis, Drive, anúncios ou NFS-e.

## Relatório final
Ambiente, migrações (0033/0034 já existentes, 0035 aplicada ou bloqueio exato), resultado de cada verificação e testes locais à parte. Lembrete: o app publicado só usará as novas funções após publicação da versão compatível, que fica para sua decisão.
