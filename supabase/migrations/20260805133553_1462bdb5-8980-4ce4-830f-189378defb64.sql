ALTER TABLE public.agenciamentos
  ADD COLUMN IF NOT EXISTS codigo_morar text,
  ADD COLUMN IF NOT EXISTS codigo_cordial text;

CREATE INDEX IF NOT EXISTS agenciamentos_codigo_morar_idx ON public.agenciamentos (lower(codigo_morar));
CREATE INDEX IF NOT EXISTS agenciamentos_codigo_cordial_idx ON public.agenciamentos (lower(codigo_cordial));