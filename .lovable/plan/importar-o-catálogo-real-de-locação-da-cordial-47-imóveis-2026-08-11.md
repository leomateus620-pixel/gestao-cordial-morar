# Importar o catálogo real de locação da Cordial (47 imóveis)

## O que a planilha traz (verificado)

- Aba **Imóveis**, cabeçalho na linha 5, **47 registros** — 47 códigos únicos, 47 IDs de site únicos, 4 páginas de catálogo.
- Todos com aluguel mensal numérico (**0 "Consulte"**).
- Distribuição por tipo: Sala Comercial 20, Apartamento 11, Comercial 8, Casa 7, Galpão 1 (total 47) — bate com a aba Resumo.
- Campos vazios existem e serão respeitados: 29 sem dormitórios, 44 sem suítes, 17 sem banheiros, 30 sem vagas, 7 sem área, 1 sem cidade/UF.
- A tabela `properties` já existe e já guarda os 423 imóveis de venda, com os mesmos campos e o par origem + ID do site como identidade única.

## O que será feito

### 1. Carga dos 47 imóveis de locação
Migração com os 47 registros literais na tabela `properties`, com **carteira Cordial** e **operação Aluguel**. O valor mensal entra no campo de valor com modo `fixo` (nenhum "Consulte" nesse lote). Metadados de origem preservados: código, ID no site, página do catálogo, link do imóvel, link da página e lote de importação próprio de locação.

Identidade única por origem + ID do site (`ON CONFLICT ... DO UPDATE`): rodar duas vezes não duplica, e os 423 de venda não são tocados.

Regra absoluta: nada inventado. Célula vazia vira nulo — nunca 0, nunca cidade suposta. Código guardado como texto.

Validação após a carga: 47 registros de aluguel, 47 códigos únicos, 47 IDs únicos, contagem por tipo idêntica à planilha, e os 423 de venda intactos (total 470).

### 2. Interface (sem mudança estrutural)
O menu Imóveis já consulta o banco com os filtros Todas/Cordial/Morar e Todos/Venda/Aluguel. Depois da carga:
- **Aluguel** passa a listar os 47 (hoje mostra "Nenhum imóvel encontrado").
- **Venda** continua com os 423; **Todos** mostra 470; **Morar** segue vazio.
- Card e detalhe já exibem só o que existe, com "Não informado no catálogo" nos campos ausentes e link para o imóvel no site.

### 3. Validação visual
Testo a página real em desktop e mobile: filtro Aluguel, busca por código (ex.: 1304), valores mensais formatados, ausência de zeros inventados e links de origem funcionando.

## Detalhes técnicos

- Uma migração de dados: `INSERT ... ON CONFLICT (source, source_property_id) DO UPDATE` com as 47 linhas geradas do XLSX; `operacao = 'aluguel'`, `carteira = 'cordial'`, `source = 'cordial_website'`, `source_import_batch = 'locacao_2026-08-11'`.
- Sem alteração de schema, de RLS/GRANTs ou de código da aplicação — as funções `listImoveis`/`getImovel` e os filtros já cobrem o caso.
