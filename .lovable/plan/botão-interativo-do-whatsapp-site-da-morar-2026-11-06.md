# Botão interativo do WhatsApp — site da Morar

## Situação atual (conferida)
- O site da Cordial já tem o botão flutuante "Vamos conversar" com o número dela.
- No site da Morar o botão existe no código, mas **não aparece**: as configurações da Morar estão **sem número de WhatsApp** salvo (o botão do menu "Conversar pelo WhatsApp" também fica escondido).

## O que vai mudar (só no site da Morar)
1. **Salvar o número 55 55 99659-0199** nas configurações do site da Morar (só o campo WhatsApp; nada mais muda). Com isso voltam a funcionar o botão flutuante e o "Conversar pelo WhatsApp" do menu.
2. **Botão flutuante interativo**, com a mesma experiência da Cordial, nas cores da Morar:
   - ícone do WhatsApp em círculo, com leve pulso ao entrar (para sozinho; sem animação para quem prefere menos movimento);
   - ao passar o mouse abre o texto "Fale com a Morar";
   - depois de ~6 s mostra um balão: "Olá! Posso ajudar a encontrar seu imóvel?" com X para fechar (fica fechado durante a visita).
3. **Ao clicar** abre a conversa com 55 55 99659-0199 já com mensagem pronta:
   - páginas gerais: "Olá! Vim pelo site da Morar Imóveis e gostaria de atendimento.";
   - página de imóvel: mensagem com o código e o link do imóvel (o botão passa a aparecer também ali, sem cobrir os botões de contato no celular).
4. Celular: botão menor, sem ficar por cima do rodapé, do aviso de cookies ou da barra de contato.

## Fora do escopo
- Site da Cordial (continua igual), Gestão, corretores, site atual da Morar na ImobiBrasil. Nada publicado sem sua autorização.

## Detalhes técnicos
- Dado: UPDATE apenas de `morar_site_settings.content.whatsapp = "5555996590199"` (jsonb_set), sem migração.
- `SiteShell.tsx`: componente `WhatsAppFloat` usado quando `brand === "morar"`; link `wa.me/<n>?text=` montado por função pura; balão fechado em sessionStorage lido após hidratação.
- `morar.css`: estilos do botão/balão, `prefers-reduced-motion`, posição com `.cs-mobile-contact`.
- Teste vitest da função do link (número e mensagens geral/imóvel).
- Conferência no navegador em 1366 e 390 px (home e imóvel) e checagem de que a Cordial não mudou.
