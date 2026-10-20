# Novo atendimento: opção "Kitnet" no Tipo de imóvel

## O que muda para quem usa
- "Kitnet" aparece logo depois de "Apartamento" no Novo atendimento, na edição, e nos filtros de Atendimentos.
- Ao reabrir um atendimento salvo como Kitnet, ele continua Kitnet (hoje viraria "Outro").
- Lista, detalhe, e-mail ao cliente, histórico em PDF e relatórios mostram "Kitnet".
- Ao converter atendimento em cliente, o tipo Kitnet é mantido.

## Confirmado no código
- Listas: `src/types/atendimento.ts` (`TipoImovelInteresse`, `atendimentoTipoImovelOptions`, rótulo) e `src/types/client.ts` (`PropertyType`, `propertyTypeOptions`).
- Risco real: `normalizeTipoImovel` em `src/services/atendimentos.ts` (~613) e a função equivalente em `src/services/clients.ts` (~417) não reconhecem "kitnet" e caem em "outro".
- O atendimento copia o tipo para o cliente (`services/atendimentos.ts` ~346, `propertyType: atendimento.tipoImovel`), por isso Clientes também precisam da opção.
- Servidor (`attendances.functions.ts` 217/274/511): só exige que exista um tipo; não há lista fechada nem zod restringindo valores. Nada a mudar ali além do tipo TS.
- Rótulos do e-mail/PDF: mapa em `src/lib/attendances/email.functions.ts` (~175).
- Banco: `attendances.tipo_imovel` é texto livre (conferido antes por você). **Sem migração.**

## Alterações
1. `src/types/atendimento.ts`: `"kitnet"` no tipo e `{ value: "kitnet", label: "Kitnet" }` após Apartamento.
2. `src/types/client.ts`: idem em `PropertyType` / `propertyTypeOptions`.
3. `src/services/atendimentos.ts` e `src/services/clients.ts`: reconhecer `kitnet`, `kitinete`, `quitinete`, `kitchenette` antes das demais regras.
4. `src/lib/attendances/email.functions.ts`: rótulo `kitnet: "Kitnet"`.
5. Filtros (`AtendimentoFilters`, `ClientFilters`) usam as listas acima — entram automaticamente.
6. Revisar e, se houver mapa de rótulos/contagem por tipo, incluir Kitnet em: `src/lib/busca/busca.server.ts`, relatórios, `src/lib/agent/tools/common.ts` e pontuação `scoreProperty` (assistente/MCP compartilham as mesmas ferramentas).

## Sugestão de imóveis (decisão sua)
- Padrão proposto: atendimento Kitnet sugere imóveis Kitnet com pontuação cheia.
- Opcional: também sugerir Apartamento com pontuação menor (kitnet é um apartamento compacto). **Não aplico sem seu ok.**

## Fora do escopo (sem alteração)
- Cadastro de imóveis e sync Imobi: já têm "Kitnet" e salvam o mesmo valor `kitnet`.
- Formulários de contato dos sites Cordial/Morar: as funções de lead aceitam lista fixa (`casa…outro`) e os formulários não oferecem Kitnet. Ficam como estão; se quiser Kitnet no site, é uma migração aditiva separada.
- Endereço, NFS-e, fotos, códigos, Drive, publicação.

## Testes
- `normalizeTipoImovel`: "kitnet", "Kitinete", "quitinete" → kitnet; casa/apartamento/terreno/sala/rural/sítio/outro inalterados (atendimento e cliente).
- Leitura/edição: atendimento com `kitnet` volta como `kitnet`; conversão para cliente mantém `kitnet`.
- Rótulos: `atendimentoTipoImovelLabel("kitnet")` e mapa do e-mail = "Kitnet"; opção presente e logo após Apartamento.
- Sugestão: Kitnet pontua imóvel Kitnet.
- Rodar `bun run test` e typecheck.

## Riscos
- Baixo. Atendimentos antigos não mudam. Único cuidado: a regra "kitnet" vir antes das regras genéricas para não cair em "outro".
