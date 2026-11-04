# Busca de inquilino/proprietário abre direto o aluguel

## Problema
Ao pesquisar um nome no topo e clicar no resultado, só abre um painel lateral de resumo. O botão de abrir leva para a lista de Aluguéis inteira, sem abrir o contrato da pessoa. A página de Aluguéis já consegue abrir um contrato específico, mas a busca não envia qual é.

## O que muda
1. **Clique leva direto ao contrato**: ao clicar em um resultado de Aluguel, Inquilino ou Imóvel de locação, a tela de Aluguéis abre já com os detalhes do contrato certo (o mesmo painel de quando se clica no card).
2. **Inquilino**: o resultado fica ligado ao contrato dele (o mais recente/ativo). Se ele tiver mais de um contrato, aparece um resultado para cada um, com o endereço para diferenciar.
3. **Proprietário**: pesquisar o nome do proprietário também encontra os contratos dos imóveis dele e abre o contrato direto.
4. **Locatário/fiador**: o mesmo vale para quem consta no contrato (vários inquilinos e fiadores).
5. **Painel de resumo**: o botão "Abrir" do resumo (na página de busca completa) também leva ao contrato específico.
6. Se a pessoa não tiver contrato, o resultado continua abrindo a lista de Aluguéis já filtrada pelo nome.

Nada muda em dados, contratos, NFS-e ou permissões; quem não tem acesso a Aluguéis continua sem acesso.

## Detalhes técnicos
- `src/lib/busca/busca.server.ts`: `rota` passa a ser `/alugueis?id=<contractId>` (ou campo `params`) para categorias aluguel/inquilino/imóvel de locação; inquilino resolve contratos via `rental_contract_tenants` + `rental_contracts.tenant_id`; busca de aluguel inclui `rental_properties.proprietario_nome` e fiadores. Mesmo ajuste nas timelines (linhas ~801/925/969).
- `GlobalSearchBar.tsx` e `_app.busca.tsx`: resultados com contrato navegam com `navigate({ to: "/alugueis", search: { id } })` em vez de abrir o drawer; `RecordTimelineDrawer` usa o `search` no Link.
- `_app.alugueis.tsx`: já abre via `?id=`; garantir que abre mesmo quando o filtro de status/imobiliária atual esconderia o contrato (buscar em `allContracts`) e que a imobiliária do topo (Cordial/Morar) não impeça.
- Teste: resultado de inquilino com contrato gera destino `/alugueis` com `id` do contrato; proprietário encontra contrato. Verificar no navegador com "José Luis Oliveira da Silva".
