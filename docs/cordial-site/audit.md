# Auditoria e reconciliação

## Estado inicial e arquitetura

Inspeção iniciada em 25/09/2026, fuso America/Sao_Paulo. Branch inicial `main`, commit `8ea1de5fbc23778d7941500db1b906589fc9c04b`, igual a `origin/main` após fetch. Única alteração local inicial: `package-lock.json` não rastreado, preservado. Branch de trabalho: `codex/cordial-site-publico-premium`. Nenhum `AGENTS.md` encontrado.

Stack confirmada: React, TypeScript, Vite, TanStack Start/Router/Query, Tailwind/Radix e Supabase. Foram examinados rotas de imóveis, hooks, funções autenticadas, filtros, tipos, catálogo, entrega e processamento de imagens, publicação ImobiBrasil, layout raiz, autenticação, permissões, atendimento, configurações, migrações e CI. Não houve migração de framework.

`properties_catalog` é uma visão interna extensa. Seu fallback de carteira quando não há vínculos de fornecedor não é autorização pública. Listagem e detalhe internos mantêm autenticação. `property_provider_publications` pode incluir as duas marcas independentemente da origem. `property_images` usa armazenamento privado e assinaturas temporárias; `position = 0` governa a capa. As imagens processadas têm política de marca-d’água versionada. Nenhuma dessas tabelas ou buckets foi aberta ao visitante.

Fluxo novo: cadastro canônico no Gestão → decisão explícita no canal próprio → visão de elegibilidade → projeção pública permitida → SSR/API paginada → mídia autorizada por objeto → interesse persistido em fila privada → triagem explícita para atendimento. Estado e falha ImobiBrasil não participam da elegibilidade do novo canal.

Reaproveitado: banco/cadastro, imagens e processamento, autenticação e permissões, atendimento e stack. Isolado: layout, CSS, DTO, consultas, APIs, mídia e publicação pública. Criado: decisões do canal próprio, aprovação das mídias, conteúdo/configurações, fila de contatos, auditoria, limites e mapa de redirecionamentos. O provider de notificações/sessão foi deslocado da raiz compartilhada para `_app`; o middleware autenticado continua nas funções internas.

## Inventário autenticado completo

Fonte: backend do Gestão acessado com a conta fornecida, respeitando RLS. Script `inventory.mjs`: paginação por `id`, 500 registros por lote, deduplicação e duas varreduras completas com SHA-256 idêntico para as três entidades. Isso verifica estabilidade observada entre leituras, sem alegar uma transação histórica atômica do banco remoto.

Leitura estável concluída em **26/09/2026 01:18:50 UTC** (25/09, horário local). Relatórios detalhados restritos em `.local/cordial-site-audit/`; esse diretório é ignorado pelo Git.

| Medida                                     |           Resultado |
| ------------------------------------------ | ------------------: |
| Imóveis internos                           |                 855 |
| Origem Cordial / Morar                     |           549 / 306 |
| Venda / aluguel                            |           751 / 104 |
| Vínculo Cordial habilitado no fornecedor   |                 527 |
| Somente Morar habilitada                   |                 305 |
| Compartilhados habilitados                 |                  46 |
| Rascunhos / arquivados / estado de remoção | 0 / 0 / todos nulos |
| Exibição sim / não                         |             853 / 2 |
| Autorização nula / negada / afirmativa     |        805 / 50 / 0 |
| Disponibilidade nula / `sim`               |             849 / 6 |
| Registros de publicação de fornecedor      |                 879 |
| Imagens canônicas                          |              12.110 |
| Imóveis sem imagens                        |                  29 |

Essas categorias se sobrepõem; não devem ser somadas. Vínculo no fornecedor, origem e visibilidade são evidências para revisão, não autorização automática do canal novo. Não se pode afirmar que 527 ou 855 serão publicáveis. A migração cria **zero anúncios publicados**.

Há 16 valores de tipo não nulos, incluindo categorias pouco representadas no menu antigo (Pavilhão, Terreno Rural, Sítio e outras), além de 3 registros sem tipo. Todos os quatro campos de unidade auditados estavam nulos; área não é publicada como m² sem conferência explícita. `acomodacoes` permanece sem equivalência presumida com dormitórios.

## Site de referência

Fontes: [home](https://www.cordialimoveis.com/), [busca completa](https://www.cordialimoveis.com/buscar), [catálogo](https://www.cordialimoveis.com/imovel/) e [detalhe observado](https://www.cordialimoveis.com/imovel/4358914/casa-venda-santa-rosa-rs-bairro-central-loteamento-vargas). A navegação desktop/móvel, estados e limites estão na matriz. Nenhum formulário real foi enviado.

O script `reconcile.mjs` percorreu os links reais de paginação: **35 páginas, 509 IDs externos distintos**, em duas varreduras estáveis. Leu os **509 detalhes**, com listas de fotos identificadas em todos. O total de anúncios continua diferente do inventário interno. A distribuição preparatória de 459 vendas e 50 locações deve ser lida no relatório por operação, não tomada como meta de importação.

Reconciliação por relação existente `provider = cordial + external_property_id → property_id`: **509 correspondências confirmadas**, nenhuma fusão por nome/endereço/referência. Restam **346 registros internos sem presença confirmada nesse site**, o que inclui outros escopos e não prova ausência indevida. Código e operação coincidiram nos 509. Foram encontradas **2 divergências de preço e 29 de quantidade de fotos**.

Limitações explícitas: o detalhe observado não mostrou descrição completa, e o seletor de descrição não encontrou corpo nos 509 HTMLs; não se afirmou equivalência de descrições. Áreas, disponibilidade comercial e identidade visual/capa/ordem das fotos continuam marcadas como pendências individuais. URLs e nomes de arquivos não são usados como prova de identidade binária. Não houve registro sem vínculo confirmado que justificasse recuperar cadastros do fornecedor. Não foi executada importação.

## Imagens

`audit-media.mjs` conferiu todos os caminhos referenciados por metadados de Storage: **13.432 caminhos únicos**, **879 prefixos**, **zero prefixos com falha**, **13.432 presentes**, **zero caminhos externos**, **zero imóveis com posições duplicadas**, **zero galerias com fotos sem posição zero**. Detectou 913 grupos de ETag repetido; isso é candidato à revisão de duplicidade, sem exclusão automática e sem presumir que fotos compartilhadas são erro.

Das imagens, 11.448 têm estado `legacy`, 662 `ready` com marca combinada. Há 11.448 sem dimensões cadastradas e 22 com maior dimensão conhecida abaixo de 800 px. Conferir metadados não equivale a decodificar visualmente todo o acervo. Para testes locais foram baixadas 469 imagens de 30 registros já vinculados a anúncios públicos, diretamente do armazenamento do Gestão, sem recuperação no fornecedor.

## Conteúdo e ativos

Logo branco extraído sem redesenho do ativo oficial de marca-d’água do próprio repositório. Fonte Manrope variável auto-hospedada, licença OFL incluída. Nenhuma fotografia inventada ou de banco de imagens; nenhuma remoção ou duplicação de marca-d’água. Teal/mint da identidade observada e superfícies claras quentes são tokens exclusivos do site. Contatos do site antigo foram evidência de auditoria; não foram gravados como configuração de produção.
