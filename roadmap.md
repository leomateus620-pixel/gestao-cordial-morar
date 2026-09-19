
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

## Novo (15/09)
- [x] NFS-e Aluguéis: dados fiscais gravados (Cordial 42.767.687/0001-35 "Cordial Imoveis LTDA"; Morar 35.080.386/0001-73 "Bruna Weremchuk"; NBS 1.1001.21.00, item 10.05, ISS 3%, Simples Nacional nas duas).
- [bloqueado] Teste de emissão na prefeitura: as duas marcas retornaram "Acesso Negado" (401) — a senha do webservice salva não foi aceita. Precisa confirmar/regenerar a senha de webservice no Portal do Cidadão (menu NFS-e → Webservice), que não é a senha de acesso ao portal, e recadastrar nos segredos.
- [ ] Completar CPF/CNPJ de 2 locatários ativos (Alice Dezotti Freitas — sala 704; Caroline Fagundes/Fagundes Estética e Saúde Ltda — sala 502, ambos Morar/Clínica Cordis).

## Novo (19/09) — duplicação de anúncios e tempestade de fila de fotos
- [x] Leitura da lista do site tolerante a todos os formatos reais (`resultSet.total_data`, `root.data`, `root.imoveis`, etc.) — antes um formato não reconhecido fazia o sistema "não ver" o anúncio existente e criar outro.
- [x] Criação com trava por imóvel/site (lease de 180s no banco): dois processos simultâneos nunca chamam `/imovel/inserir` duas vezes.
- [x] Criação sem resposta (timeout/rede/5xx) entra em conferência por leitura; só cria de novo após 3 leituras confirmando ausência, e nunca se houver mais de um anúncio na referência.
- [x] Editar, adicionar ou reordenar fotos nunca cria anúncio: publicar em imóvel já publicado vira atualização, e sem código remoto com histórico vira reconciliação.
- [x] Fila de fotos coalescida: no máximo um envio pendente por imóvel/site, sempre na última versão da galeria (índice único no banco + rotina de acompanhamento).
- [x] Duplicidade registrada e exibida na tela de Integrações (somente leitura); enquanto existir, nenhum cadastro novo é criado.
- [ ] Remover no painel dos sites as fotos repetidas dos imóveis 1381/3380, 1373/3372 e 1374/3373 (manter a versão com a foto aérea demarcada). Bloqueado: a API só permite listar e inserir fotos, e o sistema não tem o código remoto de cada imagem para apagar com segurança — a exclusão precisa ser manual, com conferência visual.
- [ ] Teste final em imóvel controlado (editar + 3 fotos + reordenar) — aguardando o imóvel que pode ser usado.
