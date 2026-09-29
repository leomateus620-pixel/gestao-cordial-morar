# Chamado ImobiBrasil — primeira criação de imóvel na conta Cordial sem resposta

Levantamento somente leitura de 29/09/2026 (horário de Brasília). Nenhum token, cabeçalho ou dado de proprietário incluído.

## Resumo para o suporte

Na conta **Cordial**, a primeira chamada `POST /imovel/inserir` de imóveis novos termina em ~3,3–4,7 s **sem resposta HTTP recebida** pelo nosso servidor (nem status, nem corpo). A mesma chamada, com o mesmo formato de dados, funciona de primeira na conta **Morar**. Minutos depois, após conferirmos por referência (`GET`) que o imóvel não existia, uma nova criação deu certo com HTTP 200. Pedimos que verifiquem nos logs da conta Cordial o que ocorreu nessas chamadas (recusa, corte de conexão, WAF/limite por IP).

| Referência | Falha sem resposta | Duração | Criado com sucesso | Código Cordial |
| --- | --- | --- | --- | --- |
| 1385 | 23/09 14:21:05 | 3.359 ms | 23/09 14:29:03 (HTTP 200) | 4358914 |
| 1386 | 24/09 10:29:04 | 4.670 ms | 24/09 10:38:02 (HTTP 200) | 4359659 |
| 1388 | 28/09 15:14:52 | 4.385 ms | 28/09 15:23:04 (HTTP 200) | 4362753 |
| 1390 | 29/09 14:06:05 e 16:18:08 | 4.304 / 3.339 ms | 29/09 16:23:03 (HTTP 200) | 4364149 |

Nenhuma cópia duplicada foi criada: após cada falha, o sistema só tenta de novo depois de 3 leituras confirmando ausência.

## Limite desta evidência

Nos casos acima o sistema não guardava o status HTTP nem o corpo da resposta. A partir de 29/09/2026, toda falha de `/imovel/inserir` passa a gravar status, duração, trecho sanitizado da resposta e o resultado (`ambiguous`, `definitive_no_create`, `rate_limited`, `lease_lost`). Na próxima ocorrência, anexar ao chamado:

```sql
select to_char(a.created_at at time zone 'America/Sao_Paulo','DD/MM HH24:MI:SS') quando,
       p.external_reference, a.request_path, a.http_status, a.duration_ms,
       a.outcome, a.error_category, a.response_excerpt
  from property_sync_attempts a
  join property_sync_jobs j on j.id = a.job_id
  join property_provider_publications p on p.property_id = j.property_id and p.provider = j.provider
 where j.provider = 'cordial' and a.request_path = '/imovel/inserir'
 order by a.created_at desc limit 50;
```
