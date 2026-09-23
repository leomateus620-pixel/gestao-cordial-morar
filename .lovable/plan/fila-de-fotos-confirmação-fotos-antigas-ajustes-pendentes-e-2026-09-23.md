# Fila de fotos: confirmação, fotos antigas, ajustes pendentes e endereço

## Já apurado (somente leitura, 23/09 ~02:50 UTC)
- **11 tarefas "aguardando confirmação"**: 9 na Cordial (969, 708, 1250, 1265, 763, 1266, 781, 935, 1278) e 2 na Morar (3133, 2960). Todas com o status "leitura do site não confiável". A próxima tentativa de cada uma está marcada entre 03:41 e 03:49 UTC. Nenhuma delas está perto do imóvel 1384.
- A tarefa só conta como concluída quando a leitura do site é considerada confiável e confere com o Gestão em quantidade, fotos, ordem e capa. O motivo exato da desconfiança é gravado, mas ainda não li esse registro.
- **Endereço**: só 2 imóveis têm número com mais de 15 caracteres: "270 ap 103 Cancun" e "380 Residencial Ravena , Ap 504 - Bloco 01". Nos dois, o complemento está vazio.
- **Cópias de segurança**: a consulta de permissões não devolveu nenhuma linha para as 4 tabelas. Ainda falta confirmar isso de outra forma.

## Etapas

### 1. Prioridade: as 11 tarefas aguardando confirmação (só leitura)
- Para cada conta, ler o motivo gravado: resposta HTTP (código, limite de pedidos, tempo esgotado), páginas incompletas, fotos sem código no site, códigos repetidos ou desconhecidos, e a capa.
- Refazer a mesma leitura do site uma vez por imóvel (só GET, respeitando o limite de pedidos) e comparar com o Gestão.
- Classificar cada caso como: falha real de leitura, regra rígida demais ou divergência de verdade.
- Nenhum reenvio de foto com entrega incerta. Fotos nessa situação continuam sendo verificadas só pela leitura.
- Se a causa estiver no código (por exemplo, paginação ou comparação de identidade), corrigir com um teste que reproduz o caso, sem enviar nada a mais. Depois, deixar a próxima tentativa rodar e conferir o resultado.

### 2. Mudança para as fotos antigas: mostrar e publicar
- Mostrar o diff da mudança e os testes novos:
  - lote automático ignora foto antiga;
  - pedido que nomeia uma foto antiga só adota aquela foto;
  - rotina de recuperação nunca devolve foto antiga;
  - nenhum botão ou ação cria reenvio em massa.
- Se tudo passar, publicar e informar o commit e o horário do deploy.
- Depois de publicar, conferir que as 11.448 fotos antigas continuam iguais à cópia de segurança (destino, arquivos e vínculos), com contagem e amostra.

### 3. Ajustes 060000 e 061000: prévia, sem aplicar
- Listar as funções criadas ou alteradas, as regras de acesso recriadas, as 3 rotinas automáticas novas (importação Cordial 03:11, importação Morar 03:41, limpeza de reservas aos domingos 04:17) e os dados que cada ajuste mudaria, com contagens.
- Testar as permissões numa transação desfeita no final: usuário comum, corretor, admin e o próprio sistema.
- Preparar o SQL de volta ao estado anterior de cada ajuste.
- Parar e pedir sua autorização antes de aplicar.
- O ajuste 230002 continua fora enquanto faltarem os segredos no cofre de senhas.

### 4. Cópias de segurança
- Verificar de forma objetiva: proteção por linha ligada, nenhuma permissão para visitantes e usuários logados, acesso só pelo sistema.
- Se faltar algo, corrigir retirando o acesso, sem apagar nenhum dado.
- Prazo de retenção: manter até 7 dias depois da estabilização, e apagar só com a sua autorização. O prazo fica registrado na documentação.

### 5. Número do endereço: mostrar antes de alterar
- Proposta: enviar ao site só o número ("270" e "380") e juntar o resto ao complemento do site ("ap 103 Cancun"; "Residencial Ravena , Ap 504 - Bloco 01").
- No Gestão, o cadastro não muda.
- Se o número não começar com algarismos, o envio para com uma mensagem clara.
- Mostrar esses valores antes de qualquer envio real.

### 6. Relatório final
Por conta (Cordial e Morar), separar três níveis:
- **worker executando**: tarefas processadas;
- **efeito confirmado no site**: vínculos gravados depois de conferidos na leitura;
- **galeria convergida**: quantidade, ordem e capa iguais ao Gestão.

Nenhum anúncio real é alterado para teste, e o imóvel 1384 não é tocado.

## Detalhes técnicos
- Diagnóstico: `media-sync.server.ts` (status `remote_read_unreliable` vem de `gallery.reliable=false`, motivo em `gallery.reason`), `image-list.ts` e os parsers da leitura. GET `/imovel/dados/{id}` na Cordial e HTML público na Morar.
- Diff: `src/lib/imoveis/image-pipeline.server.ts` (tratamento de `desired_destination_hash` nulo) e `media.functions.ts` (tolerância quando `property_image_upload_issues` não existe). Novo `image-pipeline.test.ts`.
- Conferência das fotos antigas: comparar `property_images` e `property_image_provider_publications` com as tabelas `backup_20260923_*`.
- Cópias de segurança: `pg_class.relrowsecurity`, `has_table_privilege` para anon e authenticated, e se preciso `REVOKE ALL ... FROM anon, authenticated`.
- Ajustes 060000/061000: prévia com `BEGIN ... ROLLBACK` quando for só leitura. O SQL de volta usa as definições atuais (`pg_get_functiondef`, `pg_policies`).
- Endereço: helper `splitAddressNumber` em `serializers.ts`, com testes para os 2 casos reais, "S/N" e "1234A".
