# Localização, filtro de valor e contato do proprietário

## 1. Etapa "Localização" do cadastro/edição

Nova ordem e comportamento dos campos:

```text
Localização exibida     |  Logradouro
Número                  |  Bairro (lista + digitação)
Cidade (padrão Santa Rosa) | UF (padrão RS)
CEP (por último)
```

- **CEP** desce para o fim da etapa.
- **Bairro** vira um campo com lista suspensa de opções já existentes nos sites
  (bairros reais dos imóveis importados de Cordial e Morar), com busca e a
  possibilidade de digitar um bairro novo quando ele ainda não existir.
- **Cidade** já vem preenchida com "Santa Rosa" e **UF** com "RS" em todo novo
  cadastro; ambos continuam editáveis.
- **Zona / região** é removida da tela (a coluna continua no banco, apenas não
  aparece mais no formulário e deixa de ser enviada como campo editável).

## 2. Identificação e proprietário

Acrescentar dois campos ao lado de "Proprietário":

- **Telefone do proprietário** (com máscara brasileira, aceita fixo e celular)
- **E-mail do proprietário** (validado)

Ambos são gravados no imóvel, aparecem preenchidos na edição e na ficha do
imóvel. São dados internos: não vão para os sites Cordial/Morar (a API de
publicação não recebe contato de proprietário), continuam apenas no Gestão
Cordial.

## 3. Filtro de valor na listagem de Imóveis

Na barra de filtros do menu Imóveis, "Valor mínimo" e "Valor máximo" saem do
popover e passam a ficar visíveis na linha principal, como no site:

- Dois campos com formatação de moeda enquanto digita (R$ 500.000).
- Faixas sugeridas em lista rápida (até 200 mil, 200–350 mil, 350–500 mil,
  500–600 mil, 600–800 mil, 800 mil–1 mi, acima de 1 mi) que preenchem os dois
  campos de uma vez.
- Digitação manual continua livre; o filtro entra na URL como já acontece hoje,
  então o link pode ser compartilhado e recarregado.

## Detalhes técnicos

- `src/types/property.ts`: adicionar `proprietarioTelefone` e
  `proprietarioEmail` a `PropertyWriteInput`; remover `zona`/`regiao` da
  edição pelo formulário (mantidos no tipo de leitura).
- `src/lib/imoveis/imoveis.functions.ts`: mapear as colunas já existentes
  `proprietario_telefone` e `proprietario_email` da tabela `properties` no
  create/update e no `getPropertyDetail`. Nenhuma migração é necessária — as
  colunas já existem.
- Bairros: reaproveitar `getImoveisFacets` (que já devolve `bairros` distintos
  dos imóveis importados dos dois sites) e passar essa lista ao
  `PropertyForm`; combobox com `Command` do shadcn, permitindo valor livre.
- `src/components/imoveis/PropertyForm.tsx`: reordenar a etapa 2, remover o
  campo Zona/região, aplicar defaults `cidade: "Santa Rosa"` / `uf: "RS"` em
  `emptyPropertyValues()` (sem sobrescrever imóveis já existentes na edição) e
  incluir os dois campos de contato na etapa 1.
- `src/components/imoveis/PropertyFilterBar.tsx`: mover valorMin/valorMax para
  a linha principal com máscara de moeda e presets; remover a duplicação do
  popover. `src/lib/imoveis/filters.ts` já suporta esses parâmetros — apenas
  ajustar os chips ativos para exibir a faixa formatada.
- Serializer ImobiBrasil permanece intocado (bairro/cidade/uf já são enviados;
  contato do proprietário não é publicado).
