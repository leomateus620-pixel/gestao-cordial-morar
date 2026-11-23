ALTER TABLE public.rental_contract_guarantors ADD COLUMN IF NOT EXISTS conjuge jsonb;
ALTER TABLE public.rental_contract_documents ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'externo' CHECK (origin IN ('externo','gerado'));
ALTER TABLE public.rental_contract_documents ADD COLUMN IF NOT EXISTS signed_at timestamptz;
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS entry_inspection_id uuid REFERENCES public.inspections(id);
CREATE UNIQUE INDEX IF NOT EXISTS inspections_contract_exit_unique ON public.inspections(rental_contract_id) WHERE rental_kind = 'saida';