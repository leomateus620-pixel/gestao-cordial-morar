# Home da Morar no celular e tablet

Só a Morar muda, e só abaixo de 1180 px. A Cordial e o desktop das duas marcas não mudam. Nada de banco de dados, publicação, campanhas ou imagens novas.

## Situação atual (conferida no código e nos anexos)
- A foto fica num bloco próprio de 240 px, antes do texto e da busca.
- Em até 760 px, a busca fica em uma coluna só: cada grupo (Tipo, Onde morar, Orçamento, Espaços) tem um título com ícone grande, um campo de largura total e textos de ajuda. Por isso o formulário passa de uma tela inteira (anexo de 01:39).
- O imóvel da semana aparece como um card grande, com atributos e dois botões.
- O painel de bairros é puxado para cima dos destaques (`order: -1`).
- O mosaico e os adicionais ficam em uma coluna.
- Já existe uma regra só para 761–1000 px que empilha a busca e o card da semana.

## O que muda (celular de 360 a 430 px)
1. **Abertura:** a foto fica no fundo, com escurecimento só na parte de baixo e a fachada visível em cima. Depois vem o título "O seu próximo lar. Mais perto de você." (26–30 px), uma frase curta e o card de busca chumbo com vidro discreto sobre a base da foto.
2. **Busca compacta e sempre direta**, num único formulário:
   - Comprar / Alugar (44 px)
   - Tipo + Onde morar
   - Mínimo + Máximo (o rótulo diz "por mês" no aluguel e "valor de compra" na compra)
   - Dorm. + Banh. + Vagas
   - Contagem curta ("Pelo menos (+)" / "Exata"), visível e com ajuda para leitor de tela
   - Uma linha com Mais filtros · Limpar · número de imóveis
   - Botão "Encontrar meu lugar" (46–48 px)

   Ícones de 18 px nos títulos, campos com 44 px e fonte de 16 px. A ajuda repetida fica só para leitores de tela, e os erros aparecem junto do campo. Nenhum campo é duplicado e o formulário antigo que expandia não volta.
3. **Imóvel da semana:** uma faixa curta com selo, tipo, preço (/mês no aluguel), bairro e "Ver detalhes" do mesmo imóvel da foto. Sai o botão largo de WhatsApp.
4. **Bairros:** o mesmo botão "Buscar por bairro" da Cordial, com gaveta junto ao título dos destaques, agora com as cores da Morar. A gaveta trava a página por trás e tem fechar, Esc e foco correto. O painel lateral continua no desktop e o `order: -1` deixa de valer.
5. **Destaques:** o primeiro em formato horizontal, os outros quatro em 2 × 2, com favorito de 44 px.
6. **15 adicionais:** duas colunas de 360 a 430 px. Lista compacta só abaixo de cerca de 341 px. Os tamanhos de imagem declarados passam a bater com a largura real.
7. **WhatsApp flutuante:** cerca de 50 px, respeitando a área segura da tela. Some com a gaveta aberta ou durante a digitação, e o balão automático não aparece no celular.

## Tablet (768–1179 px)
- A busca fica em 3 a 4 colunas, conforme a largura, com a faixa da semana ao lado ou abaixo e pequena.
- Adicionais em 3 colunas; em 4 só quando cada card tiver 180 px ou mais.
- O bloco antigo de 761–1000 px é substituído pela nova regra.

## Organização
- As regras móveis da Morar ficam num único bloco em `morar.css`, com `.morar-site`, no lugar das regras antigas de 1100, 761–1000, 760, 380 e 520 px que conflitam. Nada de camadas novas por cima.
- `HomePage.tsx`: mostrar a gaveta de bairros também na Morar e usar as mesmas versões curtas de texto e da faixa da semana.
- `MorarSearchForm.tsx`: ajustes de classe e de rótulo (mês/compra, contagem curta). As regras de filtros, consulta e endereços continuam iguais.
- A Cordial não muda. Ela será conferida de novo, por medição e por imagem.

## Verificação
- Antes e depois em 320, 360, 375, 390, 430, 600, 768, 820, 1024 (retrato e paisagem), 1280, 1366 e 1440 px. Medidas: altura da abertura, posição do primeiro destaque e fim dos 15. Meta: 30% menos rolagem em 390×844 e 360×800.
- Teste completo no navegador: comprar/alugar, tipo, Onde morar, orçamento com mínimo maior que o máximo, quartos/banheiros/vagas, contagem exata, mais filtros, limpar, buscar e voltar com os filtros restaurados, gaveta de bairros por teclado, favoritos.
- Sem rolagem lateral; texto ampliado em 200%.
- Velocidade de carregamento (LCP e CLS em laboratório, cache frio e quente), deixando claro que não é dado de usuários reais.
- Rodar test:site, test:morar, typecheck e build. Um teste das fotos da Morar já falhava antes e será apenas informado.
- Entrega: imagens antes/depois, tabela de medidas e pendências.
