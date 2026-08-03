ALTER TABLE public.attendances ADD COLUMN IF NOT EXISTS fonte_prospeccao text;

ALTER TABLE public.attendances DROP CONSTRAINT IF EXISTS attendances_fonte_prospeccao_check;
ALTER TABLE public.attendances ADD CONSTRAINT attendances_fonte_prospeccao_check
  CHECK (fonte_prospeccao IS NULL OR fonte_prospeccao IN ('lead_imobiliaria','cliente_particular_corretor'));

CREATE INDEX IF NOT EXISTS attendances_fonte_prospeccao_idx
  ON public.attendances (fonte_prospeccao)
  WHERE fonte_prospeccao IS NOT NULL;