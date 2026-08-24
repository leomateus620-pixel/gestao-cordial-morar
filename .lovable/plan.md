# Corrigir "Atendimento indisponível ou sem permissão" ao abrir pela notificação

## O que realmente aconteceu

Verifiquei no banco os dois atendimentos que chegaram para o Ricardo Caetano
(Alexandre Mazureck e Rafaela de Oliveira Tibulo). Ambos existem, estão
vinculados ao usuário dele, e ele **tem permissão total**: perfil admin, acesso
às duas imobiliárias (Cordial e Morar), e as regras de segurança do banco
liberam a leitura. As notificações apontam para `/atendimentos?id=...`
corretamente.

Ou seja: não é falta de permissão. O erro é da tela.

Quando o link da notificação abre a página de Atendimentos, a tela decide se o
atendimento "existe" olhando a lista já carregada. Mas a lista só começa a
carregar depois que a sessão do usuário é reconhecida (um instante depois).
Nesse intervalo a página entende "lista vazia + não está carregando" e conclui
que o atendimento não existe — mostrando o alerta vermelho. Pior: ela marca
aquele link como "já avisado", então quando os dados chegam de verdade o
atendimento nunca é aberto. Isso explica exatamente o comportamento relatado:
erro na hora e depois nada abre.

O mesmo padrão existe nas telas de Agenda e Vendas, que abrem itens por link da
mesma forma.

## Correção

1. **Só concluir "não encontrado" depois da carga real.** O aviso de
   indisponibilidade passa a aparecer somente quando a busca de atendimentos
   terminou com sucesso e o registro realmente não está no resultado.
2. **Reagir quando os dados chegam.** A marcação de "já avisei sobre esse link"
   é limpa quando novos dados chegam, então o atendimento abre normalmente ao
   final do carregamento — sem precisar recarregar a página.
3. **Rede de segurança para notificações.** Se o atendimento não estiver na
   lista carregada (por filtro, paginação ou lista antiga em cache), a tela
   busca aquele registro específico na nuvem antes de dizer que está
   indisponível. Só se o banco negar de fato é que a mensagem aparece — e ela
   passa a distinguir "sem permissão" de "não encontrado".
4. **Mesma correção em Agenda e Vendas**, que sofrem do mesmo problema de
   abertura por link.
5. **Verificação.** Reproduzir a abertura pelos dois links reais do Ricardo em
   navegador automatizado (sessão autenticada), confirmando que o painel do
   atendimento abre sem alerta, e checar o console.

## Detalhes técnicos

- Causa raiz: `src/routes/_app.atendimentos.tsx` (efeito do `highlightId`) usa
  `isLoading` de `useAttendances`. Com `enabled: Boolean(user)` e a sessão
  hidratando de forma assíncrona (`useSession` só resolve após efeito), o
  React Query fica `isPending && !isFetching` → `isLoading === false` com
  `data === undefined`. O efeito então cai no branch de "não encontrado" e
  `unavailableDeepLink.current` bloqueia a reabertura.
- Ajustes: expor `isFetched`/`isSuccess` (ou `status`) em `useAttendances` e
  condicionar o efeito a `isSuccess`; resetar o ref quando `dataUpdatedAt`
  mudar.
- Fallback: nova server function `getAttendanceById` em
  `src/lib/attendances/attendances.functions.ts` com
  `.middleware([requireSupabaseAuth])`, mesmas colunas seguras
  (`ATTENDANCE_SAFE_COLUMNS`), usada só quando o id do deep link não está na
  lista; mensagem diferenciada para erro `42501`/RLS vs. resultado vazio.
- Aplicar o mesmo padrão em `src/routes/_app.agenda.index.tsx` (linha ~96) e
  `src/routes/_app.vendas.tsx` (linha ~135).
- Nenhuma migração de banco é necessária: as políticas e os grants de
  `attendances`/`attendance_history` já estão corretos.
