# Agenda — refinamento visual e de organização

Três ajustes de interface no menu Agenda (Visitas e compromissos + Agenda de fotos). Nenhuma regra de negócio, dado ou permissão muda.

## 1. Google Agenda vira um item compacto

Hoje a conexão ocupa um card grande com título de seção "Conexões da sua conta" logo no topo da página.

- Substituir por uma barra fina alinhada ao topo: ícone do Google Agenda, o e-mail conectado e um selo pequeno "Conectada".
- Ações (Desconectar / Reconectar) passam para um menu de três pontinhos à direita, em vez de dois botões visíveis.
- Sem conexão: a mesma barra fina mostra "Google Agenda não conectada" e um único botão pequeno "Conectar".
- Erro de sincronização: a barra ganha destaque em vermelho com a mensagem curta e ação "Reconectar".
- Remover o cabeçalho "Conexões da sua conta".

## 2. Seletor Visitas × Fotos com mais presença

- Remover a frase "Visitas, retornos, reuniões, assinaturas e compromissos internos." (e a equivalente da Agenda de fotos).
- Transformar as duas abas em um par de cartões-segmento maiores, lado a lado, com ícone em destaque, título e um contador do que está no recorte atual ("24 no período"), com indicador ativo bem visível (fundo sólido teal, sombra) e o inativo claramente clicável.
- Manter navegação por rota (`/agenda` e `/agenda/fotos`), acessibilidade de tablist e comportamento responsivo (empilha em telas estreitas).

## 3. Cartões de resumo viram filtros inteligentes

Os seis cartões (Hoje, Próximos 7 dias, Visitas, Retornos, Assinaturas, A confirmar) hoje são só números com ícones pequenos.

- Remover os ícones pequenos; o número passa a ser o elemento dominante, com o rótulo legível abaixo.
- Cada cartão passa a ser clicável e aplica o filtro correspondente:
  - Hoje → período "hoje"
  - Próximos 7 dias → período "próximos 7 dias"
  - Visitas → tipo visita; Retornos → tipo retorno; Assinaturas → tipo assinatura
  - A confirmar → status "agendado"
- Clicar de novo no cartão ativo desfaz o filtro. O cartão ativo fica marcado (borda/fundo teal) e a linha de chips de período acima reflete o mesmo estado.
- Mesmo tratamento na Agenda de fotos: Agendadas / Pendentes / Concluídas / Reagendadas filtram por status; Fotos hoje e Próximos 7 dias filtram por período.
- Zerados ficam esmaecidos, mas continuam clicáveis.

## Detalhes técnicos

- `src/components/configuracoes/GoogleCalendarCard.tsx`: nova variante compacta (`variant="inline"`) usada na Agenda; o uso em Configurações permanece com o layout atual.
- `src/components/agenda/AgendaViewSwitcher.tsx`: remove `description`, aceita contagens opcionais por escopo e passa a renderizar cartões-segmento.
- `src/components/agenda/AgendaSummaryCards.tsx`: passa a receber `filters` e `onFiltersChange`, sem ícones, com estado ativo derivado dos filtros atuais (toggle).
- `src/routes/_app.agenda.index.tsx` e `src/routes/_app.agenda.fotos.tsx`: ligam os novos props e ajustam a ordem do topo (conexão compacta → seletor → criar → chips → cartões-filtro → timeline).
- Estilos apenas com tokens existentes (`glass-panel`, teal do sistema).
