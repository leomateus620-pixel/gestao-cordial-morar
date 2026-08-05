# Novo checklist de agenciamentos (fotos H/V + cadastro Morar/Cordial)

## O que muda

O checklist do agenciamento passa a ter itens específicos no lugar dos genéricos:

| Antes | Agora |
| --- | --- |
| Fotos realizadas | Fotos realizadas — horizontal |
| | Fotos realizadas — vertical |
| Imóvel cadastrado no site | Imóvel cadastrado Morar |
| | Imóvel cadastrado Cordial |

Continuam iguais: Fotos enviadas ao Drive, Placa instalada, Vídeo realizado, Agenciamento validado (só admin).

O checklist fica com 8 itens, exibidos na etapa "Checklist" do cadastro, no resumo da etapa de revisão, no card e no painel de detalhe.

## Regra de bonificação

Um agenciamento só conta para a bonificação (Venda ou Aluguel) quando os 4 novos itens estiverem marcados: fotos horizontal, fotos vertical, cadastro Morar e cadastro Cordial. Isso vale tanto no cálculo do painel de progresso quanto no cálculo oficial que gera as bonificações no banco.

Nos painéis de bonificação aparece o motivo quando um agenciamento não conta ("faltam: fotos vertical, cadastro Cordial"), para o corretor saber exatamente o que preencher.

## Dados já existentes

Os agenciamentos antigos são convertidos automaticamente:
- quem tinha "Fotos realizadas" marcado passa a ter horizontal e vertical marcados;
- quem tinha "cadastrado no site" marcado passa a ter Morar e Cordial marcados.

Assim nenhuma bonificação já conquistada é perdida na virada.

## Detalhes técnicos

1. **Migração**: adicionar `fotos_horizontal`, `fotos_vertical`, `cadastrado_morar`, `cadastrado_cordial` (boolean not null default false) em `public.agenciamentos`; backfill a partir de `fotos_realizadas` e `cadastrado_site`; manter as colunas antigas por segurança (sem uso no app).
2. **Bonificação no banco**: atualizar `agenciamento_bonus_recalc` para contar apenas agenciamentos com as 4 flags verdadeiras (Venda e Aluguel), preservando o restante da regra (8 captações + 4 placas no mês / 10 acumuladas no aluguel) e o cancelamento de níveis excedentes.
3. **Tipos**: em `src/types/agenciamento.ts`, `AgenciamentoChecklist` troca `fotosRealizadas`/`cadastradoSite` por `fotosHorizontal`, `fotosVertical`, `cadastradoMorar`, `cadastradoCordial`. Filtros `com_fotos`/`sem_fotos` passam a exigir as duas fotos; `no_site`/`fora_site` passam a exigir os dois cadastros.
4. **Mapeamento**: `agenciamentos.server.ts` (`rowToAgenciamento`, `inputToPayload`, `patchToPayload`) refletindo as novas colunas.
5. **Serviço**: `src/services/agenciamentos.ts` — `checklistKeys`, defaults, `sanitizeAgenciamento`, filtros e agregações do resumo (`fotosDrive`, `cadastradosSite` → contagem pelos novos campos).
6. **Bonificação no front**: em `src/lib/agenciamentos/track.ts`, `isCountableAgenciamento` passa a exigir os 4 itens; novo helper `getMissingBonusRequirements(item)` usado nos painéis.
7. **UI**: `AgenciamentoFormModal.tsx` (lista do checklist + revisão), `AgenciamentoCard.tsx`, `AgenciamentoDetailDrawer.tsx`, `AgenciamentoBonusPanel.tsx`.
8. **Relatórios**: `src/services/reports.ts` usa `cadastradoSite` — ajustar para os novos campos.
9. **Testes**: atualizar `reclassify.test.ts` e adicionar casos cobrindo elegibilidade de bonificação com checklist incompleto/completo; rodar a suíte.
