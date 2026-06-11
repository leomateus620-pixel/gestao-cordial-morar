## Gestão Cordial — v1 (mobile-first, mock data)

App mobile premium em liquid glass terracotta para Ricardo e Bruna gerenciarem Cordial Imóveis e Morar Imóveis. Toda a v1 roda com dados mock em memória (sem backend), pronta para futura integração Conta Azul.

### Identidade visual
- Paleta terracotta executive da direção escolhida (background `hsl(30 30% 95%)`, primary `hsl(18 55% 50%)`, glass panels brancos translúcidos com blur)
- Fontes: Inter + JetBrains Mono (números/KPIs), carregadas via `<link>` em `__root.tsx`
- Background mesh animado (blobs terracotta + laranja com drift suave 20s)
- Componente reutilizável `GlassPanel` (backdrop-blur, borda branca, sombra dupla interna)
- Identidade unificada "Gestão Cordial" com selo de cor por imobiliária (Cordial = terracotta, Morar = âmbar)

### Arquitetura de rotas (TanStack Start)
```
src/routes/
  __root.tsx              shell + fontes + mesh bg + auth mock gate
  login.tsx               login mockado (Ricardo / Bruna)
  _app.tsx                layout autenticado: header + bottom nav + outlet
  _app/index.tsx          Dashboard (KPIs, gráfico, destaques, atividade)
  _app/atendimentos.tsx   lista + filtro + novo atendimento (sheet)
  _app/clientes.tsx       lista + cadastro (sheet)
  _app/imoveis.tsx        grid de cards + cadastro (sheet)
  _app/corretores.tsx     lista da equipe + performance
  _app/agenda.tsx         visitas/reuniões por dia
  _app/contratos.tsx      vendas + aluguéis ativos, status
  _app/financeiro.tsx     receita, comissões, inadimplência (gráficos)
  _app/relatorios.tsx     visões consolidadas + futura Conta Azul (placeholder)
  _app/mais.tsx           menu lateral mobile com todos os módulos
```
Bottom nav fixa: Início, Atendimentos, Imóveis, Agenda, Mais. Itens secundários (Clientes, Corretores, Contratos, Financeiro, Relatórios) acessíveis por "Mais" (drawer/sheet) e pelo FAB de ação rápida.

### Estado e dados mock
- `src/lib/mock/` — datasets em TS: `imobiliarias.ts`, `clientes.ts`, `imoveis.ts`, `corretores.ts`, `atendimentos.ts`, `contratos.ts`, `agenda.ts`, `financeiro.ts`. Conteúdo realista em PT-BR (nomes, endereços SP/Bragança, valores R$).
- `src/store/` — Zustand para estado de UI + mutações locais (criar atendimento, cliente, imóvel etc.). Persistência via `localStorage` para sobreviver reload.
- Hook `useAgency()` com switcher Cordial / Morar / Todas filtrando todas as listas.
- Auth mock em `src/lib/auth-mock.ts` (usuários hardcoded Ricardo e Bruna, sessão em localStorage).

### Telas — escopo v1

**Dashboard (`/`)**
- Header: logo + switcher de imobiliária + avatar
- Saudação contextual ("Olá, Ricardo")
- 4 KPIs: Atendimentos hoje, Visitas agendadas, Contratos ativos, Receita do mês (com delta vs mês anterior)
- Gráfico de barras 6 meses (Recharts) — Performance de Vendas
- Carrossel horizontal "Imóveis em destaque" (3-5 cards)
- Lista "Atendimentos recentes" (4 itens com avatar inicial, corretor, tempo)
- FAB "+" abre sheet de novo atendimento

**Atendimentos** — lista filtrada por status (Aberto, Em visita, Proposta, Fechado, Perdido), busca, novo atendimento (sheet com cliente, imóvel, corretor, status, observações).

**Clientes** — lista com busca, badge de tipo (Comprador/Locatário/Vendedor/Proprietário), cadastro em sheet (nome, telefone, email, interesse, orçamento).

**Imóveis** — grid de cards com foto, preço, status chip, bairro; filtro Venda/Aluguel; cadastro (tipo, finalidade, endereço, valor, quartos, área, foto URL).

**Corretores** — cards com avatar, atendimentos do mês, contratos fechados, comissão acumulada.

**Agenda** — visualização por dia, lista de compromissos com horário, cliente, imóvel, corretor; criar evento.

**Contratos** — abas Vendas / Aluguéis, lista com cliente, imóvel, valor, vigência, status (Ativo, Pendente assinatura, Encerrado).

**Financeiro** — cards de receita do mês, comissões a pagar, inadimplência; gráfico de fluxo por mês; lista de lançamentos recentes; bloco "Conta Azul" como placeholder ("Integração disponível em breve").

**Relatórios** — visão consolidada: ranking de corretores, conversão de atendimentos, mix venda/aluguel, top bairros.

**Mais (menu lateral mobile)** — sheet lateral com todos os módulos, perfil do usuário, alternar imobiliária, sair.

### Stack técnico
- TanStack Start (já configurado) + Tailwind v4 com tokens da direção em `src/styles.css`
- shadcn/ui: Sheet (formulários e menu lateral), Tabs, Badge, Button, Input, Select, Avatar, Card
- Recharts para gráficos
- lucide-react para ícones
- Zustand + persist para estado mock
- date-fns (pt-BR) para datas

### Detalhes técnicos
- Tokens da direção entram em `src/styles.css` via `@theme` + classe utilitária `.glass-panel` global
- `__root.tsx` mantém `<Outlet />` e adiciona `<link>` Inter+JetBrains Mono no `head()`
- Cada rota define `head()` com title PT-BR específico
- Imagens dos imóveis: gerar 4-6 fotos de fachadas/interiores via image gen em `src/assets/properties/`
- Mobile-first: viewport será setada para mobile na preview; layout responsivo (max-w em desktop centralizado com mesh visível ao redor)

### Fora de escopo da v1
- Backend real, autenticação Lovable Cloud, integração Conta Azul (placeholder visual apenas), upload de fotos, notificações push, multi-tenant real, RBAC. Tudo planejado para v2 quando aprovado.

### Entregáveis no fim desta build
- App navegável com 10 telas funcionais
- Cadastro funcional (em memória + localStorage) de atendimento, cliente, imóvel
- Dashboard com KPIs e gráficos a partir do mock
- Login mockado (Ricardo/Bruna) + logout
- Visual fiel à direção Terracotta Executive
