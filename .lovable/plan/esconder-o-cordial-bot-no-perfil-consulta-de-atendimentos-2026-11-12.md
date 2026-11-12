# Esconder o CORDIAL bot no perfil "Consulta de Atendimentos"

## O que foi conferido
- O botão do bot (cabeçalho desktop e atalho mobile) decide só pelo endereço da página, sem olhar o perfil.
- O painel do bot é montado para qualquer pessoa logada e abre pelo atalho de teclado (Ctrl/Cmd+K) e pelo botão.
- **Diferente do que o pedido supõe:** as páginas do assistente (`/assistente`, `/assistente/<bot>`, `/assistente/equipe`, `/assistente/equipe/<bot>`, `/assistente/estudio`) **não** têm trava por módulo. Hoje a URL direta abre a tela para esse perfil (o banco recusa as respostas, mas a tela aparece). O plano fecha isso.

## Regra única
Nova função pura `canUseAssistant(session)` em `src/lib/access-control.ts`: retorna `false` só para `isAttendanceViewer(session)` (e sem sessão); `true` para todos os outros. Não muda nada para admin, secretaria, corretor, financeiro ou `meta_reviewer`.

## Arquivos
1. `src/lib/access-control.ts` — adiciona `canUseAssistant`.
2. `src/components/assistant/launcher-state.ts` — `shouldShowAssistantLauncher(pathname, session)` passa a exigir `canUseAssistant(session)` além das regras de endereço atuais.
3. `src/components/assistant/AssistantLauncher.tsx` — passa a sessão para a regra; o botão some em desktop e mobile.
4. `src/components/assistant/GlobalAssistant.tsx` — vira um envoltório: se `!canUseAssistant(session)`, retorna `null` (sem painel, sem atalho de teclado, sem reagir ao `assistantLauncherStore`) e força o store para fechado. O componente atual continua igual, só renomeado internamente.
5. Novo `src/components/assistant/RequireAssistantAccess.tsx` — mostra "Acesso restrito" quando `!canUseAssistant(session)`; envolve as 5 páginas do assistente listadas acima. Não uso `RequireModuleAccess module="agenda"` porque isso tiraria a tela de perfis que hoje entram sem o módulo agenda (ex.: `meta_reviewer`), o que mudaria o comportamento deles.
6. `app-shell.tsx` — sem mudança (os componentes acima já se escondem sozinhos).

Sem migração, sem mudança de permissões, papel, RLS/RPC ou menu.

## Testes
- `access-control.test.ts`: `canUseAssistant` falso para `atendimentos_viewer` (inclusive com outro papel junto), verdadeiro para admin, secretaria, corretor, financeiro e `meta_reviewer`.
- `assistant-launcher.test.ts`: launcher oculto para o perfil de consulta em `/atendimentos` e qualquer página; regras atuais de endereço mantidas para os demais.
- Teste de que as páginas `/assistente*` ficam bloqueadas para o perfil (guarda baseada em `canUseAssistant`).
- Rodar testes de menu, access-control e assistente, typecheck e lint dos arquivos tocados. Sem publicar.
