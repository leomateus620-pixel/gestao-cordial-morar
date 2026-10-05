# Site Morar não carrega — correção (Partes A e B aprovadas pelo Leonardo)

## Causa confirmada
- `/site-morar` mostra "Não foi possível carregar esta página" porque as consultas do site Morar retornam 503.
- As tabelas e funções do site Morar (`morar_site_*`) não existem no banco; a preparação `supabase/migrations/20261004150000_morar_owned_site.sql` nunca foi aplicada.

## O que será feito
1. Aplicar a preparação completa do site Morar (Partes A e B juntas):
   - A: tabelas, funções de leitura/busca/contato/limite, permissões e configuração inicial.
   - B: gatilhos de sincronização em imóveis/fotos e substituição dos gatilhos de marca d'água.
   - Antes de aplicar, conferir que tudo que ela usa já existe no banco (por exemplo a coluna `registration_completed_at`, funções de marca d'água); ajustar só o necessário para não falhar, sem mudar o comportamento.
2. Conferir que nenhuma foto foi marcada para reprocessamento pela aplicação em si (contagem de fotos pendentes antes e depois).
3. Conferir `/api/morar-site/bootstrap` (esperado 200) e abrir `/site-morar` e `/site-morar/buscar` no navegador.
4. Se o catálogo vier vazio, ajustar a mensagem para não parecer erro.
5. Rodar testes (`test`, `test:site`) com TZ=America/Sao_Paulo e o type check.

## Fora do escopo
- Lote de aprovação dos 308 imóveis (site abrirá sem imóveis até ser aplicado) — pedido separado.
- Não publicar, não enviar nada aos sites ImobiBrasil, não alterar imóveis, fotos ou integrações.
