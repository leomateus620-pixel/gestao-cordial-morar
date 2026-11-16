# Personagens e movimento

O usuário pediu explicitamente um personagem com movimento dentro do ícone. O símbolo estático provisório da marca foi substituído por dois desenhos SVG próprios, sem alterar os logotipos oficiais.

Creative Production foi solicitado e seus `produce/SKILL.md` e `board-runtime` foram lidos. A sessão não disponibilizou `creative_production_board`; portanto, estes são assets vetoriais locais provisórios, não uma entrega gerada/aprovada no Creative Production. O brief original continua sendo a referência para eventual acabamento nessa ferramenta.

- Cordial: rosto arredondado, expressão acolhedora, petróleo e turquesa, pequena alusão a um telhado e gesto de mão.
- Morar: silhueta de casa mais angular, chaminé, visor e corpo grafite, telhado e detalhes laranja. A diferença vai além da cor.
- Estados: neutro, ouvindo, buscando e concluído. `Mascot.tsx` é a fonte do desenho; `mascot.css` anima cabeça, olhos e mão conforme o estado real da conversa.
- O cumprimento decorativo dura 4,6 segundos e termina. Hover/foco reproduz um gesto breve. Escuta/busca animam apenas enquanto essas operações estão em andamento. `prefers-reduced-motion: reduce` remove todas as animações, mantendo expressão e status textual.
- Não há vídeo, canvas, biblioteca de animação ou requisições de imagem para o launcher. O SVG decorativo fica fora da árvore acessível; o botão mantém nome completo e estado expandido.

Oito exports estáticos transparentes ficam em `public/public-property-bot/{cordial,morar}-{neutral,listening,searching,complete}.svg`. São vetores reais, de 1.275 a 1.537 bytes cada, total de 11.082 bytes. O launcher usa 36 px; cabeçalho do chat, 40 px; boas-vindas, 64 px. A prévia identificada `state=mascots` permite comparar 24/32/40/64 px e os quatro estados. Não há fundo raster nem bordas com halo.

Capturas em `evidence/mascots.png` e `evidence/mascots-detail.png` registram o desenho em tamanho real. A checagem de movimento reduzido no navegador confirmou `animation-name: none` nos elementos animados. O desenho a 24 px conserva silhueta e olhos; o gesto é mais legível a partir de 32 px.

Medição isolada com esbuild minificado, React externo: 3.091 bytes de JavaScript (1.177 gzip) e 2.089 bytes de CSS (586 gzip). Isso mede o componente, não a diferença total do bundle do site. O build final do navegador não contém mediabunny, nomes dos segredos do bot ou referência a SUPABASE_SERVICE_ROLE.

Brief para Creative Production quando disponível: preservar o par de identidades, acabamento elegante, acolhimento sem infantilização exagerada, legibilidade pequena, quatro estados e transparência. Não incorporar texto gerado, não redesenhar logo oficial, não criar animação pesada.
