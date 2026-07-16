
DO $$ BEGIN
  CREATE TYPE public.rental_guarantee_type AS ENUM ('sem_garantia','fiador','caucao','seguro_fianca');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.rental_contracts
  ADD COLUMN IF NOT EXISTS garantia_tipo public.rental_guarantee_type NOT NULL DEFAULT 'sem_garantia',
  ADD COLUMN IF NOT EXISTS seguro_seguradora text,
  ADD COLUMN IF NOT EXISTS seguro_apolice text,
  ADD COLUMN IF NOT EXISTS seguro_valor_mensal numeric(12,2);

UPDATE public.rental_contracts
   SET garantia_tipo = 'fiador'
 WHERE guarantor_id IS NOT NULL AND garantia_tipo = 'sem_garantia';

UPDATE public.rental_contracts
   SET garantia_tipo = 'caucao'
 WHERE valor_caucao IS NOT NULL AND valor_caucao > 0 AND garantia_tipo = 'sem_garantia';
