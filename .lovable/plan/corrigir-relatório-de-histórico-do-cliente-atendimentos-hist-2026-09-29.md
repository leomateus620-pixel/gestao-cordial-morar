# Corrigir relatório de histórico do cliente (Atendimentos → Histórico em PDF)

## Problemas relatados
1. Ao clicar num cliente da lista, a escolha não fica clara e o botão "Imprimir / PDF" continua desligado (a faixa de resumo fica vazia, sem contagem nem erro).
2. O histórico do cliente não vem completo: atendimentos do mesmo cliente com telefone escrito diferente, sem cadastro de cliente ou só com e-mail ficam de fora.

## O que será feito
1. **Seleção do cliente**
   - Reproduzir na prévia como admin e confirmar a causa da faixa vazia (consulta travada, erro silencioso ou seleção perdida quando a lista muda).
   - Deixar o cliente escolhido bem marcado (destaque forte + ícone de check) e mostrar um cartão "Cliente selecionado" acima da lista, com botão para trocar.
   - Manter a seleção mesmo se a busca mudar.
   - A faixa de resumo sempre mostra um estado: "Calculando…", contagem, "nenhum registro" ou mensagem de erro — nunca vazia.
2. **Histórico completo**
   - No servidor, juntar todos os atendimentos do cliente por: telefone (mesma regra dos últimos 8 dígitos usada na detecção de duplicados), e-mail, cadastro de cliente e cliente convertido.
   - Na lista, agrupar contatos pela mesma regra de telefone, e também por e-mail, para não aparecer a mesma pessoa duas vezes.
   - A busca procura em todos os contatos (sem cortar em 50 sem aviso); mostrar "refine a busca" quando houver muitos.
   - O relatório inclui todas as movimentações de todos esses atendimentos, na linha do tempo única.
3. **Validar na prévia** como admin: buscar, selecionar, ver contagem, gerar o PDF de um cliente com vários atendimentos e conferir que todos aparecem.

## Fora do escopo
Nada muda no funil, filtros, cadastro de atendimentos, corretores ou integrações. Sem alterar dados. Nada publicado.

## Detalhes técnicos
- `AtendimentoHistoryReportDialog.tsx`: guardar o contato selecionado como objeto (não só a chave derivada da lista), chave por `phone_key`; tratar estado `isPending` sem fetch; remover `slice(0,50)` silencioso.
- `history-report.functions.ts` (`listClientAttendanceHistoryReport`): aceitar `phone`/`email` e buscar em `attendances` via `phone_key(telefone)` e `lower(email)` (índices já existem), além de `cliente_id`/`cliente_convertido_id`; manter checagem de admin e limite de 2.000 eventos.
