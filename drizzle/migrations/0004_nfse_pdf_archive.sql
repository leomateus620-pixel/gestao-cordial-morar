ALTER TABLE public.rental_contract_documents DROP CONSTRAINT rental_contract_documents_category_check;
ALTER TABLE public.rental_contract_documents ADD CONSTRAINT rental_contract_documents_category_check
  CHECK (category = ANY (ARRAY['contrato_aluguel','termo_vistoria','checklist_aluguel','apolice_seguro_fianca','outro','nota_fiscal']::text[]));

ALTER TABLE public.rental_nfse_emissions
  ADD COLUMN IF NOT EXISTS pdf_document_id uuid NULL REFERENCES public.rental_contract_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pdf_status text NOT NULL DEFAULT 'nao_aplicavel',
  ADD COLUMN IF NOT EXISTS pdf_last_error text NULL,
  ADD COLUMN IF NOT EXISTS pdf_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.rental_nfse_emissions
  ADD CONSTRAINT rental_nfse_emissions_pdf_status_chk CHECK (pdf_status IN ('nao_aplicavel','pendente','salvo','falhou'));
CREATE UNIQUE INDEX IF NOT EXISTS rental_nfse_emissions_pdf_document_uq
  ON public.rental_nfse_emissions(pdf_document_id) WHERE pdf_document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rental_nfse_emissions_pdf_pending_idx
  ON public.rental_nfse_emissions(pdf_status) WHERE pdf_status IN ('pendente','falhou');

CREATE OR REPLACE FUNCTION public.rental_docs_protect_nfse()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.category = 'nota_fiscal' AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'O PDF da NFS-e é registro fiscal e não pode ser removido.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.category IS DISTINCT FROM OLD.category OR NEW.file_path IS DISTINCT FROM OLD.file_path THEN
    RAISE EXCEPTION 'O PDF da NFS-e é registro fiscal e não pode ser alterado.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rental_docs_protect_nfse_trg ON public.rental_contract_documents;
CREATE TRIGGER rental_docs_protect_nfse_trg BEFORE DELETE OR UPDATE ON public.rental_contract_documents
  FOR EACH ROW EXECUTE FUNCTION public.rental_docs_protect_nfse();

CREATE OR REPLACE FUNCTION public.rental_docs_block_manual_nfse()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.category = 'nota_fiscal' AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Notas fiscais são arquivadas apenas pelo sistema.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rental_docs_block_manual_nfse_trg ON public.rental_contract_documents;
CREATE TRIGGER rental_docs_block_manual_nfse_trg BEFORE INSERT ON public.rental_contract_documents
  FOR EACH ROW EXECUTE FUNCTION public.rental_docs_block_manual_nfse();

DO $$ BEGIN
  PERFORM cron.unschedule('nfse-pdf-retry') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='nfse-pdf-retry');
  PERFORM cron.schedule('nfse-pdf-retry', '17 * * * *', $c$
    SELECT net.http_post(
      url := 'https://project--feb646c9-c19a-4360-8cc9-bec5237532ea.lovable.app/api/public/hooks/nfse-pdf-retry',
      headers := public.internal_worker_headers(),
      body := '{}'::jsonb)
    WHERE EXISTS (SELECT 1 FROM public.rental_nfse_emissions WHERE pdf_status IN ('pendente','falhou') AND pdf_attempts < 24);
  $c$);
END $$;