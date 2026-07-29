## Diagnóstico (verificado agora)

- Nenhum evento novo entrou no banco depois de 24/07 — o evento de fotos do Ricardo **não foi salvo**, não é problema só de exibição.
- Nos logs do banco, hoje às 12:41 UTC há exatamente um erro: `new row violates row-level security policy for table "agenda_events"` numa operação de inserção de evento. Ou seja, o gravar foi rejeitado pela regra de acesso e o usuário não recebeu um aviso claro.
- A causa exata da rejeição ainda **não está confirmada**: Ricardo é admin e tem acesso às duas imobiliárias, então a regra deveria aprovar. Os indícios apontam para a requisição ter chegado ao banco sem sessão válida (sessão expirada no navegador), o que também explica um segundo erro no mesmo intervalo em outra tela. Confirmar isso é o primeiro passo do plano, não uma suposição a ser implementada às cegas.
- A regra de leitura atual mostra o evento apenas para criador, responsável, participantes, admin e secretária — mas a tela "Agenda de fotos" promete "visível para toda a equipe operacional". Há uma inconsistência real a corrigir.
- A listagem ordena por data de início crescente com filtro padrão "todos", então eventos de junho aparecem antes dos próximos — é isso que faz os cards mostrarem "os mais antigos primeiro".

## Passo 1 — Reproduzir e confirmar a causa (antes de mudar regra de acesso)

- Rodar o fluxo real de criação de evento (compromisso e fotos) com sessão autenticada e capturar o erro exato retornado pelo servidor.
- Registrar no servidor o detalhe completo do erro do banco (código, mensagem, dica) em vez de só a mensagem genérica, para que qualquer falha futura fique identificável.
- Confirmar se a rejeição vem de sessão expirada/token ausente ou da regra de acesso propriamente dita.

## Passo 2 — Nunca mais falhar em silêncio

- Se o salvamento falhar, o formulário permanece aberto com uma mensagem de erro visível e específica dentro do modal (hoje o erro é engolido no modal e só aparece um aviso genérico fora dele).
- Se o motivo for sessão expirada, mostrar aviso claro ("sua sessão expirou, entre novamente") e tentar renovar a sessão automaticamente antes de reenviar, em vez de descartar o preenchimento.
- Só exibir a mensagem de sucesso quando o evento realmente voltar salvo do servidor.

## Passo 3 — Garantir a exibição correta para quem criou e para a equipe

- Regra de acesso: o criador e o responsável sempre enxergam o próprio evento, sem depender de configuração de imobiliária.
- Eventos de fotos/vídeo passam a ser visíveis para todos os usuários autenticados dentro do escopo da imobiliária, alinhando a regra ao que a tela já promete; a edição continua restrita a criador, responsável, secretária e admin.
- Após salvar, o evento entra imediatamente na lista (atualização do cache + recarga), inclusive quando criado a partir da aba de fotos.

## Passo 4 — Google Agenda

- Validar que todo evento criado por qualquer usuário entra na fila de sincronização e chega ao Google Agenda do responsável, inclusive quando a sincronização imediata falha (a fila com novas tentativas já existe).
- Exibir no evento o estado real de sincronização (sincronizado, pendente, falhou) e, quando falhar, o motivo e o convite para reconectar a conta Google.

## Passo 5 — Ordenação e organização dos cards (desktop)

- Prioridade para o presente e o futuro: primeiro "Hoje", depois os próximos em ordem cronológica, e por último os anteriores em ordem decrescente (mais recentes primeiro), em vez da lista atual que começa pelos mais antigos.
- Cabeçalhos de dia fixos ao rolar, contagem por dia e separador visual entre "Próximos" e "Anteriores".
- Grade responsiva mais aproveitada no desktop (até 3 colunas em telas largas), cards com hierarquia melhor: horário e título em destaque, imóvel/cliente, responsável e status de sincronização em linha secundária.
- Mesma organização aplicada às duas abas: "Visitas e compromissos" e "Agenda de fotos".

## Detalhes técnicos

- Banco: nova migração ajustando as funções de acesso da agenda (`agenda_can_access`) e a política de leitura para incluir criador/responsável incondicionalmente e liberar leitura de eventos de tipo `fotos`/`video` para usuários autenticados no escopo da imobiliária. Nenhuma mudança de estrutura de tabelas.
- Backend: `src/lib/agenda/agenda.functions.ts` — propagar detalhes do erro do banco na criação/edição e retornar o evento salvo com estado de sincronização.
- Frontend: `AgendaFormModal.tsx` (erro visível no modal), `_app.agenda.tsx` e `_app.agenda.fotos.tsx` (feedback e revalidação), `useAgenda.ts` (nova ordenação em grupos), `AgendaTimeline.tsx` e `AgendaEventCard.tsx` (agrupamento, grade e densidade no desktop).
- Validação final: criar um evento de compromisso e um de fotos com uma conta real, conferir que aparecem na lista, no banco e na fila do Google, e revisar os logs sem novos erros de permissão.
