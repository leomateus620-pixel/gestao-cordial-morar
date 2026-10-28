# Fronteira de avaliação Meta

A migração `0055_meta_reviewer_rpc_boundary.sql` trata a combinação de papéis como restrição: se uma identidade possui `meta_reviewer`, `has_role` responde falso para todos os outros papéis. A associação dos papéis não é apagada. As leituras sanitizadas de Marketing continuam verificando o perfil de avaliação explicitamente.

O inventário somente de leitura do banco publicado, em 28/10/2026, identificou RPCs `SECURITY DEFINER` acessíveis a `authenticated` que ignoravam RLS. O histórico de imóveis verificava papéis; a busca de contatos e a listagem de corretores também aceitavam apenas uma identidade autenticada. Por isso, alterar somente RLS ou `has_role` não seria suficiente.

A lista explícita `guarded_names` na migração é o inventário revisável de 70 nomes de RPC. A proteção preserva assinatura, argumentos padrão, dono, grants, volatilidade e corpo de negócio de cada função presente. O bloqueio fica fora do bloco original PL/pgSQL, para não ser absorvido por um `EXCEPTION WHEN OTHERS`. As consultas SQL são encapsuladas com a mesma tipagem declarada dos retornos, inclusive conversões de `varchar` para `text`. Formatos SQL diferentes de uma única consulta SELECT/WITH interrompem a migração para revisão.

As leituras sanitizadas de Marketing, as verificações de identidade/agência e os gatilhos não fazem parte dessa lista. Chamadas anônimas ou de serviço sem uma identidade de avaliação mantêm suas verificações anteriores. Isso não concede acesso anônimo nem amplia grants. Workers continuam usando seu mecanismo de autenticação existente.

## Evidências locais

`tests/ads/reviewer-rpc-boundary.test.ts` executa os papéis reais `authenticated` e `service_role` em PostgreSQL/PGlite, com dados sintéticos identificados e corpos reais das RPCs do repositório:

- Revisor puro e combinado com administrador/secretária não acessam histórico privado nem a busca de contatos/listagem de corretores.
- Administrador/secretária mantêm a leitura permitida; corretores recebem o mascaramento anterior.
- O bloqueio não é absorvido por tratamento de exceção existente.
- Grants, argumentos padrão, assinatura e propriedade da função são preservados; o serviço continua funcionando.
- Marketing permanece sanitizado e sem valores financeiros para avaliação.

Seis testes SQL aprovados; TypeScript sem erros. O ensaio transacional remoto identificou um terminador duplicado que PGlite aceitava; a migração ainda não aplicada foi corrigida e o teste verifica também o SQL gerado com `END` e `END;`. Os três comandos próprios de Google Calendar (iniciar OAuth, desconectar e recuperar agenda) também possuem guarda explícita antes do provider/cliente administrativo, com quatro testes de chamada direta cobrindo papéis combinados, falha fechada na consulta de permissão e comportamento dos demais perfis. A leitura autorizada existente foi preservada. O inventário remoto foi consultado sem executar operações de negócio ou explorar dados privados. Esta evidência não equivale à aplicação em produção nem a uma auditoria de todos os caminhos de servidor que utilizam `service_role`.

## Manutenção e reversão

Novas RPCs e redefinições posteriores devem manter a restrição de avaliação explicitamente e ter testes de chamada direta. Esta migração não é um gatilho que modifica automaticamente funções futuras. Uma alteração que substitua o corpo de uma função protegida precisa conservar sua guarda.

Não reverta isoladamente a negação de `has_role` ou as guardas enquanto houver conta de avaliação. Uma reversão de aplicação pode preservar a migração de segurança. Para retirar uma função desse inventário, revise seus campos retornados e permissões; uma leitura sanitizada nova deve ter contrato próprio e testes de papéis combinados.
