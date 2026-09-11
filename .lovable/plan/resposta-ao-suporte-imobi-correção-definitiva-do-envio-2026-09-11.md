# Resposta ao suporte Imobi + correção definitiva do envio

## O que a resposta deles confirma

- `POST /imovel/alterar/{codigo}` **zera todo campo não enviado** no corpo. Era exatamente a suspeita: as 543 alterações de 08–09/09 apagaram o proprietário vinculado.
- Eles indicam `GET /pessoa/dados/{codigo}` para ler proprietário/corretor (endpoint que ainda não usamos).
- Eles afirmam que `GET /imovel/dados/{codigo}` já devolve `codigoProprietario` e `codigoCorretor`.

## O que precisamos responder (verificado aqui)

- Nós **não temos** os códigos de proprietário guardados. Motivo comprovado no código: o instantâneo salvo na importação remove por segurança qualquer chave com "proprietario/telefone/email/cpf", então `codigoProprietario` nunca foi gravado no Gestão.
- Na leitura feita em 10/09, em 40 imóveis ativos (23 Cordial + 17 Morar), `GET /imovel/dados` devolveu `codigoProprietario: 0` e `codigoCorretor: 0` em 100% dos casos — inclusive em imóveis onde o corretor aparece no painel. Evidência em `docs/IMOBI-PROPRIETARIO-CONTATO.md`. Ou seja: mesmo se quiséssemos ter guardado, a API entregava zero para o nosso token.
- Conclusão para eles: o backup terá de sair da base/plataforma deles; não há como reconstruir o vínculo pelo nosso lado.

## Plano

### 1. Reconferir a afirmação deles antes de responder (só leitura)
Rodar agora uma amostra nova de `GET /imovel/dados/{codigo}` nos dois sites e testar `GET /pessoa/dados/{codigo}`, para responder com número atual: se o campo voltou a vir preenchido, muda tudo (dá para salvar cópia e ajudar o backup); se continua 0, entregamos a evidência.

### 2. Escrever a resposta ao suporte (arquivo pronto para colar)
Novo `/mnt/documents/resposta-suporte-imobibrasil-11-09-2026.md` com:
- Confirmação de que entendemos o comportamento destrutivo e que já pausamos todas as alterações automáticas desde 10/09.
- Resposta direta à pergunta deles: não, os códigos de proprietário não ficam armazenados conosco — e o motivo é que a API sempre nos devolveu `codigoProprietario: 0` (amostra e datas anexadas).
- Pedido objetivo: restaurar pelo backup interno da plataforma os vínculos dos imóveis das listas já enviadas (288 Cordial, 255 Morar), janela 08–09/09/2026.
- Pergunta técnica única que destrava o futuro: com qual token/permissão `GET /imovel/dados` passa a devolver `codigoProprietario` diferente de zero, já que na nossa amostra vem zerado.
- Anexos: as duas listas de imóveis já enviadas, agora com uma coluna a mais para eles preencherem o código do proprietário restaurado.

### 3. Correção definitiva no envio (para nunca mais apagar nada)
- Antes de cada alteração, ler o imóvel no site e **mesclar**: enviar de volta todos os campos atuais, trocando só o que o Gestão controla.
- Guardar no Gestão o código de proprietário e de corretor lidos do site, para sempre reenviá-los junto.
- Manter a trava de alterações ligada até esse envio-mesclado passar em teste com 1 imóvel de cada site.

### 4. Passar a guardar o contato do proprietário
Com `GET /pessoa/dados/{codigo}` disponível, assim que o código vier preenchido o Gestão importa nome, celular e e-mail para a ficha interna — cópia própria, sem depender do site.

## Detalhes técnicos

- Mescla: `buildUpdatePayload` (`src/lib/imobibrasil/serializers.ts`) passa a receber o registro remoto de `fetchPropertyDetail` e preencher todo campo não gerenciado; `sync.server.ts` faz o GET antes do POST.
- Persistência dos vínculos: novas colunas em `properties` (`imobi_codigo_proprietario`, `imobi_codigo_corretor`) por provedor, gravadas na importação e no sync.
- Leitura de pessoas: novo `fetchPersonDetail` em `read.server.ts` (`/pessoa/dados/{codigo}`), alimentando `proprietario_nome/telefone/email` só quando o campo local estiver vazio.
- Snapshot: `sanitizeRemotePayload` mantém `codigoProprietario`/`codigoCorretor` (só códigos) e continua removendo CPF, telefone e e-mail.
- Trava `app_settings.imobi_update_sync_paused` só é desligada depois do teste de mescla.
