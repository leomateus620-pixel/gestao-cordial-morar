## Trocar senha de todos os administradores para `leonardo5656`

Vou identificar todos os usuários com papel `admin` na tabela `user_roles` e redefinir a senha de cada um para `leonardo5656` usando a Auth Admin API (`supabaseAdmin.auth.admin.updateUserById`).

### Passos

1. Consultar `user_roles` (JOIN com `auth.users` via `profiles`) para listar todos os admins e seus e-mails — para você confirmar quem será afetado no log.
2. Para cada admin encontrado, chamar `updateUserById(id, { password: 'leonardo5656' })` via script no sandbox usando a service role.
3. Reportar quantos administradores tiveram a senha alterada e listar os e-mails afetados.

### Observações

- Nenhuma alteração de código no projeto — apenas provisionamento via backend.
- Recomendo fortemente que cada administrador troque a senha no primeiro acesso (o fluxo "Esqueceu a senha?" já existe na tela de login).
- Se você quiser excluir algum admin específico da troca (por exemplo, sua própria conta), me diga antes de aprovar.
