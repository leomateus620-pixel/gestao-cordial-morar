## Diagnóstico

Rodei o app ao vivo com uma conta admin (Leonardo — Administrador/Proprietário) e o menu **Corretores** já renderiza a nova versão completa: hero "Inteligência operacional", 6 KPIs clicáveis, filtros operacionais, ranking do período, card de tempo de resposta e cards por corretor (Geandre, Felipe, Pablo).

Ou seja, não há bug de código nem de permissão. O que está acontecendo é que **o site publicado (cordialgestao.com) ainda serve a build anterior** — mudanças de frontend só vão ao ar quando o projeto é republicado.

## O que fazer

1. Rodar a verificação de segurança do projeto (obrigatória antes de publicar) e reportar qualquer achado crítico antes de seguir.
2. Republicar o projeto, gerando uma nova build com o código atual do menu Corretores.
3. Confirmar que o deploy foi disparado e informar a URL, avisando que leva ~1 minuto (um pouco mais no domínio personalizado) para propagar.
4. Orientar os admins a recarregar com cache limpo (Ctrl/Cmd + Shift + R) na primeira visita após a publicação, já que o navegador pode manter os arquivos antigos em cache.

## Observação técnica

Nenhuma alteração de código é necessária. Se depois da republicação algum admin ainda vir a tela antiga, o próximo passo seria checar o cache do navegador/CDN daquele acesso específico — não a lógica de permissão, que já foi validada.
