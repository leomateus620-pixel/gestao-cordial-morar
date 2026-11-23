# Vistoria de entrada usando o imóvel do próprio contrato

## Objetivo
A vistoria de entrada de um contrato de aluguel passa a usar o imóvel cadastrado no próprio contrato (cadastro de aluguel), sem depender do catálogo de venda/site. As vistorias que já existem continuam iguais.

## Como vai funcionar para o usuário
1. No contrato, depois de marcar o contrato anexado como conferido, o botão "Iniciar vistoria de entrada" abre a vistoria com o imóvel do contrato já preenchido (endereço, tipo, proprietário).
2. O usuário não precisa escolher imóvel; não aparece mais o aviso "não está ligado a um imóvel do catálogo".
3. Vistorias avulsas (fora de contrato) continuam escolhendo um imóvel do catálogo, como hoje.
4. O relatório em PDF mostra o endereço e o proprietário do imóvel do contrato.
5. Cada contrato tem no máximo uma vistoria de entrada.

## Etapas
1. Banco (migração aditiva): a vistoria ganha um campo opcional que aponta para o imóvel de aluguel. Uma regra garante que toda vistoria tenha exatamente um imóvel: do catálogo OU do aluguel.
   - Ponto que exige sua autorização: hoje o imóvel do catálogo é obrigatório na vistoria. Para vistorias de contrato ele precisa passar a ser opcional (só para elas, protegido pela regra acima). Nenhum dado existente é apagado ou alterado.
2. Permissões: quem pode abrir o contrato pode criar/ver a vistoria de entrada dele (admin, secretária da marca e quem já tem acesso ao contrato). O perfil restrito de Atendimentos e o revisor Meta continuam bloqueados.
3. Servidor: a criação da vistoria de contrato valida conferência do contrato, usa o imóvel do contrato e impede duplicidade. A comparação atual que sempre falhava é substituída.
4. Tela: pré-preenche o imóvel do contrato; mantém o fluxo avulso sem mudanças.
5. Relatório: o retrato da vistoria e o PDF leem endereço/proprietário do imóvel de aluguel quando for vistoria de contrato.
6. Testes: regras de "um imóvel só", bloqueio sem conferência, sem duplicidade, acesso por perfil; teste ponta a ponta em um contrato real só com sua autorização, desfazendo depois.

## Fora do escopo
Seguradoras/cláusulas e geração de contrato (aguardam sua lista e o modelo Morar). Sem publicar.

## Detalhes técnicos
- `inspections.rental_property_id uuid null references rental_properties(id) on delete restrict` + `contract_id` já usado pelo fluxo; `CHECK (num_nonnulls(property_id, rental_property_id) = 1)` adicionado `NOT VALID` e validado em seguida (todas as linhas atuais têm `property_id`).
- `ALTER COLUMN property_id DROP NOT NULL` — classificado como alteração que exige aprovação; nada é removido.
- Índice único parcial por `contract_id` para tipo entrada.
- Revisar `inspection_can_access/can_edit` para aceitar acesso via contrato; aplicar a política RESTRICTIVE de `meta_reviewer`/`atendimentos_viewer` já existente.
- `rental_properties` hoje só é lido pelo criador/admin; a leitura para a vistoria será feita no servidor após verificar acesso ao contrato, sem abrir a tabela.
- Ajustar `entry-inspection.server.ts`, `assertContractEntryInspectionStart`, `createInspection`, `creation-workspace.tsx`, snapshot de `inspection_finalize` e PDF.
