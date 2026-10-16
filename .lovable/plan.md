# Cordial Bot — Etapas 1, 2, 4 e 5 em um único desenvolvimento

Execução contínua, sem paradas para confirmação entre as etapas. Ao fim de cada bloco: testes do bloco, verificação de tipos e montagem com `TZ=America/Sao_Paulo`. Relato único no final, com o que foi e o que não foi testado. Nada publicado; migrações só aditivas.

## Bloco A — Etapa 1 (base)
1. **Histórico real**: guardar a resposta final já mascarada e um resumo estruturado (ids, números, links dos cartões) em `assistant_messages`; enviar ao modelo nos turnos seguintes (no máximo os últimos 12 turnos), no lugar do texto genérico de histórico. Auditoria continua igual.
2. **Retomada de escolhas**: guardar a escolha em aberto (`request_user_choice`) e o formulário de ação incompleto (`prepare_*` com campos faltando) junto da conversa; no turno seguinte, a resposta do usuário é ligada a essa pendência. Teste: "lance uma agenda amanhã" → "Visita" → proposta de agenda pedindo o que falta.
3. **Mesmas ferramentas**: `src/lib/agent/tools` passa a ser a única fonte; o acesso de outros assistentes (`src/lib/mcp`) reexporta as de leitura com o mesmo código e o mesmo acesso do usuário. Teste por papel nos dois caminhos.

## Bloco B — Etapa 2 (orquestrador)
1. **Roteador** (Gemini flash-lite) com saída validada: intenção (consulta, ação, análise, pesquisa, conteúdo, conversa), bot, entidades (cliente, imóvel, data, faixa de preço, bairro, dormitórios, finalidade), o que falta. Substitui a escolha provisória por palavras-chave; "análise" vai ao Claude Sonnet 5.
2. **Planejador**: no máximo 8 chamadas de ferramenta; checagem final (dado veio de ferramenta? link verificado?); resposta curta → detalhes → cartões com links → próximos passos como botões; "não encontrei" com sugestão de filtro.
3. **Busca de imóveis** com filtros estruturados (tipo, finalidade, dormitórios, preço mín./máx., bairro, cidade, imobiliária, disponível).
4. **Busca por significado**: tabela nova `property_search_embeddings`, só com campos publicáveis, atualizada por rotina; usada como complemento dos filtros.
5. Intenção "pesquisa" responde que a pesquisa na internet ainda não está ligada.

## Bloco C — Etapa 4 (resumo das 8h e memória de trabalho)
1. **Resumo diário às 8h (Brasília)** por papel: agenda do dia, atendimentos parados, agenciamentos vencendo, aluguéis atrasados e NFS-e pendentes (só leitura), novos cruzamentos cliente × imóvel. Reaproveita as rotinas que já existem (`assistant_routines`, worker protegido com credencial do cofre), desligável pelo administrador. Entrega pelas notificações existentes, uma por evento.
2. Cada sugestão abre o bot com a proposta já preparada, ainda exigindo Confirmar.
3. **Memória de trabalho**: tabela `assistant_facts` (dono, tipo, referência, texto curto mascarado, validade). Tela onde o usuário vê e apaga. Nunca dados de proprietário. Cada um vê só os próprios.

## Bloco D — Etapa 5 (Estúdio de Conteúdo)
1. **Novo bot "Estúdio"** e tela própria no menu do Assistente.
2. Entrada: imóvel publicado e elegível (mesma regra das seleções compartilhadas), marca Cordial ou Morar, formato: story 1080×1920, feed 1080×1080 e 1080×1350, carrossel até 10, vídeo 9:16 de 6–15 s.
3. **Fotos**: só as públicas reais, na ordem ativa; apenas recorte e zoom; marca `photo_integrity: original` com a impressão digital da foto de entrada.
4. **Imagens** montadas no navegador sobre modelos por marca (logo, marca d'água; preço só se a regra de valor exibido permitir; local só bairro/cidade). **Vídeo** montado no navegador com aproximação lenta e transições sobre as fotos reais.
5. **Texto por IA**: 3 tons de legenda, hashtags locais, "Fale com {corretor}", título curto; variações família/investidor/aluguel; selos "Novo" e "Baixou o preço" só com histórico real; link para a página pública ou seleção. Checagem automática reprova endereço exato, dados pessoais e promessas sem base.
6. **Fluxo**: rascunho → prévia → editar texto → aprovação (admin/secretária ou corretor responsável) → baixar pacote (imagens/vídeo + legenda). Nunca posta sozinho.
7. **Armazenamento** privado `studio-assets` com links temporários; tabelas `studio_projects`, `studio_assets`, `studio_audit`; limite diário por usuário.

## Regras mantidas
Escrita só como proposta com Confirmar; sem NFS-e, publicação, fotos/ordem/capa, códigos, endereço ou sincronização com os sites; sem mensagens a clientes nem postagem em redes; dados pessoais mascarados; nada de proprietário em memória, pesquisa ou mídia; sem publicar o app.

## Detalhes técnicos
- Migrações aditivas: colunas novas em `assistant_messages`/`assistant_conversations` para resumo e pendência; `property_search_embeddings` (embeddings `google/gemini-embedding-2`); `assistant_facts`; `studio_projects`, `studio_assets`, `studio_audit`; bucket privado. Funções com `SECURITY DEFINER` e `search_path` fixo, `REVOKE` de anon/PUBLIC, RLS por papel (`has_role`) e imobiliária (`user_agencies`).
- Roteador: Chat Completions com saída JSON validada por zod; planejador reaproveita o laço atual de `createAssistantResponse` com teto de 8 chamadas.
- Estúdio: modelos versionados em `src/lib/studio/templates/*`; imagens em canvas no navegador (mesmo motor do vídeo, WebCodecs), já que o servidor não roda montagem nativa; legenda pelo modelo rápido, checagem em `src/lib/studio/caption-check.ts`.
- Testes: unitários (roteador com frases em PT-BR, mascaramento, regras de preço/local, checagem de legenda, dimensões dos modelos), banco no padrão `tests/*/database.ts` (RLS por papel e imobiliária, anon sem acesso, corretor só vê os próprios projetos e fatos), fluxo (conversa com escolha → proposta → confirmar; resumo sintético das 8h; Estúdio gerando story/feed/carrossel com a impressão digital da foto intacta).
