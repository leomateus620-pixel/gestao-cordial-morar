# Segurança e validação — Assistente Cordial

## Matriz de acesso

O agente acrescenta autorização por módulo à RLS existente. Os papéis e vínculos vêm do banco, usando o bearer token do usuário. O catálogo de imóveis permanece compartilhado entre as duas imobiliárias, conforme a regra atual do Gestão; clientes e atendimentos usam também o vínculo de imobiliária e, para corretores, criador ou responsável atual.

| Ferramenta | Admin | Secretária | Corretor Cordial/Morar |
| --- | --- | --- | --- |
| Buscar imóveis / carteira | catálogo permitido pela RLS | catálogo permitido pela RLS | catálogo permitido pela RLS |
| Buscar clientes | RLS | agência + RLS | agência + criado/atribuído + RLS |
| Atendimentos / funil / parados | RLS | agência + RLS | agência + criado/atribuído + RLS |
| Agenda | RLS | agência + RLS | agência + RLS da agenda |
| Agenciamentos | RLS | agência + RLS | agência + criado/responsável + RLS |
| Aluguéis / NFS-e | consulta | consulta operacional sem receita/comissão agregadas | negado |
| Marketing | métricas completas | próprias campanhas, sem investimento/CPL | negado |
| Ranking | permitido | negado | negado |
| Insights | módulos permitidos | módulos operacionais permitidos | módulos operacionais próprios |
| Pesquisa externa | termos públicos predefinidos | negado | negado |

O papel `financeiro` não recebe automaticamente ferramentas de módulos ausentes em suas permissões. Papéis desconhecidos, ausência de papel e falhas na consulta de permissões negam acesso. Combinações de papéis seguem a prioridade já adotada pelo app.

## Limites de dados

- Não selecionar campos de proprietários, notas internas, documentos e contatos brutos para o modelo.
- Mascarar também dados pessoais em campos livres, histórico, erros e auditoria.
- Referências clicáveis são construídas pelo servidor para registros reais, nunca executadas a partir de texto do modelo.
- Resultado vazio ou registro fora do escopo vira “não encontrei”; falha técnica não vira resultado vazio.
- Consultas limitadas sinalizam a abrangência da amostra, sem alegar que representam a carteira inteira.
- Toda leitura, inclusive histórico de conversas, usa o token do usuário. O cliente administrativo é isolado à gravação de metadados `assistant_*` e consumo atômico de cota; nunca lê tabelas de negócio.
- Conteúdo de registros e fontes é dado não confiável e não pode ampliar o conjunto de ferramentas permitido ao bot.

## Disponibilidade real

A fase disponibiliza Agenda, Match, Capta e Lead somente para leitura. Caixa, Time e Mercado têm apresentações por papel e aguardam ativação futura. Rotinas, memória persistente, anexos, transcrição e ações confirmáveis não são simulados.

O cadastro atual de agenciamentos não possui data de vencimento. A consulta informa essa ausência e apresenta pendências cadastradas; não inventa datas. O score de match usa apenas preferências existentes e explicita dados faltantes.

## Configuração para revisão

Aplicar `drizzle/migrations/0013_assistant_foundation.sql` em ambiente de teste pelo fluxo habitual do projeto. O servidor precisa de `LOVABLE_API_KEY` para o gateway e da configuração administrativa já usada pelo app para gravar somente os registros internos do assistente. Não há deploy nem aplicação remota de migration nesta entrega.

Na ausência de credenciais, o produto exibe indisponibilidade com mensagem clara. Testes usam banco isolado, gateway simulado e dados sintéticos. Não usar cadastros reais nas capturas.

## Fontes técnicas consultadas

- [Lovable: AI features e streaming](https://docs.lovable.dev/features/ai)
- [TanStack: adaptador do gateway Lovable](https://tanstack.com/ai/latest/docs/adapters/lovable)

As credenciais foram confirmadas no servidor Lovable e os dois modelos responderam HTTP 200 em diagnóstico sintético (ver `gateway-validacao.md`). Os limites de primeiro token da conversa completa e latência no banco precisam ser medidos em homologação. Testes de protocolo e funcionamento local não comprovam a latência do provedor externo.
