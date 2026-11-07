# Lançar os 142 imóveis sem autorização assinada

## Objetivo
Colocar no ar os 142 imóveis (75 Cordial, 67 Morar) que hoje estão bloqueados só por falta de "Autorização assinada", cada um apenas no site do seu destino, com envio automático e sem acompanhamento manual.

## Como será feito
1. **Liberação registrada, sem mexer no cadastro**
   - A ficha do imóvel continua mostrando "Autorização assinada: não". Nenhum dado comercial é alterado.
   - Cada um dos 142 recebe, por site, uma marca "Liberado pelo administrador (Leonardo, 07/11/2026)". Para a publicação, essa marca substitui a autorização.
   - A liberação vale só para esses 142 imóveis. Cadastros novos continuam exigindo autorização.
2. **Envio automático em segundo plano**
   - Os 142 entram numa fila e são publicados em lotes pequenos (por exemplo, 10 a cada minuto). Assim os sites não ficam lentos.
   - Cada imóvel só entra no ar com fotos prontas. Se faltar foto pronta, o sistema processa as fotos primeiro e publica depois, sozinho.
   - Falhas são repetidas automaticamente algumas vezes. As que persistirem ficam marcadas com o motivo.
3. **O que continua bloqueando (por segurança)**
   - Imóvel arquivado, excluído, oculto ou com retirada manual não é publicado.
   - Imóvel com disponibilidade "Não" também não. Os que estiverem sem disponibilidade informada serão listados antes; pergunto se entram.
   - Nada muda na ImobiBrasil, que continua desligada.
4. **Conferência final (por amostra)**
   - Confiro 5 imóveis por site nas páginas públicas: texto, fotos, ordem e ausência no site errado.
   - Entrego uma planilha com o estado de cada um dos 142: no ar, aguardando fotos ou com erro e motivo.

## Antes de começar
Leio a lista atual dos 142 e confirmo os números: quantos têm fotos, quantos estão sem disponibilidade e se algum mudou de estado desde a planilha.

## Detalhes técnicos
- Mudança aditiva no banco: colunas `admin_release_at`, `admin_release_by` e `admin_release_reason` em `cordial_site_publications` e `morar_site_publications`.
- As funções de elegibilidade passam a aceitar `autorizacao OR admin_release_at IS NOT NULL`, mantendo todos os outros bloqueios.
- Fila: um job por imóvel e marca, idempotente, despachado por `property_worker_dispatch` (lotes limitados, com reserva pelo cron já existente). A publicação usa `<marca>_site_request_publication`, com decision_source `admin_release`.
- Testes para a nova regra: liberação aceita sem autorização, retirada manual preservada, arquivado bloqueado e imóvel fora da lista continua bloqueado.
