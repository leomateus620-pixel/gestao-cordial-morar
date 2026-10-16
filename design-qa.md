# Revisão visual — Assistente Cordial

final result: passed

## Revisão da identidade solicitada

Após a limpeza de descrições, o usuário pediu uma marca própria no lugar da estrela do assistente. Foram pesquisados os sites oficiais da Cordial e da Morar e conferidos os arquivos já usados no app. O novo símbolo une C/casa e M/telhado com azul-petróleo e cobre.

As marcas de origem (691 × 231 e 728 × 291) e a implementação renderizada foram comparadas no mesmo painel: `/tmp/cordial-runtime/qa-identidade-final.jpg`, 1800 × 1000. Evidência do navegador: `docs/assistente/screenshots/identidade-assistente.jpg`, viewport 1440 × 1000. O novo master é PNG RGBA 1254 × 1254; o WebP lossless do app preserva exatamente os pixels decodificados.

Foram conferidos tamanhos de 16, 24 e 40 px, fundos claro/escuro e aplicação no workspace/mobile. O ícone tem massas amplas e silhueta legível, sem estrela genérica. Os personagens dos agentes permanecem distintos da marca do assistente. Capturas principais foram atualizadas; as comparações desktop/mobile foram reabertas com essa versão.

Tipografia das reconstruções das marcas é uma aproximação visual com pequenos desvios de espaçamento; essas imagens em alta resolução ficam como derivados de revisão, sem substituir as matrizes dos sites. Os resíduos de alfa muito baixo enfatizados no visualizador isolado não apareceram na composição real do navegador. Arte do assistente foi criada pelo ImageGen, sem reconstrução manual em SVG. Não há P0/P1/P2 visual pendente nessa revisão.

## Alvo e evidências

As imagens fornecidas são referências de experiência, não um layout para cópia. A adaptação mantém os componentes e tokens do Gestão, personagens próprios e funções imobiliárias. O pedido permite explicitamente mascotes SVG/CSS; foram usados SVGs autorais, sem marcas, personagens ou assets dos produtos de referência.

| Evidência             | Arquivo                                                                    | Dimensões e estado                            |
| --------------------- | -------------------------------------------------------------------------- | --------------------------------------------- |
| Referência desktop    | `/Users/leonardo/Downloads/WhatsApp Image 2026-10-16 at 01.30.22 (2).jpeg` | 1125 × 683 px; tela vazia clara               |
| Referência mobile     | `/Users/leonardo/Downloads/WhatsApp Image 2026-10-16 at 01.30.21 (1).jpeg` | 591 × 1280 px; lista de personagens           |
| Implementação desktop | `docs/assistente/screenshots/desktop-vazio.jpg`                            | viewport e captura 1440 × 1000; vazio claro   |
| Implementação mobile  | `docs/assistente/screenshots/mobile-home-corretor.jpg`                     | viewport e captura 390 × 844; corretor, claro |
| Conversa e estados    | `docs/assistente/screenshots/`                                             | desktop 1440 × 1000; mobile 390 × 844         |

Renderização no navegador em `http://127.0.0.1:5174/tests/assistant/preview.html`, usando componentes reais e transporte isolado com dados fictícios. Não é evidência de autenticação ou integração completa com o Supabase remoto.

As comparações foram abertas lado a lado na mesma imagem, com recortes de conteúdo e escala proporcional. Fontes têm resolução física diferente; não há comparação pixel a pixel nem reprodução de moldura/status bar. A captura da implementação corresponde a um pixel por CSS px. A home admin usa captura integral de 390 × 1054 para incluir os agentes futuros.

- Composição completa desktop: `/tmp/cordial-runtime/qa-desktop-final.jpg`. Referência recortada em `(0,0,1125,643)`, implementação em `(24,80,1416,930)`; painel comparativo de 1800 × 650.
- Composição completa mobile: `/tmp/cordial-runtime/qa-mobile-final.jpg`. Referência em `(0,100,591,1115)`, implementação em `(12,162,378,815)`; painel de 800 × 760.
- Região de controles do composer: `/tmp/cordial-runtime/qa-composer-final.jpg`. Recortes de ambas as fontes, com a largura inteira do composer implementado; painel de 1800 × 240. Essa comparação focada permitiu conferir texto, ícones e espaçamento sem depender da miniatura desktop.

Os painéis temporários incluem referências fornecidas pelo usuário e não são incorporados ao produto. As capturas da implementação estão versionadas.

## Achados corrigidos e comparação posterior

1. **[P2, resolvido] Descrições repetidas competiam com a conversa.** Hero, composer, contexto e cards repetiam orientações e limites. Foram removidas faixas e frases redundantes. As apresentações mantêm habilidades e pedidos visíveis; dados, limites e rotinas ficam em seções expansíveis. Evidência posterior: `desktop-vazio.jpg`, `desktop-apresentacao.jpg`, `mobile-home-corretor.jpg` e `mobile-contexto.jpg`, recapturadas após a limpeza.
2. **[P2, resolvido] Classes de exibição interferiam nos breakpoints.** CSS da barra e do contexto podia prevalecer sobre os utilitários responsivos. A regra foi corrigida e os painéis se tornaram drawers no celular. Evidência posterior: `mobile-precisa-de-voce.jpg`, `mobile-contexto.jpg` e conversa mobile, sem sobreposição de colunas.
3. **[P2, resolvido] Altura mínima do workspace prejudicava celulares baixos.** O workspace passou a usar a altura disponível, com área de mensagens rolável e composer acessível. Verificação adicional em 375 × 667: largura do documento igual a 375 e composer entre y=530 e y=575, dentro da tela.

A comparação final, após essas correções, não encontrou P0/P1/P2 visual pendente. Diferenças intencionais: painel de contexto, briefing com dados, abas e disponibilidade honesta de recursos futuros; ausência de criação de bots, envio externo ou indicadores fictícios de atividade.

## Superfícies verificadas

- **Tipografia:** família herdada do Gestão, hierarquia curta, pesos consistentes, títulos e prévias sem colisão. A referência orienta a clareza; não se tentou identificar ou importar a fonte proprietária dela.
- **Espaçamento:** composição com respiro, raio e bordas consistentes, conversa central e laterais discretas; lista mobile com área de toque ampla. Estado vazio e mensagens com cartões foram comparados separadamente.
- **Cores e tokens:** superfícies claras/escuras do app, ação primária e foco pelos tokens existentes; cores pastel identificam os agentes sem substituir os estados semânticos. Modo escuro registrado em `mobile-escuro.jpg`.
- **Imagens:** mascotes próprios, vetoriais e nítidos; nenhum asset de marca copiado. Fotos ausentes têm ícone, sem imóveis fictícios apresentados como resultado real.
- **Conteúdo:** português curto, sem texto de marketplace ou negócios dos anexos. Detalhes só onde ajudam uma decisão. Indisponibilidades e erros continuam explícitos.
- **Ícones e acessibilidade:** controles nomeados, abas navegáveis por setas/Home/End, foco visível, labels em dialogs, descrições acessíveis sem poluição visual e movimento reduzido. Não foi executada auditoria externa completa de WCAG.

## Interações e estados

Foram verificados vazio, histórico carregando, consulta em andamento, resposta, erro, tema escuro, busca de equipe, perfil de corretor/admin, menção com seleção de registro, drawers, abas, seções expansíveis e envio pelo composer com transporte sintético. Os cartões levam às rotas reais declaradas; o harness não navega pelos módulos de negócio.

Console após recarga limpa: sem novos erros/avisos no harness final. Os logs históricos de edições intermediárias e os avisos do Recharts de outra rota foram distinguidos da sessão final.

## Checklist de implementação

- [x] Remover descrições redundantes sem esconder erro ou indisponibilidade.
- [x] Conferir desktop, mobile, celular baixo e tema escuro.
- [x] Comparar referência e resultado no mesmo painel, incluindo composer ampliado.
- [x] Versionar capturas com dados sintéticos.
- [x] Documentar limites da verificação local; homologação autenticada permanece necessária.
