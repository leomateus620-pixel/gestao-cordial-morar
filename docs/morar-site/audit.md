# Auditoria de dados e reconciliação

## Baseline e escopo

Checkout inicial: `codex/cordial-site-publico-premium`, commit `2084471976d8e2f75e08950d8aeab2617fc67ce3`, equivalente ao `main` remoto na inspeção. O único arquivo local não rastreado era `package-lock.json`; foi preservado e não incluído na entrega. Instruções `AGENTS.md` foram lidas antes das alterações.

Arquitetura confirmada: React, TypeScript, Vite, TanStack Start/Router/Query, Tailwind/Radix, Supabase. A superfície Cordial já tinha contrato público, aprovação de mídia, CMS protegido e rotas próprias. Foram reaproveitados esses mecanismos com contexto fechado `cordial | morar`, mantendo dados canônicos e separando decisões do canal.

Leituras autenticadas respeitaram RLS. Não houve escrita no banco de produção, importação, aplicação de migrações, mudança de autorização canônica, envio de contatos ou disparo operacional de filas.

## Inventário integral

Executado em 04/10/2026, horário de São Paulo (`2026-10-05T02:03:44.599Z` a `02:04:09.759Z`). Script `scripts/morar-site/inventory.mjs`: keyset por UUID, páginas de até 500, deduplicação e duas varreduras completas iguais das três entidades. Se os hashes divergirem, o script repete até três vezes e não declara estabilidade.

| Conjunto                                          | Total observado |
| ------------------------------------------------- | --------------: |
| Imóveis canônicos acessíveis                      |             868 |
| Vínculos de provedor                              |             903 |
| Fotos canônicas                                   |          12.291 |
| Intenção Morar ativa/habilitada/visível           |             363 |
| Exclusivos Morar entre os vínculos ativos         |             305 |
| Compartilhados autorizáveis entre vínculos ativos |              58 |
| Candidatos sem bloqueios impeditivos              |             308 |
| Candidatos com autorização/disponibilidade nulas  |             308 |
| Venda entre os candidatos                         |             275 |
| Locação entre os candidatos                       |              33 |
| Fotos desses candidatos                           |           4.623 |
| Candidatos sem foto                               |               0 |

Os 55 outros vínculos Morar ativos têm bloqueios. A classificação dos 868 registros produziu 560 exclusões; os motivos podem se sobrepor: ausência de intenção Morar ativa 505, autorização negativa 63, cadastro Gestão incompleto 63, arquivado 1, em retirada 1, oculto 2. O relatório restrito conserva o resultado individual e a identidade canônica. Não se deve somar os motivos como grupos disjuntos.

O solicitante autorizou **“Pode exibir esses imóveis no site.”**, em resposta à anotação sobre os 308 candidatos com campos nulos. A ativação preparada registra essa autorização para o conjunto específico. A implementação não muda a semântica global de valores nulos nem converte autorização negativa em positiva.

Há apenas um destaque cadastrado e 12 casas para locação entre os candidatos. As seções mostram até seis resultados reais; o destaque único recebe composição própria, sem completar a seção com destaques fictícios.

Hashes SHA-256 das varreduras estáveis:

```text
properties: ab45d6a9f81be540e10bbe1cc7da99ee320c9e3c7424adc1a56e68f65975cf00
property_provider_publications: b26e8ea03f000c78d80142c796732b37ef44a0a21027763ffdde600f6d6e116f
property_images: 9871d2e6b416f817797dabc090a3927e1545f55d76b7fc36b7138a2b9174ad4e
```

## Mídia

Auditoria completa de metadados em `2026-10-05T02:10:19.780Z`: 4.623 associações, 4.791 caminhos únicos de originais/derivados/miniaturas, 315 prefixos consultados no armazenamento privado. Todos os 4.791 caminhos existem; zero erros de prefixo, caminhos ausentes, links externos, capas ausentes ou posições duplicadas detectados. Foram encontrados 104 grupos de conteúdo repetido, preservados para análise; isso não autoriza unir imóveis nem apagar fotos.

Estados: 4.539 fotos legadas e 84 processadas com marca composta. O site só entrega mídia aprovada no canal e não aplica outra marca sobre foto já aprovada. Esta auditoria comprova existência e associação por metadados; não comprova decodificação de todos os arquivos, resolução de todos os originais nem equivalência visual integral com o fornecedor.

Uma segunda verificação decodificou os **358 arquivos reais** baixados para QA: capas dos 308 candidatos e cinco galerias completas, sem erro. Desses arquivos, 81 têm largura abaixo de 960 px e 18 abaixo de 480 px; larguras de 335 a 1.400 px. Três metadados de Content-Type não coincidem com os bytes JPEG. A entrega identifica o formato pelos bytes e não amplia arquivos pequenos. A revisão visual amostral abriu 14 fotos em cinco galerias, incluindo compartilhado, venda, aluguel, apartamento e terreno. O recibo restrito foi incorporado ao preparo; não equivale à decodificação ou revisão visual das 4.623 fotos.

Na revisão inicial, seis descrições importadas continham o logradouro que o cadastro manda ocultar, após normalização de acentos, caixa e espaços. A revisão final acrescentou decodificação de entidades HTML e comparação de palavras divididas por tags: a avaliação offline dos 308 metadados identificou **sete descrições** a omitir, zero entidades ambíguas e zero diferenciais adicionais retirados. A projeção pública omite esses textos antes da resposta e da hidratação, sem alterar o cadastro original. Busca textual usa apenas tipo, cidade e bairro autorizados. Os casos individuais permanecem no relatório restrito para revisão editorial.

## Site antigo e URLs

`scripts/morar-site/reconcile.mjs` percorreu duas vezes todas as 26 páginas, encontrando 374 anúncios com conjuntos iguais, e leu os 374 detalhes. Foram observados descrição e lista de fotos em todos. A extração remove CSS/scripts e preserva separação de linhas da descrição.

| Resultado                                                                               | Total |
| --------------------------------------------------------------------------------------- | ----: |
| Correspondência confirmada por vínculo externo ou `source=morar_api/source_property_id` |   338 |
| Anúncios sem vínculo confirmado ao Gestão                                               |    36 |
| Imóveis com intenção Morar ativa sem correspondência confirmada ao site antigo          |    26 |
| Divergências de referência / operação                                                   | 0 / 0 |
| Divergências de preço                                                                   |     1 |
| Divergências de quantidade de fotos                                                     |    23 |
| Divergências de descrição normalizada                                                   |    27 |

Números de referência, títulos, endereço ou nomes de arquivo não foram usados para fundir identidades. O conjunto antigo não é a meta de publicação. Disponibilidade, semântica das áreas, equivalência binária das fotos, capa e ordem visual antigas permanecem pendências explícitas; o relatório não afirma reconciliação comercial integral.

O relatório restrito em `.local/morar-site-audit/reconciliation.json` conserva caminhos antigos, identidade confirmada e divergências. Prepare redirecionamentos específicos apenas para relações únicas e publicação aprovada. O guard consulta `morar_site_redirects`, verifica elegibilidade e retorna redirecionamento permanente 308; imóveis retirados retornam 410. Não foi importado conteúdo antigo nem criado redirecionamento genérico para a home.

## Evidências restritas

Os JSONs integrais estão em `.local/morar-site-audit`, ignorado por Git e fora de `public/`. Contêm IDs internos, caminhos e dados comerciais que não devem ser hospedados junto ao site. Guarde-os em acesso restrito da Cordial/Morar se necessários para a ativação, com hashes e data. Credenciais foram usadas exclusivamente em variáveis de processo, sem inclusão nesses relatórios.
