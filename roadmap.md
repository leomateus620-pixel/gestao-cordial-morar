
## Novo (09/09)
- [x] Enviar ao Imobi o corretor que agenciou e o proprietário (códigos internos do provedor). Pendente: nomes sem correspondência no cadastro do site (ex.: "Ricardo Caetano", "Felipe") e proprietários ainda não cadastrados lá.

- [x] Organizar fotos (arrastar/ordenar): eliminar demora e fotos que voltam para o lugar antigo; validar para corretor, secretaria e admin.

- [bloqueado] Importar contato de proprietário do Imobi — API não expõe o vínculo imóvel↔cliente (codigoProprietario sempre 0). Evidência: docs/IMOBI-PROPRIETARIO-CONTATO.md. Depende do suporte ImobiBrasil liberar o campo no token.

## Novo (10/09)
- [x] Proprietário sumido nos painéis Cordial/Morar: fila de alterações cancelada (278 jobs) e trava `imobi_update_sync_paused` ligada. Evidência e pedido ao suporte em docs/IMOBI-PROPRIETARIO-SUMICO-10-09-2026.md + lista de 543 imóveis alterados.
- [ ] Aguardando suporte ImobiBrasil: restaurar vínculos de proprietário e confirmar se /imovel/alterar zera campos omitidos. Só depois religar as alterações automáticas.
