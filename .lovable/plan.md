# Lançar nos sites novos os imóveis que estavam no ar no site antigo

## O que a conferência encontrou (hoje)
Imóveis ativos, fora dos sites novos e sem retirada registrada:

| Grupo | Destino | Qtde | Ação |
|---|---|---|---|
| Estavam no ar no site antigo (publicado / dados desatualizados / parcial) | Cordial e/ou Morar | 37 | Lançar |
| Têm código no site antigo, envio falhou por instabilidade ou ficou pendente | Cordial e Morar | 33 | Lançar |
| Têm código no site antigo, mas sem destino escolhido | nenhum | 30 | Não lançar (não há como saber o site certo) — listar |
| Nunca foram ao site antigo | nenhum | 23 | Não lançar |

Ficam de fora, sempre:
- 29 imóveis **arquivados** (todos foram retirados do site antigo).
- Imóveis **retirados/desativados** num site novo (ex.: 5 retirados da Cordial), mesmo não arquivados.

Total a lançar: **70 imóveis**, cada um só no(s) site(s) do seu destino.

## Como será feito
1. Marca de liberação do administrador nos 70 (data, quem liberou, motivo "estava no ar no site antigo"), sem mexer em autorização, disponibilidade, proprietário, corretor, códigos ou fotos.
2. A regra de publicação aceita essa liberação no lugar da autorização/disponibilidade/cadastro concluído — só para esses 70.
3. Envio automático em pequenos lotes; cada imóvel só entra no ar quando as fotos estiverem prontas.
4. Antes de cada envio, nova checagem: se o imóvel foi arquivado ou retirado nesse meio-tempo, ele é pulado.
5. ImobiBrasil continua desligado; nada é enviado ao site antigo.

## Entrega
- Planilha com os 70 lançados (código, destino) e os 53 não lançados com o motivo.
- Contagem dos sites antes/depois (hoje 443 Cordial / 304 Morar).

## Detalhes técnicos
- Migração aditiva: colunas `admin_release_at/by/reason` em `cordial_site_publications` e `morar_site_publications`; elegibilidade = `autorizacao OR admin_release_at IS NOT NULL`, com bloqueio duro para `archived_at IS NOT NULL` ou estado `withdrawn`.
- Seleção: `archived_at IS NULL`, sem linha `published`/`withdrawn` nos canais próprios, `publish_targets` não vazio, e registro em `property_provider_publications` com status published/out_of_sync/partial ou `external_property_id` preenchido.
- Pedidos via `cordial_site_request_publication` / `morar_site_request_publication` (idempotentes), respeitando `owned_gallery_ready()`.
