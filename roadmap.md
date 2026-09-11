
## Novo (09/09)
- [x] Enviar ao Imobi o corretor que agenciou e o proprietário (códigos internos do provedor). Pendente: nomes sem correspondência no cadastro do site (ex.: "Ricardo Caetano", "Felipe") e proprietários ainda não cadastrados lá.

- [x] Organizar fotos (arrastar/ordenar): eliminar demora e fotos que voltam para o lugar antigo; validar para corretor, secretaria e admin.

- [bloqueado] Importar contato de proprietário do Imobi — API não expõe o vínculo imóvel↔cliente (codigoProprietario sempre 0). Evidência: docs/IMOBI-PROPRIETARIO-CONTATO.md. Depende do suporte ImobiBrasil liberar o campo no token.

## Novo (10/09)
- [x] Proprietário sumido nos painéis Cordial/Morar: fila de alterações cancelada (278 jobs) e trava `imobi_update_sync_paused` ligada. Evidência e pedido ao suporte em docs/IMOBI-PROPRIETARIO-SUMICO-10-09-2026.md + lista de 543 imóveis alterados.
- [ ] Aguardando suporte ImobiBrasil: restaurar vínculos de proprietário e liberar `codigoProprietario` no GET. Só depois religar as alterações automáticas.

## Novo (11/09)
- [x] Suporte confirmou que `POST /imovel/alterar` zera campos omitidos. Envio agora lê o imóvel antes de alterar e reenvia proprietário/corretor; códigos guardados em `property_provider_publications`. Novo `GET /pessoa/dados/{codigo}` alimenta contato do proprietário na ficha interna.
- [x] Resposta pronta ao suporte em `/mnt/documents/resposta-suporte-imobibrasil-11-09-2026.md` + listas v2 com colunas para eles devolverem os códigos restaurados.
- [ ] Religar `imobi_update_sync_paused` só após teste de alteração em 1 imóvel de cada site (depende de o GET devolver o código real).
