# Testes reais GET da Meta — 26/10/2026

## Base histórica separada
364 GET; 364 sucessos; 0 erros; 354 Marketing API; 10 outras leituras, nenhuma escrita. Base fornecida pelo usuário e relatos anteriores. A fila antiga não foi recuperada.

## Nova matriz
Descoberta atual de campanhas e relatórios independentes por campanha + segmentação. Sem repetição de detalhes de campanhas/conjuntos/anúncios. Concorrência 1; teto preventivo de qualquer métrica de uso: 85%; parada em qualquer erro, sem troca de conta/token/app.

Início: 2026-10-26T17:21:28.834298+00:00; última atualização: 2026-10-26T17:30:52.174201+00:00
Estado: target reached
Fuso: America/Sao_Paulo; intervalo: {'since': '2026-09-28', 'until': '2026-10-25'}
Incremento: 147 GET Marketing API, 147 sucessos, 0 erros.
Acumulado: 511 GET; 501 Marketing API; 511 sucessos; 0 erros.

## Limites observados
```json
{
  "first": {
    "X-App-Usage": null,
    "X-Ad-Account-Usage": null,
    "X-Business-Use-Case-Usage": {
      "1010379113136989": [
        {
          "type": "ads_management",
          "call_count": 0,
          "total_cputime": 0,
          "total_time": 0,
          "estimated_time_to_regain_access": 0,
          "ads_api_access_tier": "development_access"
        }
      ]
    },
    "Retry-After": null
  },
  "last": {
    "X-App-Usage": null,
    "X-Ad-Account-Usage": null,
    "X-Business-Use-Case-Usage": {
      "1010379113136989": [
        {
          "type": "ads_insights",
          "call_count": 1,
          "total_cputime": 4,
          "total_time": 12,
          "estimated_time_to_regain_access": 0,
          "ads_api_access_tier": "development_access"
        }
      ]
    },
    "Retry-After": null
  }
}
```

## Fontes oficiais
https://developers.facebook.com/docs/marketing-api/insights/breakdowns/
https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adsinsights.py

## Evidências e limites
Registro sanitizado por chamada: `evidence/testes-api-2026-10-26.json` (campos, recorte, identificador empresarial de campanha, status, quantidade de linhas e uso; sem nomes, pessoas, tokens, corpos ou URLs autenticadas). Resposta vazia bem-sucedida significa nenhum resultado registrado nesse recorte. Nenhum teste simulado. Escopos historicamente concedidos não foram revalidados nesta matriz. GET exercita leitura, não prova escrita ads_management. Contador Testing não observado; atualização pode demorar 24h. Nada continuará automaticamente.

## Conferência final
147 assinaturas distintas (caminho + parâmetros), todas HTTP 200. Famílias: descoberta 1; fuso 1; campanha/publisher_platform 57; campanha/impression_device 57; campanha/device_platform 31. Horários 17:21:28–17:30:23 UTC.

A fonte oficial lista os três recortes individuais e os campos; não foram combinados entre si. Não se solicitou reach, ações de conversão ou dados de indivíduos. Os 28 dias completos foram calculados no fuso retornado pela conta, America/Sao_Paulo: 28/09/2026–25/10/2026.

142 respostas de relatório vieram vazias e três trouxeram linhas. Não inferir ausência de entrega exclusivamente de impression_device vazio: a documentação oficial informa possível indisponibilidade síncrona para algumas contas desde 06/08/2026. Não foi criado job assíncrono nem alterada configuração.

ads_management retornou 0/0/0 e espera 0 nas duas leituras de descoberta/fuso, não foi sondado repetidamente. A última resposta reportou ads_insights: call_count 1, total_cputime 4, total_time 12, espera 0. X-App-Usage e X-Ad-Account-Usage ausentes. O maior indicador observado durante esta matriz foi 12%. O nome de grupo ads_management não comprova escrita.

As 26 combinações úteis não executadas permanecem registradas como pendentes opcionais; o objetivo solicitado foi atingido e não há tarefa automática agendada.
