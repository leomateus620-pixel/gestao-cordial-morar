# Mascotes originais e movimento

Os dois personagens foram gerados com a ferramenta nativa ImageGen em 16/11/2026, seguindo o workflow Creative Production `produce`, `board-runtime` e a skill ImageGen. A ferramenta `creative_production_board` não estava disponível: não foi criado nem aprovado um board. A geração dos arquivos, porém, foi concluída e verificada; os desenhos SVG provisórios foram substituídos no componente por ilustrações raster originais com transparência real.

Os logos existentes foram vistos antes da criação e usados como referência de formas e cores no briefing. Nenhum logo oficial foi alterado ou incorporado como texto gerado. Os PNGs originais, prompts integrais, dimensões, tamanhos e hashes estão em [mascot-sources/manifest.json](./mascot-sources/manifest.json).

- **Cordial:** personagem-casa arredondado, telhado petróleo, corpo turquesa, rosto creme e mão em aceno. O contorno macio e a porta mantêm o vínculo com acolhimento e moradia.
- **Morar:** personagem-casa angular grafite, telhado assimétrico laranja, rosto em arco e chave lateral. A silhueta, pose e expressão são próprias; não é uma recoloração da Cordial.
- **Material:** ilustração tridimensional suave com acabamento fosco. São PNG/WebP, não vetores.

## Entrega e custo de carregamento

| Asset servido         | Dimensão         |  Bytes | Uso     |
| --------------------- | ---------------- | -----: | ------- |
| `cordial-mascot.webp` | 192 × 192, alpha | 38.808 | Cordial |
| `morar-mascot.webp`   | 192 × 192, alpha | 40.160 | Morar   |

Os arquivos ficam em `public/public-property-bot/`. Cada site requisita apenas sua imagem, reutilizada no cabeçalho e no painel; o navegador pode reutilizar o mesmo recurso entre estados. O orçamento adotado foi **48 KiB por marca**. Os originais de 1.254 × 1.254 ficam somente na documentação e não são importados pelo site. A exportação usa redimensionamento Lanczos3 e WebP sem perda pelo Photon já existente, sem novo pacote ou processamento de imagem no navegador.

Medição isolada do componente com esbuild minificado e React externo: **838 bytes de JavaScript (455 gzip)** e **3.528 bytes de CSS (953 gzip)**. É a medida do componente, não a diferença total do bundle da aplicação. As imagens são recursos externos ao JavaScript. Não há vídeo, canvas, SDK ou biblioteca de animação adicional.

## Quatro estados, uma arte por marca

`Mascot.tsx` usa um raster original por marca; os quatro estados são composições de interface com CSS, não quatro imagens geradas. A arte permanece decorativa (`aria-hidden`, imagem com `alt` vazio); o controle e o status da conversa fornecem o nome acessível.

| Estado    | Comportamento                                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Neutro    | Cordial faz um balanço acolhedor de 1,6 s; Morar um breve gesto de 1,3 s. Uma execução ao montar, sem animação decorativa contínua. |
| Ouvindo   | Inclinação estática diferente por marca; pequeno indicador de áudio anima somente enquanto a gravação está ativa.                   |
| Buscando  | Cordial oscila suavemente; Morar inclina o corpo com a chave. Três pontos acompanham a busca real.                                  |
| Concluído | Elevação breve de 560 ms e indicador de confirmação.                                                                                |

Hover/foco no launcher pode repetir o gesto breve. `prefers-reduced-motion: reduce` remove todas as animações, preservando a arte, a inclinação de escuta, os indicadores e os textos de status. O movimento não altera filtros, estado de rede, cota ou comportamento de foco.

## Inspeção

Os originais e os WebPs exportados foram abertos e inspecionados. Há canal alpha e margens transparentes reais. A [prancha de escala](./evidence/mascots-raster-scale.png) mostra Cordial na primeira linha e Morar na segunda; em cada metade, as colunas são 24, 32, 40 e 64 px, primeiro sobre a superfície clara e depois sobre petróleo/grafite usados no produto. Rosto e silhueta continuam distinguíveis a 24 px; mão e chave são mais legíveis a partir de 32 px. Não foi observado halo claro nessas escalas.

A prévia identificada `state=mascots` reutiliza o componente real e permite inspecionar todos os estados e tamanhos. Capturas antigas `mascots.png`/`mascots-detail.png` registram a versão SVG anterior e não são evidência desta arte raster. A inspeção do movimento e do layout completo no navegador é registrada separadamente pela validação da interface.
