# Links das seleções nos domínios dos sites

## O que está errado hoje
- O botão "Copiar link" monta o endereço a partir de onde o corretor está usando o sistema (prévia ou cordialgestao.com). Por isso o cliente recebe um link do sistema, como o do print, que pede login ou não é o endereço da marca.
- Nos domínios novos (cordialimoveis.com e imobiliariamorarimoveis.com.br) o endereço `/s/...` é desviado para dentro do site e não encontra a página da seleção, então mesmo trocando o domínio à mão o link não abre.
- "Detalhes" só abre uma janelinha; não leva ao anúncio do imóvel no site da marca.

## O que vai mudar
1. **Link sempre no domínio da marca**: seleção Cordial gera `https://cordialimoveis.com/s/<código>`; seleção Morar gera `https://imobiliariamorarimoveis.com.br/s/<código>`. Vale para "Copiar link", texto do WhatsApp e lista de Seleções.
2. **Página da seleção funcionando nos dois domínios**, com logo, cores e WhatsApp da marca certa. Se alguém abrir uma seleção Morar no domínio Cordial (ou vice-versa), é levado ao domínio correto.
3. **Links antigos já enviados continuam valendo**: quem abrir `/s/<código>` pelo cordialgestao.com ou pelo endereço do sistema é redirecionado automaticamente para o domínio da marca da seleção.
4. **"Ver anúncio no site"** em cada imóvel disponível (na janela de detalhes), abrindo a página do imóvel no site da marca — só para imóveis que estão no ar nesse site.
5. Nada muda nas regras de quais imóveis aparecem, nem nos dados das seleções existentes.

## Validação
- Testes automáticos para: montagem do link por marca, redirecionamento dos links antigos e domínio errado.
- Abrir na prévia uma seleção Cordial e uma Morar simulando cada domínio, sem login, e conferir fotos, botão do WhatsApp e "Ver anúncio no site".
- Não publico sem sua autorização.

## Detalhes técnicos
- `selectionPublicUrl(token, agency)` passa a usar `sitePublicHost(agency)` (domains.ts); chamadas em SelectionPanel.tsx e _app.selecoes.tsx recebem a agency.
- `rewritePublicInput` (routing.ts) deixa `/s/` passar sem prefixar `/site`, como já faz com `/api/`.
- `src/server.ts`: para `GET /s/<token>` fora do domínio da marca correta, consulta a agency via `shared_selection_public` (ou RPC leve só com agency) e responde 301 para o domínio certo; mantém prévia acessível para teste.
- Migração aditiva: `shared_selection_public` passa a devolver `site_public_id` por item somente quando o imóvel é elegível na view `<marca>_site_eligible`; `toPublicSelection` aceita o campo na lista fechada.
- AGENTS.md de src/lib/selecoes atualizado com a regra do domínio por marca.
