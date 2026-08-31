# Validação end-to-end: fotos com marca e envio de dados aos sites

Objetivo: comprovar, com teste real e não com suposição, que a Etapa 6 (fotos com a marca Morar + Cordial) e o envio de dados para os dois sites funcionam sem inconsistência. Nenhuma alteração de funcionalidade está prevista — só correções pontuais se o teste apontar falha.

## O que será testado

3 cadastros de imóvel completos, criados por automação de navegador com uma sessão real do sistema:

1. Imóvel A — venda, destino Cordial + Morar, 20 fotos de uma vez na Etapa 6.
2. Imóvel B — aluguel, destino apenas Cordial, 5 fotos, com reordenação e troca de capa.
3. Imóvel C — venda, destino apenas Morar, 3 fotos, incluindo uma repetida (teste de duplicidade) e uma remoção.

## Pontos de verificação em cada cadastro

- Todas as fotos chegam ao estado "pronta", sem foto presa na fila e sem "tentar novamente".
- A imagem publicada realmente contém a marca (conferência do arquivo processado no armazenamento, não só do status).
- Capa, ordem e remoção refletem no banco.
- Códigos Cordial/Morar gerados uma única vez, sem pular numeração e sem duplicar.
- Publicação cria os registros de sincronização e os jobs terminam com sucesso.
- Os dados enviados (título, valor, descrição, bairro, área com vírgula, quartos/vagas) batem com o que foi digitado.
- Consulta ao anúncio nos sites/API confirma valor e descrição preenchidos — nada de "R$ Consulte" vazio.

## Como o resultado será apresentado

Um relatório curto por imóvel: fotos enviadas x prontas, códigos gerados, referências externas retornadas pelos sites, e campos conferidos. Qualquer divergência vem com a causa identificada e a correção proposta antes de eu mexer no código.

## Detalhes técnicos

- Automação via Playwright contra o app rodando localmente, com sessão autenticada; 20 imagens sintéticas geradas em disco para o lote grande.
- Conferência direta no banco: `property_images` (status, checksum, ordem, capa), `property_provider_publications`, `property_sync_jobs`, `property_sync_attempts`, `provider_code_reservations`.
- Verificação da marca lendo o arquivo `processed` no Storage e comparando dimensões/checksum com o original.
- Conferência do payload enviado por `serializers.ts` e da resposta das duas APIs registrada em `property_sync_attempts`.
- Limpeza ao final: os 3 imóveis de teste são despublicados e excluídos, e os códigos reservados devolvidos, para não sujar o catálogo real.
