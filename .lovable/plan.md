# Sites Cordial e Morar: tirar os avisos de aceitar/recusar e explicar a coleta na Privacidade

## O que muda para o visitante
- Os dois avisos que aparecem ao entrar no site somem para todos:
  - "Com sua permissão, a {marca} mede como as visitas chegam ao site..." (audiência) e o link "Métricas de audiência" no rodapé.
  - O aviso de "Preferências de métricas" (Google Analytics).
- Não haverá mais botões "Aceitar" / "Recusar" / "Revogar".
- A página de Política de Privacidade de cada site (Cordial e Morar) ganha uma seção "Quais dados coletamos ao navegar", explicando em linguagem simples:
  - páginas visitadas, buscas, imóveis vistos e cliques em contato (WhatsApp, telefone, formulário);
  - origem da visita (Google, redes sociais, link direto), aparelho e navegador;
  - para que usamos (entender quais imóveis e páginas interessam mais) e que não vendemos esses dados;
  - como pedir acesso ou exclusão pelo e-mail do encarregado (já existente).
- O link "Privacidade" do rodapé continua levando a essa página.

## O que continua no painel
- Sessões e audiência dos sites no painel do Gestão continuam sendo medidas, agora para todos os visitantes, sem depender de aceite.
- Google Analytics passa a medir as visitas também sem aceite.

## Decisão que tomei (avise se quiser diferente)
- Anúncios (Meta Pixel e sinais de publicidade do Google) continuam desligados, porque eles dependiam do aceite e sem aviso não há como pedir. Medição de visitas segue normal; só a parte de anúncios/remarketing fica parada.
- Lembrete: as regras de privacidade (LGPD) pedem transparência sobre essa coleta; vale confirmar com quem cuida do jurídico de vocês.

## Detalhes técnicos
- `SiteShell.tsx`: deixar de renderizar `<SiteAnalytics>` como painel e `<SiteAudience>` como botão/painel; manter só a ativação.
- `SiteAudience.tsx`: remover UI; ativar `activateAudience` sempre que a configuração vier habilitada (sem depender de `readAudiencePreference`), mantendo o fallback de política rejeitada e o `updateView` por página.
- `SiteAnalytics.tsx` / `analytics-consent.ts`: inicializar com `analytics_storage: granted`; `ad_storage`, `ad_user_data`, `ad_personalization` e Meta Pixel continuam negados/não carregados.
- `gtm-install.ts` / testes do GTM: ajustar o default para analytics concedido e publicidade negada.
- `privacy-template.ts`: trocar "Com o seu consentimento, coletamos também métricas de navegação" pela nova seção; ajustar o trecho de "revogar o consentimento".
- `site.css`: remover estilos que só serviam aos avisos.
- `src/lib/cordial-site/AGENTS.md`: atualizar a regra "Meta Pixel só após consentimento / GTM tudo negado" para "medição de visitas sem aviso; publicidade sempre negada".
- Sem migração e sem alteração de dados.
- Testes: atualizar os do GTM/consentimento; novo teste garantindo que a audiência ativa sem preferência salva e que publicidade fica negada. Rodar tsc, build e a suíte do site. Conferir no navegador que nenhum aviso aparece nas duas marcas e que a Privacidade mostra a nova seção.
- Não publicar até seu OK.
