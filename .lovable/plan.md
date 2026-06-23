## Objetivo
Finalizar o menu **Atendimentos** para uso real: CTA integrado no card principal, remoção total do mock e persistência segura na nuvem (Supabase) com isolamento por usuário/imobiliária.

---

## 1. UI do menu (`src/routes/_app.atendimentos.tsx`)

**Card superior — vira o ponto de entrada do cadastro**
- Substituir o chip estático *"Pré-atendimento · Corretor · Conversão"* por um botão real `+ Novo atendimento` (visível em desktop e mobile, com microinteração de hover/active e foco acessível).
- Manter o subtítulo atual; logo abaixo do título adicionar uma linha auxiliar curta tipo *"Pré-atendimento · Corretor · Conversão"* como texto de apoio (não-clicável), preservando o conceito visual original.
- O botão dispara o mesmo `setOpen(true)` que abre o `AtendimentoFormModal`.
- Em mobile, o botão ocupa largura total dentro do card; em desktop fica alinhado à direita do header.

**Remoção do card duplicado**
- Excluir o uso de `AtendimentoCreateCard` da página e remover o componente `src/components/atendimentos/AtendimentoCreateCard.tsx` (e qualquer import órfão).

**Estado vazio profissional**
- Quando não houver atendimentos reais (lista total = 0), renderizar `EmptyState` com:
  - Título: *"Nenhum atendimento cadastrado ainda."*
  - Descrição: *"Clique em Novo atendimento para registrar o primeiro contato comercial."*
  - Botão que abre o modal.
- Quando houver atendimentos mas o filtro zerar o resultado, manter o estado vazio "Nenhum atendimento encontrado".

---

## 2. Remoção do mock

- Zerar `atendimentosSeed` em `src/lib/mock/data.ts` (manter o export como `[]` para não quebrar imports) e remover qualquer card/métrica fake do menu.
- Remover do `app-store` (`src/store/app-store.ts`) a alimentação inicial de atendimentos a partir do seed e o caminho de persistência local apenas para atendimentos — a fonte da verdade passa a ser o Supabase via React Query.
- Métricas (Compra / Aluguel / Ticket médio / Leads do mês) e contadores do pipeline passam a ser calculados em cima dos dados reais retornados do banco.

---

## 3. Backend (Lovable Cloud / Supabase)

**Migration `attendances` (nova)** — campos alinhados ao tipo `Atendimento` já existente para minimizar refactor:
- `id uuid pk`, `created_by uuid` (auth.users), `imobiliaria text check in ('cordial','morar','ambas')`
- Contato: `cliente_id uuid null`, `cliente_nome text not null`, `telefone text not null`, `email text`, `contato_preferencial text`, `origem text`
- Interesse: `finalidade text`, `tipo_imovel text`, `dormitorios text`, `bairro_interesse text`, `orcamento_min numeric`, `orcamento_max numeric`, `imovel_id uuid`, `imovel_descricao text`
- Operação: `corretor_id text`, `corretor_nome text`, `prioridade text`, `status text`, `proximo_retorno timestamptz`, `proximo_passo text`, `observacoes text`, `historico_inicial text`, `motivo_perda text`
- Conversão: `convertido_em_cliente bool default false`, `cliente_convertido_id uuid`
- `created_at`, `updated_at` + trigger `touch_updated_at`.

**GRANTs + RLS**
- `GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendances TO authenticated;`
- `GRANT ALL ON public.attendances TO service_role;` (sem `anon`).
- `ENABLE ROW LEVEL SECURITY`.
- Policies (isolamento por usuário + admin):
  - **SELECT**: `created_by = auth.uid() OR has_role(auth.uid(),'admin')`.
  - **INSERT**: `created_by = auth.uid()` (WITH CHECK).
  - **UPDATE/DELETE**: mesma regra do SELECT.
- Filtro por imobiliária é aplicado pela query do front (já existe o switcher Todas/Cordial/Morar). O backend garante isolamento por usuário; admin enxerga tudo (consistente com `handle_new_user` já no projeto).

**Server functions** (`src/lib/attendances/attendances.functions.ts`, protegidas por `requireSupabaseAuth`):
- `listAttendances()` — retorna atendimentos do usuário, ordenados por `created_at desc`.
- `createAttendance(input)` — valida com Zod, força `created_by = userId`, insere e devolve o registro.
- `updateAttendance(id, patch)` — para mudanças de status, conversão, etc. (preparado para as ações já existentes nos cards).
- `deleteAttendance(id)` — opcional, para arquivar.

Não criar tabelas auxiliares (history/notes/events) nesta entrega — o tipo atual já carrega `historicoInicial`/`observacoes` e não há UI consumindo histórico estruturado. Fica como evolução futura para não inflar o escopo.

---

## 4. Integração no front

- Novo hook `useAttendances()` usando TanStack Query:
  - `queryKey: ['attendances']` → chama `listAttendances` via `useServerFn`.
  - Mapeia o registro do banco para o tipo `Atendimento` já consumido pelos componentes (mantém compatibilidade com `AtendimentoCard`, filtros, summary).
  - Aplica o filtro de imobiliária (`agency` do store) e busca em memória, igual ao `useAtendimentos` atual.
- `AtendimentoFormModal` continua igual visualmente; o `onSubmit` da página passa a chamar a mutation `createAttendance` (com loading no botão Salvar, toast `sonner` em sucesso/erro, `invalidateQueries(['attendances'])`).
- Botão Salvar do modal mostra spinner durante o request e preserva o formulário se a API retornar erro.
- Ação "Transformar em cliente" passa a chamar uma mutation que atualiza `convertido_em_cliente`/`cliente_convertido_id` (a criação do cliente em si já existe no store; será adaptada para consumir o atendimento retornado pelo backend). Outras ações que ainda não têm backend (encaminhar corretor, gerar relatório fora desse escopo) continuam exibindo toast informativo "Em breve" — sem simular sucesso falso.

---

## 5. Garantia de segurança / aceite

- Usuário só vê os próprios registros (RLS via `created_by`); admin vê todos.
- Insert força `created_by = auth.uid()` no servidor (não confia no client).
- Switcher Cordial/Morar é apenas filtro de visualização; a persistência grava a imobiliária selecionada no cadastro.
- Após cadastrar: registro aparece imediatamente na lista (invalidate), persiste após refresh (vem do Supabase), métricas e pipeline recalculam.

---

## 6. Validação final
- `bun run build` e lint.
- Testes manuais: cadastrar atendimento real → refresh → continua; logar com outro usuário → não vê dados alheios; menu sem dados → estado vazio com CTA; busca/filtros operando sobre os dados reais; mobile (≤640px) com CTA acessível.

---

## Arquivos previstos
- **Editar**: `src/routes/_app.atendimentos.tsx`, `src/store/app-store.ts`, `src/lib/mock/data.ts`, `src/hooks/useAtendimentos.ts` (refatorado para consumir o hook novo) ou substituído por `src/hooks/useAttendances.ts`, `src/components/atendimentos/AtendimentoFormModal.tsx` (loading no submit).
- **Criar**: migration `attendances` + policies, `src/lib/attendances/attendances.functions.ts`, `src/hooks/useAttendances.ts`.
- **Remover**: `src/components/atendimentos/AtendimentoCreateCard.tsx`.
