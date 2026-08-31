# Descrição fiel nos sites (fim dos "?????")

## O que foi verificado

No Gestão Cordial, a descrição do imóvel 1340 / 3336 está salva **corretamente**, com emojis:
"✨ Casa à venda no bairro Central! ... 📍 Bairro Central 🏡 Características ... 🔹 01 quarto ... ✔️ Localização privilegiada".

No site publicado, exatamente esses caracteres aparecem como `????`. Ou seja: acentos vão bem (`à`, `ç`, `ã`), só emojis e símbolos especiais (✨ 📍 🏡 🔹 ✔️ —) viram interrogação. É o banco dos sites (Cordial/Morar) que não aceita esses caracteres — não é perda de texto nossa.

Além disso, as quebras de linha somem: o site exibe tudo como um parágrafo único.

## Correção proposta

1. **Sanitizar o texto antes de enviar aos sites**
   - Converter emojis/símbolos decorativos em equivalentes seguros: `🔹 ✔️ ▪ •` viram `-`; `✨ 📍 🏡` e demais pictogramas são removidos; travessão `—` vira `-`; aspas curvas viram aspas simples.
   - Remover qualquer caractere fora do conjunto aceito pelos sites, sem tocar em acentos e cedilha.
   - Limpar espaços duplicados deixados pela remoção.

2. **Preservar as quebras de linha**
   - Enviar as quebras no formato que os sites renderizam (`<br />`), para a descrição sair em linhas/tópicos como o corretor escreveu, e não em bloco único.

3. **Aplicar em todos os campos de texto livre**
   - Descrição, observações, pontos fortes, outras informações, título e descrição SEO.

4. **Aviso no cadastro (sem bloquear)**
   - Na etapa de descrição, um aviso discreto quando houver emojis: "Os sites não exibem emojis — eles serão convertidos automaticamente."

5. **Reenviar o imóvel afetado**
   - Após a correção, reenviar o 1340 / 3336 para Cordial e Morar e conferir na página pública que a descrição sai limpa e em tópicos.

## Detalhes técnicos

- Novo helper de sanitização em `src/lib/imobibrasil/serializers.ts`, aplicado nos `assign` de `descricaoImovel`, `observacaoImovel`, `pontosFortesImovel`, `outrasInformacoesImovel`, `seoTitulo`, `seoDescricao`.
- Testes em `src/lib/imobibrasil/serializers.test.ts` cobrindo emoji → hífen/remoção, acentos preservados e `\n` → `<br />`.
- Aviso de UI em `PropertyForm.tsx` (etapa de conteúdo). Sem mudança de schema; o texto original continua salvo íntegro no Gestão Cordial.
