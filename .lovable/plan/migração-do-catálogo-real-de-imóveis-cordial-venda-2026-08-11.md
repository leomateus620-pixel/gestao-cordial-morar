# Migração do catálogo real de imóveis (Cordial — Venda)

## Situação atual (verificada)

- O menu **Imóveis** (`src/routes/_app.imoveis.tsx`, `_app.imoveis.$imovelId.tsx`, `_app.imoveis-destaque.tsx`) lê 100% de dados fictícios: a lista vem do store local (`src/store/app-store.ts`) alimentado por `imoveisSeed` em `src/lib/mock/data.ts`, com fotos de banco de imagens em `src/assets/properties/`.
- **Não existe hoje nenhuma tabela de imóveis no banco.** Só há `rental_properties` (imóveis de locação, outro fluxo) — o catálogo de venda precisa de estrutura nova.
- A planilha foi lida: aba **Imóveis**, cabeçalho na linha 5, **423 registros**, 423 códigos únicos, 423 IDs de site únicos, 33 sem valor numérico (“Consulte”), e a distribuição por tipo bate exatamente com a esperada (Casa 218, Apartamento 100, Terreno 73, etc.).

## O que será feito

### 1. Nova tabela de imóveis no banco
Tabela `properties` com todos os campos da planilha, cada um anulável (exceto identificadores): tipo, endereço exibido, bairro, cidade, UF, dormitórios, suítes, banheiros, vagas, área principal + tipo da área, área total/útil/construída/terreno.

Valor com modelo único: um campo numérico anulável + um indicador de modo (`fixo` ou `consulte`). Na interface aparece sempre um único campo **Valor**.

Metadados de origem preservados: código, ID no site, página do catálogo, link do imóvel, link da página, origem (`cordial_website`) e lote de importação. Classificação fixa: carteira **Cordial**, operação **Venda**.

Regras de acesso mantidas no padrão do sistema (leitura para usuários autenticados; escrita restrita a admin/secretaria). Índices para código, ID de origem, tipo, cidade, bairro, operação e carteira.

### 2. Importação idempotente dos 423 registros
A carga vai numa migração com os 423 registros literais, usando o par origem + ID do site como identidade única (`ON CONFLICT` atualiza em vez de duplicar). Rodar duas vezes não cria duplicatas.

Regra absoluta: nada é inventado. Célula vazia vira nulo — nunca 0, nunca “Santa Rosa”, nunca R$ 0,00. Código guardado como texto (zeros à esquerda preservados).

Ao final, valido no banco: 423 registros, 423 códigos únicos, 423 IDs únicos, 33 com “Consulte”, e a contagem por tipo idêntica à planilha. Relatório final com inseridos / atualizados / rejeitados / duplicados.

### 3. Camada de dados real
- `src/lib/imoveis/imoveis.functions.ts`: consulta paginada no servidor com filtros (carteira, operação, tipo, cidade, bairro, busca por texto) e busca de um imóvel por id.
- `src/hooks/useImoveis.ts`: hook com paginação/scroll infinito via React Query.
- A busca aceita código, ID do site, tipo, localização exibida, bairro e cidade — procurar “1303” encontra o imóvel de código 1303.

### 4. Interface
- **Lista**: mesmos filtros atuais (Todas/Cordial/Morar e Todos/Venda/Aluguel) passam a consultar o banco. Os 423 aparecem em Todas, Cordial e Venda; não aparecem em Morar nem Aluguel. Carregamento incremental para não puxar tudo de uma vez.
- **Card**: tipo, código, localização, bairro, cidade/UF, valor, dormitórios, banheiros, vagas e área principal — mostrando só o que existe. Campo ausente exibe, discreto, “Não informado no catálogo”. Sem fotos falsas: placeholder neutro com “Imagem não disponível”.
- **Detalhe**: seções Identificação, Localização, Valor, Características, Áreas e Fonte, com ação “Abrir imóvel no site Cordial” usando o link original.

### 5. Remoção dos dados fictícios
`imoveisSeed` e as fotos de banco de imagens saem do fluxo de Imóveis (lista, destaques e detalhe). O formulário “Novo imóvel” passa a gravar na tabela real. Referências de imóvel usadas por Atendimentos e Agenda continuam funcionando (esses módulos já guardam os dados do imóvel em texto próprio) — nada de registro real existente será apagado.

### 6. Validação visual
Depois da carga, testo a página real em desktop e mobile: filtros, busca por código, preços “Consulte”, ausência de zeros inventados, links de origem, rolagem com 423 registros e ausência de estouro de layout no mobile.

## Detalhes técnicos

- Migração 1: schema + índices + RLS/GRANTs. Migração 2: `INSERT ... ON CONFLICT (source, source_property_id) DO UPDATE` com as 423 linhas geradas a partir do XLSX.
- Enum de operação/carteira reaproveitando o vocabulário existente (`cordial` / `morar`, `venda` / `aluguel`).
- Consultas paginadas com `range()` e contagem exata; sem N+1.
- `valor_modo` (`fixo` | `consulte`) evita duplicar “Valor (R$)” e “Valor exibido”.
