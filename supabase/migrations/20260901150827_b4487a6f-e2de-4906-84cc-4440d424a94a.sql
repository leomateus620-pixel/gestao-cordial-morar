ALTER TABLE public.attendances ADD COLUMN IF NOT EXISTS venda_id uuid;
ALTER TABLE public.real_estate_sales ADD COLUMN IF NOT EXISTS attendance_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS real_estate_sales_attendance_id_key ON public.real_estate_sales(attendance_id) WHERE attendance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS attendances_venda_id_idx ON public.attendances(venda_id);