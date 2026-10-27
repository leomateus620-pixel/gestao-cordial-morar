# Corretor "a preencher" e conferência dos sites

## Situação atual (verificado)
- 1178/3003: publicado no site Cordial e no site Morar, e ativo nos dois anúncios da ImobiBrasil.
- 2758: publicado no site Morar e ativo na ImobiBrasil Morar. Conforme a sua escolha, fica só na Morar.
- Os dois imóveis estão sem corretor no Gestão. O cadastro já tem o campo "Quem agenciou", que pode ficar vazio.

## O que será feito
1. **Corretor a preencher**
   - Na ficha do imóvel, quando não houver corretor, o campo "Quem agenciou" mostra "A preencher" com um atalho "Escolher corretor" que abre o cadastro direto nesse campo.
   - No cadastro, a opção vazia do campo passa a se chamar "A preencher (definir depois)".
   - Os dois imóveis continuam sem corretor. Quando alguém escolher um corretor mais tarde, a alteração segue o caminho normal de salvar.
2. **Sites**: não envio nada de novo. Confiro se os dois continuam exibidos nas páginas públicas e ativos na ImobiBrasil, e relato o resultado.

## Garantias
- Nenhuma alteração de proprietário, códigos ou fotos.
- Nenhum envio à ImobiBrasil nesta etapa.

## Detalhes técnicos
- `src/routes/_app.imoveis.$imovelId.index.tsx`: o `InternalField` "Quem agenciou" mostra "A preencher" e um link para a edição (âncora do campo).
- `src/components/imoveis/PropertyForm.tsx`: texto da opção vazia e um `id` no campo para a âncora.
- Verificação: GET nas páginas `/site-morar/imovel/<id>`, na página Cordial e em `/imovel/dados` na ImobiBrasil.
