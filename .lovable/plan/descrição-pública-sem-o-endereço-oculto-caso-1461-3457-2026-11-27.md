# Descrição pública sem o endereço oculto (caso 1461/3457)

## O que muda para o usuário
Nos sites Cordial e Morar, a descrição volta a aparecer; só o nome da rua (e o número logo depois dele) é retirado do texto quando o endereço deve ficar oculto. O cadastro no Gestão não muda. Os 24 imóveis afetados passam a mostrar a descrição sozinhos, sem reenvio.

## Regras mantidas
- Cordial: endereço estruturado continua nulo; a rua nunca aparece no texto (como hoje, independe de "exibir endereço").
- Morar: sanitiza só quando "exibir endereço no site" não é "sim"; com "sim", texto integral.
- Trava de segurança: se, após a limpeza, a função atual de detecção ainda achar a rua no texto (ex.: grafia sem espaço), o texto vira vazio (descrição) ou nulo (pontos fortes), exatamente como hoje. Nunca vaza.
- Se não sobrar conteúdo útil (só pontuação/conectores), fica vazio.
- Características, fotos, preço, publicação e demais campos: intocados.

## Migração 0122 (aditiva, sem alterar dados)
Próximo número livre do journal é 0122 (último aplicado: 0121). A regra ".." reservada como 0116 segue reservada por nome; se 0116 já estiver ocupado no journal na hora de aplicar, uso o próximo livre e registro.

1. Novas funções `public.cordial_site_strip_hidden_address(p properties, _text text)` e `public.morar_site_strip_hidden_address(...)` (IMMUTABLE, search_path=public):
   - Se `*_has_hidden_address(p,_text)` é falso → devolve `_text` intacto.
   - Monta um padrão a partir do logradouro: cada letra vira classe que aceita maiúscula/minúscula e acentos (a→[aáàâãäAÁ…]), espaços viram `\s*`, caracteres especiais escapados; aceita prefixo opcional (Rua, R., Av., Avenida, Travessa, Alameda, Rodovia, Estrada) e sufixo opcional de número (`, nº 123`, `n. 123`, `123`, `s/n`).
   - Remove todas as ocorrências (regexp_replace 'gi'), depois normaliza: espaços duplos, vírgula/ponto órfãos, "na ," / "à ." residuais, parênteses vazios, linhas vazias repetidas.
   - Trava final: se `*_has_hidden_address(p, resultado)` ainda for verdadeiro → ''. Se o resultado sem pontuação ficar com menos de 3 letras → ''.
   - GRANT EXECUTE igual às funções `*_has_hidden_address` atuais.
2. `CREATE OR REPLACE VIEW public.cordial_site_eligible` e `public.morar_site_eligible` copiando a definição vigente do banco (lida via `pg_get_viewdef` antes de escrever, conferida contra 0086 + alterações posteriores), trocando só:
   - `descricao_imovel`: `CASE WHEN has_hidden THEN '' ELSE ...` → `strip_hidden_address(p.*, p.descricao_imovel)`.
   - `pontos_fortes`: mesmo, com `nullif(strip(...),'')` para manter NULL quando vazio.
   - Mesmas colunas, mesma ordem e tipos (requisito do CREATE OR REPLACE); `*_site_documents`, busca e bots (0095 lê `e.descricao_imovel` das views) herdam sem mudança.
3. Confirmar por leitura que nenhum outro ponto público (server de páginas, sitemap, bots, src/lib/cordial-site e morar) monta descrição direto de `properties`; se houver, aplicar a mesma função.

## Testes
- `tests/cordial-site/public-data.test.ts`: texto só com endereço → description vazia, address nulo; descrição longa citando a rua com número → resto presente, sem rua nem número; variação com acento/maiúsculas; grafia colada sem espaço → trava zera.
- Equivalente Morar (teste de dados públicos Morar existente ou novo no mesmo padrão): `exibir_endereco_site` ≠ 'sim' sanitiza sem apagar tudo; = 'sim' integral.
- `scripts/morar-site/verify-local.mjs` (linha ~355): trocar "description vazia" por "não contém a rua"; manter a checagem de não vazamento.
- Rodar suítes de dados públicos e publicação das duas marcas; relatar números.

## Aplicação e conferência (após testes passarem)
- Aplicar a migração neste banco.
- Só leitura: `properties.descricao_imovel` do 1461 segue com 1.357 caracteres; `cordial_site_documents`/`morar_site_documents` de 1461/3457 com description não vazia e sem o logradouro; recontagem dos 17+9 anúncios: quantos agora têm description e nenhum contém a rua; fotos (14) e preço iguais.
- Não publicar.

## Riscos e reversão
- Risco: texto com a rua escrita de forma inesperada → a trava zera a descrição (comportamento atual), sem vazamento.
- Hash de conteúdo das publicações pode mudar por ser view; não dispara reenvio.
- Reversão: nova migração recriando as views com o `CASE` anterior.
