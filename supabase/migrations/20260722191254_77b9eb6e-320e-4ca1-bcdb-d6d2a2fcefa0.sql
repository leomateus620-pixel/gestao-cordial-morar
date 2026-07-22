ALTER TABLE public.sale_documents
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'outro';

ALTER TABLE public.sale_documents
  DROP CONSTRAINT IF EXISTS sale_documents_category_check;
ALTER TABLE public.sale_documents
  ADD CONSTRAINT sale_documents_category_check
  CHECK (category IN ('contrato_venda','contrato_corretagem','checklist_venda','outro'));

ALTER TABLE public.rental_contract_documents
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'outro';

ALTER TABLE public.rental_contract_documents
  DROP CONSTRAINT IF EXISTS rental_contract_documents_category_check;
ALTER TABLE public.rental_contract_documents
  ADD CONSTRAINT rental_contract_documents_category_check
  CHECK (category IN ('contrato_aluguel','termo_vistoria','checklist_aluguel','outro'));