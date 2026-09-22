# Contrato de alteração ImobiBrasil — mapa de campos (22/09/2026)

Semântica confirmada em conta (`/api/v1/doc/api.json`, Cordial e Morar):
**omitir preserva · vazio limpa**. Obrigatórios em toda alteração:
`finalidade`, `codigoTipoImovel` (+ `referencia`, mantida por identidade).

Fonte do mapa: `src/lib/imobibrasil/update-contract.ts` (`LOCAL_FIELD_MAP`).

| Campo no Gestão | Campo da API | Limpeza | Verificável na leitura |
| --- | --- | --- | --- |
| operação / finalidade | `finalidade` | não (contrato exige valor) | sim |
| tipo | `codigoTipoImovel` | não | sim |
| referência (código do site) | `referencia` | não | sim (`referenciaImovel`) |
| CEP, logradouro, número, complemento, bairro, zona, região | idem | sim | sim (`endereco`) |
| cidade / UF | `codigoCidade` | não | não (a leitura devolve nome, não código) |
| área principal / útil | `areaPrivativa` + `tipoAreaPrivativa` | sim | sim |
| área total / construída / terreno | `areaTotal` / `areaConstruida` / `areaTerreno` | sim | sim |
| dormitórios, suítes, banheiros, salas, vagas | `dormitorios`, `suites`, `banheiros`, `salas`, `garagem` | sim (`0` é valor, não limpeza) | sim |
| valor | `valorImovel` | sim | sim (`valorEsperado`) |
| IPTU, condomínio, taxas | `valorIPTU`, `valorCondominio`, `valorTaxas` | sim | sim |
| observação do valor | `valorObservacao` | sim | sim (`valorObservacoes`) |
| descrição | `descricaoImovel` (+ `pontosFortesImovel`) | sim | não (a leitura não devolve o texto de forma confiável) |
| pontos fortes | `pontosFortesImovel` (+ `descricaoImovel`) | sim | sim |
| vídeo, tour virtual | `video`, `tourVirtual` | sim | sim |
| mobiliado, exclusividade, autorização, escriturada, averbada, com placa, aceita financiamento, permuta | idem (`sim`/`nao`) | não (`false` é valor) | sim |
| exibir no site, destaque | `exibirImovel`, `destaqueInicial` | não | sim |
| disponibilidade, origem da captação, ano, pavimento, local da chave, unidade, empreendimento | idem | sim | sim |
| proprietário / corretor / usuário adicional | `codigoProprietario`, `codigoCorretor`, `codigoUsuarioAdicional` | **nunca** | sim (mas `0` = desconhecido) |
| observações internas, outras informações, link do Maps, contato do proprietário | — | — | nunca enviados |

## Limitações comprovadas

- **Destaque de foto**: a API só oferece inserir / excluir / listar imagem. Não há
  alternância de destaque nem reordenação; correção de destaque duplicado só pelo
  painel do site.
- **Característica**: a desassociação usa
  `POST /imovel/{codigoImovel}/caracteristica/excluir/{codigoCaracteristica}`.
  O endpoint `/imovel/caracteristica/excluir/{codigo}` apaga do catálogo global e
  **nunca** é usado.
- **Cidade**: a leitura do imóvel devolve o nome, não o código; por isso
  `codigoCidade` fica como "não verificável" na conferência pós-escrita.
- **`nomeCondominio`** é tipado como inteiro no contrato: não é enviado sem
  mapeamento administrativo confirmado.
- **Pessoas**: o imóvel aceita apenas o código do cadastro. Nome não resolve
  vínculo; homônimo fica classificado como desconhecido (e o campo não viaja).

## Estados por campo na alteração

- **intocado** — fora do corpo (o site preserva).
- **definido** — vai no corpo, inclusive `0` e `false` legítimos.
- **limpeza intencional** — vai vazio, e somente quando o usuário tocou o campo
  e o site ainda tem conteúdo.

Sem a lista de campos tocados (jobs antigos, reconciliação), a alteração cai na
diferença contra o último envio confirmado e **nunca** limpa nada por conta.
