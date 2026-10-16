# Cordial Bot — revisão visual da fase 4

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
