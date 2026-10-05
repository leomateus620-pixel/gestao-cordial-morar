# Site Morar não carrega — diagnóstico e correção

## O que foi verificado
- `/site-morar` mostra "Não foi possível carregar esta página" porque todas as consultas do site Morar (`/api/morar-site/bootstrap`, `/properties`) retornam 503.
- Causa confirmada: as tabelas e funções do site Morar (`morar_site_*`) **não existem no banco**. Só as do site Cordial (`cordial_site_*`) existem.
- O arquivo de preparação do banco `supabase/migrations/20261004150000_morar_owned_site.sql` está no projeto, mas nunca foi aplicado. O próprio README do site Morar diz que a ativação do banco ficou pendente.
- Não é falha de código da página nem do servidor: o código está pronto, falta a estrutura no banco.

## Riscos de aplicar essa preparação como está
Além de criar as tabelas novas do Morar, ela:
1. Grava a configuração inicial do site Morar (1 linha nova).
2. Cria gatilhos novos em imóveis e fotos (atualizações passam a sincronizar o site Morar).
3. **Substitui gatilhos existentes de marca d'água das fotos** (`property_image_desired_watermark_on_insert`, `property_targets_mark_images_pending`). Isso pode marcar fotos como pendentes de reprocessamento quando os destinos do imóvel mudarem — mexe no fluxo de fotos, que está fora do escopo sem autorização.
4. Não popula imóveis: o site abrirá sem nenhum imóvel até o lote de aprovação (308 candidatos) ser aplicado separadamente.

## Proposta (aguarda decisão do Leonardo)
1. Separar a preparação em duas partes:
   - **Parte A (só acréscimos, segura):** tabelas, funções de leitura/busca/contato/limite, permissões e configuração inicial do Morar. Sem tocar em gatilhos de fotos/imóveis existentes.
   - **Parte B (sincronização e marca d'água):** gatilhos em `properties`/`property_images` e substituição dos gatilhos de marca d'água — fica para aprovação separada.
2. Aplicar a Parte A. Resultado: `/site-morar` volta a abrir (página inicial, busca e contato), sem imóveis ainda.
3. Melhorar a mensagem quando o catálogo estiver vazio, para não parecer erro.
4. Conferir no navegador `/site-morar`, `/site-morar/buscar` e `/api/morar-site/bootstrap` (esperado 200).
5. Rodar testes (`test`, `test:site`) com TZ=America/Sao_Paulo e o type check.

Não publicar, não enviar nada aos sites ImobiBrasil, não alterar fotos, imóveis ou integrações.

## Decisões necessárias
- Aprovar Parte A agora?
- Parte B e o lote de 308 imóveis: aplicar depois, em pedido separado?
