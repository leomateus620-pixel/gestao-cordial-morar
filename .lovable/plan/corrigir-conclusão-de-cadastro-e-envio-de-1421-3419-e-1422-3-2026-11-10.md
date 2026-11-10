# Corrigir conclusão de cadastro e envio de 1421/3419 e 1422/3420

## O que foi encontrado
- O agenciamento do Geandre **foi salvo corretamente** nos dois imóveis (proprietário, endereço, descrição, fotos feitas, corretor Geandre, códigos). Nada se perdeu.
- Ele só "aparece zerado" porque, ao abrir "Concluir cadastro" de novo, a etapa de agenciamento sempre começa em branco — não recarrega o que já está gravado.
- O motivo real de não ter ido aos sites: "Autorização assinada" desligada e Disponibilidade em branco. O site Morar recusou o envio, o Cordial deixou fora do ar, e por isso o cadastro não foi marcado como concluído. A ficha mostra a frase genérica "Ainda sem agenciamento", que é falsa nesse caso.

## O que será feito

### 1. Regra nova: autorização não bloqueia mais
- "Autorização assinada" deixa de ser exigida para enviar aos sites Cordial e Morar (continua só como informação do cadastro).
- Disponibilidade em branco também não bloqueia um cadastro concluído no Gestão; só "Não"/indisponível bloqueia.
- Arquivados, retirados e com "Exibir no site" desligado continuam fora dos sites.

### 2. Os dois imóveis
- Sem alterar dados deles: concluir o cadastro pelo fluxo normal, mantendo o agenciamento do Geandre (sem duplicar), e enviar para Cordial e Morar.
- Conferir que aparecem nas páginas públicas dos dois sites com as fotos.

### 3. Evitar que se repita
- Ao reabrir "Concluir cadastro", a etapa de agenciamento vem preenchida com o que já foi salvo; reenviar nunca apaga dados gravados.
- O aviso "Cadastro não concluído" diz o motivo real (ex.: "Agenciamento registrado. Envio ao site Morar falhou — tente novamente").
- Erros de envio em português claro, no lugar da mensagem técnica.
- Teste automático para cada regra.
- Verificar se há outros cadastros recentes travados pelo mesmo motivo e listá-los.

## Fora do escopo
Outros imóveis (só listados), ImobiBrasil (segue desligada), fotos, NFS-e.

## Detalhes técnicos
- Causa: `morar_site_request_publication` lança "blocked by canonical property state" com `autorizacao IS FALSE`; `enqueuePropertySyncCore` retorna `partial` → `steps.publish="error"` → `registration_completed_at` nulo.
- Migração aditiva: recriar `morar_site_request_publication`, `cordial_site_request_publication` e as funções/views de elegibilidade (`*_site_sync_property`, `*_site_eligible`) sem exigir `autorizacao`, tratando `disponibilidade` nula como disponível; manter bloqueios de arquivado/retirada/oculto/indisponível explícito.
- `_app.imoveis.novo.tsx`: hidratar `agency` a partir do agenciamento vinculado (`property_id`) quando houver `resume`.
- Ficha: texto do aviso baseado em `hasAgenciamento` e estado da publicação.
- Reexecutar a conclusão dos dois imóveis após a migração; atualizar regra de projeto (autorização não é critério de publicação).
