# Design QA — Morar

**Source visual truth:** `C:/Users/Leonardo/Downloads/Busca imobiliária em vidro fumê.png` (1295×1215 px), mais os dois prints atuais fornecidos. A imagem é uma referência recortada de material e hierarquia; o briefing funcional e o catálogo real determinam os controles e o conteúdo.

**Implementation:** `http://127.0.0.1:4174/site-morar`, componentes do repositório com API pública real e transporte de prévia somente para leitura. Evidências em `docs/qa/morar-charcoal/`.

## Comparação e normalização

O print gerado é um recorte ampliado do card, sem metadados de viewport. A revisão comparou o card e seus ícones/campos com a região correspondente da implementação, além da composição completa da abertura, resultados e rodapé. Não se presume uma reprodução pixel a pixel da página inteira a partir desse recorte.

A abertura desktop usa alvo CSS 1440×900; a captura final tem aproximadamente 1427×901 pixels úteis, com arredondamento/scrollbar do navegador. A captura completa tem 1440×4074 px. A home mobile usa alvo 390×844 e captura completa 390×8449 px. Os demais alvos, dimensões CSS observadas e colunas constam em `viewports.json`. A densidade do ambiente variou de 1 a aproximadamente 1,14; as capturas foram normalizadas pelo fator observado, sem recolorir fotografias ou logos.

Referência e capturas finais foram abertas juntas na inspeção. Foram examinados separadamente campos, foco, combobox, ícones a 20/24 px, borda da ação, contraste do material, gaveta, galeria e rodapé.

## Histórico de revisão

1. **[P1] Labels escuros herdados no vidro.** A regra compartilhada do vidro Cordial tinha especificidade maior que a variante Morar. O escopo Cordial foi explicitado e a variante passou a controlar seus campos. Evidência inicial: `iteration-1-desktop.jpg`; revisão: `after-desktop-hero.jpg` e `after-desktop-location.jpg`.
2. **[P2] Limite da ação insuficiente no pior fundo claro.** O contorno com alpha 0,42 produzia 2,48:1. Alpha 0,56 elevou o resultado a 3,19:1. Evidência: `contrast.json` e captura da abertura.
3. **[P2] Avançados apertados em duas colunas no celular.** Abaixo de 520 px a gaveta passou a uma coluna. Evidência posterior: `after-mobile-advanced.jpg`.
4. **[P2] Chips herdavam superfície Cordial.** A especificidade da variante foi consolidada. O estado final usa `#e9edf1` com `#2a2f35`. Evidência: `after-desktop-results.jpg`.
5. **[P1] Preenchimento vulnerável à resolução inicial da home.** A busca Morar foi movida para uma região estável; foto e card semanal têm fronteiras Suspense próprias. A seleção 5+15 continua no mesmo loader. Um teste resolve a promessa com a gaveta aberta e verifica preservação dos inputs e aplicação do rascunho.
6. **[P1] Ícone do menu móvel herdava branco do cabeçalho compartilhado.** A variante clara Morar passou a declarar a cor grafite no cabeçalho. A conferência final confirmou ícone visível, abertura do menu, Escape e retorno de foco ao acionador. Evidência: `after-home-390x844.jpg` e `after-mobile-menu.jpg`.

## Superfícies de fidelidade

- **Tipografia:** Manrope existente, labels principais de 15 px e sublabels de 14 px; controles de 16 px, incluindo modo de contagem. Nomes acessíveis completos para dormitórios e banheiros. Hierarquia e quebras verificadas em desktop e mobile.
- **Espaçamento/layout:** dois grupos por linha quando há largura, uma coluna no celular, orçamento em dupla e espaços reorganizados em 360 px. Abertura mantém foto e semanal. Controles e lista não expandem o card; o CTA teve variação de 0 px na seleção de localização.
- **Cores/tokens:** chumbo, superfícies claras opacas e vidro moderado. Fotografia não determina o contraste dos inputs. Erro e sucesso preservam semântica. Portais recebem a marca no próprio contêiner. O ambiente respeita a preferência real de menor transparência; a flag exclusiva da prévia simula também o material padrão para a inspeção.
- **Imagens/ícones:** foto, marca estampada na foto e logos preservados; sem filtros de imagem. SVGs Lucide permanecem vetoriais, com traço 1,7 e cor contextual. Não foram criados ícones raster nem uma nova logo.
- **Texto/conteúdo:** labels e ações correspondem aos controles reais. Contagens, bairros, preços e ofertas vêm da API. A composição observada reteve cinco destaques e quinze adicionais. O modo exato recebido pela URL permanece explícito.

## Verificações e limites

Foram exercitados teclado, Enter/Escape, seleção de cidade/bairro, limpeza, intervalo inválido, rascunho avançado, foco, retorno da ficha e o portal da galeria. A Cordial manteve os valores de cor e o formulário próprios. O viewport curto manteve a ação da gaveta dentro da área visível, com corpo rolável.

A prévia não certifica SSR completo com catálogo real, leitor de tela ou dispositivos físicos. Reflow e viewport curto não são prova de teclado virtual de SO ou zoom real. O relatório principal separa testes, prévia, build e publicação.

**final result: passed** — capturas finais e referência conferidas; sem achados P1/P2 pendentes no escopo validado. Os limites de dispositivos, teclado virtual, zoom, leitor de tela e SSR completo permanecem explícitos.
