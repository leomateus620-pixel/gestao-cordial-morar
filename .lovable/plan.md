# Fonte de prospecção (Atendimentos) + classificação editável (Agenciamentos)

## 1. Atendimentos — campo "Fonte de prospecção"

Novo campo obrigatório, separado da "Origem do lead" já existente (site, indicação, etc.).

Valores normalizados no banco: `lead_imobiliaria` e `cliente_particular_corretor`.
Registros antigos ficam nulos e aparecem como "Não informado" — nunca inferidos automaticamente.

Onde aparece:
- Cadastro de atendimento: seleção obrigatória, com descrição curta de cada opção.
- Edição: valor atual pré-selecionado, alterável por quem já pode editar o atendimento (corretor dono, secretária, admin) — sem novas regras de permissão.
- Detalhes: linha própria no bloco de origem, com "Não informado" quando vazio.
- Filtros: opções Todas / Lead da imobiliária / Cliente particular / Não informado.

Regras:
- Continua respeitando o corretor responsável e a imobiliária (Cordial/Morar) do atendimento; o campo não altera nem deduz imobiliária.
- Novos atendimentos exigem o campo; edições de registros antigos podem salvar sem preencher, mas o formulário sugere o preenchimento.
- Dados já ficam prontos para futuros relatórios (coluna indexada e valor normalizado).

## 2. Agenciamentos — Venda/Locação editável com segurança

O seletor de finalidade já existe no formulário; a entrega aqui é tornar a troca segura e consistente:

- Ao editar, a classificação atual vem selecionada.
- Se o usuário mudar Venda → Aluguel (ou o inverso) em um registro já salvo, aparece uma confirmação explicando que o agenciamento sai da contagem/bonificação da categoria antiga e entra na nova.
- Botão de salvar bloqueado durante o envio (sem duplicidade de submit).
- Salvamento usa o fluxo de atualização existente: preserva imóvel, corretor, checklist, datas, anexos, observações e histórico.
- Após salvar, listas, filtros, indicadores, painel de bonificação, relatórios e o menu Corretores são atualizados na hora (invalidação das queries de agenciamentos, bônus e desempenho da equipe).
- O recálculo de bonificação continua no gatilho de banco já existente, que roda para as duas categorias afetadas; sem bônus ou notificação duplicada.

## 3. Testes

- Testes automatizados: rótulos/normalização da fonte de prospecção e mapeamento de campos do atendimento; regra de "mudou de trilha" que dispara a confirmação.
- Verificação em navegador: criar atendimento com cada fonte, editar a fonte, recarregar e conferir persistência, detalhes e filtros; registro antigo mostrando "Não informado"; trocar um agenciamento de Venda para Aluguel e de volta, conferindo contagens, filtros e painel de bônus.
- Conferência de responsividade (desktop e mobile) e de estados de carregando/erro/sucesso.

## Detalhes técnicos

- Migração: `ALTER TABLE public.attendances ADD COLUMN fonte_prospeccao text` com `CHECK` nos dois valores permitidos (nullable, sem default), mais índice para relatórios futuros. Sem mudança de RLS ou grants.
- Tipos: `FonteProspeccao` em `src/types/atendimento.ts` + opções com rótulo/descrição; campo opcional em `Atendimento`, `AtendimentoFiltersState` e input de criação/edição.
- Mapeamento: `src/lib/attendances/attendance-field-mapping.ts` e `attendances.functions.ts` (select, insert, update, filtro server-side quando aplicável).
- UI: `AtendimentoFormModal.tsx` (campo + validação), `AtendimentoDetailDrawer.tsx`, `AtendimentoFilters.tsx`, e filtragem em `_app.atendimentos.tsx`.
- Agenciamentos: confirmação de troca de trilha e guarda de submit em `AgenciamentoFormModal.tsx`; invalidação já centralizada em `useAgenciamentos.ts` (agenciamentos, bônus, equipe) — estender se algum consumidor ficar defasado.
- Sem novas rotas, sem mock, sem duplicação de regras de permissão.
