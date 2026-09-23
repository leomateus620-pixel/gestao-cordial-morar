# Divergência Gestão x sites (fotos, capa, endereço)

## Confirmado agora (só leitura)
- O erro "desired_availability não existe" vem de **11 ajustes de banco que estão no projeto mas nunca foram aplicados** (de 22/09 23:00 a 23/09 06:10: intenção durável de fotos, recuperação da fila, agendamentos, travas de envio, limite duplo por janela, reservas de upload etc.). O código já usa essas colunas; por isso a recuperação fica presa em `pending_delete`/`rebuilding`.
- O Gestão já tem campos separados `numero` e `complemento`. Hoje o envio manda `numero` inteiro ("270 ap 103 Cancun"), que o site recusa por passar de 15 caracteres.

## O que vou fazer
1. **Aplicar os ajustes pendentes do banco**, na ordem, conferindo antes que cada um é só aditivo (sem apagar dados). O que não for aditivo eu paro e te mostro. Pausa cadastral continua desligada.
2. **Destravar a fila**: trabalhos de fotos que falharam só por esse erro voltam à fila sem gastar tentativa. Nada é reenviado em massa.
3. **Número do endereço (opção segura padrão)**: no envio, separar o número (ex.: "270") e juntar o resto ("ap 103 Cancun") ao complemento que vai ao site. O Gestão não é alterado. Se não houver número reconhecível, o envio para com mensagem clara: "Corrija o número do endereço (máx. 15 caracteres)".
4. **Capa e comparação de fotos**: comparar pelo código da foto no site (não pelo nome do arquivo); `partial` só quando falta foto de verdade; capa conferida pelo primeiro/destaque do site.
5. **Fotos a mais no site (1373, 1308)**: só apagar foto do site que está registrada como nossa e marcada para exclusão; foto desconhecida é listada para decisão, não apagada.
6. **Corrigir os prioritários** 1384/3383, 1381/3380, 1373/3372, 1379/3378 pelo fluxo normal de fotos (com limite de pedidos e retomada), e publicar 1360/3360 e 1372/3371.
7. **Validar e documentar**: Cordial via `imovel/dados` (contagem, destaque); Morar pela página pública; conferir que proprietário, corretor, descrição e pontos fortes não mudaram; relatório final em docs.

## Detalhes técnicos
- Migrações: reaplicar conteúdo de `20260922230000`…`20260923061000` via ferramenta de migração (uma por vez, revisadas; `IF NOT EXISTS`).
- Endereço: helper `splitAddressNumber` em `serializers.ts` + testes (casos "270 ap 103 Cancun", "380 Residencial Ravena , Ap 504 - Bloco 01", "S/N", "1234A").
- Requeue: `property_sync_jobs` com `last_error_message` contendo `desired_availability` → `pending`, attempts preservado.
- Comparação por id remoto em `gallery-rebuild.ts`/`media-sync.server.ts`.
- Testes + typecheck, depois publicar.
