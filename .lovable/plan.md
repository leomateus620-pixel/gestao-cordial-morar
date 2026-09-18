# Auditoria: informações internas aparecendo em "Pontos fortes" nos sites

## Conclusão (causa confirmada)

É **dado histórico publicado antes da separação e nunca limpo no site**, agravado por **omissão do campo no envio**. O código atual **não gera mais** o vazamento.

Evidência do caso citado (Cordial 868 / external 3423415):
- No Gestão: `pontos_fortes` está NULL e `observacao_imovel` = "comissão de 3% / Ag: Felipe Fleck".
- No site (consulta somente leitura): `pontosFortesImovel` = "comissão de 3%<br /> Ag: Felipe Fleck" — ou seja, o texto antigo continua lá.
- O único envio de alteração desse imóvel (09/09) ficou **cancelado** pela pausa de segurança de 10/09; nunca houve envio depois da limpeza interna.

Por que o texto não some sozinho: quando `pontos_fortes` fica vazio, o serializador **omite** `pontosFortesImovel` do corpo. Não existe nada no código nem nos registros que comprove que a Imobi apaga um campo omitido em "pontos fortes" — a evidência real (este imóvel) mostra o contrário: o valor antigo permanece. Portanto limpar exige **enviar o campo vazio explicitamente**, não omiti-lo.

Descartado: (a) vazamento pelo código atual — o serializador ignora `observacao_imovel`/`outras_informacoes` e filtra `pontos_fortes` linha a linha; (d) importação — o importador copia o campo público remoto para `pontos_fortes`, então ele só reintroduz o texto que **já está** no site, e a limpeza interna já foi feita.

## Números da varredura (somente leitura, 20 consultas/min por site)

- Verificados até agora: 556 anúncios (278 Cordial, 278 Morar) de 861 ativos. A varredura continua.
- Afetados: **173 no Cordial**, **0 no Morar** até este ponto.
- Padrões encontrados: comissão em % e em valor, "Ag: <corretor>", "Proprietário quer limpo R$…", valor de negociação interno.

Exemplos (site | código | texto público):
- Cordial 22 — "Terreno 160.000,00 / Comissão 12.000,00 / Quadra 1561 Lote06…"
- Cordial 171 — "Proprietário quer limpo R$500.000,00 / Comissão de 6% / Ag: Ricardo Hoff"
- Cordial 234 — "comissão 6% / Proprietário quer pra ele 450.000,00…"
- Cordial 868 — "comissão de 3% / Ag: Felipe Fleck"

A tabela completa (property_id, site, código, external_property_id, pontos fortes local, trecho interno local, pontos fortes remoto) fica em `/tmp/hits.json` e será entregue ao fim da varredura.

## Correção mínima e segura (para aprovar)

1. Terminar a varredura e fechar a lista definitiva por site.
2. No serializador: quando não houver pontos fortes públicos, enviar `pontosFortesImovel` como **string vazia** em vez de omitir — é a única forma de apagar o texto antigo no site. Nada mais no payload muda.
3. Criar um caminho de envio restrito a texto público (nos moldes do `media_sync` das fotos), autorizado com a pausa cadastral ligada, que envie **apenas** descrição/pontos fortes e nunca proprietário, corretor, fotos ou demais campos — assim a limpeza sai sem reabrir o risco que motivou a pausa.
4. Enfileirar essa limpeza somente para os imóveis afetados, em lotes que respeitem o limite de 20 requisições por minuto, e reconferir por leitura que o campo ficou vazio.
5. Ajuste opcional no importador: não sobrescrever `pontos_fortes` local com texto remoto que contenha sinal interno, para a limpeza não voltar em futura importação.

Fora de escopo: proprietário, corretor, fotos, pausa de sincronização cadastral, qualquer outro campo.

## Nota

Nesta auditoria nada foi alterado: somente leituras no banco e consultas GET nas duas integrações.
