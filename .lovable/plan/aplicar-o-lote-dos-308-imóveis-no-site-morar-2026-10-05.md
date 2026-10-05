# Aplicar o lote dos 308 imóveis no site Morar

## Conferência já feita (somente leitura)
- Hoje existem 363 imóveis com vínculo ativo Morar; 308 sem bloqueio.
- A "impressão digital" da lista atual de 308 é exatamente a registrada na autorização de 04/10 (`6586600e…962b`). Ou seja: é o mesmo conjunto aprovado, sem imóvel a mais ou a menos.
- O arquivo restrito original não está neste ambiente, por isso a lista é recalculada do banco e conferida por essa impressão digital.

## O que será feito
1. Em uma única operação no banco, agindo como o Leonardo (admin), com as mesmas regras do botão "Inventário e ativação":
   - ler o inventário Morar e pegar a versão atual de cada um dos 308;
   - rodar a simulação (sem gravar) e exigir que os 308 estejam prontos;
   - aplicar o lote uma vez, confirmando autorização e disponibilidade **só para o site Morar**, aprovando as fotos já associadas (revisão por amostra documentada) e sem converter áreas de unidade desconhecida.
2. Trava de segurança: na mesma operação, contar fotos marcadas para reprocessar antes e depois. Se alguma foto mudar de situação, ou se a simulação não der 308 prontos, **tudo é desfeito** e eu aviso.
3. Conferir: 308 publicados, `/site-morar` mostrando imóveis, busca, uma página de detalhe e fotos carregando.

## O que não muda
- Nenhum campo do imóvel (autorização, disponibilidade, preço, códigos, corretor, carteira, fotos) é alterado.
- Nada é enviado aos sites ImobiBrasil, nada é publicado no site oficial, nenhum domínio muda.
- Os 55 imóveis bloqueados continuam fora.

## Como desfazer, se preciso
"Retirar do site" na administração Morar, por imóvel ou para todo o lote; o cadastro fica intacto.

## Detalhes técnicos
- `set_config('request.jwt.claims', {"sub":"d3abe478…","role":"authenticated"}, true)` dentro da transação; `morar_site_inventory` paginado; `morar_site_review_batch(_dry_run=true)` e depois `false` com `_confirm_authorization=true, _confirm_availability=true, _review_media=true, _areas_m2=false`, `_batch_id` fixo para ser idempotente.
- Checagem por `processing_status`/`desired_destination_hash` de `property_images` antes/depois; divergência → `RAISE` (rollback).
