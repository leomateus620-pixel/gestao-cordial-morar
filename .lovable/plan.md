# Bonificação: cadastro nas duas imobiliárias reconhecido + tipo "Kitnet"

## O que encontrei nos cadastros do Geandre

Dois agenciamentos ativos dele aparecem como pendentes por "sem cadastro Cordial":

- Rua Erico Goulart, 285 (aluguel, 01/09)
- Rua dos Papagaios, 530 (venda, 01/09)

Nos dois casos o imóvel **está publicado nas duas imobiliárias**: a Morar ficou com status `published` e a Cordial com status `partial`, mesmo já tendo código externo confirmado (4338736 e 4338876). O `partial` acontece quando o anúncio foi criado, mas algum detalhe secundário (foto, por exemplo) não fechou 100%.

O sistema só marca o item "Imóvel cadastrado Cordial/Morar" quando a publicação fica exatamente em `published`. Como a Cordial parou em `partial`, o checklist nunca marcou e a bonificação passou a mostrar pendência indevida. Hoje há 2 publicações nesse estado e outras 10 em `out_of_sync` (também já criadas nos sites), sujeitas ao mesmo problema.

## O que será feito

1. **Reconhecer o cadastro pelo que importa: o anúncio existir no site.**
   O marcador de "cadastrado Cordial / cadastrado Morar" passa a valer sempre que a publicação tiver identificador confirmado no site, e não só no estado perfeito. Isso cobre `published`, `partial` e `out_of_sync`.

2. **Corrigir o que já está errado.**
   Varredura em todos os agenciamentos: quem já tem imóvel publicado na Cordial e/ou na Morar recebe o item marcado, e o cálculo de bonificação é recalculado para todos os corretores (Geandre incluído). Depois disso os dois cadastros acima passam a contar.

3. **Etapa 1 do cadastro de imóveis: novo tipo "Kitnet"**, disponível no seletor de tipo junto com Casa, Apartamento etc.

Sem mudança nas regras de bonificação (8 captações + 4 placas por mês na Venda, 10 acumuladas no Aluguel) e sem republicar nenhum imóvel nos sites.

## Detalhes técnicos

- Migração: `agenciamentos_sync_provider_checklist()` deixa de exigir `status = 'published'`; passa a marcar quando `NEW.status IN ('published','partial','out_of_sync')` e `external_property_id IS NOT NULL`, mantendo o guard de status do agenciamento (`NOT IN ('cancelado','reprovado')`).
- Backfill na mesma migração: `UPDATE public.agenciamentos SET cadastrado_cordial/cadastrado_morar = true` a partir de `property_provider_publications` com identificador externo; `cadastrado_site` recalculado como AND dos dois; em seguida `PERFORM agenciamento_bonus_recalc(id)` para cada corretor com agenciamentos.
- `src/components/imoveis/PropertyForm.tsx`: adicionar `"Kitnet"` à constante `TIPOS` (logo após "Apartamento").
- `src/lib/agenciamentos/property-link.functions.ts` já mapeia `kitnet` para o tipo normalizado — nenhuma mudança necessária lá.
- Sem alteração em fila, worker, cliente HTTP ou serializers.
- Após aplicar, conferência dos dois agenciamentos do Geandre e do painel de bonificações.
