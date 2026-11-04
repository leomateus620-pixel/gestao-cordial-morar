# Anexos do aluguel: corrigir o erro 504 ao salvar

## O que aconteceu (confirmado nos registros)
- Contrato `16245bcc…` (Senaidi x Lenon), editado pela Bianca às 15:02, 15:04 e 15:09.
- Os dados do contrato foram salvos. O erro aparece depois, no envio dos anexos.
- Nas três tentativas, o primeiro arquivo ("Contrato de locação - caução", 52 KB) **chegou ao armazenamento em menos de 1 segundo**. Só que a resposta de confirmação nunca voltou. Depois de 60 s a conexão foi cortada e apareceu o "HTTP 504".
- A tela trata isso como falha e para tudo:
  - os outros 4 arquivos (vistoria, check-list, recibos, ficha) nunca foram enviados;
  - o arquivo que chegou não ficou registrado no contrato, então não aparece em lugar nenhum;
  - cada nova tentativa envia o mesmo arquivo de novo. Hoje há **3 cópias soltas** dele, sem vínculo com o contrato.
- O tamanho do arquivo e as permissões da Bianca não são a causa: o arquivo foi aceito.
- Não está confirmado por que a confirmação travou. No mesmo horário, a rotina que prepara as imagens dos sites estava estourando o tempo no banco a cada 5 minutos. Isso pode ter contribuído, mas não está provado.

## O que vou corrigir
1. **Envio que se recupera sozinho:** cada arquivo tem um tempo máximo de espera. Se der erro de tempo (504) ou a conexão cair, o sistema confere se o arquivo chegou:
   - se chegou, segue normalmente e registra o arquivo no contrato;
   - se não chegou, tenta mais uma vez.
2. **Sem cópias repetidas:** o registro do anexo no contrato passa a ser único por arquivo. Repetir o envio nunca duplica nada.
3. **Um arquivo com problema não trava os outros:** cada anexo mostra seu próprio estado (enviando, salvo, falhou). Se algum falhar, a janela continua aberta com a mensagem "Contrato salvo — X anexos não foram enviados" e o botão "Tentar novamente", que reenvia só os que faltam.
4. **Mensagem clara:** no lugar de "HTTP 504 error", aparece o nome do arquivo e o que fazer.
5. A mesma proteção vale para o botão "Adicionar" na tela de detalhes do aluguel, que usa o mesmo envio.

## Limpeza do contrato Senaidi x Lenon (precisa da sua autorização)
- Registrar no contrato uma das 3 cópias já enviadas do "Contrato de locação - caução".
- Apagar as outras 2 cópias soltas, que estão no armazenamento e não aparecem em lugar nenhum.
- Os outros 4 arquivos nunca foram enviados. A Bianca vai precisar anexá-los de novo depois da correção.

## Fora deste pedido (só aviso)
A rotina de preparação de imagens dos sites estoura o tempo no banco a cada 5 minutos. Posso tratar isso em outro pedido, se você quiser.

## Verificação
- Testes automáticos de que o envio repetido e a recuperação após o 504 não duplicam anexos.
- Teste na prévia anexando vários arquivos a um contrato de teste: todos salvos e visíveis nos detalhes.
- Nada será publicado sem a sua autorização.

## Detalhes técnicos
- `RentalFormModal.tsx` e `useRentalDocuments.ts`: um único auxiliar compartilhado, `uploadRentalDocument`, com `AbortController` (~25 s). Depois de um timeout ou erro 5xx/rede, faz `storage.list(prefixo, { search })` para confirmar se o objeto existe e chama `register`. Retry único, com o mesmo `filePath`.
- `registerRentalContractDocument`: se já existir linha com o mesmo `file_path`, devolve essa linha (idempotente). Migração aditiva: índice único em `rental_contract_documents(file_path)`.
- Os anexos pendentes guardam o estado de cada arquivo (`filePath` reservado e status), assim "Tentar novamente" reaproveita o caminho.
