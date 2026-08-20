# Plano: Cidade padrão "Santa Rosa" no cadastro de agenciamentos

## Objetivo
Ao criar um novo agenciamento, o campo **Cidade** deve vir preenchido por padrão com "Santa Rosa", mas permanecendo editável (o corretor pode alterar para outra cidade livremente).

## Alteração
Arquivo: `src/components/agenciamentos/AgenciamentoFormModal.tsx`

1. **Linha 199** — função `initialForm`: trocar o valor padrão de `cidade` de `"Porto Alegre"` para `"Santa Rosa"`.
   - Antes: `cidade: agenciamento?.cidade ?? "Porto Alegre",`
   - Depois: `cidade: agenciamento?.cidade ?? "Santa Rosa",`
   - Observação: o `??` mantém o valor salvo quando editando um agenciamento existente; o padrão só se aplica em cadastro novo.

2. **Linha 643** — input da cidade: trocar o `placeholder` de `"Porto Alegre"` para `"Santa Rosa"` para manter consistência visual quando o campo for limpo.

## Comportamento esperado
- Criar agenciamento → cidade já aparece "Santa Rosa".
- Editar agenciamento existente → mantém a cidade salva (sem sobrescrever).
- O corretor pode apagar e digitar outra cidade normalmente.

## Sem impacto em backend
A mudança é só de valor padrão no formulário (front-end). Nenhuma migração de banco nem server function é necessária.
