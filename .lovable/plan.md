# Novo layout de Atendimentos

Objetivo: o topo fica pequeno e o funil com os contatos aparece logo, sem precisar rolar a tela. Segue o mesmo padrão da nova Agenda.

## 1. Topo compacto (cerca de 75% menor)
```text
[icone] Atendimentos      [ Vendas 213 · 7 atraso | Aluguéis 103 · 14 atraso ]   [Filtros] [PDF] [+ Novo atendimento]
```
- Uma única faixa petróleo, com ~64px de altura.
- Sai: "Central de entrada comercial", a frase de descrição e a linha "Pré-atendimento · Corretor · Conversão".
- **Vendas/Aluguéis:** os dois cartões grandes viram uma troca compacta dentro da faixa, com ícone, nome, total de ativos e um selo laranja de atrasos.
- **Botões à direita:** "Histórico em PDF" (só o ícone no celular) e "Novo atendimento" (no celular, "+ Novo").
- **Filtros:** o botão sai da linha da busca e vai para essa faixa, como ícone com o número de filtros ativos. O painel de filtros continua igual.
- No celular: título e ações em cima, e a troca Vendas/Aluguéis ocupando a largura toda logo abaixo.

## 2. Uma busca só
- A barra de busca própria da página é removida.
- Na página de Atendimentos, a busca do topo do sistema passa a filtrar os atendimentos (nome, telefone, bairro, origem, corretor). Ela mostra o texto de exemplo "Buscar atendimentos…" e o resultado aparece direto no funil.
- Nas outras páginas, a busca do topo continua sendo a busca geral, como hoje.

## 3. Etapas do funil com destaque
- Sai o título "Navegação principal / Etapas do funil" e a frase de apoio.
- Cada etapa vira um bloco compacto:
  - faixa e fundo suave na cor da etapa (azul, ciano, roxo, laranja, verde, vermelho, âmbar);
  - número grande em Sora e nome numa linha só;
  - "Expandir etapa" vira um ícone discreto;
  - a etapa selecionada fica preenchida na sua cor.
- Altura cai de ~250px para ~90px.

## 4. Indicadores
- Compra, Aluguel, Ticket médio, Leads do mês e Retornos atrasados viram uma faixa fina com ícone colorido, número em Sora e rótulo pequeno.
- Retornos atrasados mantém o destaque em vermelho quando houver atraso.

## O que não muda
- Regras de acesso, dados, filtros, funil, lista, PDF e cadastro. A mudança é só visual e de organização.

## Detalhes técnicos
- Em `_app.atendimentos.tsx`: novo cabeçalho compacto com `PipelineTrackSelector` em versão compacta.
- `AtendimentoFilters`: o campo de busca sai e o botão de filtros passa para o cabeçalho.
- `AtendimentoSummaryCards`: os blocos de etapas e os indicadores são redesenhados.
- `GlobalSearchBar`: quando a página atual é /atendimentos, passa a ler e gravar o texto da busca da página (o mesmo estado que a busca local usa hoje), com o tempo de espera atual.
- Conferir em 390, 768 e 1440px por captura de tela.
