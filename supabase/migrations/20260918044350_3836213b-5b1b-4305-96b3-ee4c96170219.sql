ALTER TABLE public.agenda_event_attachments
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'general';

ALTER TABLE public.agenda_event_attachments
  DROP CONSTRAINT IF EXISTS agenda_event_attachments_purpose_check;

ALTER TABLE public.agenda_event_attachments
  ADD CONSTRAINT agenda_event_attachments_purpose_check
  CHECK (purpose IN ('general', 'property_reference'));

CREATE UNIQUE INDEX IF NOT EXISTS agenda_event_attachments_ref_photo_uniq
  ON public.agenda_event_attachments (event_id)
  WHERE purpose = 'property_reference' AND kind = 'foto';

CREATE UNIQUE INDEX IF NOT EXISTS agenda_event_attachments_ref_link_uniq
  ON public.agenda_event_attachments (event_id)
  WHERE purpose = 'property_reference' AND kind = 'link';