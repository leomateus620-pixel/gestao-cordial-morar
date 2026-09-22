# Estados de sincronização Cordial / Morar

Um imóvel do Gestão pode ter **um vínculo por imobiliária**, cada um com estado
próprio. Nada aqui é compartilhado entre Cordial e Morar.

## Os três estados por campo

| Estado | Coluna | Significado |
| --- | --- | --- |
| Confirmado | `confirmed_field_snapshot` / `last_published_hash` | último valor que o site confirmou por leitura |
| Gestão | linha de `properties` | valor atual no sistema |
| Site | `remote_field_snapshot` / `remote_observed_hash` | valor lido agora no site |

Os três passam pela **mesma normalização** (`sameValue`, de `payload-diff.ts`),
então "R$ 450.000", "450000" e "450000,00" não parecem diferentes.

`last_payload_hash` é outra coisa: é o hash do **corpo enviado**. Ele nunca deve
ser comparado com `remote_observed_hash` — a comparação válida é
`last_published_hash` (confirmado) contra `remote_observed_hash` (site).

## Classificação (`tri-state.ts`)

| Classificação | Ação |
| --- | --- |
| `igual` | nada |
| `mudou_remoto` | importa automaticamente |
| `mudou_local` | preserva o Gestão; o campo segue pendente de envio |
| `limpeza_local` | preserva a limpeza; nunca é desfeita pela importação |
| `conflito` | aplica o valor do site **e** registra em `property_field_conflicts` |
| `nao_verificavel` | fora de qualquer decisão (a leitura não descreve o campo) |

Campos nunca tocados pela importação: `codigo`, `referencia`, `pontos_fortes`,
`carteira`, `valor_modo`. Proprietário, corretor, fotos e agenda também ficam
fora — não são alterados por leitura remota em nenhuma hipótese.

## Avanço da referência

`confirmed_field_snapshot` e `last_published_hash` só avançam quando o valor
local ficou **realmente igual** ao do site (`nextConfirmedSnapshot`). Quando a
importação preservou uma diferença local, a referência **não** avança — antes o
`upsertPublication` gravava os três hashes iguais e mascarava a divergência.

## Ciclo de sincronização

Depois de publicar, o sistema lê o anúncio e grava `echo_payload_hash` com
validade de 2 horas. Se a próxima leitura devolver exatamente esse conteúdo, é
**eco do próprio envio**: confirma a publicação em vez de virar "alterado fora".
Assim uma importação não provoca republicação e um envio do Gestão não é lido
como edição externa.

## Leitura e ausência

`fetchAllPropertyPages` lê todas as páginas e só devolve `reliable: true` quando
nenhuma falhou. Ausência de um anúncio, falha de consulta ou filtro geram
`remote_read_state = missing_remote_suspeito` / `leitura_falhou` — **nunca**
remoção local.

## Limites reais da API

- Não há webhook de imóveis: a documentação só confirma webhook de leads. Toda
  detecção de mudança externa depende de leitura periódica.
- A resposta de inserção de imagem não é documentada; o sistema confere a
  galeria antes e depois do envio.
- Não existe endpoint para alternar destaque: capa e ordem só mudam por
  reconstrução com fotos já enviadas.
