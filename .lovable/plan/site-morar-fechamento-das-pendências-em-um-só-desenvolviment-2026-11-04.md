# Site Morar — fechamento das pendências, em um só desenvolvimento

Já está pronto na prévia: o tamanho certo das fotos, fotos do cache aparecendo na hora, os nomes dos filtros completos e a gaveta "Mais filtros" no celular. Este plano fecha todo o resto, em etapas encadeadas. A Cordial continua funcionando como hoje, e nada é publicado sem sua autorização.

## Etapa 1 — Base comum por marca (organização)
- Hoje o código da vitrine semanal tem os nomes da Cordial fixos (tabelas, bucket e funções). Vou trocá-los por um "adaptador de marca" com os nomes de cada uma.
- Cordial: mesmos dados de hoje, sem migrar nada.
- Morar: tabelas, armazenamento e funções próprios.
- Uma só lógica de vitrine serve as duas marcas, e cada consulta fica presa à sua própria marca.

## Etapa 2 — Banco e armazenamento da Morar (migração aditiva)
- Três tabelas novas, no mesmo formato da Cordial:
  - `morar_site_showcase_settings`
  - `morar_site_showcase_weeks`
  - `morar_site_showcase_attempts`
- Todas com permissões de acesso, regras de segurança (só administração edita) e o bloqueio da conta de revisão da Meta.
- O banco aceita no máximo uma semana ativa na Morar.
- Funções da Morar:
  - leitura da vitrine ativa, que só devolve imóvel publicado e disponível no site Morar e com a foto autorizada;
  - trava contra duas execuções ao mesmo tempo;
  - **ativação atômica**, que valida e troca a semana ativa num único passo.
- A ativação atômica também passa a valer para a Cordial. Hoje a Cordial encerra a semana anterior antes de ativar a nova, em duas chamadas separadas.
- Bucket privado `morar-showcase`, acessado só pelo servidor.

## Etapa 3 — Rotina automática da Morar
- A geração usa o mesmo editor de fotos já configurado.
- Cada geração tem chave única por marca, semana, imóvel e versão. Rodar o agendamento de novo não paga outra edição.
- Se a conexão cair durante o envio, a tentativa fica marcada como "incerta" e não é reenviada.
- Agendamento: um disparo por hora, autenticado pelo método interno, como na Cordial.
- O disparo ativa o que já venceu (segunda às 06h, horário de São Paulo), inclusive se a execução atrasar.
- Sem edição aprovada, entra a foto original do mesmo imóvel.
- Se o imóvel sair do site, a semana é retirada e entra uma alternativa elegível. Sem nenhum candidato, a abertura fica neutra.
- A IA nunca roda durante uma visita ao site.

## Etapa 4 — Site e foto da semana
- A home da Morar passa a buscar a vitrine da própria Morar.
- Foto, preço, cartão, WhatsApp e link vêm todos do mesmo anúncio Morar.
- Um endereço próprio da Morar entrega só a foto aprovada, com cache privado. Ele confere de novo se o imóvel ainda está no site.
- Se a foto editada falhar, o site tenta uma vez a foto original. Se esta também falhar, a abertura fica numa superfície neutra e legível.
- A escolha manual "Em destaque" continua como alternativa. O site não afirma "atualizado toda semana" enquanto não houver uma semana ativa de verdade.

## Etapa 5 — Aba "Vitrine semanal" na administração da Morar
Mesma tela já usada na Cordial (reaproveitada, com a marca indicada). Ela mostra:
- a semana ativa e a escolha manual, separadas;
- a foto original e a editada, lado a lado;
- o estado da geração e o ponto focal para computador e celular;
- a próxima execução e o histórico de tentativas.

Ações disponíveis:
- escolher o imóvel, preparar a próxima semana, aprovar ou reprovar, ativar, pausar e pedir nova edição.

Proteções:
- os botões ficam bloqueados enquanto uma ação está em andamento;
- o servidor confere de novo permissão, marca e estado de cada ação.

## Etapa 6 — Acabamentos que faltaram
- Refazer a captura da gaveta aberta no celular, com o teclado aberto, e ajustar o que precisar.
- Retirar o efeito antigo de entrada das seções, que não tem mais função.
- Auditar as fotos de capa e a da abertura quanto a marca Morar duplicada ou do canal errado. Os originais ficam preservados, e o resultado vai no relatório.

## Etapa 7 — Testes e conferência
- **Testes automáticos novos:**
  - tamanho das fotos respeitado;
  - foto já carregada sendo reconhecida;
  - filtros com rascunho, aplicação e descarte;
  - vitrine de uma marca sem enxergar a da outra;
  - ativação única e repetível sem duplicar;
  - execução atrasada do agendamento;
  - edição incerta não reenviada.
- **Navegador:**
  - telas 1280×720, 1366×768, 1440×900, tablet em pé e deitado, 390×844 e 360×800;
  - entrada direta, cache frio e cache já carregado;
  - voltar da ficha do imóvel e uso só pelo teclado;
  - Cordial sem mudanças.
- **Medições** antes e depois, nas mesmas condições: tempo até a foto principal, estabilidade do layout, quantidade de dados e de imagens. O ponto de partida é a "prévia no início da conclusão".
- **Teste real:** uma única edição com IA na Morar (cerca de 0,8 crédito). Ela só é ativada no site depois da sua aprovação na tela.

## Entrega
Uma lista curta com o que foi corrigido, o que foi testado e as medições, junto com as capturas. Se algo ficar bloqueado, digo qual é o bloqueio.

## Detalhes técnicos
- Novo `src/lib/site-showcase/brand-adapter.ts` com `{ settings, weeks, attempts, bucket, rpc: { active, takeLock, releaseLock, activate } }` por marca.
- `showcase.server.ts` e `showcase.functions.ts` recebem a marca e validam `brand ∈ {cordial, morar}` no servidor.
- Nova RPC `*_showcase_activate(_week uuid, _original bool)` com `pg_advisory_xact_lock` e índice único parcial `WHERE state='ativo'`, nas duas marcas.
- Nova rota `src/routes/api/public/hooks/morar-showcase.ts`, com cron horário via `internal_worker_headers()`, e endpoint de mídia Morar.
- `home-loader.ts` passa a chamar `loadShowcase(brand)`.
- `ShowcaseManager` recebe `brand`; nova aba em `_app.site-morar-administracao.tsx`.
- A regra de arquitetura vai para o `AGENTS.md`.
