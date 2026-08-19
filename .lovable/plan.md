# Finalizar e validar a publicação nos sites Cordial e Morar

Objetivo: concluir a integração com as duas APIs ImobiBrasil e validá-la de ponta a ponta, com evidências reais de publicação, atualização e despublicação em cada site.

## 1. Credenciais das duas contas

- Abrir o formulário seguro para os dois tokens: `IMOBIBRASIL_CORDIAL_TOKEN` e `IMOBIBRASIL_MORAR_TOKEN` (cada um é o token de aplicação gerado no painel ImobiBrasil do respectivo site).
- Conferir o status de cada conta pelo painel de saúde em Integrações (chamada real de status por destino).

## 2. Carga dos catálogos de cada site

- Executar a atualização de catálogos para Cordial e para Morar (cidades, bairros, tipos, finalidades, características).
- Guardar os valores em cache no banco e revisar o mapeamento entre os dados do Gestão Cordial e os códigos de cada site.
- Listar em relatório os campos que não tiverem correspondência, para ajuste manual antes da publicação em massa.

## 3. Testes por destino (Cordial e Morar, separadamente)

Para cada site, com um imóvel de teste real do catálogo:

1. Publicar e conferir que o registro foi criado no site com a referência correta.
2. Reprocessar o mesmo envio e confirmar que nada é duplicado (idempotência).
3. Alterar dados do imóvel (valor, dormitórios, descrição) e republicar, conferindo a atualização no site.
4. Enviar e reordenar imagens, conferindo a galeria e a foto de capa.
5. Despublicar e conferir que o imóvel sai do site.
6. Rodar a reconciliação e confirmar que o status no Gestão Cordial reflete exatamente o estado remoto.

## 4. Testes de resiliência

- Token inválido: mensagem clara no painel, sem travar a fila.
- Falha temporária da API: nova tentativa automática com espera crescente e limite de tentativas.
- Duas execuções simultâneas do processador: nenhuma tarefa é processada em duplicidade.
- Erro definitivo: registro fica marcado como falha, com motivo visível e opção de reprocessar.

## 5. Ajustes finais e entrega

- Corrigir o que os testes revelarem (mapeamentos, campos obrigatórios, tratamento de erros).
- Deixar o painel de cada imóvel mostrando destino, status, última sincronização, link do anúncio e erros.
- Entregar um resumo com o que foi validado em cada site e as evidências de cada etapa.

## Observações técnicas

- Testes executados contra as APIs reais das duas contas, usando um imóvel de teste e limpando o registro remoto ao final.
- Fila e worker já existentes (`property_sync_jobs`, worker por cron a cada minuto, endpoint protegido) são reaproveitados; nenhuma mudança estrutural prevista além de correções pontuais de mapeamento.
- Nenhum token é exibido em logs, respostas de API ou na interface.
