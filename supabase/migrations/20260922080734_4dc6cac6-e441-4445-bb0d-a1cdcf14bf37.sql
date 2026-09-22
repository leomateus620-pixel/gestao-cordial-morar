ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_removal_state_check;
ALTER TABLE public.properties ADD CONSTRAINT properties_removal_state_check CHECK (
  removal_state IS NULL OR removal_state = ANY (ARRAY['pending_removal'::text, 'removed'::text, 'pending_archive'::text, 'archived'::text])
);