# Cordial Bot no topo da tela

## O que muda para o usuário
- O botão redondo do Cordial Bot some do canto inferior direito; nada mais cobre "Publicar imóvel" ou outros botões de rodapé.
- Computador: botão "Cordial Bot" (ícone + nome) no topo, à direita, antes do sino de notificações.
- Celular: só o ícone (40x40, "Abrir Cordial Bot"), ao lado do sino, sem empurrar o seletor de imobiliária/carteira.
- O painel lateral do Cordial Bot, o atalho Ctrl/⌘ K e o contexto da página continuam iguais.
- Continua oculto em /assistente e nas telas de vistoria.

## Situação atual (conferida)
- `GlobalAssistant.tsx` guarda o estado de abertura (`copilot`) e renderiza o botão fixo `.assistant-copilot` só fora de `/assistente` e de `inspectionLayout(...)`.
- `app-shell.tsx` tem dois topos (celular `lg:hidden` e computador `hidden lg:block`), ambos já ocultos no layout de vistoria; o `GlobalAssistant` é renderizado no fim do shell.
- O posicionamento fixo está em `src/components/assistant/assistant.css`.

## Etapas
1. Pequeno provider `AssistantLauncherProvider` (contexto com `open()` e `isOpen`) envolvendo o shell; `GlobalAssistant` passa a ler/escrever o estado nele, em vez do `useState` local. Lógica do painel, atalho e contexto intocados.
2. Remover o `<button className="assistant-copilot">` e as regras de posição fixa (bottom/right/z-index) no CSS; manter estilos do painel.
3. Novo `AssistantLauncherButton` (`variant="desktop" | "mobile"`), com a mesma regra de visibilidade (função compartilhada `shouldShowAssistantLauncher(pathname)` extraída do código atual).
4. Inserir no topo do computador (antes do `NotificationBell`) e no topo do celular (antes do `NotificationBell`, `shrink-0`). Altura do topo não muda (botões de 36–40px, igual aos existentes).
5. Conferência visual em 390px, 768px e 1440px: cadastro novo e edição de imóvel ("Publicar imóvel"), atendimentos, agenda, aluguéis, financeiro, ficha do imóvel; checar que o topo continua com a mesma altura e que conteúdos fixos não ficam escondidos.

## Arquivos
- `src/components/assistant/GlobalAssistant.tsx` (usar contexto, remover botão fixo)
- `src/components/assistant/assistant.css` (remover posição fixa)
- `src/components/assistant/AssistantLauncher.tsx` (novo: provider, hook, botão, `shouldShowAssistantLauncher`)
- `src/components/app-shell.tsx` (provider + botão nos dois topos)
- `src/components/assistant/assistant-launcher.test.ts` (novo, incluído em `bun run test`)

## Testes
- Visibilidade: aparece em /imoveis, /atendimentos; não aparece em /assistente, /assistente/x e rotas de vistoria.
- Abrir pelo botão abre o mesmo painel; Ctrl/⌘ K continua abrindo (teste do handler).
- `bun run test`, `bun run test:site`, typecheck; capturas nos três tamanhos.

## Riscos
- Celular com seletor de carteira + painel de sincronização + sino + perfil: espaço apertado em 360–390px; se faltar, o ícone fica e o painel de sincronização mantém prioridade (verificado na captura).
- Usuários acostumados ao botão do canto: o novo ícone usa a mesma marca para ser reconhecido.
- Sem mudança no assistente, dados ou banco.
