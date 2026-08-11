CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carteira text NOT NULL DEFAULT 'cordial',
  operacao text NOT NULL DEFAULT 'venda',
  tipo text,
  localizacao_exibida text,
  bairro text,
  cidade text,
  uf text,
  valor numeric,
  valor_modo text NOT NULL DEFAULT 'fixo',
  valor_exibido text,
  dormitorios integer,
  suites integer,
  banheiros integer,
  vagas integer,
  area_principal numeric,
  area_tipo text,
  area_total numeric,
  area_util numeric,
  area_construida numeric,
  area_terreno numeric,
  codigo text,
  source text NOT NULL DEFAULT 'cordial_website',
  source_property_id text NOT NULL,
  source_catalog_page integer,
  source_property_url text,
  source_catalog_url text,
  source_import_batch text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT properties_carteira_check CHECK (carteira IN ('cordial','morar')),
  CONSTRAINT properties_operacao_check CHECK (operacao IN ('venda','aluguel')),
  CONSTRAINT properties_valor_modo_check CHECK (valor_modo IN ('fixo','consulte')),
  CONSTRAINT properties_source_unique UNIQUE (source, source_property_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read properties"
  ON public.properties FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and secretaria can insert properties"
  ON public.properties FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretaria'));

CREATE POLICY "Admins and secretaria can update properties"
  ON public.properties FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretaria'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'secretaria'));

CREATE POLICY "Admins can delete properties"
  ON public.properties FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX properties_source_codigo_uidx ON public.properties (source, codigo) WHERE codigo IS NOT NULL;
CREATE INDEX properties_operacao_idx ON public.properties (operacao);
CREATE INDEX properties_carteira_idx ON public.properties (carteira);
CREATE INDEX properties_tipo_idx ON public.properties (tipo);
CREATE INDEX properties_cidade_idx ON public.properties (cidade);
CREATE INDEX properties_bairro_idx ON public.properties (bairro);
CREATE INDEX properties_codigo_idx ON public.properties (codigo);
CREATE INDEX properties_valor_idx ON public.properties (valor);

CREATE TRIGGER properties_touch_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();