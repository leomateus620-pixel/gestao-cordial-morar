# Cordial Bot — continuação das etapas

## Decisões do Leonardo (16/10)
- Modelo forte: **anthropic/claude-sonnet-5** (no lugar do "Sonnet 5.5"). Gemini continua nas tarefas rápidas.
- Pesquisa na internet (Tavily/Perplexity): **fora por enquanto**. A Etapa 3 fica pausada; nada de chave pedida.
- Vídeos do Estúdio: **montados no navegador** de quem usa (canvas + WebCodecs) e depois salvos no armazenamento privado.

## Ordem de execução (uma etapa por vez, com testes ao fim de cada uma)

### Etapa 1 — Correções de base (restante)
1. Adaptador único de IA em `src/lib/agent/llm/`: Gemini pelo endpoint atual; Claude Sonnet 5 pelo endpoint nativo de mensagens, sempre em streaming. Modelo de análise passa a ser o Claude (configurável por `ASSISTANT_ANALYSIS_MODEL`).
2. Histórico real: guardar a resposta final já mascarada (ou resumo com ids/números/links) e enviá-la ao modelo no turno seguinte; auditoria continua igual.
3. Estado pendente: guardar escolha em aberto e formulário de ação incompleto; retomar no próximo turno. Teste: "lance uma agenda amanhã" → "Visita" → proposta de agenda pedindo o que falta.
4. Camada única de ferramentas: `src/lib/agent/tools` é a fonte; o MCP reexporta as de leitura com o mesmo código e o mesmo acesso do usuário. Teste por papel nos dois caminhos.

### Etapa 2 — Orquestrador
- Roteador com saída validada (intenção, bot, entidades, o que falta).
- Planejador com no máximo 8 chamadas, verificação de fonte e resposta em PT-BR (curta → detalhes → cartões com links → próximos passos).
- Busca de imóveis com filtros estruturados (tipo, finalidade, dormitórios, preço, bairro, cidade, imobiliária, disponível). Busca semântica em tabela nova, só com campos publicáveis.
- Intenção "pesquisa" responde que a pesquisa externa ainda não está ligada.

### Etapa 4 — Resumo das 8h e memória de trabalho
- Rotina diária (Brasília) por papel, desligável, chamando rota protegida com a credencial do cofre; aviso pelas notificações existentes; cada sugestão abre o bot com a proposta pronta (ainda exige Confirmar).
- Tabela `assistant_facts` (texto curto mascarado, validade); o usuário vê e apaga; nunca dados de proprietário.

### Etapa 5 — Estúdio de Conteúdo
- Só imóvel publicado e elegível (mesma regra das seleções). Fotos públicas reais na ordem ativa; só recorte/zoom; marca `photo_integrity: original`.
- Imagens (story, feed 1:1 e 4:5, carrossel até 10) geradas no servidor por modelos por marca Cordial/Morar; preço e localização seguem as regras de exibição; nunca endereço, proprietário ou código interno.
- Vídeo 9:16 de 6–15 s montado no navegador (Ken Burns e transições sobre as fotos reais).
- IA só para texto (3 tons de legenda, hashtags, CTA, título) com checagem automática.
- Fluxo: rascunho → prévia → editar texto → aprovação humana → baixar pacote. Nunca posta sozinho.
- Armazenamento privado `studio-assets`, tabelas `studio_projects`, `studio_assets`, auditoria; limite diário por usuário.

### Etapa 3 — Pesquisa externa
Pausada até o Leonardo liberar.

## Regras mantidas
Escrita só como proposta com Confirmar; migrações só aditivas, com bloqueio de acesso anônimo e permissões por papel e imobiliária; mascaramento de dados pessoais; sem NFS-e, publicação, fotos, códigos, endereço ou sincronização com os sites; sem publicar o app.

## Detalhes técnicos
- Claude: `/v1/messages`, `@ai-sdk/anthropic` com `streamText`, sem retentativa automática; erros 402/403/429 com mensagens em PT-BR.
- Testes ao fim de cada etapa: unitários, banco (padrão `tests/*/database.ts`), typecheck e build com `TZ=America/Sao_Paulo`. Relato do que não puder ser testado.
