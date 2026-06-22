## Objetivo
As próximas 2 contas criadas pela tela de login devem ser cadastradas como **admin**, além do admin atual já existente.

## Como funciona hoje
A função `public.handle_new_user()` (trigger de signup) só marca como `admin` se a tabela `user_roles` estiver vazia. Como já existe 1 admin (você), qualquer novo cadastro vira `corretor`.

## Mudança proposta
Ajustar `handle_new_user()` para: se a quantidade atual de admins em `user_roles` for **menor que 3**, o novo usuário recebe `admin`; caso contrário, `corretor` (comportamento padrão).

Resultado prático:
- Hoje há 1 admin → as próximas 2 contas viram admin (totalizando 3).
- A partir da 4ª conta, volta a ser `corretor` automaticamente.

## Detalhes técnicos
Migração única substituindo a função:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome TEXT;
  v_iniciais TEXT;
  v_admin_count INT;
  v_role public.app_role;
BEGIN
  -- (mesmo bloco de nome/iniciais de hoje)
  ...

  INSERT INTO public.profiles (id, nome, email, iniciais)
  VALUES (NEW.id, v_nome, NEW.email, v_iniciais);

  SELECT COUNT(*) INTO v_admin_count
  FROM public.user_roles WHERE role = 'admin';

  v_role := CASE WHEN v_admin_count < 3
                 THEN 'admin'::public.app_role
                 ELSE 'corretor'::public.app_role END;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role);
  RETURN NEW;
END; $$;
```

Sem alterações de UI — apenas a função do banco.

## Observação de segurança
Promover automaticamente novos signups a admin é um risco: qualquer pessoa que conseguir criar conta nesse intervalo vira admin. Recomendo, assim que os 2 admins entrarem, reverter a função para o comportamento original (somente o primeiro usuário vira admin). Posso já incluir esse "reset" como um passo opcional depois — confirme se prefere fazer manualmente.
