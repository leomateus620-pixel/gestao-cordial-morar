# Teste real da foto da placa em um agenciamento já cadastrado

## O que será feito
1. Escolher um agenciamento que já existe e está ligado a um imóvel com fotos prontas (de preferência um com a placa ainda pendente, para não mexer em um que já foi validado).
2. Entrar na prévia com uma conta de administrador e abrir **Agenciamentos → Imóveis captados**.
3. Abrir a edição desse agenciamento e marcar "Placa instalada":
   - primeiro cancelar sem foto e confirmar que o item continua desmarcado;
   - depois enviar como foto da placa uma das fotos do próprio imóvel e salvar.
4. Tirar prints de:
   - o card na lista com a miniatura à esquerda;
   - o detalhe do agenciamento com a foto;
   - o relatório de impressão com a foto da placa naquele agenciamento.
5. Enviar os prints aqui e informar qual agenciamento foi usado.

## O que muda de verdade
- Somente nesse agenciamento: a placa passa a constar como instalada, com a foto guardada na pasta privada das placas.
- Nada muda nas fotos do imóvel, nos sites Cordial/Morar, no cadastro, no proprietário ou nos códigos.
- Se você quiser, depois do teste eu removo a foto e a placa volta a ficar pendente.

## Detalhes técnicos
- Login no navegador de teste com uma sessão gerada para o próprio usuário (`lovable auth-session --self`).
- A foto do imóvel é baixada de uma cópia pronta já existente (somente leitura) e enviada pelo campo de upload da tela, usando o mesmo caminho que o corretor usa.
- Prints feitos com Playwright; relatório capturado no modo de impressão (emulação de mídia print).
- Nada é publicado.
