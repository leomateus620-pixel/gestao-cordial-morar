# Botão "Excluir imóvel" na ficha do imóvel

Hoje a ficha do imóvel tem apenas "Editar" e o ícone de copiar link público. Não existe nenhuma forma de apagar um imóvel de teste — por isso os cadastros de teste ficam acumulados no catálogo.

## O que será feito

Ao lado do botão "Editar", na ficha do imóvel, entra um botão discreto de excluir (ícone de lixeira, tom vermelho).

Ao clicar, abre uma confirmação que explica exatamente o que vai acontecer:

- **Imóvel não publicado** (rascunho/teste): exclusão imediata e definitiva. Some do catálogo, junto com fotos, vídeos, vínculos de agenciamento, pastas registradas do Drive e jobs pendentes.
- **Imóvel publicado na Cordial e/ou Morar**: a exclusão acontece em duas etapas automáticas. Primeiro o sistema pede a remoção do anúncio nos sites; assim que cada site confirma a remoção, o registro é apagado aqui. Enquanto isso, o imóvel aparece como "Remoção em andamento" e fica bloqueado para edição/publicação.

Para evitar exclusão acidental, a confirmação exige digitar o código do imóvel (ou a palavra EXCLUIR quando não houver código).

Quem pode excluir: administradores e corretores.

## Detalhes técnicos

1. **Migração**
   - Substituir a política de exclusão de `properties` (hoje só admin) por uma que permita admin e corretor autenticado.
   - Garantir política de exclusão nas tabelas filhas sem cascade explícito ou sem policy (`property_videos`, `property_provider_publications`, `property_drive_*`, `property_image_jobs`) — as FKs já são `ON DELETE CASCADE`, então a limpeza é automática; falta apenas a permissão onde necessário.
   - `agenciamentos`, `property_import_candidates` e `provider_code_reservations` referenciam com `SET NULL`: o histórico é preservado, apenas perde o vínculo.

2. **Server function `deleteImovel`** em `src/lib/imoveis/imoveis.functions.ts`
   - `requireSupabaseAuth`, valida `{ id }`.
   - Lê `property_provider_publications`. Se houver publicação ativa com `external_property_id`, enfileira job `delete` por provedor em `property_sync_jobs`, marca `removal_state = 'pending_removal'` e retorna `{ status: 'pending_removal', providers }`.
   - Sem publicação ativa: apaga os arquivos de imagem no Storage e faz `delete` na linha de `properties` (cascade cuida do resto). Retorna `{ status: 'deleted' }`.

3. **Conclusão automática da remoção publicada**
   - No reconciliador/worker de sync (`property-sync-reconcile` / `sync.server.ts`), quando todas as publicações de um imóvel com `removal_state = 'pending_removal'` chegarem a removido/despublicado, apagar as imagens do Storage e a linha de `properties`.

4. **UI**
   - Novo `DeletePropertyDialog.tsx` em `src/components/imoveis/` com a confirmação por digitação e o resumo do impacto.
   - Botão de lixeira em `src/routes/_app.imoveis.$imovelId.index.tsx`, ao lado de "Editar".
   - Hook `useDeleteImovel` em `src/hooks/useImoveis.ts` invalidando `imoveis`, `imoveis-facets`, `imovel-detalhe`.
   - Sucesso: toast e navegação de volta para `/imoveis`. Caso pendente: toast explicando que a remoção nos sites está em andamento.
