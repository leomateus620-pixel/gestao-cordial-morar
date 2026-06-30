# Reformular Menu "Aluguéis" — Módulo real de locações

## Visão geral

Hoje `/_app/alugueis` consome `useApp` (store mockado) e cards de imóveis fictícios. Vou transformar em módulo completo com banco, CRUD, KPIs reais, expansão de cards e UI premium, seguindo o padrão já usado em `agenciamentos` (types → services → hooks → lib/functions → componentes).

Não existem hoje no banco tabelas de `imoveis`, `contratos` ou `lancamentos`. A tabela `clients` existe mas é voltada a leads de compra/venda — não vou forçar reaproveitamento; criarei tabelas próprias e isoladas para o domínio de locação. O isolamento por usuário será via `created_by = auth.uid()` + RLS, mesmo padrão de `agenciamentos`/`clients`.

## Banco de dados (nova migration)

Quatro novas tabelas no schema `public`, todas com `created_by` e RLS scoped a `auth.uid()` (admins veem tudo via `has_role`). GRANT para `authenticated` e `service_role`. Triggers `touch_updated_at`.

1. **`rental_properties`** — imóveis para locação
   - apelido, tipo (casa/apto/sala/terreno/kitnet/outro), endereço completo (logradouro, número, complemento, bairro, cidade, uf, cep), quartos, banheiros, vagas, área m², valor sugerido, status (disponível/alugado/manutencao/reservado/inativo), observações, brand (cordial/morar).

2. **`rental_tenants`** — locatários
   - nome, cpf_cnpj, telefone, email, data_nascimento, endereço atual, profissão, renda aproximada, observações.

3. **`rental_guarantors`** — fiadores
   - nome, cpf_cnpj, telefone, email, endereço, profissão, vínculo com locatário, observações. (Opcional por contrato.)

4. **`rental_contracts`** — contratos
   - `property_id` FK → rental_properties
   - `tenant_id` FK → rental_tenants
   - `guarantor_id` FK → rental_guarantors (nullable)
   - valor_mensal, valor_caucao, data_inicio, data_fim, dia_vencimento (1–31), status (ativo/pendente_assinatura/vencido/encerrado/cancelado), payment_status (em_dia/vence_hoje/atrasado/pago/pendente), proximo_vencimento (date), data_encerramento (nullable), observações, brand.
   - Índice único parcial: um único contrato `ativo`/`pendente_assinatura` por `property_id`.
   - Trigger BEFORE INSERT/UPDATE: ao salvar contrato `ativo` → atualizar `rental_properties.status = 'alugado'`. Ao salvar `encerrado`/`cancelado` → voltar para `disponível` se nenhum outro contrato ativo apontar para o imóvel.
   - Trigger de validação: `data_fim > data_inicio`, `valor_mensal > 0`, `dia_vencimento between 1 and 31`.

Policies (padrão): SELECT/INSERT/UPDATE/DELETE quando `created_by = auth.uid() OR has_role(auth.uid(),'admin')`. INSERT WITH CHECK garantindo `created_by = auth.uid()`.

## Camada de dados

- `src/types/rental.ts` — tipos `RentalProperty`, `RentalTenant`, `RentalGuarantor`, `RentalContract`, `RentalContractFull` (com joins), `*Input`, enums de status.
- `src/lib/rentals/rentals.functions.ts` — server functions com `requireSupabaseAuth`:
  - `listRentalContracts` (retorna contratos + joins de property/tenant/guarantor)
  - `getRentalContract(id)`
  - `createRentalContract(input)` — cria/atualiza property+tenant+guarantor+contract numa única chamada (RPC server-side coordena)
  - `updateRentalContract(id, patch)`
  - `closeRentalContract(id)` — set status encerrado + data_encerramento, libera imóvel
  - `renewRentalContract(id, novaDataFim)`
  - `markPaymentPaid(id)` — atualiza payment_status + avança proximo_vencimento
  - `listRentalProperties`, `listRentalTenants` (para selects do form)
  - `getRentalKpis()` — agrega receita_mensal_ativa, contratos_ativos, pendentes, vencendo_30d, atrasos, imoveis_disponiveis.
- `src/services/rentals.ts` — wrappers que chamam as functions via `useServerFn`.
- `src/hooks/useRentals.ts` — TanStack Query hooks: `useRentalContracts`, `useRentalKpis`, `useCreateRental`, `useUpdateRental`, `useCloseRental`, etc. Invalida queries em mutações.

## Rota e componentes

Rota mantida em `src/routes/_app.alugueis.tsx`, reescrita. Componentes em `src/components/alugueis/`:

- `RentalDashboard.tsx` — orquestra KPIs + filtros + lista + form modal.
- `RentalKpiCards.tsx` — 6 KPIs reais (Receita mensal ativa, Ativos, Pendentes, Vencendo 30d, Atrasos, Disponíveis).
- `RentalFilters.tsx` — chips de status (Todos/Ativos/Pendentes/Vencidos/Encerrados/Atrasados) + busca por imóvel/locatário/cidade/bairro.
- `RentalCard.tsx` — card resumo (imóvel, endereço, locatário, valor, status, próximo vencimento, início/fim, alerta atraso/vencendo).
- `RentalExpandedDetails.tsx` — drawer/sheet com 4 seções (contrato, locatário, fiador, imóvel) + ações rápidas: editar, encerrar, renovar, marcar pago, WhatsApp, e-mail.
- `RentalFormModal.tsx` — sheet de cadastro/edição em seções colapsáveis:
  - `PropertyFormSection.tsx` — seletor "imóvel existente" ou "cadastrar novo"
  - `TenantFormSection.tsx` — idem locatário
  - `GuarantorFormSection.tsx` — opcional, toggle "incluir fiador"
  - `ContractFormSection.tsx` — valores, datas, vencimento, observações
  - Validação com `zod`: nome locatário, imóvel, valor>0, data_inicio, data_fim>inicio, telefone, email, contrato ativo duplicado checado no submit.
- `RentalStatusBadge.tsx` — cores por status (verde/dourado/vermelho/laranja/azul/cinza) seguindo `StatusBadge` mas dedicado a aluguéis.
- `EmptyRentalState.tsx` — CTA "Cadastrar primeiro aluguel".
- `RentalSkeleton.tsx` — loading.

## UI / visual

Mesma linguagem `liquid-panel`/`GlassCard` já presente. Cards com sombra sutil, hover lift leve, badges coloridos, hierarquia tipográfica forte (nome do imóvel destaque, valor monoespaçado primary, secundárias em foreground/55). Expansão fluida via `Sheet` em mobile e `Drawer` lateral em desktop (≥md). KPIs em grid 2 cols mobile / 6 cols desktop. FAB mobile + botão "Novo aluguel" desktop.

## Remoção de mock

- Remover uso de `useApp`/`useFiltered` no arquivo de rota `_app.alugueis.tsx`.
- Não tocar em `src/store/app-store.ts` (outras telas ainda usam).
- Sem outros mocks específicos a aluguéis fora do `app-store`.

## Validação pós-implementação

1. Migration aplica sem erro; `select` confirma policies.
2. Cadastrar contrato → aparece na lista, persiste após refresh.
3. Encerrar contrato → status muda, imóvel volta a disponível.
4. KPIs refletem os dados (receita = soma de `valor_mensal` dos `ativo`).
5. Usuário B logado não vê dados do A (testar via psql com `set local role`).
6. `bun run build` / typecheck limpos.
7. Layout testado em viewport mobile (375) e desktop (1280).

## Fora do escopo

- Anexos/documentos (sem storage bucket criado ainda).
- Histórico financeiro mês-a-mês (apenas próximo vencimento e status atual).
- Integração com módulo Financeiro existente (mock) — pode vir depois.
- Renovação automática agendada (a ação `renovar` é manual).

## Entrega final reportará

Tabelas criadas, componentes/hooks/functions criados, mocks removidos, testes feitos e limitações pendentes.
