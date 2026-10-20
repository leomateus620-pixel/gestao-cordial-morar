# Upgrade da Vistoria — registro de validação

Base conferida: `c6a53a3d3f14a397637847fa973062b28382bba2`, HEAD de `main` no início. Branch: `codex/vistoria-campo-segura`. Não havia alterações locais nem implementação posterior no remoto consultado.

## Evidência e limites

A captura fornecida e as cinco páginas do PDF original foram inspecionadas. Esses materiais não demonstram interação autenticada, comportamento de teclado nem duplicidade de cadastros. As imagens de evidência desta pasta e o laudo de demonstração usam somente fixtures fictícias. O PDF e a captura privados fornecidos pelo usuário não foram adicionados ao repositório.

As capturas abaixo foram obtidas no navegador antes da interrupção do acesso, a 390 × 844 CSS px, com as rotas do commit base e transporte isolado. O shell global não participa desse harness; portanto elas não representam uma repetição autenticada da captura original.

| Contexto anterior                                      | Captura                                |
| ------------------------------------------------------ | -------------------------------------- |
| Criação em página longa                                | [Abrir](antes-criacao-390.png)         |
| Ambiente e avaliações expandidas                       | [Abrir](antes-ambiente-390.png)        |
| Relato distante da ação                                | [Abrir](antes-relato-390.png)          |
| Texto de Sala ainda no editor após trocar para Cozinha | [Abrir](antes-relato-contexto-390.png) |
| Revisão anterior                                       | [Abrir](antes-revisao-390.png)         |

**Capturas finais e comparação nos mesmos viewports ainda pendentes.** A ferramenta passou a retornar “Local browser use is disabled in Work settings”. O usuário ativou explicitamente Uso do navegador local e comprovou por captura. O bloqueio persistiu mesmo depois de reiniciar a sessão de automação. Não foi contornado por outro mecanismo. Uma captura incompleta da lista e outra com dimensões incorretas foram excluídas da entrega.

## Implementado e validado

- Rascunhos locais transacionais por conta/vistoria/ambiente/item, com overlay durante refetch, debounce, serialização, revisão otimista e decisão explícita em conflito. Versões deslocadas por outra aba são preservadas; reconhecimento de geração não remove a edição de outra aba.
- Shell contextual compartilhado pela criação e execução; política única para navegação/assistente. Central compacta com continuação, filtros em painel e agregação SQL sob o mesmo escopo RLS.
- Criação em quatro etapas recuperáveis, busca protegida de respostas atrasadas, seleção por ID e criação transacional/idempotente.
- Itens expansíveis, evidências vinculadas, áreas Itens/Fotos/Relatos, navegador completo de ambientes, último ambiente levando à revisão e pendências agrupadas com ação.
- PDF canônico gerado no servidor, revisão agregada em todos os filhos, validação transacional e documentos imutáveis. A migração 0035 consta no journal e **não foi aplicada a produção**.
- PDF reorganizado por ambiente, referências de item/foto, continuação, legendas completas, proporções e assinatura sem corte de nomes.

## Testes executados

| Verificação                                                     | Resultado                  |
| --------------------------------------------------------------- | -------------------------- |
| Suíte principal do `package.json` (Node + tsx, mesmos arquivos) | 593 aprovados, zero falhas |
| Subsuíte da vistoria incluída na principal                      | 46 aprovados, zero falhas  |
| Recibos (Vitest)                                                | 23 aprovados               |
| Assistente                                                      | 169 aprovados              |
| Sites Cordial/Morar e arquivamento                              | 141 aprovados              |
| Typecheck                                                       | Aprovado                   |
| Build de produção local                                         | Aprovado; sem publicação   |
| ESLint nos novos componentes, hooks, modelo de PDF e harness    | Aprovado                   |

O ambiente não possuía Bun no PATH. As listas do script de teste foram executadas pelo Node disponível, com tsx; as subrotinas de recibos/assistente foram executadas separadamente. Não se trata de uma execução literal de `bun run test`.

Os testes usam PGlite com as migrações reais 0033/0034/0035 e papéis `authenticated`/`service_role`: isolamento RLS de linhas e contagens; escopo de agência/busca/período; gravação de item/foto/relato entre snapshot e emissão rejeitada; snapshot adulterado; emissão direta do navegador negada; ator validado pelo servidor; ordenação de fotos atômica; rollback de criação; idempotência; documento v1 inalterado após reabrir e emitir v2. Não substituem duas conexões simultâneas ao PostgreSQL hospedado nem validação de RLS em produção.

Testes de persistência cobrem commit versus sucesso do request, abort tardio/quota, falta de blur, edição durante save, offline/recarga por contexto, conflitos com refetch/IA, recuperação de duas versões e pausa/descarte de ambiente. Os testes de PDF verificam margens, segunda foto mais alta, legenda extensa, nome longo, imagem com falha, continuação e bytes determinísticos na retomada.

## Interações efetivamente exercitadas no harness

Antes do bloqueio final do navegador:

1. Reproduzido no código anterior: digitar em Sala → mudar para Cozinha → texto permanece no editor de Cozinha.
2. Na implementação nova: digitar sem blur em Sala → Cozinha vazia → retornar à Sala recupera texto → recarregar preserva texto na Sala.
3. Falha de transporte simulada: editar material, recarregar a partir do snapshot local e recuperar o campo; estado offline apresentado.
4. Gravador de fixture: iniciar → refetch/rerender mantém gravação e contador de encerramentos em zero → trocar ambiente encerra uma vez → áudio fica na Sala.

O gravador é uma fixture WAV; isso **não valida microfone físico**, permissões, Safari nem áudio real. Essas interações precedem os ajustes finais de recuperação entre abas, que foram cobertos por testes de regra, mas ainda aguardam reteste de interface.

## Laudo fictício inspecionado

[Baixar PDF de demonstração](laudo-demonstracao.pdf) — cinco páginas, quatro ambientes, 47 itens, estados variados, fotos sintéticas horizontais/verticais, legenda extensa, caracteres especiais e nome de participante longo. Todas as páginas foram renderizadas por Poppler e inspecionadas visualmente:

| Página | Renderização                                          |
| ------ | ----------------------------------------------------- |
| 1      | [Identificação e início da Sala](pdf-pagina-1.png)    |
| 2      | [Fotos e legenda extensa](pdf-pagina-2.png)           |
| 3      | [Continuação da Sala](pdf-pagina-3.png)               |
| 4      | [Cozinha e Dormitório](pdf-pagina-4.png)              |
| 5      | [Banheiro, conclusão e assinaturas](pdf-pagina-5.png) |

As imagens sintéticas testam proporção e paginação; não demonstram qualidade de registro de avarias reais. A inspeção foi em PNG renderizado por Poppler; leitores adicionais ainda precisam de conferência.

## Contraste medido nos tokens

`tsx tests/vistoria/contrast.ts` calcula luminância relativa sRGB após conversão OKLCH. Comparação com a superfície opaca usada nos cards:

| Tema   |   Texto | Secundário | Texto da ação principal |   Erro |
| ------ | ------: | ---------: | ----------------------: | -----: |
| Claro  | 15,08:1 |     6,01:1 |                  6,24:1 | 5,71:1 |
| Escuro | 17,05:1 |     8,71:1 |                 14,49:1 | 6,17:1 |

É medição dos tokens, sem afirmar auditoria completa de todos os estados renderizados, imagens de fundo ou componentes herdados.

## Aceite ainda não verificado

- Capturas antes/depois da lista, criação, ambiente, relato e revisão em estados equivalentes; primeiro card visível em 390 × 844; 320/360/430 px, rotação, teclado e safe-area.
- Jornada com conta real de corretor, isolamento em sessão autenticada hospedada e troca real de contas.
- Duas abas reais emitindo/editando simultaneamente contra banco hospedado; testes atuais exercitam o intervalo entre snapshot e confirmação no banco isolado.
- Microfone físico, Safari/iOS e Chrome/Android em dispositivos, câmera e retomada após suspensão do aplicativo.
- Falha/renovação de URL e upload contra storage hospedado. Tratamento implementado; ainda precisa de teste integrado autenticado.
- Duplicidade 1409/3408: consulta sem sessão autenticada retornou zero linhas visíveis sob RLS; isso não confirma nem descarta duplicidade. Fixtures têm códigos iguais e IDs distintos. Nenhum cadastro foi renumerado/unido/excluído.
- Validação de fontes em leitores reais adicionais. O fallback Unicode é explícito; não há cobertura gráfica universal de caracteres.

Não houve deploy, escrita em imóveis reais, exclusão da vistoria Nº 1 ou de suas mídias, alteração de anúncios/Drive/NFS-e, ativação de transcrição ou GPT Live. A PR deve permanecer em rascunho até completar o aceite visual e integrado acima.
