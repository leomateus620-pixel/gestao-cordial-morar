ALTER TABLE public.agenda_events
  ADD COLUMN IF NOT EXISTS imovel_nome TEXT,
  ADD COLUMN IF NOT EXISTS imovel_endereco TEXT;