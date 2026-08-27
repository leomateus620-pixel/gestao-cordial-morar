# Etapa 1 — Códigos por imobiliária e seletor de destino refinado

Hoje a Etapa 1 mostra um único "Código interno" ligado à "Carteira de origem", mesmo quando Cordial e Morar estão selecionadas. O gerador/reserva já existe e é por provedor no banco — o que falta é o modelo do imóvel e a interface trabalharem por provedor.

## O que o usuário passa a ver

1. **Destino da publicação** com dois cards maiores, clicáveis por inteiro:
   - Cordial: ícone, "Cordial Imóveis", "Publicar no site da Cordial", check de seleção, identidade azul institucional quando ativa.
   - Morar: mesma composição, identidade laranja/terracota quando ativa.
   - Não selecionado: neutro, legível, nunca com cara de desabilitado.
   - Ambos ativos: cada card mantém sua cor, o container recebe ambientação dupla muito suave (azul à esquerda, laranja à direita) e uma linha discreta "Publicação nos dois sites".
   - Hover, focus-visible, pressed, `aria-pressed`, teclado, alvo ≥44px, transição de ~200ms em fundo/borda/elevação/check.
2. **Campos de código dependentes da seleção**:
   - só Cordial → apenas "Código Cordial" (moldura azul);
   - só Morar → apenas "Código Morar" (moldura laranja);
   - ambos → os dois lado a lado no desktop, empilhados no mobile, cada um com sua cor.
   - Cada campo tem status próprio: Disponível, Gerando, Reservado, Em uso (conflito) ou Erro, com ação discreta "Gerar outro código".
   - Com os dois destinos ativos aparece a ação principal "Gerar códigos", que dispara as duas reservas em paralelo; se uma falhar, a outra é preservada e só a que falhou pode ser repetida.
   - Nenhum código é copiado de uma imobiliária para a outra; números iguais em sites diferentes são permitidos.
3. **Carteira de origem** deixa de comandar o código: continua como origem interna apenas.
4. **Edição**: os dois códigos existentes são carregados e preservados; trocar destinos não apaga reserva/vínculo já confirmado (pede confirmação antes de desvincular um destino já publicado).

## Detalhes técnicos

**Banco (migração segura, sem perder dados)**
- Adicionar `codigo_cordial text` e `codigo_morar text` em `public.properties`, com índices `lower()`; manter `codigo` como legado até a reconciliação terminar.
- Backfill: imóvel publicado só na Cordial → `codigo_cordial = codigo`; só na Morar → `codigo_morar = codigo`; vinculado aos dois → puxar `external_reference` de `property_provider_publications` por provedor; sem vínculo → usar `carteira` como origem. Nunca duplicar um mesmo código para os dois provedores.
- `provider_code_reservations` já é por `(provider, code)` — sem mudança estrutural; apenas confirmar o índice único parcial em reservas ativas.

**Domínio/servidor**
- `PropertyWriteInput`/`PropertyDetail` (`src/types/property.ts`) ganham `codigoCordial` e `codigoMorar`; mapeamento em `src/lib/imoveis/imoveis.functions.ts` (leitura, criação, update, busca rápida por código nos dois campos).
- `src/lib/imobibrasil/sync.server.ts`: ao criar/atualizar a publicação, `external_reference` do provedor passa a usar o código daquele provedor (`codigo_cordial` para Cordial, `codigo_morar` para Morar), caindo para a referência interna só quando não houver código — nunca para o código do outro provedor. `serializeProperty` continua recebendo a referência já resolvida por publicação, então cada payload leva exclusivamente seu código.
- `commitPropertyCodes` passa a receber as reservas com o provedor, para confirmar as duas de uma vez de forma idempotente (retry/duplo clique não gera nova reserva).

**Frontend**
- Novo componente `src/components/imoveis/PublishTargetSelector.tsx` com variantes `cordial`, `morar`, `selected` e `combined` construídas sobre tokens do design system (novos tokens de marca em `src/styles.css`, sem cores inline).
- Novo componente `src/components/imoveis/ProviderCodeFields.tsx` que recebe `destinos` e o estado `ProviderCodes` (`{ cordial?, morar?: { code, reservationId, status } }`) e renderiza um campo por provedor com status e ações.
- `PropertyForm.tsx`: substitui o estado único `codigo`/`reserveCode` por `ProviderCodes` (uma reserva por provedor, com `status` `generating | reserved | conflict | error`), mantendo `usePropertyCodeReservation` como está; `onCodeReserved` passa a informar provedor + reservationId.
- Rotas `_app.imoveis.novo.tsx` e `_app.imoveis.$imovelId.editar.tsx`: acumulam reservas por provedor no rascunho (sobrevivem a refresh via rascunho já salvo) e confirmam no submit.

**Validação**
- Testes unitários para a resolução de referência por provedor e para o reducer de `ProviderCodes` (falha em um provedor não limpa o outro).
- Conferir no preview os quatro estados do seletor (nenhum, só Cordial, só Morar, ambos) em desktop e mobile, além de criação e edição com dois destinos.
- Rodar typecheck, testes e migração antes de encerrar.
