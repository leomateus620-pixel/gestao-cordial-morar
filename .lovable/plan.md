## Bug

O campo **Próximo retorno** no modal "Novo atendimento" usa `<input type="datetime-local">`. Esse tipo só é considerado válido pelo navegador quando data **e** hora estão preenchidas. Ao digitar/selecionar só a data (ex.: `23/06/2026`), o browser bloqueia o submit com "Insira um valor válido. O campo está incompleto ou tem uma data inválida.", como na captura.

Além disso, no submit fazemos `new Date(form.proximoRetorno).toISOString()` — com string parcial `"2026-06-23"` isso é parseado como UTC midnight e desloca o dia em fusos negativos (BRT vira 22/06), o problema clássico descrito no guia interno de parsing de datas.

## Correção

Editar `src/components/atendimentos/AtendimentoFormModal.tsx` (somente UI/serialização do form — sem mudar schema, server function ou banco):

1. **Dividir o campo em dois inputs** dentro do mesmo `Field "Próximo retorno"`:
   - `<input type="date">` (obrigatório quando o usuário quer agendar retorno; opcional no geral).
   - `<input type="time">` ao lado, rotulado como "Horário (opcional)". Se vazio, assume `09:00` como horário padrão de retorno comercial.
2. **Manter `form.proximoRetorno` como string única** internamente, mas derivada de dois sub-estados `proximoRetornoData` e `proximoRetornoHora` no `FormState`. O `datetime-local` atual é removido.
3. **Serialização segura no submit** (substitui o `new Date(...).toISOString()` atual na linha 212): construir a data via `Date.UTC` a partir dos componentes year/month/day/hour/minute aplicando o offset local, evitando o shift de fuso descrito no guia de parsing. Se `proximoRetornoData` estiver vazio, envia `undefined`.
4. **Sem regressões de leitura**: `AtendimentoCard` continua usando `formatDateTime(atendimento.proximoRetorno)` com ISO completo; o card seguirá mostrando data + hora (default 09:00 quando o usuário não informou).

## Arquivos alterados

- `src/components/atendimentos/AtendimentoFormModal.tsx` — único arquivo tocado.

## Validação

- `tsgo --noEmit`.
- Playwright (headless): abrir `/atendimentos`, clicar "Novo atendimento", preencher mínimo + apenas a data do próximo retorno, submeter, screenshot confirmando que não aparece mais o tooltip de validação e que o atendimento é salvo (toast de sucesso).
- Caso com data + hora preenchidas: confirmar que ISO salvo bate com o horário local escolhido (sem shift de dia).

## Fora de escopo

Schema do banco, server functions, tipos de domínio, outros campos do formulário, outros menus.
