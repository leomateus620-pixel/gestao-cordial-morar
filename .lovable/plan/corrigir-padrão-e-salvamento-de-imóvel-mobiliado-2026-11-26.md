# Corrigir padrão e salvamento de «Imóvel mobiliado»

## Diagnóstico (confirmado por leitura)
- A coluna `properties.mobiliado` é texto; o formulário usa verdadeiro/falso. Ao salvar, `false` vira o texto `'false'`.
- `mapDetail` (`imoveis.functions.ts`) devolve o texto cru; chip (`!!values.mobiliado`) e ficha (`imovel.mobiliado ? "Sim"`) tratam `'false'` como verdadeiro.
- `toDbPayload` grava o valor sem converter.
- Envio aos sites: as views SQL já interpretam certo; o serializador antigo da ImobiBrasil (`flagToSimNao`) também, e essa integração continua desligada e intocada.
- Outro ponto com o mesmo problema: a criação de vistoria (`creation-workspace.tsx`, linha 262) lê `'true'`/`'false'` como «não informado». Proposta: usar o mesmo conversor ali, só nesse trecho. Se você preferir não mexer em vistoria agora, eu tiro esse item.

Quantidades atuais, sem nenhuma alteração: 808 sem valor, 99 com `'false'` (o 1462 é um deles), 15 com `'true'`. A correção é só na leitura, e não há nenhuma alteração em massa.

## Mudanças
1. **Conversor único** `src/lib/imoveis/mobiliado.ts`:
   - `parseMobiliado(v)`: `true`, `'true'` ou `'sim'` viram verdadeiro. `false`, `'false'`, `'nao'` ou `'não'` viram falso. Sem valor ou com outro valor, fica vazio (`null`).
   - `serializeMobiliado(v)`: grava `'true'`, `'false'` ou `null`, formatos que as views já entendem.
2. **`imoveis.functions.ts`**: `mapDetail` usa `parseMobiliado`, e `toDbPayload` usa `serializeMobiliado` para a coluna `mobiliado`.
3. **`_app.imoveis.$imovelId.editar.tsx`** (`toFormValues`): aplica `parseMobiliado` por segurança.
4. **`PropertyForm.tsx`**: `checked={values.mobiliado === true}`. O cadastro novo continua com `false`, ou seja, desmarcado.
5. **Ficha `_app.imoveis.$imovelId.index.tsx`**: mostra «Sim» só quando o valor é `=== true`. `hasExtraCharacteristics` passa a usar `imovel.mobiliado === true`.
6. **Vistoria** (`creation-workspace.tsx`): usa `parseMobiliado` antes da regra de texto atual. Verdadeiro vira «mobiliado» e falso vira «não». A opção «semimobiliado» continua como está.
7. **Migração**: nenhuma. A coluna continua texto, porque mudar o tipo mexeria nas views dos sites sem necessidade.
8. Registrar em `src/lib/imoveis/AGENTS.md` a regra: `mobiliado` só passa pelo conversor.

## Testes
- `src/lib/imoveis/mobiliado.test.ts`: converte `'false'`, `'true'`, `'sim'`, `'nao'`, `'não'`, vazio e valores verdadeiro/falso nos dois sentidos, e confere que gravar e ler de volta mantém o valor.
- Teste de `mapDetail` e `toDbPayload`: confere que voltam verdadeiro/falso e nunca a palavra `'false'` como texto. Se essas funções não estiverem acessíveis, exporto só as partes puras.
- Teste de tela (vitest, nas telas de imóveis):
  - cadastro novo vem com o chip desmarcado;
  - com `'false'` vindo do banco, o chip aparece desmarcado e a ficha não mostra «Mobiliado: Sim»;
  - com `'true'`, aparece marcado e com «Sim»;
  - desmarcar e salvar envia `'false'`; marcar e salvar envia `'true'`;
  - recarregar mantém o valor.
- Banco isolado: as views `cordial_site_documents` e `morar_site_documents` dão falso para `'false'` e verdadeiro para `'true'`.
- Depois: verificação de tipos, build e suíte completa, com os números por bateria.

## Validação
- Abrir o 1462 no preview, só para ver: o chip deve aparecer desmarcado e a ficha sem «Mobiliado: Sim».
- Nada é gravado em imóvel real.

## Riscos e como desfazer
- O risco é baixo, porque a mudança é só na leitura e na exibição.
- Para desfazer, basta reverter o commit. Não há migração nem dados a desfazer.
- Não vou publicar.
