ALTER TABLE public.attendances ADD COLUMN IF NOT EXISTS imovel_codigo text;
ALTER TABLE public.rental_properties ADD COLUMN IF NOT EXISTS proprietario_nome text;
ALTER TABLE public.rental_properties ADD COLUMN IF NOT EXISTS proprietario_cpf text;
ALTER TABLE public.rental_properties ADD COLUMN IF NOT EXISTS proprietario_email text;