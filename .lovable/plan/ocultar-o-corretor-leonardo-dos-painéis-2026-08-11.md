# Ocultar o corretor Leonardo dos painéis

O usuário Leonardo (leomateus620@gmail.com) continua existindo e funcionando normalmente para testes, mas deixa de aparecer como corretor em qualquer painel, ranking, indicador ou campo de seleção do sistema. Os 19 lançamentos financeiros de teste vinculados a ele são removidos.

## O que muda

1. **Marcação de conta interna**
   - Novo campo no cadastro de perfis: "conta interna/teste".
   - Leonardo é marcado como conta interna. Nenhum outro usuário é afetado.

2. **Sumiço das listagens de corretores**
   - Menu Corretores: fora dos cards de indicadores, do ranking, do tempo de resposta e da lista "Visão por corretor".
   - Campos "Corretor responsável" (Atendimentos, Agenciamentos, Agenda, Pesquisa de satisfação): o nome deixa de ser oferecido.
   - Filtros por corretor deixam de listá-lo.
   - Exceção intencional: quando o próprio Leonardo estiver logado, ele continua podendo se autovincular, para os testes seguirem funcionando.

3. **Limpeza dos dados financeiros de teste**
   - Remoção dos 19 lançamentos do Financeiro vinculados ao usuário dele.

4. **O que permanece**
   - Os registros de teste que ele criou em Atendimentos (2), Agenda (8), Pesquisas de satisfação (2) e 1 contrato de aluguel continuam onde estão — apenas não somam mais em indicadores individuais de corretor. Se quiser apagá-los depois, é só pedir.

## Detalhes técnicos

- Migração: `ALTER TABLE public.profiles ADD COLUMN is_internal boolean NOT NULL DEFAULT false` e marcação de `d3abe478-5f0f-480e-b2d5-d9c9762bd8c4`.
- Atualização das funções `list_corretores()` e `list_assignable_brokers()` para filtrar `p.is_internal = false` (mantendo o ramo de autovínculo do próprio usuário) e de `get_corretores_response_metrics()` para descartar brokers internos.
- `src/lib/equipe/equipe.functions.ts` e `useHydrateCorretores.ts` já consomem essas funções, então o filtro se propaga sem mudança de UI.
- Exclusão de dados via ferramenta de dados: `DELETE FROM financeiro_lancamentos WHERE user_id = '<id>' OR corretor_id = '<id>'`.
- Regeneração dos tipos após a migração.
