# Origem "Patrocínio", sugestão Kitnet → Apartamento e teste do Kitnet na suíte

## O que muda para quem usa
- "Patrocínio" aparece no campo "Origem do lead" (novo atendimento e edição), logo antes de "Outro", e também nos filtros de Atendimentos e Clientes.
- Ao reabrir um atendimento salvo como Patrocínio, ele continua Patrocínio (hoje viraria "Outro").
- Converter o atendimento em cliente mantém a origem Patrocínio.
- O card "Origem dos leads" mostra Patrocínio com ícone de megafone e cor própria; relatórios, detalhe e histórico em PDF mostram "Patrocínio".
- Um atendimento ou cliente Kitnet também sugere apartamentos, com nota menor que a dos imóveis Kitnet.

## Confirmado no código
- Opções/tipo: `src/types/atendimento.ts` (`OrigemLeadAtendimento` linha 92, `atendimentoOrigemOptions` linha 321).
- Servidor (`attendances.functions.ts` 214/506): grava `origem` como veio, sem lista fechada nem zod. Nada a mudar além do tipo.
- Reabertura: `normalizeOrigem` (`services/atendimentos.ts` 631) não reconhece patrocínio e cai em "outro".
- Conversão: `mapOriginToClient` (703) e `ORIGIN_MAP` (`useAttendances.ts` 304, exige todas as chaves).
- Clientes: `LeadOrigin`/`leadOriginOptions` próprios (`types/client.ts`) e conversão legada `mapLeadOriginToLegacy`/`mapLegacyLeadOrigin` (`services/clients.ts` 342/352).
- Rótulos: `services/reports.ts` (~2000), `LeadOriginCard.tsx` (~76), PDF do histórico usa `atendimentoOrigemLabel` (entra automaticamente).
- Banco: origem é texto livre (conferido por você). **Sem migração.**
- Teste do Kitnet: `bun run test` lista arquivos para `tsx --test`; `test:receipts` (vitest) só inclui `*.vitest.ts`. O arquivo `atendimentos-kitnet.test.ts` hoje não roda.

## Alterações
1. `src/types/atendimento.ts`: `"patrocinio"` no tipo e `{ value: "patrocinio", label: "Patrocínio" }` antes de "Outro".
2. `src/types/client.ts`: idem em `LeadOrigin` e `leadOriginOptions`. Decisão: adicionar no cliente (recomendado), senão a origem se perde na conversão e nos relatórios de clientes.
3. `src/services/clients.ts`: incluir patrocinio nas duas funções de conversão legada (ida e volta mantêm o valor).
4. `src/services/atendimentos.ts`:
   - `normalizeOrigem`: reconhecer `patrocin*`, `trafego pago`, `anuncio pago` e o valor exato `ads`/`meta ads`/`google ads` (palavra inteira, não substring), colocado no início, sem afetar site/portal/porta fria.
   - `mapOriginToClient`: patrocinio → patrocinio.
5. `src/hooks/useAttendances.ts`: `ORIGIN_MAP.patrocinio = "patrocinio"`.
6. `src/services/reports.ts`: rótulo `patrocinio: "Patrocínio"`.
7. `LeadOriginCard.tsx`: `patrocinio: { cor da paleta do projeto, Icon: Megaphone }`.
8. `ClientCard.tsx`/assistente: conferir se há mapa de cores ou agrupamento por origem; incluir onde houver (usam os rótulos acima quando não houver mapa).
9. Kitnet → Apartamento: em `scoreProperty` (`match-client-properties.ts`), tipo igual = 30 pontos; cliente kitnet + imóvel apartamento = 15 pontos com motivo "Apartamento (próximo de Kitnet)". Caminho inverso (apartamento → kitnet) não muda. Conferir se `common.ts` ou outra sugestão da tela de atendimento compara tipo; aplicar a mesma regra se houver.
10. Teste do Kitnet: converter `atendimentos-kitnet.test.ts` para `node:test` + `node:assert` (padrão dos demais) e adicioná-lo ao script `test`.

## Fora do escopo (sem alteração)
- Funções de lead dos sites Cordial/Morar (gravam 'site'), origem de agenciamentos, cadastro de imóveis, sync Imobi, NFS-e, endereço, fotos, códigos, Drive, publicação. Nenhum dado alterado.

## Testes (node:test, no script `test`)
- `src/services/atendimentos-origem.test.ts`: "Patrocínio", "patrocinado", "Tráfego pago", "anúncio pago", "Meta Ads" → patrocinio; whatsapp/site/portal/porta fria/instagram/email/ligacao/outro inalterados; opção antes de "Outro" com rótulo "Patrocínio"; conversão atendimento → cliente mantém patrocinio; ida e volta legada de clientes mantém patrocinio; rótulo de relatório.
- Exportar `normalizeOrigem`/`mapOriginToClient` para teste (sem mudar comportamento).
- `src/lib/agent/tools/tools.test.ts` (já em test:assistant): Kitnet→Kitnet = 30, Kitnet→Apartamento = 15 e menor, Apartamento→Kitnet = 0, Casa inalterada.
- Rodar `bun run test` completo e typecheck.

## Riscos
- Baixo. Registros antigos não mudam. Cuidado principal: "ads" só por palavra inteira, para não capturar outros textos. `ORIGIN_MAP` com chave obrigatória quebra o typecheck se esquecida (é a proteção desejada).
