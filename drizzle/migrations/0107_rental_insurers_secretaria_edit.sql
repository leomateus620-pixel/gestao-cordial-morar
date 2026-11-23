CREATE OR REPLACE FUNCTION public.can_edit_rental_insurer(_brands public.rental_brand[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin')
    OR (public.has_role(auth.uid(),'secretaria')
        AND coalesce(array_length(_brands,1),0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM unnest(_brands) b
          WHERE b::text <> 'ambas'
            AND NOT EXISTS (SELECT 1 FROM public.user_agencies ua WHERE ua.user_id = auth.uid() AND ua.agency = b::text)
        ))
$$;
REVOKE ALL ON FUNCTION public.can_edit_rental_insurer(public.rental_brand[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_rental_insurer(public.rental_brand[]) TO authenticated;
DROP POLICY IF EXISTS rental_insurers_admin_insert ON public.rental_insurers;
DROP POLICY IF EXISTS rental_insurers_admin_update ON public.rental_insurers;
CREATE POLICY rental_insurers_staff_insert ON public.rental_insurers FOR INSERT TO authenticated WITH CHECK (public.can_edit_rental_insurer(brands));
CREATE POLICY rental_insurers_staff_update ON public.rental_insurers FOR UPDATE TO authenticated USING (public.can_edit_rental_insurer(brands)) WITH CHECK (public.can_edit_rental_insurer(brands));