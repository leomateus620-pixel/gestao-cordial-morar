# Códigos Cordial e Morar visíveis na lista de Imóveis

## O problema (confirmado)

Os cards da lista mostram apenas o campo de código legado (`codigo`), que só existe nos imóveis importados dos sites. Os cadastros novos gravam o código em campos separados por imobiliária (`codigo_cordial` / `codigo_morar`) e deixam o legado vazio — hoje há 14 imóveis ativos exatamente nessa situação, e por isso aparecem sem código ao lado do nome.

## O que muda

1. Todo card da lista passa a exibir o código de cada imobiliária que o imóvel tiver:
   - só Cordial → um selo azul com o código Cordial;
   - só Morar → um selo laranja com o código Morar;
   - ambos → os dois selos lado a lado, na mesma linha do tipo do imóvel;
   - imóvel antigo sem códigos por imobiliária → continua mostrando o código legado, como hoje.
2. Nada de dado inventado: se o imóvel não tem nenhum código, o espaço fica limpo (sem placeholder).
3. Textos de acessibilidade (aria-label da foto e do card) passam a usar o mesmo código exibido.

## Detalhes técnicos

- `src/types/property.ts`: `Property` (tipo da lista) ganha `codigoCordial` e `codigoMorar`.
- `src/lib/imoveis/imoveis.functions.ts`: incluir `codigo_cordial` e `codigo_morar` na seleção/mapeamento da listagem (`mapRow`), sem alterar filtros, ordenação ou paginação existentes.
- `src/components/imoveis/PropertyCatalogCard.tsx`: renderizar os selos por provedor com tokens do design system (sem cores hardcoded), com fallback para o código legado.
- Sem migração de banco, sem alteração em wizard, fila, worker ou sincronização com as APIs.

## Validação

- Conferir na lista imóveis recém-cadastrados (sem código legado) mostrando Cordial e/ou Morar.
- Conferir imóveis importados continuando com o código de antes.
- Rodar typecheck.
