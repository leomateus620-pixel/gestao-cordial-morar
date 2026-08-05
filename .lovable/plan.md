# Menu "Busca" — busca global com histórico

Novo módulo exclusivo para administradores (Ricardo e Bruna) que permite pesquisar qualquer registro do sistema por nome e abrir a ficha completa daquele registro com o histórico de alterações.

## O que o usuário vê

1. **Barra de busca fixa no topo do sistema** (ao lado de "Olá, Leonardo" / seletor de imobiliária), com destaque visual elegante: campo arredondado em vidro, ícone de lupa, placeholder "Buscar cliente, contrato, venda, agenciamento…" e atalho de teclado. Visível apenas para admin. Ao digitar, abre um painel com os melhores resultados; Enter leva à página completa.
2. **Menu lateral "Busca"** (seção Sistema) apontando para `/busca`, também só para admin.
3. **Página `/busca`**: campo grande de pesquisa, filtros por categoria (Todos, Atendimentos, Clientes, Aluguéis/Contratos, Vendas, Agenciamentos, Imóveis, Inquilinos) e lista de resultados agrupados por categoria, com nome, subtítulo contextual (telefone, endereço, valor, corretor), status e data.
4. **Painel de detalhe (drawer)** ao clicar num resultado: dados principais em blocos limpos + **linha do tempo** com o que aconteceu naquele registro, e botão "Abrir no módulo" que navega para a tela de origem.

## Histórico exibido por categoria

- **Atendimentos**: histórico real de eventos já registrado no sistema (mudanças de etapa, corretor, status, anotações, atribuições e tempo de resposta).
- **Vendas**: criação/atualização, parcelas e comissões (pagas/pendentes) e documentos anexados.
- **Aluguéis/Contratos**: criação/atualização, status de pagamento, vencimentos, garantias e documentos anexados.
- **Agenciamentos**: criação, validação (quem validou e quando), reclassificação venda/locação, marcos (fotos, placa, site, vídeo) e bonificações geradas.
- **Clientes, imóveis e inquilinos**: criação, última atualização e vínculos (atendimentos, contratos, vendas relacionados).

Observação honesta: hoje só o módulo de Atendimentos grava um log de alterações campo a campo. Para os demais, a linha do tempo é montada a partir das datas e registros relacionados que já existem. Se quiser log de alterações campo a campo em vendas, aluguéis e agenciamentos, isso pode ser adicionado depois com um registro de auditoria próprio.

## Detalhes técnicos

- Novo módulo `busca` em `src/lib/mock/permissions.ts` (apenas `admin_owner`) e item em `src/components/shared/module-menu.ts` (seção `sistema`).
- Nova rota `src/routes/_app.busca.tsx` protegida por `RequireModuleAccess`.
- `src/lib/busca/busca.functions.ts` com duas server functions protegidas por `requireSupabaseAuth` + verificação `has_role(admin)`:
  - `globalSearch({ query, categoria, limit })` — busca case/acento-insensível (`ilike`) em paralelo nas tabelas `attendances`, `clients`, `rental_contracts` (via propriedade/inquilino), `rental_properties`, `rental_tenants`, `real_estate_sales`, `agenciamentos`; retorna resultados normalizados (`id`, `categoria`, `titulo`, `subtitulo`, `status`, `data`, `rota`).
  - `getRecordTimeline({ categoria, id })` — carrega o registro e monta os eventos descritos acima (usando `attendance_history`, `attendance_assignments`, `sale_payments`, `sale_commission_installments`, `sale_documents`, `rental_contract_documents`, `agenciamento_bonuses`).
- Hook `src/hooks/useGlobalSearch.ts` com React Query, `debounce` de 300 ms, `staleTime` curto e `enabled` só com 2+ caracteres.
- Componentes novos em `src/components/busca/`: `GlobalSearchBar.tsx` (barra do topo + painel de sugestões), `SearchResultCard.tsx`, `SearchResultsList.tsx`, `RecordTimelineDrawer.tsx` — reutilizando `glass-card`, `timeline`, `empty-state` e tokens do design system existentes.
- Barra inserida em `src/components/app-shell.tsx` nos dois headers (desktop e mobile), renderizada condicionalmente pelo módulo permitido.
- Sem migração de banco: apenas leitura, respeitando as RLS já existentes.
