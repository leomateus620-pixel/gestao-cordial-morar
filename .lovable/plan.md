## Mover conexão Google Agenda para o menu Agenda

Tirar o card "Conexões da sua conta" da página **Integrações** e mostrá-lo no topo da página **Agenda**, com a logo oficial do Google Agenda no lugar do ícone genérico. Sem mudanças de rota nem de fluxo OAuth.

### Mudanças

1. **`src/components/configuracoes/GoogleCalendarCard.tsx`**
   - Substituir o ícone `CalendarCheck2` (lucide) por um `<img>` da logo oficial do Google Agenda (SVG inline ou asset em `src/assets/google-calendar.svg`) dentro do mesmo container `size-10`, mantendo o restante do layout intacto.
   - Atualizar os dois `window.history.replaceState({}, "", "/configuracoes")` para `"/agenda"`, já que o card agora vive na Agenda (o callback continua redirecionando para `/configuracoes?google=connected`, então também ajustar o callback — ver item 4).

2. **`src/routes/_app.agenda.tsx`**
   - Importar `GoogleCalendarCard` e renderizá-lo no topo da página, dentro de uma `<section>` com `SectionHeader title="Conexões da sua conta"`, antes do `AgendaCreateCard`.
   - Quando `conn` existir, o card pode aparecer em modo compacto (mesmo componente, mesmo visual da screenshot enviada).

3. **`src/routes/_app.integracoes.tsx`**
   - Remover a `<section>` que renderiza `<GoogleCalendarCard />` e o import correspondente. A página continua existindo e funcionando com os demais conectores.

4. **`src/routes/api/public/google-calendar.callback.ts`**
   - Trocar `new URL("/configuracoes", origin)` por `new URL("/agenda", origin)` para que o retorno do OAuth caia direto na Agenda, onde o card agora vive e exibe o toast de sucesso/erro.

### Notas técnicas

- A logo do Google Agenda será adicionada como `src/assets/google-calendar.svg` (arquivo SVG estático da marca) e importada como URL: `import googleCalendarLogo from "@/assets/google-calendar.svg";`.
- Nenhuma rota nova, nenhuma server function alterada, nenhuma mudança no fluxo de conexão/desconexão. Apenas reposicionamento visual + troca de ícone + ajuste do destino do redirect pós-OAuth para alinhar com o novo local do card.
