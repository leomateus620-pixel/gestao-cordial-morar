# Ativar a base do Assistente Cordial

## Situação verificada
- O arquivo da base do Assistente (0013, ~5,9 KB) existe no projeto e já consta na lista local de migrações.
- No banco conectado **não existe** nenhuma tabela `assistant_*` nem as funções `assistant_current_scope` / `assistant_take_daily_quota`. Ou seja: ainda não foi aplicada, não há risco de duplicar.

## Etapas
1. Reler o arquivo 0013 e conferir que é só aditivo (cria tabelas, funções, permissões e regras de acesso; nada é apagado nem alterado em outros módulos).
2. Aplicar exatamente o conteúdo do arquivo, sem reescrever. Se a ferramenta acusar conflito com a entrada já existente na lista local, ajustar apenas o registro dessa lista (sem mexer no SQL) e reaplicar.
3. Validar no banco (somente leitura):
   - tabelas `assistant_*` criadas com regras de acesso ligadas;
   - visitante anônimo sem acesso; usuário logado só lê os próprios registros; navegador sem permissão de gravar mensagens, auditoria ou cota;
   - as duas funções existem e só quem deve pode executá-las.
4. Recarregar o cache de schema (`NOTIFY pgrst, 'reload schema'`) e rodar o verificador de segurança.
5. Rodar os testes do Assistente já existentes (incluindo o teste da base em banco isolado).
6. Teste no navegador com sessão de teste: abrir Assistente Cordial, enviar uma pergunta fictícia ("o que tenho hoje na agenda?"), confirmar resposta, conversa salva e reaberta, e os cards "Seu dia" carregando sem erro. Nenhum dado real é enviado, nenhuma mensagem a cliente.
7. Relatar resultado (o que passou, o que não foi possível testar).

## Fora do escopo
Nenhuma mudança em outros módulos, NFS-e, sync Imobi/fotos, endereço ou códigos. Sem publicar.
