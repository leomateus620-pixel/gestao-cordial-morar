# Novas origens de lead: E-mail e Ligação

## O que muda

No campo "Origem do lead" (cadastro e edição de atendimento) passam a existir duas opções novas:

- E-mail
- Ligação

Ordem sugerida na lista: WhatsApp, Ligação, E-mail, Instagram, Indicação, Site, Portal, Atendimento presencial, Porta fria, Outro.

As novas opções funcionam em todo o fluxo já existente:

- Salvam e persistem no atendimento (não há restrição no banco para esse campo, então não é preciso migração).
- Aparecem no filtro de origem da lista de Atendimentos.
- Aparecem nos detalhes do atendimento e no card "Origem dos leads" do painel, cada uma com ícone e cor próprios (envelope para E-mail, telefone para Ligação).
- Entram nos relatórios/rotulagem que já usam a lista de origens.

Registros antigos continuam iguais; nada é reclassificado.

## Detalhes técnicos

- `src/types/atendimento.ts`: adicionar `"email"` e `"ligacao"` ao tipo `OrigemLeadAtendimento` e as entradas correspondentes em `atendimentoOrigemOptions`.
- `src/hooks/useAttendances.ts`: incluir as duas chaves no `ORIGIN_MAP` (mapeamento para origem de cliente — `email` e `ligacao`/telefone).
- `src/services/atendimentos.ts`: reconhecer "e-mail/email" e "ligação/telefone" em `normalizeOrigem`, e mapear em `mapOriginToClient`.
- `src/services/reports.ts`: rótulos das novas origens.
- `src/components/dashboard/LeadOriginCard.tsx`: ícone + cor para `email` (Mail) e `ligacao` (Phone).
- Sem migração de banco, sem mudança em RLS, permissões ou server functions.
