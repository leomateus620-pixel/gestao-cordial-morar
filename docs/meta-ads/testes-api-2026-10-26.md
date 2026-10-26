# Testes reais GET da Meta — 26/10/2026

## Base histórica separada
364 GET; 364 sucessos; 0 erros; 354 Marketing API; 10 outras leituras, nenhuma escrita. Base fornecida pelo usuário e relatos anteriores. A fila antiga não foi recuperada.

## Nova matriz
Descoberta atual de campanhas e relatórios independentes por campanha + segmentação. Sem repetição de detalhes de campanhas/conjuntos/anúncios. Concorrência 1; teto preventivo de qualquer métrica de uso: 85%; parada em qualquer erro, sem troca de conta/token/app.

Início: 2026-10-26T17:21:28.834298+00:00; última atualização: 2026-10-26T17:30:23.266610+00:00
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
