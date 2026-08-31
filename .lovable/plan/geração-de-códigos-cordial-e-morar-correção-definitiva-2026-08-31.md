# Geração de códigos Cordial e Morar: correção definitiva

## Diagnóstico confirmado

A função `public.reserve_provider_code` implantada atualmente declara `code` como coluna de retorno e também usa `code` sem desambiguação em `ON CONFLICT (provider, code)`. O PostgreSQL não consegue decidir se a referência é a variável de saída ou a coluna da tabela e retorna exatamente **`column reference "code" is ambiguous`** para Cordial e Morar.

As reservas recentes verificadas estão liberadas ou expiradas; portanto, o erro atual está na função, não em um código ativo bloqueando a sequência.

## Solução

1. **Eliminar a ambiguidade no banco**
   - Criar uma migração que substitua `ON CONFLICT (provider, code)` por conflito explícito na constraint única `provider_code_reservations_unique`.
   - Qualificar todas as referências a colunas e variáveis dentro da função para impedir novas colisões de nomes.
   - Preservar a assinatura e o retorno atuais, sem exigir alteração nos consumidores do frontend.

2. **Tornar a reserva idempotente**
   - Sob o bloqueio transacional já existente, procurar primeiro uma reserva ativa do próprio usuário para a mesma imobiliária e imóvel/contexto.
   - Se existir, renovar o prazo e devolver a mesma reserva, em vez de liberá-la e criar outra.
   - Só procurar o menor código livre quando não houver reserva reutilizável.
   - Reativar linhas expiradas/liberadas pela constraint única, sem criar duplicatas e sem consumir números em cliques repetidos.

3. **Manter isolamento e segurança**
   - Cordial e Morar continuam com sequências independentes.
   - Reservas de outros usuários, reservas confirmadas e códigos publicados permanecem indisponíveis.
   - A checagem no site continua marcando códigos realmente ocupados e avançando apenas nesses casos.

4. **Ajustar a experiência do formulário**
   - Manter o código visível durante nova tentativa e bloquear chamadas concorrentes por imobiliária.
   - Tratar o botão como renovação/revalidação quando já há reserva, evitando que o estado visual fique apontando para uma reserva liberada.
   - Uma falha em Cordial não deve afetar o campo Morar, e vice-versa.

## Validação

- Gerar Cordial e Morar separadamente e em conjunto, sem erro de ambiguidade.
- Clicar repetidamente em gerar e confirmar que cada imobiliária mantém o mesmo código e `reservationId` enquanto a reserva estiver válida.
- Simular código ocupado remotamente e confirmar avanço para o próximo livre sem perder o estado do outro provedor.
- Confirmar que números publicados, comprometidos ou reservados por outro usuário nunca são reemitidos.
- Validar o fluxo real do cadastro até salvar/confirmar as duas reservas e revisar os registros finais no banco.
