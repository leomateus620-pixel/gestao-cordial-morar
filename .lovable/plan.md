# Validar bonificações no menu Agenciamentos

Hoje o painel de bonificações só mostra os últimos 6 registros com a etiqueta de status (Pendente, Aprovada, Paga) e não existe nenhuma ação para alterar esse status na tela. A regra de negócio no servidor já existe e já restringe a alteração a administradores — falta a interface.

## O que será entregue

1. **Registro completo de bonificações**
   - Botão "Ver todas" no painel de Bonificações abre um painel lateral com o histórico completo da trilha (Venda ou Aluguel), não apenas 6 itens.
   - Cada linha mostra: corretor, número da bonificação, período/ciclo, captações e placas contabilizadas, data da conquista e status atual.
   - Filtro rápido por status (Todas, Pendentes, Aprovadas, Pagas, Canceladas) e busca por corretor.

2. **Validação pelo admin**
   - Somente administradores veem as ações. Para os demais perfis a lista é apenas leitura.
   - Em cada bonificação pendente: "Aprovar", "Marcar como paga" e "Cancelar", com confirmação antes de aplicar.
   - Uma bonificação aprovada ainda pode virar paga ou ser cancelada; uma paga pode ser revertida para aprovada pelo admin.
   - Após a mudança, a lista e os contadores do painel atualizam na hora, com aviso de sucesso ou de erro real vindo do servidor.

3. **Ajustes de contagem**
   - O contador "conquistadas" passa a distinguir bonificações validadas (aprovadas/pagas) das ainda pendentes, para o admin enxergar o que falta validar.
   - Canceladas ficam fora dos contadores e aparecem apenas no registro completo, quando o filtro pedir.

## Detalhes técnicos

- `src/lib/agenciamentos/agenciamentos.functions.ts`: `listAgenciamentoBonuses` hoje filtra `neq status cancelada`; passará a aceitar um parâmetro opcional para incluir canceladas (usado só no registro completo). `updateAgenciamentoBonusStatus` já valida `admin` e será reaproveitada sem mudança de regra.
- `src/hooks/useAgenciamentos.ts`: expor `updateBonusStatus` com estado de carregamento e propagar o erro para a UI (hoje é engolido no `console.error`).
- Novo `src/components/agenciamentos/AgenciamentoBonusRegistryDrawer.tsx`: Sheet com filtros, lista completa e ações de status protegidas por `AlertDialog`.
- `src/components/agenciamentos/AgenciamentoBonusPanel.tsx`: botão "Ver todas", separação entre validadas e pendentes no resumo.
- `src/routes/_app.agenciamentos.tsx`: estado de abertura do drawer, verificação de admin e handler de mudança de status com feedback.
- Testes em `src/lib/agenciamentos/` para a contagem de validadas x pendentes e para as transições de status permitidas.

Nenhuma mudança de banco de dados é necessária: a tabela de bonificações e as permissões já suportam esse fluxo.
