# Testes reais GET da Meta — 26/10/2026

## Base histórica separada
364 GET; 364 sucessos; 0 erros; 354 Marketing API; 10 outras leituras, nenhuma escrita. Base fornecida pelo usuário e relatos anteriores. A fila antiga não foi recuperada.

## Nova matriz
Descoberta atual de campanhas e relatórios independentes por campanha + segmentação. Sem repetição de detalhes de campanhas/conjuntos/anúncios. Concorrência 1; teto preventivo de qualquer métrica de uso: 85%; parada em qualquer erro, sem troca de conta/token/app.

Início: 2026-10-26T17:21:28.834298+00:00; última atualização: 2026-10-26T17:21:29.512509+00:00
Estado: awaiting official breakdown verification
Fuso: America/Sao_Paulo; intervalo: {'since': '2026-09-28', 'until': '2026-10-25'}
Incremento: 2 GET Marketing API, 2 sucessos, 0 erros.
Acumulado: 366 GET; 356 Marketing API; 366 sucessos; 0 erros.

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
  }
}
```

## Fontes oficiais

## Evidências e limites
Registro sanitizado por chamada: `evidence/testes-api-2026-10-26.json` (campos, recorte, identificador empresarial de campanha, status, quantidade de linhas e uso; sem nomes, pessoas, tokens, corpos ou URLs autenticadas). Resposta vazia bem-sucedida significa nenhum resultado registrado nesse recorte. Nenhum teste simulado. Escopos historicamente concedidos não foram revalidados nesta matriz. GET exercita leitura, não prova escrita ads_management. Contador Testing não observado; atualização pode demorar 24h. Nada continuará automaticamente.
