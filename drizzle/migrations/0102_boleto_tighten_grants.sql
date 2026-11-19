REVOKE ALL ON public.billing_accounts, public.billing_account_events, public.rental_boletos, public.rental_boleto_events FROM anon;
REVOKE ALL ON public.billing_accounts, public.billing_account_events, public.rental_boletos, public.rental_boleto_events FROM authenticated;
GRANT SELECT ON public.billing_accounts, public.billing_account_events, public.rental_boletos, public.rental_boleto_events TO authenticated;
GRANT ALL ON public.billing_accounts, public.billing_account_events, public.rental_boletos, public.rental_boleto_events TO service_role;
REVOKE TRUNCATE ON public.rental_emissions FROM authenticated;
REVOKE ALL ON public.rental_emissions FROM anon;