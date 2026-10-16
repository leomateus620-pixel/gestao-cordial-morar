# Cordial Bot — Orquestrador, Insights, Pesquisa com fontes e Estúdio

Implementação progressiva em 5 etapas, cada uma revisável. Regras invioláveis mantidas: escrita só como proposta com Confirmar (`prepare_*` + `assistant_actions`), migrations aditivas, REVOKE anon/PUBLIC, mascaramento LGPD, nada de NFS-e/publicação/fotos/códigos/endereço/sync Imobi, sem publicar o app.

## Modelos (Gemini + Claude)
- Roteador: `google/gemini-3.1-flash-lite` (env `ASSISTANT_ROUTER_MODEL`).
- Conversa/consulta rápida: `google/gemini-3.8-flash` (env `ASSISTANT_FAST_MODEL`).
- Análise, planejamento complexo, relatórios: Claude. "Claude Sonnet 5.5" não existe no gateway; o mais próximo é `anthropic/claude-sonnet-5` (padrão proposto, env `ASSISTANT_ANALYSIS_MODEL`). Alternativa mais forte e mais cara: `anthropic/claude-opus-5-5`.
- Claude usa o endpoint nativo de mensagens (streaming obrigatório); Gemini segue no endpoint atual. Um adaptador único em `src/lib/agent/llm/` traduz ferramentas/histórico para os dois formatos.
- Observação: Claude nesta workspace é endpoint com retenção de dados pelo provedor (permitido pela política atual). Registros vão mascarados.

## Etapa 1 — Correções de base
1. Histórico real: `chat.server.ts` e `persistence.server.ts` passam a gravar a resposta final mascarada + resumo estruturado (ids, números, links) e reenviá-la ao modelo. `ASSISTANT_HISTORY_TEXT` fica só na trilha de auditoria. Migration aditiva: coluna `assistant_messages.model_content jsonb` e `assistant_conversations.pending_state jsonb` (escolha pendente de `request_user_choice` ou formulário de ação incompleto), retomado no turno seguinte.
2. Camada única: `src/lib/agent/tools` é a fonte; `src/lib/mcp/tool-adapter.ts` já reexporta por nome — garantir mesmo handler e mesmo cliente com token do usuário; teste por papel nos dois caminhos.
3. Remover a regex de escolha de modelo; escolha pelo roteador (Etapa 2). `max_tokens` adaptativo: curto 1200, relatório 4000.
- Testes: multi-turno "lance uma agenda amanhã" → escolha "Visita" → `prepare_agenda_event` pedindo campos faltantes; ferramentas por papel (assistente e MCP).

## Etapa 2 — Orquestrador
- `src/lib/agent/orchestrator/router.ts`: saída JSON validada por zod `{intent, bot, entidades{cliente, imovel, data, faixa_preco, bairro, dormitorios, finalidade}, faltando[], precisa_externo}`.
- `planner.ts`: até 8 chamadas de ferramenta, verificação (dado veio de ferramenta? link verificado?), síntese PT-BR: resposta curta → detalhes → cartões com links → próximos passos como botões. Sem resultado: "não encontrei" + sugestão de filtro.
- `search_properties` ganha filtros estruturados (tipo, finalidade, dormitórios, preço mín/máx, bairro, cidade, imobiliária, disponível).
- Busca semântica opcional: tabela aditiva `property_search_embeddings` (só campos publicáveis, `google/gemini-embedding-2`, extensão vector), atualizada por rotina; RLS por imobiliária.

## Etapa 3 — Pesquisa externa com fontes
- `web-research.ts` reescrito: consulta higienizada (remove nomes, CPF, telefone, e-mail, endereço) antes de sair; Tavily (`TAVILY_API_KEY`) com fallback Perplexity (`PERPLEXITY_API_KEY`); filtros de domínio/região; retorna título, URL, data, trecho.
- Resposta separa "Dados do Gestão" de "Dados externos", sempre com fonte e data.
- Tabela aditiva `assistant_web_cache` (consulta normalizada, 6 h, só service_role); cota diária por usuário reaproveita `assistant_daily_usage`; chave liga/desliga do admin em `assistant_bot_configs`.
- Bloqueio: as duas chaves ainda não existem; sem elas a ferramenta responde "não configurada".

## Etapa 4 — Insights proativos e memória
- Ativar as rotinas existentes (`routines.worker.server.ts`, rota `/api/public/hooks/assistant-briefing-worker`) com agendamento às 8h de Brasília (11:00 UTC) autenticado por `internal_worker_headers()`, protegido por `ASSISTANT_ROUTINES_ENABLED`.
- Resumo por papel: agenda do dia, atendimentos parados, agenciamentos vencendo, aluguéis atrasados/NFS-e pendentes (só leitura), novos matches. Entrega por `notifications`/push existente, 1 por evento (dedupe por chave). Cada sugestão abre o bot com a proposta já preparada, ainda exigindo Confirmar.
- Tabela aditiva `assistant_facts` (user_id, tipo, ref_id, texto mascarado, expires_at); tela em Configurações do assistente para ver e apagar; nunca dados de proprietário.

## Etapa 5 — Estúdio de Conteúdo (novo bot "Estúdio")
- Entrada: imóvel publicado e elegível (`shared_selection_property_eligible`), marca Cordial/Morar, formato: story 1080×1920, feed 1080×1080 e 1080×1350, carrossel até 10, vídeo 9:16 de 6–15 s.
- Fotos: só as públicas reais na ordem ativa; apenas recorte/zoom/enquadramento; nunca IA generativa sobre a foto. Metadado `photo_integrity: original` + hash da foto de entrada.
- Imagens: Satori + resvg-wasm no servidor (compatível com o runtime). Templates React versionados em `src/lib/studio/templates/*` com logo/marca d'água. Preço só se `valor_exibido` permitir; localização só bairro/cidade.
- Vídeo: Remotion e ffmpeg nativo não rodam no servidor deste app. Proposta: render do vídeo no navegador do usuário (canvas + WebCodecs, Ken Burns e transições sobre as fotos reais), salvo depois no bucket. Em fila por usuário.
- Texto por IA (Gemini Flash): 3 legendas, hashtags locais, CTA "Fale com {corretor}", título; verificador automático reprova endereço exato, dados pessoais e promessas não verificáveis.
- Variações por público (família, investidor, aluguel); selos "Novo"/"Baixou o preço" só com histórico real; QR para seleção compartilhada ou página pública.
- Fluxo: rascunho → pré-visualizar → editar texto → aprovação (admin/secretária, ou corretor responsável) → baixar pacote ZIP (PNG/MP4 + legenda .txt). Nunca posta.
- Armazenamento: bucket privado `studio-assets`, URLs assinadas; tabelas aditivas `studio_projects`, `studio_assets` (status rascunho|aprovado|arquivado, aprovado_por, aprovado_em) e `studio_audit`. Limite diário por usuário.

## Testes
- Unitários: roteador (intenções PT-BR), mascaramento, regras de preço/localização, verificador de legenda, dimensões dos templates.
- Banco (padrão `tests/*/database.ts`): RLS por papel e imobiliária em todas as tabelas novas, anon sem acesso, corretor só vê os próprios projetos e fatos.
- Fluxo: multi-turno com escolha → proposta → confirmar; insight sintético das 8h; pesquisa com fontes (mock); Estúdio gera story/feed/carrossel com hash da foto original intacto.
- Ao fim de cada etapa: testes, typecheck e build (TZ=America/Sao_Paulo), relatório do que não pôde ser testado.

## Ordem de execução
Após aprovação, executo as etapas 1 → 5 em sequência, parando só se surgir bloqueio (chaves Tavily/Perplexity, decisão de produto). Cada etapa termina com testes antes da próxima.

## Pendências que dependem do Leonardo
- Confirmar `anthropic/claude-sonnet-5` (ou `claude-opus-5-5`) no lugar do inexistente "Sonnet 5.5".
- Fornecer `TAVILY_API_KEY` e, opcionalmente, `PERPLEXITY_API_KEY`.
- Aceitar vídeo renderizado no navegador em vez de Remotion no servidor.
