## Diagnóstico

No `AtendimentoCard.tsx`, somente **Transformar em cliente** está ligado (chama `convertAtendimento`). As outras 5 ações chamam `onMockAction` → `toast.info("…: em breve")`. Nada redireciona, nada persiste.

A infraestrutura backend já cobre os fluxos necessários:
- `updateAttendance` aceita patch de `status`, `motivoPerda`, `proximoRetorno`, `proximoPasso`, `corretorId/Nome`, `observacoes`.
- `upsertAgendaEvent` cria visitas vinculadas via `atendimentoId`.
- Histórico hoje é derivado no `rowToAtendimento` (não há tabela `attendance_history`).

Faltam só os fluxos de UI + ações de mutação. Não vou criar tabela nova de histórico nesta rodada (uso `observacoes` com timestamp prefixado para "Registrar histórico", evitando migração para esta entrega; posso promover a tabela depois se você quiser histórico estruturado).

## Atalhos: comportamento alvo

| Atalho | Ação |
|---|---|
| **Transformar em cliente** | já funciona (mantém) |
| **Vincular corretor** | dialog com select de `atendimentoBrokerOptions` → `updateAttendance({ corretorId, corretorNome })` |
| **Criar visita** | abre `AgendaFormModal` pré-preenchido (`tipo=visita`, `clienteNome`, `atendimentoId`, `imovelDescricao`, `imobiliaria`, `responsavelPrincipalNome=corretor`) → salva via `upsertAgendaEvent` e atualiza status do atendimento para `visita_agendada` + grava `proximoRetorno = inicio` |
| **Criar tarefa de retorno** | dialog leve com `date` + `time` (mesmo helper anti-timezone do form) + select `proximoPasso` → `updateAttendance({ proximoRetorno, proximoPasso, status:"aguardando_retorno" })` |
| **Registrar histórico** | textarea → append em `observacoes` com prefixo `[dd/mm HH:mm] texto` (sem nova tabela) → `updateAttendance({ observacoes })` |
| **Marcar motivo de perda** | dialog com select de motivos comuns + textarea livre → `updateAttendance({ status:"perdido", motivoPerda })`. Já fica oculto se `status==="perdido"` (regra atual mantida) |

## Arquivos a criar/alterar

**Novos componentes** (`src/components/atendimentos/actions/`):
- `VincularCorretorDialog.tsx`
- `CriarVisitaDialog.tsx` (wrapper que reusa `AgendaFormModal` com `initialEvent`)
- `CriarRetornoDialog.tsx`
- `RegistrarHistoricoDialog.tsx`
- `MotivoPerdaDialog.tsx`

**Alterar**:
- `src/components/atendimentos/AtendimentoCard.tsx` — substituir botões mock por triggers reais; receber callbacks tipados (`onVincularCorretor`, `onCriarVisita`, `onCriarRetorno`, `onRegistrarHistorico`, `onMarcarPerda`) ao invés de `onMockAction`.
- `src/routes/_app.atendimentos.tsx` — fiar as mutações: `updateAtendimento` (já existe no hook) e nova mutação `useMutation(upsertAgendaEvent)` para a visita; invalidar `ATTENDANCES_QUERY_KEY` e `AGENDA_QUERY_KEY`.
- `src/components/agenda/AgendaFormModal.tsx` — confirmar suporte a `initialEvent` para pré-preencher (verificar e ajustar se preciso).

**Sem migration nova** (uso colunas já existentes em `attendances` + tabela `agenda_events` já pronta).

## Validações

- `tsgo --noEmit`
- Criar atendimento → testar cada atalho na preview:
  - vincular corretor → card mostra novo nome
  - criar visita → aparece em /agenda com vínculo, status do atendimento vira `visita_agendada`
  - criar retorno → `proximoRetorno` atualiza no card sem timezone shift
  - registrar histórico → observação aparece com timestamp
  - marcar perda → badge `Perdido`, botão some

## Limites conhecidos

- "Registrar histórico" grava em `observacoes` (append), não em tabela dedicada. Posso promover para `attendance_history` em uma segunda rodada se quiser timeline estruturada por usuário/data.
- Lista de corretores é estática (`atendimentoBrokerOptions`); quando a tabela `corretores` virar fonte de verdade, troco o select.
