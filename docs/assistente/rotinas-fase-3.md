# Rotinas e preferências — fase 3

O worker consulta dados de negócio apenas com concessão OAuth individual. A credencial interna do cron serve somente para acordar o worker; não substitui o token do usuário. Não há cópia da sessão do navegador, senha ou JWT de impersonação. O segredo do cliente OAuth, o verificador PKCE e o refresh token ficam no Vault. As tabelas de rotina e execução contêm somente metadados e referências.

## Configuração após publicar a rota

1. Registrar um cliente OAuth confidencial no mesmo Supabase, com PKCE e autenticação `client_secret_basic`. Callback: `https://<origem>/api/public/assistant-oauth/callback`. Manter a UI de consentimento `/.lovable/oauth/consent` configurada no projeto.
2. Configurar `ASSISTANT_PUBLIC_ORIGIN` e `ASSISTANT_OAUTH_CLIENT_ID` no servidor. Guardar o segredo no Vault com nome `assistant_oauth_client_secret`; nunca em arquivo ou variável `VITE_*`.
3. Guardar a origem HTTPS publicada no Vault como `assistant_worker_origin`. Os hooks usam `internal_worker_headers()`; chave pública não autentica o cron.
4. Após verificar a publicação da rota, habilitar `ASSISTANT_ROUTINES_ENABLED=true` no servidor e chamar a RPC interna `assistant_routine_scheduler_set(true)`. A migration não chama essa RPC nem ativa nenhum cron. Para parar a escala, usar `assistant_routine_scheduler_set(false)` e desativar a variável.
5. Cada usuário autoriza separadamente as rotinas. Reconexão não retoma rotinas pausadas automaticamente: é necessário clicar em Retomar. Revogar apaga o refresh token do cofre, interrompe rotinas ativas e tenta revogar a concessão OAuth no provedor.

Sem configuração externa, a UI mostra indisponibilidade real; nenhum resultado, conexão ou envio é simulado. O readiness separa banco, gateway, pesquisa, delegação e escala. Detalhes técnicos de configuração são retornados somente ao administrador.

## Execução

O briefing padrão é diário às 8h de `America/Sao_Paulo`, incluindo sábado e domingo, mesmo sem novidades. Também são aceitas agendas de segunda a sexta (sem calendário de feriados) e semanais. Os modelos são consultas: briefing, agenda, atendimentos parados, pendências de captação, aluguéis atrasados, novos matches, ranking e mercado. Aluguéis restringem-se a admin/secretária; ranking e mercado a admin. Não há envio para clientes nem ação fiscal/comercial automática.

Uma execução por rotina e dia local; claim atômico; até 20 ocorrências em paralelo por chamada do worker, com uma renovação de autorização por usuário no lote; até três tentativas, com esperas de um e cinco minutos. Refresh grants possuem lease exclusivo. Se uma renovação puder ter sido consumida sem retorno confirmado, falha fechada e pede reconexão. Não reutiliza uma concessão com lease abandonado.

Novos matches consultam até três clientes por execução, com cursor persistido para avançar pela carteira permitida e retornar ao início. A combinação de IDs já vista é guardada sem nomes ou valores. Notificação, referências da execução, cursor e pares vistos são confirmados na mesma transação. Abertura reconsulta os dados com as permissões atuais. Listas continuam limitadas e não representam análise exaustiva instantânea da carteira.

A notificação possui texto genérico e chave única por execução; o push é delegado à outbox existente. Retentativas de transporte podem ocorrer, com o mesmo identificador lógico/tag. Não se promete exatamente uma transmissão física por FCM.

## Memória

Somente tom, bairros de foco e horários, com esquema fechado, validação no servidor e no banco, leitura/escrita/exclusão pelo próprio usuário. Não guarda documentos, contatos, proprietários, anotações ou instruções livres. O modelo prepara uma proposta; a UI salva somente após confirmação. Gravação de memória não nasce de inferência silenciosa sobre conversas.

## Validação local

`bunx tsx --test src/lib/agent/routines.test.ts src/lib/agent/routines.database.test.ts` valida horários, dias, papéis, RLS, proteção do cofre, exclusividade/rotação de grants, tentativa máxima, cancelamento por revisão, confirmação transacional e deduplicação. PGlite usa implementações sintéticas do Vault e notifications: não substitui a autorização OAuth real em ambiente publicado.

As revisões das rotinas invalidam execuções antigas. Uma ocorrência inacabada pode ser reservada de novo no horário revisado, sem tomar um lease ativo ou repetir uma ocorrência concluída. A conclusão bloqueia também a rotina, linearizando pausa/edição e notificação. Contenção temporária na autorização não consome as três tentativas.
