-- Extensões mínimas do esquema do Gestão para testar o arquivamento em
-- PostgreSQL real (PGlite), num banco isolado. Nunca é aplicado em produção.
CREATE TYPE public.app_role AS ENUM ('admin','secretaria','corretor','financeiro');
CREATE TYPE public.property_sync_action AS ENUM ('publish','update','unpublish','delete','reconcile','media_sync');
CREATE TABLE public.user_roles(user_id uuid, role public.app_role, PRIMARY KEY(user_id, role));
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_role text) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role::text=_role) $$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT public.has_role(_user_id, _role::text) $$;
ALTER TABLE public.properties ADD COLUMN publish_targets text[] DEFAULT '{}';
ALTER TABLE public.property_provider_publications
  ADD COLUMN desired_availability text DEFAULT 'visible',
  ADD COLUMN publication_intent_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN create_state text,
  ADD COLUMN last_synced_at timestamptz,
  ADD COLUMN last_error_message text;
CREATE TABLE public.property_sync_jobs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), property_id uuid, provider text,
  action public.property_sync_action, requested_revision int, requested_by uuid,
  status text, next_run_at timestamptz, finished_at timestamptz, last_error_category text,
  publication_intent_revision int);
