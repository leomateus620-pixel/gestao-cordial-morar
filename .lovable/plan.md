## Bug

No `AgenciamentoFormModal`, o `handleSubmit` chama `onSubmit(input)` sem aguardar — e a função do pai (`createAgenciamento` / `updateAgenciamento`) é assíncrona. Hoje o fluxo é:

```
setTimeout(() => {
  onSubmit(input);   // promise ignorada
  setSaving(false);  // libera UI
  requestClose();    // fecha modal "no escuro"
}, 120);
```

Resultado prático: a chamada de salvar dispara, mas o `requestClose` pode ser anulado/recriado quando o React re-renderiza com `currentBroker`/`agenciamento` recém-invalidados pela query, e o `useEffect` de reset (`if (open) setForm(...)`) reinicia o formulário com `open` ainda `true`. Em parte dos casos a modal continua visível mesmo após o registro ter sido persistido (visível na lista). Além disso, se o servidor rejeitar (ex.: RLS / validação), a modal já fechou e o usuário perde o que digitou.

## Correção

Tornar o submit verdadeiramente assíncrono e só fechar a modal quando o salvamento concluir com sucesso.

### 1. `src/components/agenciamentos/AgenciamentoFormModal.tsx`
- Trocar a prop:
  - de `onSubmit: (input: AgenciamentoInput) => void`
  - para `onSubmit: (input: AgenciamentoInput) => Promise<boolean | void>`.
- Reescrever `handleSubmit`:
  - `event.preventDefault()`, validar, setar erros.
  - `setSaving(true)`; `try { const ok = await onSubmit(input); if (ok !== false) requestClose(); } catch { /* mantém aberto */ } finally { setSaving(false); }`
  - Remover o `window.setTimeout(..., 120)`.
- Desabilitar o botão "Cadastrar/Atualizar agenciamento" e o botão "Cancelar" enquanto `saving` for `true` (já existe `saving`, hoje não bloqueia clique duplo).
- Quando `saving` for `true`, ignorar `requestClose` por Esc / overlay para evitar fechamento durante o save.

### 2. `src/routes/_app.agenciamentos.tsx`
- `handleSubmit` passa a **retornar `boolean`**:
  - `true` quando `createAgenciamento` retornar um `id` truthy ou `updateAgenciamento` retornar `true`.
  - `false` quando a operação for negada (sem permissão) ou lançar erro (já tratado com `showFeedback`).
- Sem mudanças de UI/copy além do retorno; o fechamento da modal passa a ser responsabilidade do próprio modal após `await`.

### 3. Nada a mexer em
- `src/hooks/useAgenciamentos.ts` (já retorna `id`/`boolean` corretamente).
- `src/lib/agenciamentos/agenciamentos.functions.ts` (server fn ok).
- Banco / RLS / migrations.

## Validação manual após a correção
1. Abrir "Cadastrar agenciamento", preencher campos válidos, clicar em salvar → modal fecha sozinha, toast "Agenciamento cadastrado com sucesso." aparece, novo card surge na lista.
2. Preencher telefone inválido → modal permanece aberta com o erro inline (comportamento atual preservado).
3. Editar um agenciamento existente → mesmo comportamento, modal fecha no sucesso.
4. Forçar erro (ex.: trocar para um corretor inexistente) → modal continua aberta com toast de erro, dados preservados.
5. Clique duplo no botão salvar → só dispara uma vez (botão desabilitado durante `saving`).

Escopo restrito ao bug; não altera estilo, layout, regras de negócio ou banco.