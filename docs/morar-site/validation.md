# Validação executada — Morar

Execução local em Windows, Node, Bun 1.4.2 via `npx`, Vite e PGlite. Finalizada em 05/10/2026. Base inicial `2084471976d8e2f75e08950d8aeab2617fc67ce3`; branch `codex/morar-site-publico`. Produção foi somente lida para inventário/metadados e recuperação canônica de arquivos para revisão.

## Checks de código

| Comando                                          | Resultado executado                                                                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun run test`                                   | 401/401 passaram; zero falhas/skips                                                                                                                                                  |
| `bun run test:site`                              | 89/89 passaram; Cordial, Morar, arquivamento, allowlist, filtros, nulos, isolamento, mídia, aprovação e ativação                                                                     |
| `bun run typecheck`                              | Exit 0                                                                                                                                                                               |
| ESLint de todos os TS/TSX/MJS alterados ou novos | Exit 0; zero erros, seis avisos existentes em PropertyForm/novo                                                                                                                      |
| `bun run lint` geral                             | Executado e falhou: 121.094 erros, 24 avisos; majoritariamente CRLF/formatação do checkout e problemas existentes fora do escopo. Não houve correção global para esconder o baseline |
| `bun run build`                                  | Exit 0, cliente/SSR/Nitro gerados; sem deploy                                                                                                                                        |

O build mantém avisos de chunks grandes, diretivas `use client` de dependências e parser WASM Nitro (`Unexpected instruction: 0xfc00` do Photon), sem impedir a conclusão. A entrega de mídia foi executada no runtime Node local. Compatibilidade efetiva do artefato em Cloudflare continua sendo check de homologação, antes da ativação; build concluído não comprova runtime remoto.

Logs integrais locais estão em `.local/morar-final-{test,site,typecheck,lint-scope,build}.log`, restritos e fora da publicação. O lint geral está em `.local/morar-lint.log`.

## Integração HTTP

[Dez grupos de verificações HTTP](http-validation.md) executaram o servidor real com a migração efetiva em banco local e dados de leitura do Gestão: 308 identidades em 26 páginas, 4.623 associações de fotos, filtros combinados, referência, allowlist/SSR, cruzamento de marcas, retirada 410/mídia404, headers e duplicata de contato. Não é um catálogo de demonstração: o adapter de QA é separado, exige opt-in e nunca integra o aplicativo ou o banco remoto.

A primeira execução de contato persistiu uma fixture exclusivamente local, Morar 1/Cordial 0. Repetição HTTP imediata manteve essa contagem. Falha 503 foi provocada somente no adapter local e restaurada; a UI exibiu erro e conservou o texto. A repetição tardia do script falhou na expectativa de contagem absoluta: a fixture já estava fora da janela de dez minutos e um novo requestId criou legitimamente outro contato local. O script foi corrigido para criar uma fixture fresca por execução e conferir repetição imediata por requestId/fingerprint usando a diferença de contagem, preservando a regra comercial. Nenhum formulário externo, WhatsApp ou fila comercial foi acionado.

A repetição final corrigida aprovou dez grupos HTTP. O contato fresco elevou Morar 2→3; as repetições imediatas por mesmo requestId e mesmo fingerprint conservaram 3, com Cordial 0. O relatório falho foi arquivado antes do novo resultado, sem apagar fixtures nem mudar a janela de deduplicação. A revalidação de mídia antes da entrega também foi exercitada pelo servidor atualizado; sua corrida de retirada foi coberta pelo teste unitário dedicado.

Depois dessa verificação HTTP, a revisão encontrou codificação de entidades HTML como possível contorno à comparação de logradouro. A SQL final foi reforçada e testada em banco fresco com entidades nomeadas, numéricas, espaços, tags e referências ambíguas. Uma avaliação offline do snapshot com a SQL final identificou sete descrições a omitir; o HTTP anterior havia observado seis. O adapter já aberto não foi alterado por um canal improvisado. Os testes dirigidos da migração fresca comprovam a proteção final, sem apresentar a observação HTTP anterior como execução dessa última revisão.

## Jornadas no navegador

Chromium no navegador interno do Codex, autorizado pelo solicitante após Chrome bloquear o localhost. Viewports são emulados; não são equipamentos físicos. O zoom do host exigiu calibrar a dimensão solicitada e confirmar `innerWidth/innerHeight` no DOM.

| Jornada                     | Evidência observada                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home → filtros → resultados | Aluguel, Casa, Santa Rosa e preço máximo 2.000 retornaram sete imóveis; URL manteve filtros                                                                     |
| Cidade/bairro               | Cidade habilita bairros correspondentes; Escape recolhe painel e retorna foco a “Onde morar”                                                                    |
| Filtros móveis              | Drawer com seleções e “Ver 7 imóveis”; Escape retorna foco a “Filtros (4)”                                                                                      |
| Detalhe → galeria → voltar  | Ref. 3095 com dez fotos; ArrowRight avançou 1→2→3, Escape retornou ao acionador; retorno conservou a pesquisa de sete resultados                                |
| Paginação/visualização      | Próxima página abriu `pagina=2`; lista alterou `visualizacao=lista` preservando a página                                                                        |
| Favoritos                   | Morar preservou o imóvel selecionado; favoritos Cordial ficaram vazios                                                                                          |
| Copiar link                 | Ação anunciou “Link copiado.”; WhatsApp contém referência Morar e URL completa do próprio detalhe                                                               |
| Menu móvel                  | Destinos e WhatsApp acessíveis; Contato abriu a rota Morar                                                                                                      |
| Formulário                  | Sucesso somente após persistência local; falha mantém texto; rascunho em memória restaurado ao sair e voltar pela navegação SPA                                 |
| Nenhum resultado            | Referência exata inexistente mostrou zero resultados, orientação e link para ampliar a pesquisa                                                                 |
| Fonte e isolamento          | Fonte computada Manrope local; HTML público sem stylesheet/fontes/metadados administrativos. Não foi feita auditoria integral de todas as requisições dinâmicas |

Rascunhos são memória temporária do navegador, isolada por marca/formulário/imóvel: sobrevivem à troca de rota e retry dentro da sessão SPA, mas **não ao recarregamento completo/fechamento da página**. Nenhum dado pessoal é gravado em localStorage. A primeira renderização é determinística e mantém controles desabilitados até restaurar essa memória; os links do detalhe usam caminho consistente em SSR/primeiro render e resolvem a origem após hidratação.

A inspeção textual dos chunks JavaScript finais em `.output/public` encontrou zero nomes das variáveis de segredos de servidor (service role, rate secrets e password de homologação). É evidência adicional do bundle gerado, sem substituir revisão de configuração/segredos do runtime remoto.

As últimas regressões também verificam retirada durante download/decodificação de mídia e despacho do worker pela RPC privada com destino fixo do Vault, sem fallback por host do pedido. Falha do despachante não transforma a intenção durável em confirmação de processamento.

## Responsividade e imagens

| Viewport efetivo | Resultado observado na home                                                     |
| ---------------- | ------------------------------------------------------------------------------- |
| 360×800          | Sem overflow horizontal; botão principal até 702 px                             |
| 390×844          | Sem overflow horizontal; botão principal até 702 px; WhatsApp não cobre a busca |
| 768×1024         | Sem overflow horizontal; botão principal até 814 px                             |
| 1024×900         | Sem overflow horizontal; botão principal até 750 px                             |
| 1440×900         | Sem overflow horizontal; botão principal até 817 px                             |
| 1440×768         | Sem overflow horizontal; botão principal até 749 px                             |

Capturas em [evidence](evidence/) registram referência antiga desktop, nova home móvel, janela estreita completa, localização, resultados, drawer, menu e contato/sua falha local. O navegador interno corta a região pintada quando o viewport virtual excede o painel físico do aplicativo; capturas largas incompletas foram descartadas. As medições DOM desktop não são apresentadas como screenshot integral de 1440 px. A comparação visual ampla desktop ainda precisa de navegador com área física suficiente.

Todos os 4.791 caminhos únicos de mídia do recorte existem. Foram decodificados 358 arquivos reais, sem falha; 81 abaixo de 960 px e 18 abaixo de 480 px. Cinco galerias foram abertas e 14 fotos conferidas visualmente, respeitando capa, ordem e duas fotos do terreno quando só existem duas. Associação completa por metadados e revisão visual amostral são evidências distintas. Resolução limitada e 104 grupos de conteúdo repetido permanecem pendências, sem substituição inventada.

## Limitações e ativação

Não foram executados Firefox/WebKit, equipamentos físicos, leitor de tela, zoom de página, simulação de `prefers-reduced-motion`, auditoria WCAG integral ou Lighthouse. CSS de movimento reduzido, semântica/labels e pares de contraste foram inspecionados; isso não certifica conformidade integral. Gestos implementados não foram exercitados em aparelho de toque real. Não há métricas de campo LCP/INP/CLS nem comprovação de percentil 75.

O pacote restrito conserva a autorização explícita dos 308 candidatos e recibo factual da amostra de mídia. Schema remoto, simulação autenticada da RPC após migração, conteúdo/contatos institucionais, unidade das áreas, runtime de hospedagem e ingestão comercial ainda exigem a homologação descrita em [ativação](activation.md). Migração remota, aplicação do lote, merge, deploy e DNS não foram executados. A base local não comprova migração ou oferta ativa em produção.
