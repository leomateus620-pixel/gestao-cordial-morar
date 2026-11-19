-- Boleto rows in rental_emissions are written only by the server (service role).
-- Receipts and NFS-e keep exactly the same owner/admin rules.
ALTER POLICY rental_emissions_insert ON public.rental_emissions
  WITH CHECK (tipo <> 'boleto' AND created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
ALTER POLICY rental_emissions_update ON public.rental_emissions
  USING (tipo <> 'boleto' AND EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (tipo <> 'boleto' AND EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
ALTER POLICY rental_emissions_delete ON public.rental_emissions
  USING (tipo <> 'boleto' AND EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
REVOKE ALL ON public.rental_emissions FROM anon;