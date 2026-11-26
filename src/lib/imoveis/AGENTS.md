# src/lib/imoveis

- src/lib/imoveis/drive has its own AGENTS.md; read it before changing files there.
- Property catalog situation (disponível/desativado/arquivado) mirrors `shared_selection_property_eligible` and is exposed as `properties_catalog.situacao_rank` (pure twin in src/lib/imoveis/situacao.ts); only the catalog sends `situacao`, other `listImoveis` callers pass `situacao: "disponiveis"` — why: inactive listings stay visible but never leak into selection, agenda, ads or featured pickers.
- Property gallery (ficha + Fotos step) uses `resolveGalleryMode` in gallery-fallback.ts: `queue` only when loaded keys (`uploadKey ?? id`) cover every active photo, otherwise `safe` = database `position` order with reorder/cover disabled; photos without a stored thumbnail use the full signed URL — why: no active photo may disappear and an incomplete list must never be saved as the new order.

- `properties.mobiliado` (texto) só é lido/gravado por `src/lib/imoveis/mobiliado.ts` ('true'/'false'/null), nunca por truthiness — why: o texto 'false' é truthy e mostrava «Mobiliado: Sim».
