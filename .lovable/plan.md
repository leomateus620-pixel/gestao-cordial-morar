# NFS-e IPM: formato do item de serviço e demais campos numéricos

## O que foi conferido
- No cadastro das duas marcas o item está salvo como `10.05`. Na montagem do arquivo ele passa por `sanitizeText`, que mantém o ponto. É exatamente o que a prefeitura recusou.
- Os outros campos numéricos já saem **só com dígitos** (passam por `onlyDigits`): CNPJ/CPF do prestador e do tomador, CEP, cidade (TOM 8847), local da prestação, DDD, telefone, cLocalidadeIncid, finNFSe, indFinal, cIndOp (020101), tpOper, CST (011) e cClassTrib (011004).
- Dois campos de código ainda passam por `sanitizeText`, que não tira pontuação: `codigo_nbs` (salvo `110012100`, que já está certo, mas seria recusado se alguém digitasse `1.1001.21.00`) e `situacao_tributaria` (`0`). Os dois passam a sair só com dígitos.
- Valores e alíquota vão com vírgula (`100,00`, `3,0000`), que é o formato decimal da IPM. Esses campos não são do tipo inteiro e **ficam como estão**. Se a prefeitura recusar esse formato, o erro vai aparecer no próximo teste e a mudança fica para outro ciclo.
- O cadastro não usa campo de CNAE nem de código de atividade, então não há nada a corrigir ali.

## Mudanças
1. **Item da lista de serviço (`xml.ts`)**: nova função `normalizeItemListaServico(valor, formato)`:
   - Remove tudo o que não é dígito: `10.05` vira `1005`, e `10.05.01` vira `100501`.
   - Formato padrão `lc116` (4 dígitos): se sobrarem 3 dígitos, completa com zero à esquerda (`1.05` vira `0105`). Se sobrarem 6, mantém os 6.
   - Formato `cgnfse` (6 dígitos, desdobramento da NT 122/2025): se sobrarem 4 dígitos, completa com `01` no fim (`1005` vira `100501`).
   - Se o código ficar vazio ou com tamanho que não dá para usar, a emissão para antes do envio com a mensagem "Código do item da lista de serviço inválido". Nada é enviado nesse caso.
   - O valor salvo no cadastro (`10.05`) não muda.
2. **Opção de reserva sem migração**: o formato é lido do segredo opcional `IPM_NFSE_ITEM_FORMATO_CORDIAL` / `_MORAR` (`lc116` ou `cgnfse`). Se o segredo não existir, vale `lc116`. Não crio esse segredo agora. Se a prefeitura recusar `1005`, você cadastra `cgnfse` em Configurações do projeto → Secrets. Como alternativa, dá para salvar `10.05.01` no cadastro, porque a normalização já gera `100501`.
3. **NBS e situação tributária** passam a sair só com dígitos (NBS com no máximo 9, situação com no máximo 4).
4. **Testes (`xml.test.ts`)**:
   - `10.05` vira `1005`, `1005` continua `1005`, `1.05` vira `0105`, `10.05.01` vira `100501`.
   - No formato `cgnfse`, `10.05` vira `100501`.
   - Um valor inválido lança erro.
   - O XML gerado tem `<codigo_item_lista_servico>1005</codigo_item_lista_servico>` e nenhum ponto nos campos numéricos (NBS, CNPJ, CEP, cIndOp, CST, cClassTrib).
   - Depois, roda a tipagem e a suíte completa.
5. **Documentação**: acrescentar a regra do formato e a opção de reserva em `docs/NFSE-IPM-SANTA-ROSA.md`.

## Validação (após aprovação)
- Uma tentativa em modo teste por marca, com os mesmos contratos de antes:
  - Cordial: R$ 100, competência 08/2026, contrato e971e17a…
  - Morar: R$ 85, competência 09/2026, contrato 9eb47d1a…
- A tentativa usa o mesmo fluxo de teste pelo servidor no preview, com `modo_teste` continuando ligado.
- Depois, informo o `status` e a `error_message` gravados em `rental_nfse_emissions`.
- Se vier nova recusa de formato (inclusive se `1005` for recusado), paro e trago a mensagem sem tentar de novo.

## Riscos
- A prefeitura pode exigir o desdobramento de 6 dígitos (`100501`). Nesse caso, basta cadastrar o segredo de formato, sem mudar código.
- Pode aparecer outra crítica do formato depois dessa (por exemplo, sobre valores decimais), porque o XSD para na primeira falha. Nesse caso, isso vira um novo ciclo curto.

## Fora do escopo
- Não altero segredos, telas nem dados do cadastro, e não publico.
- Nenhuma emissão real.
- Não mexo em outras áreas.
