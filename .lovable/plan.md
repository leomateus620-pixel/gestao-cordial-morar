# Redes sociais oficiais: Cordial e Morar

## Endereços confirmados
Os quatro endereços abaixo aparecem nos rodapés das versões antigas e oficiais dos sites, arquivadas no Web Archive.

| Marca | Instagram | Facebook |
|---|---|---|
| Cordial | https://www.instagram.com/cordialimoveis/ | https://www.facebook.com/cordialimoveis |
| Morar | https://www.instagram.com/morarimoveis.sr/ | https://www.facebook.com/morarimoveis.sr |

O perfil antigo @cordial_imoveis não será usado. YouTube, TikTok, LinkedIn e Google Maps ficarão vazios.

## O que será feito
1. Salvar os links pelo painel "Site e Google" de cada marca, usando o mesmo caminho de salvamento do painel. As permissões e a auditoria serão as mesmas de sempre.
2. Conferir se os dados ficaram salvos em cada marca, sem misturar os links.
3. Conferir os rodapés nos dois domínios, no computador e no celular:
   - se os ícones aparecem;
   - se cada link aponta para o perfil certo;
   - se o link abre em nova aba com proteção.
4. Se o rodapé não abrir em nova aba ou não tiver a proteção, fazer um ajuste mínimo apenas nesse trecho. Esse ajuste ficaria somente na prévia, sem publicação.

## Observação
As configurações já valem no site no ar assim que forem salvas, sem nova publicação. Isso acontece porque o rodapé atual já exibe os campos de Instagram e Facebook.

## Não muda
Imóveis, fotos, busca, SEO, redirecionamentos, layout e outras integrações.

## Detalhes técnicos
- Campos `instagram` e `facebook` em `settingsSchema` (contract.ts). O rodapé é renderizado em SiteShell.tsx.
- O salvamento será feito pelo mesmo caminho do painel administrativo. A gravação será confirmada com SELECT em cordial_site_settings e morar_site_settings, e o rodapé será verificado com Playwright em 1280px e 390px.
