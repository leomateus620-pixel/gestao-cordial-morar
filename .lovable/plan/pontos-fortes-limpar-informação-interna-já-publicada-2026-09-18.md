# Pontos fortes: limpar informação interna já publicada

## O que a auditoria mostrou (somente leitura, apenas consultas GET)

- O código atual **não vaza**: no serializador, `observacao_imovel` e `outras_informacoes` nunca entram no que é enviado aos sites, e `pontos_fortes` passa por filtro linha a linha.
- O texto interno que aparece no site é **conteúdo antigo, publicado antes da separação dos campos e nunca apagado no site**. Confirmado no caso Cordial 868 (external 3423415): no Gestão o campo público está vazio, e a consulta ao site devolve "comissão de 3% / Ag: Felipe Fleck".
- Agrava o problema: quando o campo público está vazio, o envio **omite** o campo e o site **preserva** o valor anterior.
- Descartado: importação contaminando o campo público a partir de "outras informações" do site (esse campo remoto voltou vazio em praticamente todos os anúncios; confirmar na varredura final).

### Números até agora
- 861 publicações ativas; 716 conferidas (519 Cordial, 197 Morar) — restam ~145 da Morar, que serão concluídas.
- Anúncios expondo informação interna em pontos fortes: **360** (Cordial 302, Morar 58 parcial).
- Padrões encontrados: comissão, "Ag: <nome>", "proprietário quer líquido", valores internos.

## Sequência proposta

1. **Terminar a varredura da Morar** e entregar a tabela definitiva: property_id, provedor, código, external ID, URL pública, pontos fortes local, informação interna local, pontos fortes remoto, motivo — com totais por site, quantos com campo público vazio, quantos com conteúdo legítimo misturado, e quantos `published` / `out_of_sync`.
2. **Blindagem e testes do serializador** (casos A–F pedidos): inspeção recursiva de todo o corpo enviado, garantindo que nenhuma frase interna apareça em qualquer campo.
3. **Ajuste único**: quando não houver pontos fortes públicos, enviar o campo **vazio** em vez de omitir — só para esse campo, sem política global de enviar campos vazios.
4. **Importação**: nunca sobrescrever o campo público local com texto remoto que contenha sinal interno.
5. **Limpeza remota**: caminho de envio restrito ao texto de pontos fortes, nos moldes do caminho exclusivo de fotos, autorizado com a pausa cadastral ligada, em lotes de 20 chamadas/minuto, com reconferência por leitura de que o campo ficou apenas com o conteúdo legítimo (ou vazio).
6. **Antes de qualquer envio**, entrego o relatório e o método exato; se a limpeza exigir enviar o cadastro completo, **paro e te aviso** em vez de executar.

## Garantias

- Nada de proprietário, telefone, e-mail, corretor, códigos dos dois sites, fotos, ordem das fotos, preço, descrição, características, localização, Drive ou agenciamento é tocado.
- A pausa de segurança das atualizações cadastrais permanece ligada.
- As informações internas continuam intactas no Gestão.

## Detalhes técnicos

- `src/lib/imobibrasil/serializers.ts`: `stripInternalSiteNotes()` mantido; `pontosFortesImovel` passa a ser enviado como `""` quando não houver conteúdo público (hoje é omitido via `assign`, que descarta vazio).
- Novo caminho de sincronização `text_sync` (espelhado em `media-sync.server.ts`), com corpo mínimo contendo apenas o campo de pontos fortes; jobs em `property_sync_jobs` com ação própria, ignorando `imobi_update_sync_paused` como o `media_sync`.
- Testes com `bun test`: casos A–F + varredura recursiva do payload.
- Relatório gerado a partir de `/tmp/sweep.jsonl` cruzado com `properties` e `property_provider_publications`.
