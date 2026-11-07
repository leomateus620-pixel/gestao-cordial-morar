# Home Cordial — celular e tablet mais compactos

Objetivo: mostrar mais imóveis com menos rolagem no celular e no tablet. Desktop (a partir de 1180 px), Morar, dados, seleção de 5 + 15 imóveis, vitrine semanal, favoritos e Minha seleção continuam como estão.

## 1. Medição antes de mexer
- Capturas da home Cordial em 320, 360, 375, 390, 430, 600, 768, 820, 1024 (retrato e paisagem), 1280, 1366, 1440 px, e da home Morar em 390/768/1280.
- Registrar: altura da abertura, rolagem até o 1º destaque, fim dos 15 adicionais, LCP/CLS de laboratório (cache frio e quente, mesmo perfil).
- Comparar com os três anexos de referência.

## 2. Abertura (celular)
Sequência: cabeçalho 60–64 px → abertura única (foto ao fundo + título + busca) → resumo do imóvel da semana → destaques com botão "Buscar por bairro" → 15 adicionais.
- Foto como fundo da própria abertura, com degradê só onde fica o texto; respeita o ponto de foco atual; sem altura fixa nem 100vh.
- Título 26–30 px; descrição curta.
- Imóvel da semana vira faixa compacta: selo, tipo, preço (/mês no aluguel), bairro e link "Ver detalhes" do mesmo imóvel da foto. Sem pílulas e sem segundo botão de WhatsApp.

## 3. Busca
- Abas Comprar/Alugar mantidas; campos em 2×2 (Tipo + Cidade, Bairro + Valor), controles ≥44 px, fonte 16 px, rótulos visíveis.
- Botão "Buscar imóveis" 46–48 px, largura total, logo abaixo; "Pesquisa completa" e "Buscar por referência" numa linha secundária.
- Bairro e orçamento abrem no próprio campo (popover limitado à tela); mesma lógica, filtros e endereço de busca de hoje.

## 4. Bairros
- Celular e tablet estreito: painel grande sai do caminho; entra botão "Buscar por bairro" ao lado do título dos destaques + resumo do bairro escolhido.
- O botão abre uma gaveta com título, fechar, Esc, foco preso e retorno ao botão; cidade, pesquisa, bairros com contagens reais e link para a página de bairros.
- Desktop mantém o painel lateral; ordem de leitura por teclado igual à ordem visual (sem `order: -1`).

## 5. Destaques e 15 adicionais
- Destaques no celular: 1º ocupa a largura toda em formato horizontal curto (foto ao lado; abaixo de ~360 px foto panorâmica curta); os outros 4 em 2×2 com foto 3:2.
- Adicionais: 2 colunas de 360 a 430 px (remove a volta para 1 coluna abaixo de 380 px); em 320 px ou texto ampliado, lista compacta. Tablet: 3 colunas, 4 só quando cada card tiver ≥ ~190 px (por largura do container).
- Favorito e selo com toque de 44 px; sem links dentro de links; preço nunca cortado; "Ver todos os imóveis" mantido.

## 6. Tablet (768–1179 px)
- Busca e resumo semanal lado a lado só quando a busca mantém largura confortável; caso contrário, empilhados e compactos. Conferir transições 560, 640, 760/761, 767/768, 900, 1000/1001, 1100/1101 e 1180.

## 7. Imagens, movimento e WhatsApp
- `sizes` corretos por variante (meia largura não declara 100vw); prioridade só na foto da abertura e primeiras visíveis; resto continua com carregamento sob demanda; proporções reservadas.
- Mantém a verificação de imagem já carregada (complete/naturalWidth) e onLoad/onError.
- Movimento da foto só com mouse; respeita "reduzir movimento"; desfoque só numa área pequena da abertura.
- WhatsApp flutuante 48–52 px com margem segura, escondido quando a gaveta ou o teclado estão abertos.

## 8. Verificação e entrega
- Capturas depois nas mesmas larguras; tabela antes/depois (altura da abertura, rolagem até o 1º destaque, fim dos 15; meta −30% em 390×844 e 360×800).
- Conferir: 5 + 15 sem repetição, sem rolagem lateral, busca/finalidade/limpar/bairro/orçamento/referência/favoritos/Minha seleção/voltar da busca, teclado e zoom de texto, Morar sem mudança visual, desktop Cordial igual.
- Rodar `test:site`, `typecheck` e `build`; LCP/CLS de laboratório (sem chamar de INP real).
- Sem publicação; entrega apenas na prévia.

## Detalhes técnicos
- Arquivos: `HomePage.tsx` (HeroMedia/HeroProperty/HomeCard/DistrictsPanel → novo `DistrictsDrawer` reutilizando os mesmos facets), `site.css` (reorganizar os blocos `@media` 1200/1100/900/760/560/380 do `.cs-hx-*` em uma sequência única, escopo `.cordial-site:not(.morar-site)`), `SearchForm.tsx` (grade 2×2, `min-width:0`, popover ancorado), `PropertyCard.tsx`/`PropertyImage` só se o `sizes` exigir.
- Sem mudança em `home-loader.ts`, `home-selection.ts`, banco, vitrine semanal ou geração por IA. Links por helpers existentes (`brand.ts`/`presentation.ts`).
- Testes novos só para: gaveta de bairros (link preserva cidade/bairro) e ausência de IDs repetidos entre destaques e adicionais.
