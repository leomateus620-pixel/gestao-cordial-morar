# Operação dos bots públicos

## Situação e configuração

As flags gerais das duas marcas nascem habilitadas. Não existe aprovação de ativação adicional no produto. A disponibilidade depende de credencial restrita e ingresso confiável configurados no servidor; sem isso, o painel oferece busca comum e contato e não libera consumo pago.

Todas as alterações de banco são aplicadas pelo conector Lovable no projeto Gestão Cordial `feb646c9-c19a-4360-8cc9-bec5237532ea`. Migrações são geradas com `drizzle-kit generate --custom --name=...` e entram no journal do projeto. Não editar uma migração já aplicada nem inventar entradas de journal. O usuário autorizou a base compartilhada e, posteriormente, o chat Lovable exclusivamente para a configuração de runtime.

| Variável de servidor                        | Uso                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `PUBLIC_BOT_DATABASE_REST_URL`              | HTTPS do projeto, caminho exato `/rest/v1/`.                                                                       |
| `PUBLIC_BOT_GATEWAY_KEY`                    | Chave publicável do gateway Supabase. Não usar service_role.                                                       |
| `PUBLIC_BOT_GATEWAY_SECRET`                 | Credencial aleatória do serviço fechado; só servidor. O banco guarda SHA-256, expiração e revogação.               |
| `PUBLIC_BOT_IP_SECRET`                      | Segredo HMAC de ao menos 32 caracteres, comum às duas marcas.                                                      |
| `PUBLIC_BOT_TRUSTED_IP_HEADER`              | `cf-connecting-ip` ou `x-real-ip`, apenas após comprovar sobrescrita no ingresso e bloqueio de acesso alternativo. |
| `PUBLIC_BOT_INGRESS_VERIFIED`               | `true` somente após a verificação do caminho real dos dois domínios.                                               |
| `LOVABLE_API_KEY`                           | Transporte gerenciado de IA/voz, já existente na plataforma.                                                       |
| `PUBLIC_BOT_AI_KEY`, `PUBLIC_BOT_VOICE_KEY` | Overrides opcionais de credencial do mesmo gateway fixo.                                                           |
| `PUBLIC_BOT_AI_MODEL`                       | Default `google/gemini-3.1-flash-lite`.                                                                            |
| `PUBLIC_BOT_VOICE_MODEL`                    | Default `openai/gpt-transcribe`.                                                                                   |

Nenhuma variável secreta usa `VITE_`. Valores secretos nunca entram em docs, PR, logs, respostas, URLs ou bundle do navegador. O adaptador não usa `SUPABASE_SERVICE_ROLE_KEY`, client administrativo, sessão de funcionário, backend do assistente interno ou ferramenta genérica de SQL.

A emissão de JWT customizado não é suportada com segurança pelas ferramentas disponibilizadas do Lovable. Por isso a versão final usa `public.public_bot_gateway(op,payload)`: dispatcher estático autenticado por segredo opaco, executado sob `public_bot_runtime`, com apenas as operações fechadas do schema privado. Não instala Auth Hook global nem expõe `public_bot` ao PostgREST. A proposta inicial `PUBLIC_BOT_SCOPED_JWT` foi substituída.

Em 16/11/2026 o Lovable confirmou a configuração de REST URL, chave publicável e segredo HMAC de 64 caracteres; confirmou também a presença de `LOVABLE_API_KEY`. O formulário de inserção do segredo final não é exposto pelo conector: o proprietário deve usar **Project Settings → Secrets → Add secret**, nome `PUBLIC_BOT_GATEWAY_SECRET`, sem `VITE`, e inserir o valor local protegido indicado na entrega. A hash correspondente foi registrada pelo conector, não o segredo, com validade até 15/05/2027 04:47:50 UTC. As migrações 0095, 0096 e 0097 foram aplicadas e o journal validado. O segredo local permanece fora do repositório em arquivo 0600.

## Confiança no IP

O solicitante salvou `PUBLIC_BOT_GATEWAY_SECRET` pelo formulário seguro. A verificação via Lovable retornou HTTP 200 para configuração Cordial e Morar (enabled=true, voice=true, trends=false) e 401/PT401 sem a credencial. O segredo não foi exibido, enviado em chat ou incluído no repositório. A comprovação do ingresso abaixo continua pendente.

A cota é 25 envios aceitos por IP/dia em America/Sao_Paulo, global entre marcas. IP nunca autoriza histórico; token de sessão e marca fazem isso. CGNAT compartilha franquia, mudança de rede pode criar outra chave; não se promete 25 por pessoa.

O Lovable verificou que `CF-Connecting-IP` forjado recebe 403 nos dois domínios, enquanto outros headers passam. Isso não comprova sozinho qual IP chega ao worker final. A Morar usa uma camada Cloudflare adicional; os ingressos precisam ser testados separadamente. A documentação Cloudflare distingue requisições diretas, subrequisições na mesma zona e entre zonas; não presumir equivalência: [headers Cloudflare](https://developers.cloudflare.com/fundamentals/reference/http-headers/).

Antes de atestar o ingresso, fazer um diagnóstico controlado e autenticado no ambiente de implantação, comparando o endereço conhecido da conexão com o recebido, com/sem headers forjados e por ambos os domínios e hostname alternativo. Não expor IP público em resposta de diagnóstico aberta, não registrar IP bruto, não usar X-Forwarded-For arbitrário. Remover diagnóstico temporário após a validação. Se a plataforma não garantir a origem, a conversa permanece indisponível de modo honesto.

## Limites e retenção

- 6 turnos aceitos/minuto por chave diária; uma execução ativa por sessão; 10 aberturas/minuto.
- 25 transcrições bem-sucedidas/dia; reserva conservadora de 60 segundos por tentativa, limite de tentativas, bytes e rajadas. Áudio máximo 60 s e 10 MiB, validado durante leitura e pela estrutura dos pacotes; não persiste.
- Orçamento global inicial de 5.000.000 micros/dia e reserva conservadora de 20.000 micros por chamada paga; teto 1.000 chamadas e 20 sessões ativas para admissão paga. Não apresentar reservas como cobrança real do provedor. Os limites são configuráveis em `configuration_data` por operador autorizado, e o mínimo entre marcas governa o teto global.
- Sessões: 24 h de inatividade, máximo absoluto 7 dias; turnos seguem sessão. Cotas: até 48 h após expirar o dia, com limpeza de 15 min. Uso técnico: 30 dias. Estatísticas: 90 dias. Contribuições de tendência: 24 h. Conjuntos de sugestão: hora atual/anterior.
- Cron `public-property-bot-retention` executa `public_bot.cleanup()` a cada 15 min, dentro do banco. Não é hook HTTP e não usa chave pública.

## Validação após implantar a PR

1. Conferir journal/hashes e integridade dos grants; confirmar ausência de `USAGE public/auth/storage` e leitura direta para runtime.
2. Confirmar segredo por chamada autenticada ao gateway e testar ausência/segredo inválido/operação desconhecida. Nada de inserir segredo em linha de comando ou imprimir headers.
3. Verificar POST session com Origin real, cookie Secure/HttpOnly/SameSite, POST chat e stream no-store; host Morar recusa API Cordial. Testar ausência de ingresso/HMAC/armazenamento e resposta indisponível sem chamada paga.
4. Fazer uma busca estruturada em cada marca com catálogo real e revalidar detalhes/WhatsApp central. Em seguida um pedido completo de texto e uma transcrição curta com fala real revisada antes do envio.
5. Confirmar duas sessões/abas e marcas compartilham cota, 25º responde e 26º devolve 429/Retry-After. Teste sintético de concorrência é restrito a chaves descartáveis, sem imóveis comerciais fictícios.
6. Verificar Safari/iPhone e Chrome/Android físicos: permissão negada, codecs, cancelamento, silêncio, erro, revisão; não confundir teste unitário/emulação com validação de dispositivo.
7. Medir p95 com carga definida, volume/caches anotados e orçamento limitado. A execução isolada de EXPLAIN não prova latência fim a fim.

## Rollback e rotação

As flags `enabled`, `voice` e `trends` são independentes por marca; tendências começam desligadas e usam diversidade do catálogo. Para interromper chamadas, operador autorizado atualiza as flags pelo conector e verifica novas requisições. Pode reverter a PR para retirar launcher/rotas preservando dados de cota durante retenção; não desfaça grants globais nem apague projeções sob tráfego como primeiro passo.

Para revogar a credencial, registrar `revoked_at` na hash por meio do conector. Para rotação, gerar novo par em canal seguro, cadastrar hash com validade explícita, trocar o segredo no Lovable, verificar uma chamada e só então revogar a anterior. Nunca usar JWT de funcionário ou service_role como fallback. Não limpar cotas ao desativar/reativar a feature.
