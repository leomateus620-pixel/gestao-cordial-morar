GRANT SELECT, INSERT, UPDATE ON public.email_logs TO authenticated;
GRANT ALL ON public.email_logs TO service_role;

CREATE POLICY "Owners can insert email logs"
ON public.email_logs
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Owners can update their email logs"
ON public.email_logs
FOR UPDATE
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());