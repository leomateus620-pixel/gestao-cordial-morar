# Contrato público Morar

O contexto aceita somente `cordial` ou `morar`. Os namespaces, URLs, chaves locais e variáveis de ambiente vêm de uma tabela fechada; parâmetros do visitante não escolhem tabelas, carteira ou credenciais. As APIs Morar são `/api/morar-site/{bootstrap,properties,detail,detail-state,pages,page,leads,media/…,sitemap.xml}`.

## Campos permitidos

Imóvel: ID **público próprio do canal**, referência Morar, finalidade, tipo, cidade/bairro/UF, endereço condicionado à autorização cadastral, preço e modalidade, dormitórios/banheiros/suítes/vagas, áreas com unidades confirmadas, mobiliado/permuta/financiamento/estágio, destaque, data editorial de publicação, descrição textual, características, capa e quantidade de fotos. Detalhe acrescenta mídias autorizadas ordenadas por posição e identidade.

Mídia: ID próprio do canal, versão hash, dimensões e posição. O caminho privado do armazenamento não sai da API. Facetas retornam somente valores, contagens, cidade do bairro e estágios. Configurações são validadas pelo schema público, inclusive links HTTPS e fotografia de imóvel elegível.

A allowlist Zod é aplicada **no servidor antes da serialização**. Não retorna `PropertyDetail`, `select('*')`, códigos Cordial, IDs de fornecedor, proprietário, telefone/email privado, observações, documentos, comissão, coordenadas ou URL Maps. HTML e descrição são renderizados como texto, sem `dangerouslySetInnerHTML`.

Quando o endereço deve ficar oculto, a SQL também omite descrição/diferenciais que contenham o logradouro cadastrado, com comparação normalizada de caixa, acentos e espaços, inclusive palavras divididas por tags. Entidades HTML comuns/portuguesas e referências numéricas cobertas são decodificadas antes da decisão; entidades desconhecidas, ambíguas, aninhadas ou caracteres de controle fazem esse texto falhar fechado, sem supor como será renderizado. A busca textual não consulta esses textos privados. Essa proteção conserva cidade/bairro públicos mesmo quando seu nome coincida com um logradouro interno; não é uma autorização para apresentar endereço preciso. Correções editoriais permanecem no Gestão.

## Elegibilidade única

`morar_site_eligible` alimenta busca, facetas, destaques, detalhes, relacionados, sitemap e mídias. Exige publicação própria aprovada, confirmação de autorização e disponibilidade, conteúdo/mídia compatíveis com a revisão e ausência de estados impeditivos. Valores negativos, ocultação, rascunho, arquivamento, retirada ou cadastro Gestão não concluído bloqueiam o canal.

O vínculo ativo com Morar identifica candidatos **na ativação inicial**. Depois da aprovação própria, status/ID ImobiBrasil não é requisito para manter a oferta. Carteira de origem, código isolado ou histórico não autorizam publicação. Os mesmos imóveis compartilhados podem ter decisões e IDs públicos diferentes para cada marca.

Novos anúncios sem referência legada recebem identificação estável do canal `M-…`, preservando códigos existentes. Referência técnica `GC-…` não é promovida automaticamente. Busca exata prioriza a referência pública Morar; não sugere códigos privados Cordial.

## Contatos

`POST leads` valida payload até 10 KB, origem, consentimento, honeypot, contato, tipo/finalidade e imóvel elegível. Limites e impressão digital previnem repetição. O servidor só confirma depois de `morar_site_submit_lead` retornar persistência durável. Em erro, o formulário conserva o rascunho. Triagem protegida integra atendimento com `imobiliaria='morar'`, sem gerar cadastro comercial incompleto ao abrir página. Clique WhatsApp não equivale a mensagem recebida, visita agendada ou atendimento concluído.

## Separação e segurança

- RLS e autenticação do Gestão preservadas; tabelas/Storage originais continuam privados.
- APIs sem sessão do visitante; service role apenas no servidor, seleção explícita e autorização por objeto.
- Admin protegido e decisões auditadas; carregar tela não publica registros.
- Favoritos, rascunhos, consultas e URLs de mídia separados por marca.
- Host dedicado não aceita APIs da outra marca nem funções administrativas.
- Homologação não indexável; password opcional e ingress precisam de configuração privada.
- Sem rastreadores, publicidade, destinatários ou scripts do fornecedor anterior.

`tests/morar-site` verifica regras efetivas em PGlite e limites de serialização/HTTP. Esse banco de teste não substitui o preflight do schema remoto.
