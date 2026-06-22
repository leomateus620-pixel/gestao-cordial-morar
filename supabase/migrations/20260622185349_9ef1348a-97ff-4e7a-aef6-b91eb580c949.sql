CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_nome TEXT;
  v_iniciais TEXT;
  v_admin_count INT;
  v_role public.app_role;
BEGIN
  v_nome := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'nome'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    split_part(NEW.email, '@', 1)
  );

  v_iniciais := UPPER(
    SUBSTRING(
      regexp_replace(
        (SELECT string_agg(LEFT(word, 1), '') FROM unnest(string_to_array(v_nome, ' ')) AS word),
        '[^A-Za-z]', '', 'g'
      ) FROM 1 FOR 2
    )
  );
  IF v_iniciais IS NULL OR v_iniciais = '' THEN
    v_iniciais := UPPER(LEFT(v_nome, 2));
  END IF;

  INSERT INTO public.profiles (id, nome, email, iniciais)
  VALUES (NEW.id, v_nome, NEW.email, v_iniciais);

  SELECT COUNT(*) INTO v_admin_count
  FROM public.user_roles
  WHERE role = 'admin'::public.app_role;

  v_role := CASE
    WHEN v_admin_count < 3 THEN 'admin'::public.app_role
    ELSE 'corretor'::public.app_role
  END;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role);

  RETURN NEW;
END;
$function$;