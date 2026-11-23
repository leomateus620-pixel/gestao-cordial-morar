# Contratos de locação gerados pelo sistema — Cordial e Morar

## O que foi recebido
- Morar: 3 modelos (Fiador — exemplo preenchido, Caução, Seguro-fiança com S8 Garante).
- Cordial: 3 modelos já enviados (Fiadores/comercial, Caução/residencial, Seguro-fiança/residencial).
- Seguradoras parceiras das duas marcas: **Seu Fiador** e **S8 Garante**, cada uma com sua cláusula.
- MagniCred fica fora (encerrou as atividades). Pottencial, que aparece no modelo antigo da Cordial, não está na lista nova e não será cadastrada.

## Como vai funcionar para a equipe
1. **Seguradoras (Configurações)**: lista com nome, marcas atendidas, ativa/inativa e o texto da cláusula. Já começa com Seu Fiador e S8 Garante. Admin pode editar o texto ou desativar; uma seguradora desativada não aparece para contratos novos.
2. **Check-list do contrato**: novo campo "Garantia" (Fiador, Caução ou Seguro-fiança). Em seguro-fiança, escolhe-se a seguradora e preenchem-se os valores da cláusula (total, número e valor das parcelas, ou valor mensal). Em fiador, os dados dos fiadores; em caução, o valor da caução.
3. **Gerar contrato**: botão no contrato que monta o documento Word com o modelo da marca (Cordial ou Morar; em "ambas", quem opera escolhe) e da garantia escolhida, preenchendo locador, locatários, imóvel, prazo, aluguel, vencimento e a cláusula da seguradora. Antes de baixar, aparece uma prévia com a lista do que falta preencher; campos vazios ficam destacados e o contrato não sai com "xxx".
4. O arquivo gerado fica guardado nos documentos do contrato como versão. Nada é enviado ao inquilino automaticamente. Contratos e recibos que já existem não mudam.

## Antes de começar, preciso confirmar
- Os modelos da Morar desta mensagem são os oficiais (o de fiador veio preenchido com um cliente real; vou usar só a estrutura, nunca esses dados).
- Os valores da cláusula (R$ 2.653,20, R$ 221,10, R$ 94,00) mudam a cada contrato. Por isso vão virar campos preenchidos no check-list.

## Ordem de entrega
- A. Cadastro de seguradoras com as duas cláusulas.
- B. Campos de garantia no check-list.
- C. Os 6 modelos com marcação dos campos e a geração do Word com prévia.
- D. Testes: escolher a seguradora certa gera a cláusula certa; seguradora inativa não aparece; marca certa por contrato; nenhum campo sai em branco ou com "xxx".

Não vou publicar. Também não vou mexer em boletos, NFS-e nem nos documentos de contratos que já existem.

## Detalhes técnicos
- Migração aditiva: tabela `rental_insurers` (nome, cnpj, brands[], clause_template, active, timestamps), com RLS de leitura para a equipe interna e escrita só por admin, além da política restritiva `meta_reviewer_block`/`atendimentos_viewer`. Colunas novas e opcionais no check-list do contrato: `guarantee_kind`, `insurer_id`, `guarantee_values jsonb`.
- Os modelos ficam versionados no projeto, com marcadores (`{{locador.nome}}`, `{{clausula_garantia}}`). A geração usa um modelo puro mais o docx no servidor, roda numa função autenticada e o arquivo vai para o armazenamento privado do contrato (padrão dos recibos).
- Testes com vitest no modelo puro de preenchimento.
