## Criar acessos para corretores e secretária

Vou criar 3 usuários diretamente no backend (Lovable Cloud), já confirmados (sem precisar de e-mail de confirmação), e ajustar o papel da secretária.

### Usuários

| Nome | E-mail | Senha | Papel |
|---|---|---|---|
| Felipe | felipe.cordialimoveis@gmail.com | cordial2026 | corretor |
| Pablo | pablo.backes@hotmail.com | 2026cordial | corretor |
| Bianca (Secretaria) | biancareginah@gmail.com | biancacordial26 | secretaria |

### Como será feito

1. Executar um script único no sandbox usando `supabaseAdmin.auth.admin.createUser()` para cada usuário, com `email_confirm: true` e `user_metadata.nome` preenchido.
2. O trigger `handle_new_user` já cria automaticamente:
   - Registro em `profiles` (nome, iniciais, e-mail).
   - Registro em `user_roles` — como já existem 3+ admins, os novos entram como `corretor` por padrão.
3. Para a Bianca, após a criação, atualizar `user_roles` de `corretor` para `secretaria` via SQL.
4. Verificar via `SELECT` que os 3 usuários existem com os papéis corretos.

### Observações de segurança

- Senhas estão sendo definidas conforme solicitado explicitamente pelo usuário. Recomendo pedir que cada pessoa troque a senha no primeiro acesso (já existe fluxo de "Esqueceu a senha?" na tela de login).
- Nenhuma alteração de código será feita — é apenas provisionamento de dados no backend.
- Se algum e-mail já existir no sistema, o script vai reportar e pular esse usuário.
