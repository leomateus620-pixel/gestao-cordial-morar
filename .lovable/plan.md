## Objetivo

Conectar o menu **Vendas** ao Supabase (Lovable Cloud), removendo os dados mock. Manter a UI/UX atual criada anteriormente.

## 1. Banco de dados (migration)

Criar tabela `public.real_estate_sales`:

- `id uuid pk`, `user_id uuid` (auth.uid), `imobiliaria text` (cordial/morar)
- Imóvel: `property_id uuid null`, `property_name`, `property_address`, `property_neighborhood`, `property_city_state`, `property_type`, `bedrooms int`, `bathrooms int`, `area_m2 numeric`, `previous_asking_price numeric`
- Comprador: `buyer_name` (NOT NULL), `buyer_document`, `buyer_phone`, `buyer_email`, `buyer_address`, `buyer_observations`
- Venda: `sale_value numeric NOT NULL`, `sale_date date NOT NULL`, `sale_status text NOT NULL`, `document_status text NOT NULL`, `payment_method text`, `payment_details text`, `commission_value numeric`, `commission_percentage numeric`, `responsible_agent text`, `notes text`
- Contrato: `contract_file_path text`, `contract_file_name text`, `supporting_document_file_name text`
- `created_at`, `updated_at` (trigger `touch_updated_at`)

**GRANTs** para `authenticated` e `service_role`. RLS habilitado.

**Policies** (padrão do projeto — user_id + admins via `has_role`):
- SELECT/INSERT/UPDATE/DELETE: `user_id = auth.uid()` OR `has_role(auth.uid(), 'admin')`

## 2. Supabase Storage

Bucket **privado** `sale-documents`. Path: `{user_id}/{sale_id}/{timestamp}-{filename}`.

Policies em `storage.objects` restringindo por primeira pasta = `auth.uid()::text`. Tipos permitidos (validação client-side): pdf, doc, docx, png, jpg, jpeg. Máx 10MB.

Upload retorna `path`; URL assinada gerada sob demanda por server fn (`getSaleDocumentUrl`).

## 3. Server functions — `src/lib/sales/sales.functions.ts` (novo)

Todas com `.middleware([requireSupabaseAuth])`, seguindo padrão de `rentals.functions.ts`:

- `listSales()` → `SaleRecord[]`
- `getSaleById({ id })`
- `createSale({ data: SaleRecordInput })`
- `updateSale({ id, data })`
- `cancelSale({ id })` (soft: status=cancelada, document_status=cancelado)
- `deleteSale({ id })` (hard delete + remove arquivo do Storage)
- `getSalesKpis()` → calcula direto no SQL/JS a partir das linhas
- `getSaleDocumentSignedUrl({ path })` (createSignedUrl 1h)

Mapper row↔DTO (snake_case → camelCase compatível com `SaleRecord` existente).

## 4. Hook — `src/hooks/useSales.ts` (novo)

Padrão do `useRentals`: `useQuery` para lista/kpis, `useMutation` para create/update/cancel/delete, `invalidateQueries(['sales'])` no sucesso.

Upload de arquivo feito no cliente via `supabase.storage.from('sale-documents').upload(...)` antes de chamar createSale/updateSale; o path resultante é enviado como `contractFilePath`.

## 5. Refatorar UI (sem redesign)

- `src/routes/_app.vendas.tsx`: substituir leitura de `useApp` por `useSales()`. Manter filtros/busca client-side sobre os dados carregados. KPIs do hook.
- `src/components/vendas/SaleForm.tsx`: no submit, fazer upload do arquivo (se houver) → obter path → chamar mutation. Estados de loading/erro/sucesso (toast). Validar tipo/tamanho.
- `SaleDetailsDrawer`: botão "Baixar contrato" chama `getSaleDocumentSignedUrl` e abre URL. Editar/cancelar via mutations do hook.
- `SaleRecordCard`: sem mudança estrutural.
- `EmptySalesState`: já existe, será exibido quando lista real vier vazia.

## 6. Limpeza de mock

- Remover de `src/store/app-store.ts`: state/actions de `vendas` (`addVenda`, `updateVenda`, `cancelVenda`) — ou manter apenas se outros módulos usarem (verificar; se sim, deixar intocado mas parar de ler em `_app.vendas.tsx`).
- Remover vendas mock de `src/lib/mock/data.ts` (somente o array de vendas se não referenciado por outros módulos).
- `src/services/sales.ts`: manter helpers puros de KPI/formatação; remover funções que dependem do store. Usar mapper server-side.

## 7. Estados de UI

Loading skeleton na lista/KPIs; empty state; erros via `toast.error`; sucesso via `toast.success`; disabled em botões durante mutations.

## 8. Validação

- `bun run build` limpo.
- Manual: cadastrar venda com PDF → aparece → refresh persiste → editar → cancelar (status muda, KPIs recalculam) → outro usuário não vê (RLS).

## Arquivos

**Novos:** migration SQL, bucket `sale-documents`, `src/lib/sales/sales.functions.ts`, `src/hooks/useSales.ts`.
**Editados:** `src/routes/_app.vendas.tsx`, `src/components/vendas/SaleForm.tsx`, `src/components/vendas/SaleDetailsDrawer.tsx`, `src/services/sales.ts`, `src/store/app-store.ts`, `src/lib/mock/data.ts`.
**Intocados:** layout, sidebar, tokens visuais, `SaleRecordCard`, `SalesKpiCards`, `SalesFilters`, `SaleStatusBadge`, `EmptySalesState`.

## Perguntas em aberto

1. **Multi-tenant/empresa:** o projeto usa `imobiliaria` (cordial/morar) como discriminador — não vi tabela de company/tenant. Vou isolar por `user_id` + admins veem tudo (padrão dos outros módulos). Confirma?
2. **`property_id`:** deixo nullable (não há tabela `properties` acoplada às vendas hoje — o imóvel é digitado no form). OK?
