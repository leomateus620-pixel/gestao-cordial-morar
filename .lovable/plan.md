## Objetivo
Eliminar a seção **Links e observações** (step 05) do modal de cadastro e edição de agenciamentos, mantendo os dados nos cards e drawer de detalhe.

## O que será feito

### 1. AgenciamentoFormModal.tsx
- Remover os campos `driveFolderUrl`, `siteUrl` e `observacoesInternas` do tipo `FormState`.
- Remover os valores iniciais desses campos em `initialForm`.
- Remover o bloco JSX `<FormSection title="Links e observações" step="05">` inteiro (campos Drive, site e observações internas).
- Remover as propriedades correspondentes do retorno de `toInput()`.

### 2. services/agenciamentos.ts
- Remover as validações de URL para `driveFolderUrl` e `siteUrl` da função `validateAgenciamentoInput`, pois os campos deixarão de existir no formulário.
- Ajustar o tipo `AgenciamentoValidationErrors` removendo as chaves obsoletas.

## O que NÃO será alterado
- Tipos `Agenciamento` e `AgenciamentoInput` em `src/types/agenciamento.ts` — os dados continuam existindo no modelo.
- Mock data em `src/lib/mock/data.ts` — registros antigos permanecem intactos.
- Componentes `AgenciamentoCard.tsx` e `AgenciamentoDetailDrawer.tsx` — os links e observações ainda serão exibidos para registros que já possuem esses valores.
