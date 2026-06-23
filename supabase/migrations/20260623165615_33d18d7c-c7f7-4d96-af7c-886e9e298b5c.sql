
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  brand text NOT NULL DEFAULT 'cordial',
  full_name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  email text,
  document text,
  client_type text NOT NULL DEFAULT 'comprador',
  contact_preference text NOT NULL DEFAULT 'whatsapp',
  lead_origin text NOT NULL DEFAULT 'whatsapp',
  assigned_broker_id text,
  assigned_broker_name text,
  status text NOT NULL DEFAULT 'novo',
  purpose text NOT NULL DEFAULT 'compra',
  property_type text NOT NULL DEFAULT 'apartamento',
  bedrooms text,
  neighborhood text,
  min_budget numeric,
  max_budget numeric,
  approximate_income numeric,
  profession text,
  notes text,
  restrictions text,
  next_step text,
  next_follow_up_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_select_own_or_admin" ON public.clients
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "clients_insert_own" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "clients_update_own_or_admin" ON public.clients
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "clients_delete_own_or_admin" ON public.clients
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_clients_created_by ON public.clients(created_by);
CREATE INDEX idx_clients_created_at ON public.clients(created_at DESC);

CREATE TRIGGER clients_touch_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
