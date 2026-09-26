# Restabelecer o site público Cordial (/site)

## Causa confirmada (leituras feitas agora)
- `GET https://cordialgestao.com/api/cordial-site/bootstrap` responde **503** "serviço temporariamente indisponível".
- No banco publicado: **0 tabelas, 0 funções `cordial_site_*`** e nenhuma migração `20260926…` registrada. A migração `20260926020000_cordial_owned_site.sql` da PR #27 **não foi aplicada**.
- O segredo **`CORDIAL_SITE_RATE_SECRET` não existe** no projeto. Como a chave de serviço está disponível no servidor, o bootstrap passa pelo limitador (`limit()` em `http.server.ts`), que lança erro sem esse segredo. Ou seja, são **duas causas somadas**: falta a estrutura no banco e falta o segredo do limitador.
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já são fornecidos pelo backend; não é preciso configurá-los manualmente nem usar prefixo VITE_.

## O que será feito
1. **Conferência antes de aplicar**: ler a migração inteira e os documentos (operations, contract, media-cache, validation), e checar se ela depende de objetos existentes (tabela de imóveis, bucket `property-images`, funções de papel). Registrar como desfazer (apagar só os objetos `cordial_site_*` criados). Não há homologação separada: um só backend serve teste e produção. A migração será validada antes no banco de teste local (PGlite, `tests/cordial-site`).
2. **Aplicar a migração** pelo mecanismo oficial, com o conteúdo sem alterações. Se algo falhar ou houver divergência de esquema, criar uma migração corretiva versionada. Nada será apagado nem recriado.
3. **Conferir os objetos** por consulta: settings com o registro inicial, publications, media, pages, leads, audit, rate_limits, redirects, as views eligible, documents e authorized_media, as funções search, facets, take_rate e submit_lead, além de RLS, permissões e políticas.
4. **Criar `CORDIAL_SITE_RATE_SECRET`** com um valor aleatório gerado pelo sistema, que nunca aparece. Não configurar `CORDIAL_SITE_TRUSTED_IP_HEADER`, porque não há confirmação de que o proxy sobrescreve esse cabeçalho. Manter `VITE_CORDIAL_SITE_PUBLIC_HOST` vazio e o site em /site, sem indexação.
5. **Catálogo vazio correto**: confirmar que, sem anúncios aprovados, `/site` abre com o estado "nenhum imóvel" e não com a tela de indisponível. Se isso não acontecer, fazer um ajuste mínimo no código. Nenhum imóvel será aprovado. Os 855 registros, os exclusivos da Morar, preços, códigos, proprietários e o estado da ImobiBrasil ficam intactos.
6. **Validar**: tipagem, suíte completa e testes do site (`tests/cordial-site`). Em seguida, publicar pelo fluxo existente.
7. **Conferência no endereço publicado**: `/site` sem erro, bootstrap 200, busca 200 com lista vazia, `/site-administracao` exigindo login e o caminho Configurações → Site público Cordial → Abrir homologação. Verificar também que o HTML e o JSON não trazem dados privados nem URLs assinadas, que uma mídia inexistente ou retirada responde 404, e tirar uma captura real da página. O formulário de contato não será enviado em produção; a validação fica só nos testes locais.

## Entrega
Causa, migração aplicada (backend único de produção), segredo criado (sem valor), testes e resultados, link, captura e pendências separadas:
- **Editoriais/comerciais**: aprovar anúncios e fotos no painel e revisar os textos das páginas.
- **Técnicas**: cabeçalho de IP confiável e os 8 achados de segurança já existentes.

## Detalhes técnicos
- Migração: `supabase--migration` com o SQL do arquivo, sem nenhuma alteração. O segredo é criado por `generate_secret` (64 caracteres).
- Só depois disso haverá mudança de código, e somente se a validação apontar a necessidade.
