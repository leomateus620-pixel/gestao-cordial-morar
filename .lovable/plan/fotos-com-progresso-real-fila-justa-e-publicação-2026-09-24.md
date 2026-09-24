# Fotos com progresso real, fila justa e publicação

## Objetivo
Publicar as correções já prontas da marca-d’água e da retomada rápida, impedir que tarefas antigas com leituras falhas consumam todo o limite da Cordial ou Morar e mostrar na tela o andamento real das fotos por site.

## 1. Publicar as correções já concluídas
- Publicar o caminho alternativo de marca-d’água que funciona no site publicado quando o processamento principal não inicia.
- Publicar a retomada de galerias em andamento em cerca de 75 segundos, sem empurrá-las para uma espera de uma hora.
- Confirmar que a versão publicada contém essas duas correções antes de atribuir qualquer novo resultado a elas.

## 2. Proteger o limite de cada site
- Quando Cordial ou Morar responder 429, guardar a espera pedida pelo próprio site e pausar novas chamadas somente daquela imobiliária até esse horário.
- Manter os limites compartilhados atuais de 4 chamadas por segundo e 18 por minuto por site.
- Fazer leituras repetidamente inconclusivas esperarem progressivamente mais, com pequena variação para evitar várias retomadas simultâneas.
- Manter novas tarefas elegíveis enquanto uma tarefa antiga estiver em espera; a falha de um imóvel não reservará continuamente as vagas dos demais.
- Preservar os comportamentos de segurança: nenhuma repetição cega de foto com entrega incerta, um envio ativo por imóvel/site, lease e watchdog, nenhuma criação ou exclusão de anúncio e nenhuma alteração cadastral.

## 3. Mostrar estados reais na etapa de fotos
Na etapa 6, exibir dois níveis separados:

- **Preparação no Gestão:** “Processando N de M fotos”, usando os estados reais de marca-d’água já gravados por foto.
- **Envio por destino:** uma linha para Cordial e outra para Morar, somente quando o destino estiver ativo, com:
  - “Aguardando envio” quando há fotos prontas ainda não confirmadas no site;
  - “Enviando N de M” ou “N de M confirmadas” com os contadores já gravados por destino;
  - “Aguardando limite do site até HH:MM” quando houver pausa real por limite;
  - “Conferindo envio” quando uma entrega incerta estiver sendo verificada sem reenvio;
  - “Galeria confirmada” apenas quando quantidade, ordem e capa estiverem conferidas.

Os estados continuarão atualizando automaticamente enquanto houver processamento ou envio pendente, mesmo após recarregar a página.

## 4. Detalhar o estado na ficha do imóvel
- Substituir o genérico “Atualizando” por uma descrição curta da etapa atual de cada destino.
- Manter os detalhes de próxima tentativa, última conferência e impedimentos já existentes.
- Nunca apresentar “concluído” apenas porque a tarefa rodou; exigir a confirmação real já usada pela sincronização da galeria.

## 5. Validação
- Testar a espera progressiva, o respeito ao `Retry-After`, o isolamento Cordial/Morar e a prioridade prática para tarefas novas.
- Testar a tradução dos estados reais para os textos da tela, incluindo processamento, fila, limite, confirmação incerta e conclusão.
- Rodar a suíte existente e a verificação de tipos.
- Após publicar, conferir no site publicado que a tela abre sem erro, o 1385 permanece com 14/14 fotos confirmadas nos dois destinos e as filas automáticas continuam avançando.
- Não alterar fotos, códigos, proprietário, corretor ou cadastro de imóveis reais durante essa conferência.

## Detalhes técnicos
- O controle central atual está em `provider_rate_acquire`; será ampliado com uma pausa persistente específica para 429, separada do bloqueio de credencial e por provedor.
- `imobiRequest` registrará o `Retry-After` nessa pausa; o worker reagendará sem consumir tentativa.
- A política de recuperação em `sync.server.ts` ganhará atraso progressivo para `remote_read_unreliable`, sem alterar o tratamento de `delivery_unknown`.
- `getPropertySyncStatus` passará a devolver o estado de limite necessário à tela junto dos contadores de mídia já existentes.
- `PropertyPhotosStep` e `PropertyPublishPanel` consumirão a mesma leitura, evitando estados divergentes entre edição e ficha.
- A mudança de banco será aditiva, com acesso restrito ao servidor; nenhuma tabela ou dado existente será apagado.
