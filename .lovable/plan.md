## Bug: formulário de Agenciamentos "cai fora" na etapa 4 (checklist e revisão)

### Diagnóstico

O `useEffect` de inicialização em `src/components/agenciamentos/AgenciamentoFormModal.tsx` (linhas 291–303) depende de `agenciamento`, `currentBroker`, `currentUserBroker` e `open`. Quando qualquer uma dessas referências muda, ele **reseta o formulário** (`setForm(next)`, `setStep(0)`, `setErrors({})`, etc.).

`currentBroker` vem do hook `useAgenciamentos`, memoizado a partir do array `corretores` do `app-store`. Esse array é reescrito por `useHydrateCorretores` toda vez que a query `["corretores","profiles"]` retorna — inclusive nos refetches automáticos do React Query (ex.: `refetchOnWindowFocus`, invalidations por outros hooks). Cada refetch cria um novo array (`useApp.setState({ corretores })`), o que altera a referência de `currentBroker` e dispara o efeito, apagando o que a Bianca já preencheu e voltando para a etapa 0. Para a usuária isso aparece como "cai fora automaticamente e não salva o que foi feito", tipicamente na última etapa porque é onde ela passa mais tempo (checklist + revisão).

Confirmações no código:
- `src/hooks/useHydrateCorretores.ts` linha 68: `useApp.setState({ corretores })` roda em todo `query.data` novo.
- `src/hooks/useAgenciamentos.ts` linhas ~112–115: `currentBroker = useMemo(..., [corretores, ...])` — nova referência a cada hidratação.
- `src/components/agenciamentos/AgenciamentoFormModal.tsx` linha 303: `currentBroker` e `currentUserBroker` estão no array de dependências.

Não é um problema de RLS/permissão: `secretaria` já tem SELECT/UPDATE/INSERT via policies (`agenciamentos_insert_own` + `agenciamentos_select_own_admin_or_secretaria`) e `agenciamentos:write` no `permissions.ts`. O submit em si funcionaria — o formulário simplesmente é resetado antes.

### Correção

Editar `src/components/agenciamentos/AgenciamentoFormModal.tsx`, `useEffect` das linhas 291–303:

- Reduzir as dependências para `[open, agenciamento?.id]`, de modo que o reset só aconteça quando o modal abre ou quando o registro em edição muda.
- Continuar lendo `currentBroker` e `currentUserBroker` dentro do efeito para semear os defaults iniciais (corretor logado, imobiliária), mas sem depender das suas referências.
- Adicionar `// eslint-disable-next-line react-hooks/exhaustive-deps` acompanhado de um comentário explicando por quê (refetches de `corretores` não podem apagar o formulário aberto).

Nenhuma outra alteração é necessária: fluxo de submit, validações, RLS, políticas e mutations permanecem os mesmos.

### Verificação

1. Abrir o modal como Bianca (secretaria), preencher etapas 1–3.
2. Alternar para outra aba do navegador e voltar (força refetch por focus do React Query) — os campos e a etapa atual devem permanecer.
3. Concluir a etapa 4 (checklist e revisão) e clicar em "Cadastrar agenciamento" — o registro deve ser salvo e aparecer na lista.
4. Repetir para admin (fluxo com toggle "validado") para garantir que a validação por gestão continua funcionando.
