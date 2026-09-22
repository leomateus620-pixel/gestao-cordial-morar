# Reativar o envio de alterações para os sites Cordial e Morar

## Observação sobre o pedido
O item 7 chegou cortado ("**Centralize o limi…**"). Pelo código, o ponto que falta centralizar é o **limite de chamadas por site** (hoje aplicado só no envio de fotos e na limpeza de hotspots; o cadastro chama a API sem passar pelo controle). O plano assume isso. Se o item 7 era outra coisa, me diga e eu ajusto antes de executar.

## Situação confirmada agora (produção)
- A pausa está **ligada** na configuração do ambiente publicado: `app_settings.imobi_update_sync_paused = {"paused": true, ...}` desde 10/09/2026. Não é código, é dado — então reativar exige mudar esse registro.
- Efeito hoje: todo trabalho com ação `update` é **cancelado definitivamente** ao ser retirado da fila (324 registros já cancelados). Publicação, retirada e exclusão passam.
- A checagem da pausa acontece **uma vez, no início do ciclo do worker**, antes de resolver a ação real. Como `publish` em imóvel já existente vira `update` depois dessa checagem, hoje existe caminho de alteração que **escapa** da pausa.
- A alteração envia **o imóvel inteiro** (`serializeProperty`, ~80 campos). Como a API apaga o que não vem no corpo, o código compensa relendo e reenviando vínculos. É exatamente esse reenvio massivo que coincidiu com a perda de proprietário em 08–09/09.
- O limite de 18 chamadas/minuto por site só é respeitado por fotos e hotspots; cadastro passa direto.
- Fila atual: 24 trabalhos de fotos pendentes, 5 publicações com falha, nenhum `update` pendente.

## O que será feito

### 1. Alteração mínima (antes de liberar qualquer processamento)
- Guardar, por imóvel e site, o **último corpo enviado e confirmado** (snapshot por campo, não só o hash atual).
- Passar a montar a alteração como **diferença**: só os campos cujo valor mudou desde o último envio confirmado, mais os campos que o contrato exige em toda alteração (referência, finalidade, tipo, cidade e os vínculos).
- Sem snapshot anterior (imóvel antigo), a primeira alteração parte do que o site responde no `GET /imovel/dados` — nunca de valores padrão.
- Campo desconhecido, mascarado ou ausente **nunca** entra no corpo: omitir preserva.
- Limpar um campo de propósito continua possível, mas só quando o usuário realmente apagou o valor no Gestão.

### 2. Preservar vínculos
- Proprietário, corretor e usuário adicional só entram no corpo quando houve alteração explícita desses vínculos no Gestão.
- Se o site devolver o vínculo mascarado ou a leitura falhar, a alteração é **abortada** em vez de enviar o campo vazio.

### 3. Validação da semântica em registro de teste
- Consultar o contrato vivo de cada site (`/api/v1/doc/api.json`) e confirmar na prática, em **um imóvel de teste controlado**, que omitir preserva e vazio limpa — com leitura antes e depois, registrada em documento.
- Só depois disso a pausa é desligada.

### 4. Pausa na hora certa
- Mover a checagem para **imediatamente antes de cada escrita externa**, já com a ação efetiva resolvida (inclusive `publish` que virou `update`).
- Retirada do site (`unpublish`) passa a usar alteração mínima: apenas o campo de exibição, nada mais.

### 5. Estado retomável em vez de cancelamento
- Trabalho bloqueado pela pausa vira `retry` com estado "aguardando liberação", em lugar de `cancelled`.
- Na liberação, reconciliar: para cada imóvel e site fica **apenas a intenção atual válida** (a revisão mais recente). Revisões antigas, exclusões e publicações históricas **não** são reprocessadas — os 324 cancelados ficam como estão.

### 6. Limite de chamadas centralizado
- Todas as chamadas à API dos sites (cadastro, fotos, catálogos, hotspots) passam pelo mesmo controle de 18/min por site, dentro do cliente HTTP, não em cada chamador.

### 7. Reativação efetiva e verificação
- Desligar a pausa no registro de configuração do ambiente publicado (com motivo e data), conferir que os workers e agendamentos de cadastro estão ativos e que os tokens dos dois sites respondem.
- Validar com **um** imóvel real: alterar um único campo no Gestão, conferir que só esse campo foi enviado, que proprietário/corretor/preço/descrição/códigos continuam intactos no site e que a página pública reflete a mudança.
- Registrar o resultado em `docs/` e atualizar `roadmap.md`.

## Detalhes técnicos
- Arquivos: `src/lib/imobibrasil/sync.server.ts` (ordem da pausa, ação efetiva, unpublish mínimo), `serializers.ts` (novo modo `patch` + campos obrigatórios), novo `payload-diff.ts` (puro, com testes), `queue-policy.ts` (`shouldDeferForPause` em lugar de `shouldCancelForPause`), `client.server.ts` (limite centralizado), `rate-limit.server.ts`.
- Migração aditiva em `property_provider_publications`: `last_payload_snapshot jsonb`, `last_payload_synced_at`; RPC para coalescer intenção por imóvel/site na retomada (EXECUTE só `service_role`).
- Nenhuma exclusão remota, nenhum reenvio de fotos e nenhuma alteração de códigos, proprietário ou corretor fora do escopo.
- Testes: novos casos de diferença de corpo e de pausa antes da escrita; `bunx tsx --test` e typecheck ao final.
