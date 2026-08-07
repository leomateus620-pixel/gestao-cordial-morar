# Agenciamentos — refino visual e de organização

Reorganizar a tela de Agenciamentos para ficar mais limpa, mais intuitiva e mais precisa, no desktop e no mobile.

## O que muda na tela

1. **Cabeçalho da página**
   - Remove a descrição "Acompanhe imóveis captados, responsáveis e etapas de validação."
   - Substitui o ícone genérico de prancheta por uma marca própria do módulo (ícone de imóvel com selo de captação), em um selo mais discreto.
   - Visual mais clean: menos preenchimento, destaque pontual só no brilho de fundo e no botão "Cadastrar agenciamento". Ao lado do título, um resumo mínimo em texto (total de captações no período) para o cabeçalho já informar algo útil.

2. **Faixa de classificação**
   - Quando não há pendências, a faixa "Todos os agenciamentos estão classificados…" desaparece por completo; sobra apenas um link discreto "Ver sem classificação" no rodapé do seletor de trilhas.
   - Quando existem itens sem classificação, a faixa de alerta continua aparecendo (é informação acionável).

3. **Cards de trilha (Venda / Aluguel)**
   - Mantêm as duas opções, com hierarquia mais forte: número grande de captações, meta em texto secundário menor, chip de pendências só quando houver.
   - Estado ativo com borda/realce sólido em vez de fundo colorido inteiro.

4. **Card de bonificações**
   - Cabeçalho mais limpo (título + ciclo em uma linha), destaque numérico para "validadas / pendentes".
   - Barra de progresso com número grande do percentual e a frase de pendência reduzida a uma linha curta.
   - Histórico continua listado, com tipografia mais consistente e o botão "Ver todas" alinhado.

5. **Resumo operacional**
   - Remove o título/descrição "Toque em um card para filtrar a lista abaixo." e o rótulo "Todo período" à direita.
   - Cards ficam mais intuitivos: rótulo curto, número em destaque, ícone removido ou reduzido a marcador de estado, e uma legenda de ação clara ("Filtrar" / "Filtro ativo · tocar para limpar") aparecendo no hover/estado ativo.
   - Cards sem valor a resolver (zero pendências) ficam visualmente apagados para não competir com os relevantes.

6. **Correções de filtragem dos cards** (verificado no código atual)
   - "Fotos pendentes" hoje conta imóveis sem envio ao Drive, mas ao clicar aplica o filtro "sem fotos horizontal/vertical" — números e lista não batem. Passa a contar e filtrar o mesmo critério (fotos horizontal + vertical).
   - "Agenciamentos no período" hoje aparece sempre como ativo, porque o estado ativo é deduzido de filtros no padrão. Passa a ser ativo somente quando for a seleção explícita do usuário.
   - "Placas pendentes", "Imóveis fora do site", "Pendentes de validação" e "Validados" são conferidos par a par (contagem × filtro aplicado).

7. **Filtros operacionais**
   - Sai o card grande. Entra um botão compacto "Filtros" com ícone e contador de filtros ativos, alinhado à direita acima da lista, junto com chips dos filtros ativos (cada chip removível).
   - Ao clicar, abre um painel expansível (popover no desktop, folha inferior no mobile) com Imobiliária, Período, Status, Tipo de imóvel, Checklist e Responsável, com rótulos tipograficamente destacados e ações "Limpar" / "Aplicar".
   - O campo "Busca" sai do painel de filtros; permanece apenas como campo de busca próprio acima da lista (não dentro do painel).

8. **Card do agenciamento — bloco "Responsabilidade"**
   - Passa a ter avatar com iniciais do corretor, nome em destaque tipográfico maior e a data do agenciamento em linha secundária com rótulo ("Captado em"), num bloco com fundo suave e separado visualmente também no desktop.

## Detalhes técnicos

- `src/routes/_app.agenciamentos.tsx`: novo cabeçalho, faixa de classificação condicional, correção de `activeSummaryKey`/`handleSummarySelect` (chave ativa passa a ser estado próprio, e não inferência dos filtros), e nova composição barra de busca + botão de filtros acima da lista.
- `src/components/agenciamentos/AgenciamentoSummaryCards.tsx`: remoção do cabeçalho/descrição, novo desenho dos cards, estados apagado/ativo, e alinhamento das métricas com os filtros aplicados.
- `src/components/agenciamentos/AgenciamentoFilters.tsx`: refeito como controle compacto (`Popover` no desktop, `Sheet` no mobile) + chips de filtros ativos; remoção do `SearchField` de dentro do painel, extraído para um componente de busca próprio usado pela rota.
- `src/components/agenciamentos/AgenciamentoTrackSelector.tsx` e `AgenciamentoBonusPanel.tsx`: ajustes de hierarquia tipográfica e densidade.
- `src/components/agenciamentos/AgenciamentoCard.tsx`: novo bloco "Responsabilidade" com avatar/iniciais e data rotulada.
- `src/services/agenciamentos.ts`: apenas o ajuste do cálculo de "fotos pendentes" para bater com o filtro `sem_fotos` (nenhuma outra mudança de regra de negócio).
- Sem alterações de banco, RLS ou server functions. Validação: typecheck, suíte de testes existente e conferência visual no preview em desktop e mobile.
