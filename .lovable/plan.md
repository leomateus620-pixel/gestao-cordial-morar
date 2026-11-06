# Botão interativo do WhatsApp — site da Cordial

## Situação atual (conferida)
- O número salvo do site da Cordial já é o **55 55 99659-0199**.
- Já existe um botão simples no canto ("Vamos conversar"), branco, sem animação, e ele **some nas páginas de imóvel**.

## O que vai mudar (só no site da Cordial)
1. **Novo botão flutuante** no canto inferior direito, com o ícone verde do WhatsApp em círculo:
   - leve pulso chamando atenção ao entrar no site (para depois de alguns segundos, e não pulsa para quem prefere menos movimento);
   - ao passar o mouse, abre o texto "Fale com a Cordial";
   - depois de ~6 s, mostra um balão pequeno: "Olá! Posso ajudar a encontrar seu imóvel?" com um X para fechar (fica fechado durante a visita).
2. **Ao clicar**, abre a conversa com 55 55 99659-0199 já com mensagem pronta:
   - páginas gerais: "Olá! Vim pelo site da Cordial Imóveis e gostaria de atendimento.";
   - página de imóvel: mensagem com o código e o link do imóvel (passa a aparecer também nessas páginas, sem cobrir os botões de contato no celular).
3. Celular: botão menor, acima da barra de contato do imóvel quando ela existir; nada sobreposto ao rodapé ou ao aviso de cookies.
4. O clique continua sendo contado nas métricas do site (só com consentimento).

## Fora do escopo
- Site da Morar, Gestão, número dos corretores nos cartões, dados salvos. Nada publicado sem sua autorização.

## Detalhes técnicos
- `SiteShell.tsx`: novo componente `WhatsAppFloat` (só `brand === "cordial"`; Morar mantém o atual), número via `whatsappNumber(settings.whatsapp)`, link `wa.me/<n>?text=` com mensagem por página; balão fechado guardado em sessionStorage lido após hidratação.
- `site.css`: estilos `.cs-wa-float`, animação com `prefers-reduced-motion`, ajuste de posição com `.cs-mobile-contact`.
- Teste vitest da função que monta o link/mensagem (número 5555996590199, mensagem geral e de imóvel).
- Conferência no navegador em 1366 e 390 px, home e página de imóvel.
