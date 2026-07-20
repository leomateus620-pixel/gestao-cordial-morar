## Objetivo
Permitir apagar agenciamentos (para remover testes e cadastros incorretos), com confirmação e permissão adequada.

## Escopo

- Backend/RLS: sem mudanças. A server function `deleteAgenciamento` já existe em `src/lib/agenciamentos/agenciamentos.functions.ts` e o hook `useAgenciamentos` já expõe `deleteAgenciamento(id)` protegido por `canManage`.
- Frontend: adicionar ação "Excluir" no `AgenciamentoDetailDrawer` (onde já há edição), com `AlertDialog` de confirmação. Também adicionar botão discreto de excluir no `AgenciamentoCard` (ícone de lixeira) visível apenas para quem tem permissão (`admin_owner` e `secretaria`, via `canManage`).
- Após excluir: fechar drawer/diálogo, toast de sucesso, invalidação da query (já feita pelo hook).

## Passos

1. `src/components/agenciamentos/AgenciamentoCard.tsx`
   - Aceitar prop opcional `onDelete?: (id: string) => void` e `canDelete?: boolean`.
   - Renderizar botão "lixeira" no canto (ghost, `text-destructive`) que dispara `onDelete`, sem propagar o clique para o card.

2. `src/components/agenciamentos/AgenciamentoDetailDrawer.tsx`
   - Adicionar botão "Excluir agenciamento" no rodapé (visível se `canManage`).
   - `AlertDialog` de confirmação com nome do imóvel/proprietário no texto.
   - Ao confirmar: chamar `deleteAgenciamento(id)` do hook, `toast.success`, fechar drawer.

3. `src/routes/_app.agenciamentos.tsx`
   - Passar `onDelete` e `canDelete={canManage}` para os `AgenciamentoCard`.
   - Confirmação inline (reutilizar `AlertDialog`) antes de disparar a exclusão a partir do card.

## Fora de escopo
- Alterar RLS, políticas ou schema.
- Soft delete / lixeira / restauração.
- Ação em massa.