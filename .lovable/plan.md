# Novo layout da Agenda (Equipe e Fotos)

Objetivo: o topo fica pequeno e o destaque passa para os eventos. As duas agendas (Equipe e Fotos) recebem o mesmo tratamento.

## 1. Topo compacto (cerca de 75% menor)
```text
[icone] AGENDA DA EQUIPE              [Compromissos | Fotos]  [G conta ✓ ···]  [+ Novo compromisso]
        Visitas e compromissos
```
- Uma faixa só, de uma linha, com altura aproximada de 72px (hoje ~440px).
- **Esquerda:** ícone pequeno, um rótulo curto ("Agenda da equipe" ou "Agenda de fotos") e o título em tipografia premium (Sora). A frase longa de descrição sai do topo.
- **Direita:** a troca Compromissos/Fotos, o Google Agenda reduzido a um ícone redondo com sinal de "conectado" (o e-mail e o menu aparecem ao clicar) e o botão laranja "Novo compromisso" / "Nova sessão".
- No celular: título em cima e ações em uma linha abaixo; o botão vira só "+ Novo".
- O fundo petróleo (Equipe) e roxo (Fotos) continua, mais discreto.

## 2. Filtros mais perto do topo
- Hoje / Próximos 7 dias / Este mês / Todos / Personalizado e "Filtros" sobem logo abaixo da faixa, com menos espaço entre eles.
- O contador "2 compromissos" fica junto dos filtros, menor.

## 3. Indicadores redesenhados
- Hoje, Próximos 7 dias, Visitas, Retornos, Assinaturas e A confirmar viram blocos compactos: um ícone colorido por tipo, número grande em Sora e rótulo pequeno.
- Fundo claro e suave, com uma borda fina e um tom leve na cor do tipo; o bloco selecionado fica preenchido.
- Os que estão zerados aparecem mais apagados, para não chamar atenção.
- A agenda de fotos usa os mesmos blocos, com os seus próprios indicadores.

## 4. Lista "Hoje e próximos" em destaque
- O cabeçalho de cada dia vira um selo de data mais elegante (dia grande, mês e dia da semana), e "Hoje" ganha destaque na cor da marca.
- No cartão do evento:
  - o horário fica grande à esquerda, com uma faixa colorida conforme o tipo (visita, retorno, assinatura, fotos);
  - o título vem em destaque;
  - cliente, imóvel e responsável ficam numa linha compacta com ícones;
  - status e imobiliária viram etiquetas pequenas à direita.
- Menos texto auxiliar, mais espaço para o evento, sombra e cantos refinados.

## O que não muda
- Regras de quem pode criar ou editar, ligação com o Google Agenda, filtros, dados e lembretes. A mudança é só visual.

## Detalhes técnicos
- Alterar: `AgendaHero.tsx` (faixa compacta e Google Agenda como ícone com menu), `AgendaSummaryCards.tsx`, `AgendaTimeline.tsx`, `AgendaEventCard.tsx` e o espaçamento nas rotas `_app.agenda.index.tsx` / `_app.agenda.fotos.tsx`.
- `GoogleCalendarCard`: nova variante "icon" com menu suspenso (reaproveita as ações atuais: conectar, sincronizar, desconectar).
- Cores definidas como tokens no arquivo de estilos.
- Conferir em 390, 768 e 1440px por captura de tela, nas duas agendas.
