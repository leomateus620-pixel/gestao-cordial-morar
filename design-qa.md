# Sidebar — organização da locação · 20/10/2026

final result: passed

## Referência, estado e evidências

Fonte: `docs/sidebar/referencia-sidebar.jpeg`, cópia da imagem enviada pelo usuário. Implementação: `tests/sidebar/preview.html`, navegador in-app, componentes reais `SidebarMenu`, `BrandMark`, `Sheet` e `RentalFormModal`, transporte isolado sem dados reais.

Comparação principal: referência original de 186×848 px e `docs/sidebar/screenshots/desktop-secretaria.png` de 1280×848 px; mesmo perfil Secretária, item Vistoria inteligente ativo e tema claro. A barra foi recortada em `sidebar-secretaria.png` (272×824 px) para comparação de toda a navegação, além do detalhe `locacao-detalhe.png` (250×180 px). Fonte, barra final, detalhe e mobile foram abertos juntos na mesma entrada de comparação.

A referência é a interface anterior a ser melhorada. O aumento de largura, o bloco Locação, os títulos curtos, a legibilidade e o novo atalho são mudanças intencionais do pedido, não desvios de fidelidade. A imagem original é um recorte sem escala CSS conhecida; não foi esticada para simular igualdade de densidade. Capturas da implementação usam densidade 1. Desktop CSS 1280×848, mobile CSS 390×844 e 320×740; capturas nos mesmos tamanhos em pixels após estabilizar as animações.

## Achados e histórico de correções

1. **P2 — densidade da primeira versão escondia Marketing em 848 px.** A navegação da Secretária tinha conteúdo de 763 px para uma janela interna de 713 px. Reduzidos espaços entre linhas e cards e altura dos cabeçalhos, preservando itens de 44 px. Revalidação: conteúdo e janela interna de 721 px, todos os quatro grupos visíveis, sem corte. Evidência: `desktop-secretaria.png`.
2. **P2 — marca mobile perdia as cores.** Os SVGs desktop/mobile compartilhavam IDs de gradientes; o SVG oculto interferia no drawer. IDs agora são próprios de cada instância, sem mudar os traços/cores da marca. Revalidação visual: `mobile-390.png` e `mobile-320.png`, símbolo completo nas duas larguras.
3. **P2 — espaço herdado entre filhos do drawer cortava o último bloco.** Removido o gap genérico do Sheet apenas na navegação. Em 390×844 a área útil passou de 701 para 733 px e todos os grupos da Secretária ficam visíveis. Em 320×740 a lista rola internamente, com cabeçalho, botão de fechar e rodapé preservados. Evidência: capturas mobile finais.

Não há P0/P1/P2 aberto após a comparação final. Estados animando não foram usados como evidência final.

## Superfícies verificadas

- **Fontes/tipografia:** Manrope carregada, itens 14 px/20 px, peso 600/700; títulos 10 px com hierarquia discreta. Sora da marca preservada; Cordial Bot herda a cor clara do menu. Nomes completos sem reticências; quebra de linha disponível em telas estreitas.
- **Espaçamento/layout:** sidebar 272 px, rail 68 px; cards, alinhamentos, ícones e rodapé consistentes. Sem overflow horizontal em 1280, 390 ou 320 px. Itens de 44 px também em 320 px. Rolagem administrativa mantém Configurações acessível sem rolar o documento (`admin-rolagem.png`).
- **Cores/tokens:** azul-petróleo original e acentos por grupo; Locação com acento areia. Testes de contraste de texto principal/secundário passam em repouso, hover e ativo. Seleção tem fundo, borda e indicador, além da cor.
- **Assets:** marca e ícones existentes preservados, sem imagens substitutas. Corrigida apenas a unicidade dos identificadores da marca. Símbolo do assistente continua sendo o asset existente.
- **Conteúdo:** Operação, Comercial, Locação, Gestão e Sistema. Locação reúne Aluguéis, Vistoria inteligente e Novo contrato; este último abre o cadastro atual, conforme confirmado pelo usuário. Nada anuncia geração de documento ou operação fiscal nova.

## Interações, verificações e limites

No navegador: navegação entre módulos; expansão/recolhimento; foco visível por Tab e tooltip do rail; Novo contrato por clique e Enter no modo recolhido; abertura do formulário real a partir de Vistoria e da própria tela Aluguéis; fechar e abrir novamente; menu mobile fecha ao abrir contrato; quatro perfis e ausência do atalho para corretor/financeiro. Cabeçalhos de grupos e gradientes sem IDs duplicados com desktop e drawer montados juntos. Console sem erros ou avisos nas interações finais.

Tipos, build e lint dos arquivos de produção alterados passaram. O lint da página de Aluguéis foi executado com a regra de formatação desligada para não reformatar o arquivo legado inteiro. Os 12 testes focados de menu, contraste e preferências passaram. O build mantém avisos preexistentes de depreciação do TanStack e tamanho de chunks.

- [x] Comparação principal e detalhe do bloco Locação abertos com a referência.
- [x] Desktop, rail, drawer e perfis conferidos no navegador.
- [x] Atalho exercitado com o formulário real, sem envio de dados.
- [x] Definições/URLs de produção, permissões, serviços e banco preservados.
- [ ] Conferir a tela autenticada completa em homologação: a prévia isola a navegação e o formulário, sem backend real.

Não houve publicação, migração ou emissão financeira/fiscal. A revisão anterior do Cordial Bot é preservada abaixo como histórico.

---

# Cordial Bot — revisão visual da fase 4 (histórico)

final result: passed

## Referência e comparação

Base aprovada: `docs/assistente/screenshots/fases-2-3/acao-pendente-desktop.jpg` (1280×720) e `acao-pendente-mobile.jpg` (390×844). As referências e as capturas finais foram abertas juntas na mesma entrada de comparação. Esta é uma evolução da interface existente, com a marca e os ajustes solicitados; não uma cópia de outra plataforma.

Implementação: `tests/assistant/preview.html`, navegador in-app, dados sintéticos. Evidências em `docs/assistente/screenshots/fase-4/`. Desktop CSS1280×720, captura completa1280×728: os oito pixels adicionais são o padding do documento do harness; a comparação considera a área da aplicação. Mobile CSS390×844/captura390×844, densidade1. Também verificados320×740,430×844,768×844,1024×844 e390×500.

Comparação principal: `action-pending-desktop.jpg` e `acao-mobile.jpg`; foco ampliado na assinatura da marca, cabeçalho, diff e botões. A altura maior da aplicação mobile é intencional: usa o espaço disponível, sem o vazio inferior da referência. O símbolo/mascotes são os mesmos assets/componentes; não foram redesenhados.

## Achados e iterações

1. **P2 — nome truncado no cabeçalho móvel.** A primeira inspeção390px cortava “Agenda” pela soma dos controles. Preferências/Sobre foram reunidos em “Mais opções”; a pílula abre a equipe. Revalidação320/390: nome inteiro, cabeçalho sem overflow e controles44px. Evidência final: `acao-320.jpg` e `acao-mobile.jpg`.
2. **P2 — estado vazio rolava ao fim.** O auto-scroll inicial escondia parte dos mascotes e do cumprimento. Agora só acompanha mensagens; limpar a conversa volta ao topo. O hero é compacto quando há briefing, preservando “Seu dia” visível no desktop. Evidência após correção: `empty-desktop.jpg`, scrollTop0 e nenhum overflow horizontal.
3. **P2 — inconsistência dos dados de revisão.** A fixture repetia a pergunta antes do cartão e não permitia remover o contexto fixo. A fixture agora acompanha o contrato real: pergunta aparece uma vez, contexto pode ser retirado e uma escolha inclui sua pergunta na resposta. Evidências: `choices-mobile.jpg` e `mencao-contexto-mobile.jpg`.

Nenhum P0/P1/P2 aberto após as correções.

## Superfícies verificadas

- **Tipografia:** Sora600 carregada na marca, capitalização “Cordial Bot”, espaçamento−0.025em; Manrope na interface. Mensagens14px/21px, composer mobile16px. Nome e botões não comprimidos em320px.
- **Espaçamento/layout:** três colunas no desktop, duas no tablet e uma no celular. Contexto/pendências em drawers. Botões44px, formulário com rolagem natural, carrosséis internos sem overflow do documento. Composer fica dentro do viewport reduzido: bottom475px em altura500px.
- **Cores/tokens:** mantidos os tokens do Gestão e as duas cores no símbolo. Light/dark verificados; estados de falha, pendência e sucesso distinguíveis. Captura `tema-escuro-mobile.jpg` inclui a barra exclusiva do harness.
- **Assets:** símbolo1024 original reutilizado sem distorção; mascotes e animações mantidos. Motion é desativado apenas por `capture=1` no harness para evidência determinística.
- **Conteúdo:** removidas repetições; orientações administrativas e progresso concluído ficam expansíveis. Revisões mostram efeitos da desativação/revogação sem prometer revogar as oito consultas legadas. Aprovação do app e consentimento pessoal são apresentados separadamente.

## Interações e console

Verificados no navegador: confirmar proposta e contador1→0; abrir Mais opções; “Outro…” foca o composer sem enviar; opção envia pergunta+resposta; busca@ com setas/Enter; remover contexto preservando rascunho; revisão de aprovação MCP; conflito CAS e recarregar configuração. Os cliques usam o transporte sintético do harness, não clientes reais.

O console mantém registros de invalid-hook-call durante HMR/otimização de dependências às10:21UTC. Após recarregar, não reapareceram nas navegações finais; componentes e menus foram exercitados novamente. Typecheck/build e testes de componentes passaram.

## Limites e checklist

- [x] Referências e implementação abertas e comparadas.
- [x] Capturas dos estados principais desktop/mobile e ajustes revalidados.
- [x] Layout320–1280px, formulário, foco e interação por teclado.
- [x] Sem erro reproduzível nas navegações finais.
- [ ] Teclado físico em iOS/Android: validar em homologação; o teste local usa viewport de altura reduzida, não simula um aparelho real.
- [ ] OAuth/gateway/push reais e latência: dependem de configuração/publicação; não são comprovados pela prévia.

Sem publicação ou deploy nesta revisão.
