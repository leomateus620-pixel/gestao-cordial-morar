ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS last_user_edit_at timestamptz;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS recent_sort_at timestamptz
  GENERATED ALWAYS AS (GREATEST(created_at, COALESCE(last_user_edit_at, created_at))) STORED;
CREATE INDEX IF NOT EXISTS properties_recent_sort_at_idx ON public.properties (recent_sort_at DESC, id);