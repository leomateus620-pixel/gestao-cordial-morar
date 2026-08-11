# Corretores — limpeza visual e compactação

Objetivo: remover poluição visual do menu Corretores, encolher os cards de KPI e recolher todos os filtros em um ícone expansível, mantendo um visual profissional e responsivo.

## O que muda

### 1. Cabeçalho mais enxuto
- Remove o selo "Inteligência operacional" e a frase "Indicadores rastreáveis de atendimentos, agenda, agenciamentos, negócios e resposta da equipe."
- Mantém apenas o título "Corretores" com uma linha curta de contexto (escopo/período) e as três pílulas (Ativos, Fechados, Conversão) em tamanho reduzido.
- Altura do bloco reduzida (padding menor, sem gradiente extra).

### 2. Avisos deixam de ocupar espaço
- O aviso "Atribuição preservada: X aluguéis sem UUID…" sai do fluxo da página.
- Vira um ícone discreto de informação ao lado do título, com o texto completo em tooltip/popover.
- Mesma abordagem para o aviso de "Dados parciais". O alerta de erro real (falha de carregamento) continua visível, pois exige ação.

### 3. Cards de KPI menores
- Grid passa a 3 colunas em tablet e 6 em telas grandes (2 colunas no mobile).
- Cada card fica compacto: rótulo pequeno, número em destaque menor, detalhe em uma linha truncada, ícone reduzido; remove a seta de canto e sombras pesadas.
- Continuam clicáveis com os mesmos destinos de navegação.

### 4. Filtros dentro de um ícone
- O bloco inteiro "Filtros operacionais" (cabeçalho, descrição, 5 campos e botão limpar) sai da página.
- No lugar: um botão-ícone de filtro com contador de filtros ativos, na mesma linha do título da lista.
- Ao clicar, abre um popover (desktop) / sheet inferior (mobile) com Período, Situação, Critério do ranking, Corretor, Busca e "Limpar filtros".
- Chips compactos mostram os filtros ativos quando houver, para não esconder o estado.

### 5. Tipografia e ritmo
- Escala tipográfica unificada nas seções (título de seção menor e consistente), espaçamento vertical reduzido entre blocos.
- Ranking, tempo de resposta e lista por corretor mantêm a função, apenas com cabeçalhos mais leves e menos texto auxiliar.

## Detalhes técnicos
- `src/routes/_app.corretores.tsx`: remove textos do herói, converte avisos em popover informativo, reorganiza a ordem dos blocos e passa os filtros para a barra da lista.
- `src/components/corretores/CorretoresSummaryCards.tsx`: nova densidade de grid e card compacto (sem mudança de lógica de dados/indisponibilidade).
- `src/components/corretores/CorretoresFilters.tsx`: refatorado para renderizar apenas o gatilho (ícone + contador) e o conteúdo dentro de Popover/Sheet, com os mesmos props atuais.
- Sem alterações em hooks, server functions ou banco.
