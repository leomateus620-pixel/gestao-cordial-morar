## Objetivo
Remover o botão flutuante laranja com ícone "+" que aparece na tela **Início** (rota `/`).

## Alteração
- `src/routes/_app.index.tsx`
  - Remover o `<Fab onClick={() => setOpen(true)} label="Novo atendimento" />` (linha 458).
  - Remover o `import { Fab } from "@/components/fab";` (linha 19), já que não haverá mais uso no arquivo.

## Não muda
- O componente `src/components/fab.tsx` permanece (ainda é usado em `/imoveis`).
- Nenhuma outra rota, lógica de "Novo atendimento" (modal/sheet) ou estilos globais são alterados.
- O estado `setOpen`/modal de novo atendimento continua acessível pelos demais gatilhos existentes na página.

## Validação
- Typecheck do build.
- Conferência visual na rota `/` (desktop e mobile) confirmando ausência do botão flutuante.
