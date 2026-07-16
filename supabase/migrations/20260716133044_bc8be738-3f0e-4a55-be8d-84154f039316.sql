
-- 1. Novas colunas em financeiro_lancamentos
ALTER TABLE public.financeiro_lancamentos
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS origem_ref TEXT;

-- Índice único parcial para upsert idempotente vindo da planilha
CREATE UNIQUE INDEX IF NOT EXISTS financeiro_lancamentos_origem_uniq
  ON public.financeiro_lancamentos (origem, origem_id)
  WHERE origem = 'google_sheets';

CREATE INDEX IF NOT EXISTS financeiro_lancamentos_origem_ref_idx
  ON public.financeiro_lancamentos (origem, origem_ref)
  WHERE origem = 'google_sheets';

CREATE INDEX IF NOT EXISTS financeiro_lancamentos_deleted_at_idx
  ON public.financeiro_lancamentos (deleted_at);

-- 2. Habilitar Realtime para o dashboard atualizar sozinho
ALTER TABLE public.financeiro_lancamentos REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'financeiro_lancamentos'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.financeiro_lancamentos';
  END IF;
END $$;

-- 3. Tabela de log de sincronizações
CREATE TABLE IF NOT EXISTS public.financeiro_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES public.financeiro_sheet_config(id) ON DELETE SET NULL,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INTEGER,
  inserted INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  soft_deleted INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  ok BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  triggered_by TEXT NOT NULL DEFAULT 'cron',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.financeiro_sync_log TO authenticated;
GRANT ALL ON public.financeiro_sync_log TO service_role;

ALTER TABLE public.financeiro_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_log_admin_select" ON public.financeiro_sync_log;
CREATE POLICY "sync_log_admin_select"
  ON public.financeiro_sync_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS financeiro_sync_log_ran_at_idx
  ON public.financeiro_sync_log (ran_at DESC);
