# Diagnóstico real do gateway Lovable

Em 16/10/2026, a conexão Lovable confirmou o projeto Gestão Cordial no mesmo commit-base do repositório. O conector AI está habilitado. O diagnóstico usou apenas texto fictício (`teste sintético OK`); nenhum cliente, proprietário ou dado de negócio foi consultado ou enviado.

O ambiente do servidor confirmou a presença de `LOVABLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. Os valores permaneceram no servidor e não foram exportados ao ambiente local, chat ou repositório.

| Modelo | HTTP | Tempo até primeiro byte | Duração total |
| --- | --- | --- | --- |
| `google/gemini-3-flash-preview` | 200 | ~877 ms | ~959 ms |
| `google/gemini-3.1-pro-preview` | 200 | ~1539 ms | ~1578 ms |

O transporte foi SSE (`stream=true`), com `max_tokens=30`. A medição retornada pelo diagnóstico usa `curl time_starttransfer`, portanto mede primeiro byte HTTP, não comprova primeiro token nem a latência da conversa completa. Isso valida presença das credenciais e disponibilidade dos dois modelos; o fluxo integrado ainda precisa de homologação após aplicar a migration em ambiente de teste.

O diagnóstico foi solicitado em modo de planejamento, sem edições, migrations ou publicação. A plataforma sincronizou automaticamente o pacote de runtime e `previewAuthStorage.ts` no `main` até o commit `702d21cd`; a PR incorpora essa base, sem recriar ou reverter essas mudanças externas. Nenhuma publicação de produção foi solicitada.

[Projeto no Lovable](https://lovable.dev/projects/feb646c9-c19a-4360-8cc9-bec5237532ea).
