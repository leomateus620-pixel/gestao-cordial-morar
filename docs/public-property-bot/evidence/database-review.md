# Revisão do banco e evidências do bot público

Execução em 16/11/2026, pelo conector Lovable, projeto `feb646c9-c19a-4360-8cc9-bec5237532ea` (Gestão Cordial). Commit de origem: `3a9c4be70a6b2b9fec1509d0e94ac78f710f6af5`. Os ensaios desta revisão foram envolvidos em `BEGIN`/`ROLLBACK`. Nenhuma conexão direta de banco, credencial de produção ou consulta ao cofre foi usada.

## Migrações e escopo

- `0095_public_property_bots`: aplicada pelo coordenador via Lovable; SHA-256 `6c43d1f35484ff9d8dc568513b627310e9a4cd325e4fef2fa00c2ccf6d5e4972`; journal `1794800560042`. O backfill observado continha 852 documentos públicos (499 Cordial, 353 Morar).
- `0096_public_bot_evidence_and_revalidation`: gerada com `drizzle-kit generate --custom`, ensaiada nesta revisão e aplicada pelo coordenador via Lovable; SHA-256 `74bd466099186c951451cd9f6e39163b3e62db69adc433cbc13e52c962784c34`; journal `1794803578773`.
- `0097_public_bot_restricted_gateway`: gerada com o mesmo mecanismo, ensaiada nesta revisão e aplicada pelo coordenador via Lovable. SHA-256 `fb257f317db777cb5040f723b31d7476c7b5acb18648f76a3342b72f8269d5c4`; journal `1794803986071`. Aplicação confirmada pelo coordenador: 98 entradas no journal, 852 documentos, executor sem acesso a `public` ou `properties` e funcionários sem execução do gateway. Um digest de credencial foi registrado separadamente pelo conector, sem expor o segredo, com validade até 15/05/2027 04:47:50 UTC.

A 0096 corrige escopo e negação da evidência de características, procura além de trinta candidatos obsoletos, usa agrupamento monetário brasileiro e uma janela horária independente do fuso da conexão, devolve o bloqueio diário ao reabrir a sessão e recusa o sucesso de uma transcrição cujo lease expirou. Recalcula apenas o índice derivado de características e invalida conjuntos de sugestões.

A 0097 cria uma única RPC pública com quatorze operações estáticas, validando um segredo opaco enviado somente pelo servidor. Apenas o hash SHA-256 fica no banco. O executor continua sem acesso ao schema `public`, ao schema `auth`, às tabelas privadas ou à tabela de credenciais. Não há hook global de autenticação, JWT personalizado, exposição do schema `public_bot`, SQL dinâmico nem credencial gerada pela migração.

O primeiro ensaio da 0097 detectou que revogar os privilégios após a troca de proprietário mantinha grants padrão na função pública nesta instalação. A ordem foi corrigida: revogar e conceder somente `anon` antes de transferir a propriedade. O ensaio final verifica explicitamente que `authenticated`, `service_role` e `PUBLIC` não ganham acesso ao gateway por esses grants.

## Ensaios executados nesta revisão

| Arquivo | Resultado observado |
| --- | --- |
| `tests/public-property-bot/database.evidence.sql` | Treze expressões de características passaram, incluindo negação, ausência de informação, possibilidade de construir, piscina privativa e churrasqueira do condomínio, além de `sala` não corresponder a `salão`. Reabertura com cota de 25, troca de marca e chave diária nova passaram. `finish_voice` com lease vencido devolveu falso, não contou sucesso e liberou a reserva. |
| `tests/public-property-bot/database.suggestions.sql` | Sugestões estáveis na mesma janela, quatro critérios pesquisáveis, marca isolada e preço formatado em pt-BR. Consentimento negado não gravou contribuição e não impediu busca. Repetição de evento e novos UUIDs da mesma sessão não inflaram a contagem. Quatro sessões não promoveram tendência; a quinta promoveu uma categoria compatível. Eventos com texto livre ou sessão de outra marca foram negados. Janela independente de `Asia/Kolkata`, reconstrução da hora, retirada com cache ainda presente e catálogo vazio passaram. Trinta candidatos desatualizados não ocultaram o primeiro válido na posição 31. |
| `tests/public-property-bot/database.gateway.sql` | Todos os quatorze despachos passaram como `anon` com segredo sintético válido. Sessão, resposta persistida, replay e reserva de custo única passaram. Sem segredo, segredo inválido, expirado ou revogado foram negados. Operação desconhecida, autoridade extra, marca, hash, ID, data e corpo inválidos foram recusados. Texto com sintaxe SQL permaneceu um filtro literal. Erros públicos vieram sem detalhes internos. Acesso direto a `properties`, `clients`, sessões, hashes e RPC de projeção foi negado ao executor. Sessão não atravessou a marca. |

Depois dos ensaios, consultas separadas confirmaram que as tabelas sintéticas, documentos e reservas de voz de teste não permaneceram. Depois do ensaio pré-aplicação da 0097, a tabela de credenciais e a função gateway ainda não existiam, e a sessão/uso sintéticos também não existiam; `public_bot_runtime` continuava sem `USAGE` em `public`. Depois da aplicação real, `database.gateway.sql` foi executado novamente em rollback e todos os cenários passaram. A consulta separada de confirmação encontrou uma credencial ativa, zero credenciais/sessões/uso sintéticos, 852 documentos, executor sem `USAGE` em `public` e funcionários sem execução do gateway. Nenhum hash ou segredo foi lido por essa verificação.

Os testes de sugestões substituem a função fonte e o índice somente dentro da transação revertida. Não publicam nem retiram imóveis comerciais. Eles comprovam o comportamento da revalidação diante de uma fonte que muda; não substituem um ensaio futuro do fluxo administrativo real de publicação em um imóvel de teste autorizado.

O coordenador executou separadamente `database.integration.sql` via Lovable, incluindo privacidade com sentinelas, isolamento, quota, voz, retenção e privilégios; também executou concorrência real com cota em 24: dois pedidos de marcas distintas produziram exatamente um aceito e um esgotado. Esses resultados foram informados pelo coordenador; os detalhes de execução são registrados na validação geral.

## Medições observadas

Cinco buscas sequenciais no catálogo público real da Cordial, casa para venda até R$ 650.000, durante o ensaio da 0096: **301,620; 287,989; 287,480; 313,622; 283,989 ms**. Sugestões: **303,160 ms** sem conjunto horário previamente gerado e **281,626 ms** com conjunto já presente. Mesmo o conjunto armazenado revalida disponibilidade ao servir.

As medições usam o catálogo de 852 documentos, a conexão do conector e cache de banco não controlado. São amostras pontuais de baixa concorrência, não p95, teste de carga nem promessa de latência de rede/interface. O coordenador também registrou um `EXPLAIN ANALYZE` anterior de **318,419 ms**. Nenhuma extensão ou índice GIN foi adicionado sem consulta que o utilizasse.

## Limites e operação

A RPC pública depende do segredo configurado no servidor e do hash correspondente, válido e não revogado. O ensaio usou somente valores sintéticos descartados no rollback. A existência de um digest ativo foi confirmada, mas a configuração do segredo correspondente no servidor e o caminho HTTP real precisam de validação própria. A chave pública de API identifica o projeto, mas não autoriza o gateway sem o segredo dedicado. Não registrar `X-Public-Bot-Key` em logs; nunca fornecer esse segredo ao navegador ou ao modelo.

Os testes não chamaram o provedor de IA/transcrição nem validaram o caminho HTTP real. Nenhuma evidência SQL substitui os testes de navegador, voz, ingresso de IP confiável ou cancelamento conduzidos nos demais módulos. A retenção e a cota por IP são controles operacionais; uma rede compartilhada pode compartilhar a franquia e uma mudança de rede pode originar outra chave.
