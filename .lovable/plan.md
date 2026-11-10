# Corrigir conclusão de cadastro e envio de 1421/3419 e 1422/3420

## O que foi encontrado
- O agenciamento do Geandre **foi salvo corretamente** nos dois imóveis (proprietário, endereço, descrição, fotos feitas, corretor Geandre, códigos 1421/3419 e 1422/3420). Nada se perdeu.
- Ele só "aparece zerado" porque, ao abrir "Concluir cadastro" de novo, a etapa de agenciamento sempre começa em branco — ela não recarrega o que já está gravado. Se o corretor concluir de novo, corre o risco de sobrescrever com dados vazios.
- O motivo real de não ter ido aos sites: os dois imóveis estão com **"Autorização assinada" desligada** e **Disponibilidade em branco** (Etapa 5). Com isso:
  - o site Morar recusa o envio (erro interno, mostrado ao corretor como mensagem técnica);
  - o site Cordial registra o pedido, mas deixa o imóvel fora do ar;
  - como um dos sites falhou, o sistema não marca o cadastro como concluído — e a ficha mostra a frase genérica "Ainda sem agenciamento e sem envio aos sites", que é falsa nesse caso.

## O que será feito

### 1. Os dois imóveis (1421/3419 e 1422/3420)
- Ligar "Autorização assinada" e Disponibilidade = "Sim", **somente após sua confirmação** de que a autorização do proprietário existe.
- Concluir o cadastro pelo fluxo normal, mantendo o agenciamento do Geandre como está (sem duplicar), e enviar para Cordial e Morar.
- Conferir que aparecem nas páginas públicas dos dois sites com as fotos.

### 2. Evitar que se repita
- **Agenciamento recarregado**: ao reabrir "Concluir cadastro", a etapa de agenciamento vem preenchida com o que já foi salvo (finalidade, checklist, descrição, placa). Reenviar nunca apaga dados já gravados.
- **Aviso antes de concluir**: na última etapa, se houver destino escolhido e faltar "Autorização assinada" ou Disponibilidade, o botão mostra claramente o que falta (com link para a Etapa 5) em vez de deixar o envio falhar depois.
- **Mensagem certa na ficha**: o aviso "Cadastro não concluído" passa a dizer o motivo real (ex.: "Agenciamento registrado. Falta autorização assinada para enviar aos sites") em vez de "sem agenciamento".
- **Erro do site Morar em português claro**, no lugar da mensagem técnica.
- Teste automático para cada regra acima.

## Fora do escopo
Nenhuma mudança em outros imóveis, ImobiBrasil (segue desligada), fotos, NFS-e ou regras de publicação já aprovadas.

## Detalhes técnicos
- Causa: `morar_site_request_publication` lança "blocked by canonical property state" quando `autorizacao IS FALSE`; `enqueuePropertySyncCore` retorna `partial` → `steps.publish="error"` → `isFinalizeCompleted` falso → `registration_completed_at` nulo.
- `_app.imoveis.novo.tsx`: `agency` inicia com `emptyAgencyStepState`; hidratar a partir do agenciamento vinculado (`property_id`) quando houver `resume`.
- Pré-checagem no cliente e no servidor (`finalizePropertyRegistration`) com motivo legível; mapear o erro da RPC Morar.
- Ficha: usar `hasAgenciamento`/estado da publicação para o texto do aviso.
- Dados dos dois imóveis: UPDATE pontual de `autorizacao`/`disponibilidade` via ferramenta de dados após autorização, depois concluir pelo fluxo existente.
