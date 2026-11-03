# Novo imóvel da semana, escolhido pela beleza, com abertura mais imersiva

## O que muda para você
1. **Troca do imóvel:** a casa Ref. 1329 sai da abertura e a semana dela fica como "recusada". Até a nova edição ser aprovada, a home mostra a foto original do novo imóvel.
2. **Escolha pela beleza da foto:** a rotina deixa de pegar só "o mais recente". Uma IA de análise de imagem avalia a foto principal de até 24 imóveis publicados com foto horizontal e dá notas para:
   - visual moderno, acabamento e fachada;
   - riqueza de detalhes e composição;
   - luz e céu;
   - ausência de terreno de obra, entulho, terra exposta e muros inacabados.
   Fotos com problema grave são descartadas. Fica a de maior nota que não apareceu nas últimas 4 semanas. A nota e o motivo aparecem no painel.
3. **Edição mais cinematográfica, sem mudar o imóvel:** a IA trabalha luz, profundidade, tom de fim de tarde e céu mais vivo (sem trocar o céu), além de contraste e nitidez. Ela continua proibida de adicionar, remover ou mudar construções, objetos, terreno, cores de materiais ou medidas.
4. **Abertura com movimento:**
   - deslocamento lento de câmera (aproximação + leve panorâmica) em direção ao ponto de foco;
   - camada de luz suave que atravessa a foto;
   - leve efeito de profundidade ao rolar e ao mover o mouse;
   - escurecimento gradual atrás do texto, para manter a leitura.
   Tudo para quando a foto sai da tela e fica parado para quem pediu menos movimento ou usa economia de dados.
5. **Aprovação e publicação:** gero a nova edição e mostro aqui a original e a editada. Você aprova (ou eu aprovo, se você disser "aprovo" de novo) e publico em seguida.

## Validação
- Testes da nova regra de escolha: maior nota, descarte de fotos com problema, sem repetir imóvel.
- Conferência da abertura na prévia no computador e no celular, com e sem a opção de menos movimento.
- Medição de estabilidade da página (o movimento não pode fazer o conteúdo pular).

## Custo
- Análise das fotos: cerca de 0,1 crédito por rodada.
- Edição: cerca de 0,8 crédito.

## Detalhes técnicos
- `showcase.server.ts`: novo `scoreCandidates()` usando o modelo de chat padrão do gateway (entrada de imagem, saída JSON estrita com notas 0–10 e `reject` booleano), aplicado a no máximo 24 candidatos, em uma chamada com miniaturas. O resultado é guardado nas novas colunas `score` e `score_reason` da semana (migração aditiva).
- `showcase.ts`: `chooseCandidate` passa a ordenar pela nota, com desempate pela data. O prompt sobe para a versão `vitrine-imersiva-v2`.
- `HomePage.tsx` + `site.css`: animação via CSS transform/opacity guiada por `--cs-hx-focal`, parallax com `requestAnimationFrame` limitado e desligado com `prefers-reduced-motion`/`saveData`.
- Troca do imóvel atual: `reject` na semana 838cc4f0 → `create-and-activate` com o melhor candidato → `generate`.
