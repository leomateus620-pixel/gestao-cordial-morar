# Aplicar a 0035 da Vistoria com o aplicador disponível

## Por que falhou antes
O aplicador disponível sempre roda primeiro as mudanças pendentes da lista do repositório (a 0035 original, sem alterações) e depois o conteúdo novo enviado. Como reenviei o mesmo SQL da 0035, ele rodou duas vezes e a segunda parou no primeiro gatilho repetido. Tudo foi desfeito; o banco segue como antes.

## Solução
Em vez de reenviar a 0035, envio um conteúdo novo que **só verifica** (não cria nem altera nada). O aplicador então:
1. aplica a 0035 original exatamente como está no repositório (uma única vez);
2. roda a verificação na mesma operação; se qualquer item faltar, a operação inteira é desfeita automaticamente e nada fica pela metade.

Consequência a aceitar: fica no histórico uma entrada extra de verificação (0036), sem nenhuma mudança de estrutura ou dados. A 0035, a 0033, a 0034 e o journal existentes não são alterados.

## O que a verificação exige (falha = desfaz tudo)
- 8 funções da 0035 existem, com `search_path` fixo.
- 5 gatilhos novos (4 de revisão agregada + ordem de fotos).
- `inspection_finalize` e `inspection_finalize_server` sem permissão para navegador/anônimo; `finalize_server` só para o servidor.
- Política de envio do bucket `inspection-media` recriada bloqueando a pasta `docs`.
- RLS ativo nas 7 tabelas de vistoria.

## Depois de aplicar (somente leitura)
- Confirmar o histórico (0035 e 0036 registradas), gatilhos, vínculos compostos, permissões e políticas.
- Confirmar que a vistoria Nº 1 segue com 2 fotos e o laudo com o mesmo hash `b71dd0db…`.
- Rodar os testes locais da vistoria, relatados à parte.
- Sem publicar, mesclar ou mexer em imóveis, Drive, anúncios ou NFS-e.

## Lembrete
O site publicado só passa a usar as funções novas quando a versão compatível do app for publicada — decisão sua.
