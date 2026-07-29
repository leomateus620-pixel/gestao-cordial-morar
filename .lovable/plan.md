## Objetivo

Deixar o CRM de Atendimentos menos comprimido: quadro com 5 etapas ativas, perdidos em uma visão própria, colunas mais largas no desktop e "Última ação" sem cortes.

## 1. "Perdido" sai do quadro

- O Kanban passa a renderizar apenas as 5 etapas ativas (Primeiro contato → Fechamento).
- O card "Perdidos" do resumo continua no topo, com a contagem real, e vira o gatilho: ao clicar, a tela troca do quadro para uma **visão dedicada de Perdidos** (lista em grade, com destaque vermelho e o motivo da perda visível).
- Nessa visão há um botão "Voltar ao funil" que devolve o quadro das 5 etapas.
- O seletor de etapa dentro de cada card continua oferecendo "Perdido", para marcar/recuperar leads — só a coluna sai do quadro.
- No mobile, as abas de etapa também ficam com as 5 ativas; "Perdidos" segue acessível pelo card do resumo.

## 2. Responsividade desktop

- Com 5 colunas em vez de 6, reduzir a largura mínima do quadro (de ~1800px para ~1450px) para caber sem rolagem em telas comuns e dar mais respiro a cada card.
- Card do atendimento: rótulos e valores das colunas "Corretor / Telefone / Região / Faixa" com quebra de linha em vez de corte, e a trilha "Anterior / Atual / Próxima" sem truncar o nome da etapa.

## 3. "Última ação" completa

- Remover o corte de 2 linhas da descrição: o texto aparece inteiro, com quebra de palavra preservada.
- Reorganizar o bloco para data/autor abaixo do texto quando a coluna é estreita, evitando o empilhamento vertical de uma palavra por linha visto no print.
- Mesma correção no bloco "Lead perdido" (motivo completo) e no "Imóvel vinculado".

## Detalhes técnicos

- `src/types/atendimento.ts`: usar `ACTIVE_PIPELINE_STAGES` como base do quadro; manter `FUNNEL_PIPELINE_STAGES` para os seletores/resumo.
- `src/components/atendimentos/AtendimentoKanban.tsx`: colunas a partir das etapas ativas, `min-w` reduzido, e novo modo "lista de perdidos" quando `selectedStage === "perdido"`.
- `src/components/atendimentos/AtendimentoSummaryCards.tsx`: card "Perdidos" mantido como botão de alternância.
- `src/components/atendimentos/AtendimentoCard.tsx`: remover `line-clamp`/`truncate` dos blocos de conteúdo (última ação, motivo de perda, imóvel, contexto).
- `src/routes/_app.atendimentos.tsx`: garantir que a etapa selecionada "perdido" acione a visão dedicada.

Sem mudanças de banco de dados ou de regras de acesso.
