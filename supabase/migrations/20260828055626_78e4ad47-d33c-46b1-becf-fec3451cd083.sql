ALTER TABLE public.property_images
  ADD COLUMN IF NOT EXISTS orientation_override text;

INSERT INTO public.app_settings (key, value)
VALUES ('property_drive_root', jsonb_build_object('id', '1JRCFkohIiGUjQNF5kboEaXfrhcoGosEf', 'configured_at', now()))
ON CONFLICT (key) DO NOTHING;