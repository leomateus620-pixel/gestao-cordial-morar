# Imobi OFF — execução contínua das etapas 1 a 5

Executar sem pausas as etapas 1 a 5 do plano aprovado. A etapa 1 já começou com a barreira OFF; agora seguem as demais. Nada é publicado, e NFS-e, boleto e dados fora do escopo ficam como estão.

## Etapa 1 — Inventário "antes" (somente leitura)
- Tirar um retrato por imóvel: IDs, códigos, status, publicações Cordial/Morar, quantidade e ordem das fotos, capa, vídeos, arquivamento e estado Imobi legado, com checksum por imóvel.
- Guardar o retrato como arquivo interno de auditoria. Nenhuma alteração de dados.

## Etapa 2 — Barreira Imobi OFF completa
- Completar a barreira em todas as rotinas de fundo: workers, ganchos, crons, retries, importação e scripts que falam com a Imobi. A verificação acontece antes de ler credenciais e antes de cada envio.
- Estacionar ou cancelar só os trabalhos externos pendentes da Imobi, com motivo registrado e liberação dos bloqueios em andamento. Rotinas locais continuam rodando: Drive, fotos, Realce e vitrines.
- Teste: com token configurado, nenhuma chamada sai.

## Etapa 3 — Sites próprios sem depender da Imobi
- Fazer a sincronização do site Cordial (e conferir a da Morar) usar os dados do próprio Gestão, e não mais o status ou o ID da Imobi.
- Publicar ou retirar cada marca separadamente, com permissão conferida no servidor por usuário, imóvel e marca, controle de revisão e proteção contra pedidos repetidos.
- Cadastro, conclusão do cadastro e códigos deixam de acionar o envio antigo. O agenciamento automático continua sem duplicar.
- Mudanças no banco: só acréscimos, pelo histórico oficial de migrações.

## Etapa 4 — Retirada, arquivamento e reativação
- A retirada só é confirmada pelo canal próprio de cada marca. Destinos da Imobi passam a contar como histórico desligado, e não como pendência.
- Reativar um imóvel não volta a publicar sozinho. Nenhuma foto ou arquivo é apagado.

## Etapa 5 — Tela
- Em Imóveis: mostrar o estado real por marca (publicado, retirado, pendente), com links para cordialimoveis.com e imobiliariamorarimoveis.com.br, e a Imobi como "Desligada (histórico)".
- Retirar ou desativar os botões e avisos que ainda chamam a Imobi.

## Verificação
- Testes com dados de exemplo, sem anúncios reais: OFF com token presente, publicação por marca, permissões, pedidos simultâneos, arquivamento/reativação, inventário preservado e rotinas locais funcionando.
- Inventário "depois" comparado com o "antes" (checksums), build e tela conferidos na prévia.
- A etapa 6 (inventário final formal, deploy e domínios) fica para depois, mediante autorização.

## Detalhes técnicos
- `integration-switch.ts` vira a única fonte do estado OFF. Os hooks em `/api/public/hooks/*` que tratam a Imobi retornam "disabled" sem consultar a fila externa.
- Uma nova RPC/migração aditiva troca a dependência de `cordial_site_sync_property` em `property_provider_publications` pela decisão do canal `cordial_site_*`. Os dados legados ficam preservados.
- `finalizePropertyRegistration` e os gatilhos de códigos deixam de enfileirar jobs da Imobi. A chave `property:<id>:initial-agency-listing` continua idempotente.
- Fila: trabalhos externos marcados como `parked` com motivo `imobi_off` e os leases liberados. Trabalhos locais seguem intactos.
