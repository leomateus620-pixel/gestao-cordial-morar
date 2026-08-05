# Códigos Morar e Cordial nos Agenciamentos

Adicionar dois campos opcionais de código de imóvel ao módulo Agenciamentos, exibidos acima do nome/endereço do imóvel e pesquisáveis na Busca global.

## O que o usuário vê

1. **Cadastro (Etapa 1 — Imóvel)**: dois campos novos lado a lado, "Código Morar" e "Código Cordial", ambos opcionais, logo no topo da etapa (antes de tipo de imóvel/endereço), com dica "Opcional — usado para localizar o imóvel na busca".
2. **Edição**: os mesmos campos já preenchidos ao abrir qualquer agenciamento existente.
3. **Card do agenciamento**: acima do título (tipo + endereço), uma linha discreta com etiquetas dos códigos, por exemplo `MORAR 1234 · CORDIAL 5678`. Se só um existir, mostra só ele; se nenhum, a linha não aparece.
4. **Painel de detalhe**: os códigos aparecem entre os dados do imóvel e no resumo da etapa de revisão do formulário.
5. **Busca global**: digitar `1234` encontra o agenciamento pelo código; o resultado mostra o código acima/junto ao endereço, e o histórico do registro exibe os dois códigos nos campos.

## Detalhes técnicos

- Migração: adicionar `codigo_morar text` e `codigo_cordial text` em `public.agenciamentos` (nulos permitidos), com índices `lower(...)` para busca eficiente. Sem mudança de RLS/grants (colunas herdam as permissões da tabela).
- `src/types/agenciamento.ts`: adicionar `codigoMorar?: string` e `codigoCordial?: string` em `Agenciamento` (e portanto em `AgenciamentoInput`).
- `src/lib/agenciamentos/agenciamentos.server.ts`: incluir as colunas em `AgenciamentoDbRow`, `rowToAgenciamento`, `inputToPayload` e `patchToPayload` (normalizando vazio para `null` via `orNull`). Sem validação obrigatória.
- `src/components/agenciamentos/AgenciamentoFormModal.tsx`: estado inicial a partir do agenciamento editado, dois inputs em `PropertyStep` e linha nova no resumo de revisão.
- `src/components/agenciamentos/AgenciamentoCard.tsx` e `AgenciamentoDetailDrawer.tsx`: renderizar os códigos acima do endereço com estilo de etiqueta já usado no design system.
- `src/lib/busca/busca.server.ts`: incluir `codigo_morar`/`codigo_cordial` no `select`, na lista de colunas do `ilikeOr` da categoria `agenciamento`, no `detalhe`/`subtitulo` do resultado e nos `campos` de `agenciamentoTimeline`.
- Filtro de texto local do módulo (`src/services/agenciamentos.ts` / `useAgenciamentos.ts`): incluir os códigos no `busca` para que a barra de filtro da própria página também encontre por código.
- Validação: rodar typecheck e a suíte de testes existente; conferir criação e edição no preview.
