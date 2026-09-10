# Dados internos nos sites: o que já está resolvido e o que ainda escapa

## Situação hoje (verificada agora no sistema)

- O filtro que impede anotações internas de irem para Cordial/Morar **está ativo** e funcionando: observações internas e "outras informações" nunca são enviadas, e os "pontos fortes" passam por uma limpeza linha a linha antes do envio.
- A limpeza em massa feita antes moveu as anotações internas para o campo de observações.
- Porém, dos 830 imóveis ativos, **38 ainda têm linhas de controle interno dentro de "Pontos fortes"** que o filtro atual não reconhece. Exemplos reais encontrados:
  - "Ag. Pablo Backes" / "Ag. Bianca H" (sigla do corretor sem dois-pontos)
  - "78.000,00 para o proprietário"
  - "350.000 proprietária"
  - "Verificar disponibilidade e valor com o proprietário"
  - "Imóvel alugado, agendar com o proprietário as visitas"
- Nada disso está sendo publicado neste momento, porque o envio de alterações aos sites está pausado desde a apuração do sumiço dos proprietários. Mas, ao religar, esses 38 sairiam no ar.

## O que proponho fazer

1. **Ampliar o reconhecimento de linha interna**
   - Qualquer linha começando com "Ag." / "Ag:" seguida de nome (com ou sem dois-pontos).
   - Qualquer linha que cite proprietário/proprietária em contexto de negociação ou contato (valor "para o proprietário", "com o proprietário", "avaliação do proprietário", "agendar com o proprietário").
   - Menções a comissão, averbação, exclusividade, chaves, cartório — já cobertas, mantidas.
   - Cuidado para não remover frases legítimas de venda (ex.: "aceita financiamento", "amplo quintal") — cada padrão novo entra com teste.

2. **Limpar os 38 imóveis restantes**
   - Mover as linhas internas de "Pontos fortes" para "Observações internas", sem apagar nada e sem tocar em descrição, fotos, códigos ou status de publicação.
   - Relatório: quantos ajustados, quantos ficaram com pontos fortes públicos.

3. **Aviso no cadastro**
   - O aviso âmbar em "Pontos fortes" passa a reconhecer os mesmos padrões novos, para o corretor perceber na hora de digitar.

4. **Publicação**
   - Não vou religar o envio de alterações aos sites neste trabalho — isso continua dependendo da resposta do suporte sobre o proprietário. Quando religar, os textos já sairão limpos.

## Detalhes técnicos

- `src/lib/imobibrasil/serializers.ts`: ampliar `INTERNAL_NOTE_PATTERNS` (linha ~314) para cobrir "Ag." sem dois-pontos e proprietário em contexto de valor/contato; `stripInternalSiteNotes`/`hasInternalSiteNotes` seguem inalterados na estrutura.
- `src/lib/imobibrasil/serializers.test.ts`: casos novos para cada padrão adicionado e casos negativos (frases comerciais legítimas preservadas).
- Limpeza dos 38 registros via SQL de correção pontual: recorta as linhas detectadas de `pontos_fortes` e as concatena em `observacao_imovel`; nenhuma alteração em `property_sync_jobs`.
- Sem mudanças em schema, fila, fotos ou publicação.
