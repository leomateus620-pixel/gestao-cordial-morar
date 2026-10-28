# Evidências visuais de Marketing

Capturas reais do código executado no navegador local, usando fixtures explicitamente sintéticas. Não são imagens geradas, maquetes nem provas de chamadas reais à Meta. A prévia usa os componentes de produto e adapta somente transporte e sessão.

- `overview-{360,390,768,1280,1440}.png`: larguras CSS verificadas em `viewports.json`, sem rolagem horizontal da página.
- `campaigns-*`, `leads-*`, `reports-*`: listagem, fila operacional e relatórios; o estado `reports-queued-1440.png` tem download desabilitado e informa solicitação, sem sucesso antecipado.
- `wizard-bianca-review-1440.png`, `wizard-review-360.png`: rascunho de Bianca salvo, orçamento/calendário preservados e criação pausada ainda não executada. No celular, a revisão tem rolagem interna e as ações permanecem alcançáveis.
- `pdf-page-{1,2}.png`: páginas renderizadas da amostra PDF com logo oficial e dados sintéticos. Todas as cinco páginas da amostra foram inspecionadas; nenhuma pessoa real consta no arquivo.
- `marketing-preview-synthetic.mp4`: vídeo de 36 segundos montado com 12 capturas reais das interações na prévia (3 segundos por quadro). Mostra visão geral, campanha/detalhe, leads/histórico, relatório/prévia/disponível/fila e assistente. Não é gravação contínua nem medição de latência.

As capturas da sessão autenticada de produção foram mantidas localmente fora do repositório para não publicar informações reais. A sessão, inicialmente indisponível, ficou acessível ao final da execução; a referência publicada ainda era a interface anterior, sem deploy desta branch. O primeiro acesso sem filtro mostrou dezembro/1969, defeito corrigido no cálculo tardio do mês padrão.

Não houve pesquisa com participantes nem medição de LCP/INP/CLS p75. Contagens de interação e limites estão em `docs/meta-marketing-ux.md`. Os resultados SQL e do teste externo de Lead Ads têm registros separados das fixtures.
