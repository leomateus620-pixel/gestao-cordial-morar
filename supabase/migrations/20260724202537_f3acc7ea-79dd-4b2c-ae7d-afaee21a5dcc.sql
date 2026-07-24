
-- Corrective migration for the Atendimentos CRM review.
-- The prior migration (20260724233000) nulled imovel_codigo/imovel_descricao
-- for rows without a canonical property link. Broker-typed codes like
-- "Cód 1258" and "Cód 2940 e 3109" were the real property reference — restore
-- them here from the pre-migration snapshot, and only then populate the new
-- interesse_descricao column for rows that truly have no property reference.

-- Ensure the extended columns exist (idempotent; the prior migration also
-- adds them, but restating keeps this migration self-contained).
ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS imovel_ref TEXT,
  ADD COLUMN IF NOT EXISTS interesse_descricao TEXT,
  ADD COLUMN IF NOT EXISTS imovel_endereco TEXT,
  ADD COLUMN IF NOT EXISTS imovel_bairro TEXT,
  ADD COLUMN IF NOT EXISTS imovel_cidade TEXT,
  ADD COLUMN IF NOT EXISTS imovel_tipo TEXT,
  ADD COLUMN IF NOT EXISTS imovel_valor NUMERIC(14, 2);

-- Restore imovel_codigo where the prior migration nulled it.
-- Only writes when the target column is currently NULL (idempotent) and only
-- for the exact rows captured in the snapshot.
WITH snapshot(id, imovel_codigo) AS (
  VALUES
    ('17194c4c-064a-4df1-b2e4-a1d22e7fb228'::uuid, 'Casas cód 667 e 677'),
    ('35a6497f-fed9-4ba4-86bd-ff50ee896bb5'::uuid, 'Cód 1258'),
    ('64e5ea6d-f1f2-4676-babd-99a32eafdb95'::uuid, 'Cód 2897'),
    ('678e46f7-e645-42a7-9e26-71ecd9c2d36f'::uuid, 'Cod 1259'),
    ('6ed38278-c29e-4d1e-9391-0699532d7bac'::uuid, 'Cod 1259'),
    ('779e943f-5d04-408f-b284-1efca5e047a7'::uuid, 'Interesse no cód 1094'),
    ('7ebda899-7bee-4d4d-8f46-6b66c40c1c82'::uuid, 'Cód 1238'),
    ('b1f35861-13ac-43d5-9abb-5b228be6df8b'::uuid, 'Cód 2940 e 3109'),
    ('ec13fb7f-338f-470e-b6c4-643d5fd26d6c'::uuid, 'Cod 1072 e 1210')
)
UPDATE public.attendances a
SET imovel_codigo = s.imovel_codigo
FROM snapshot s
WHERE a.id = s.id
  AND a.imovel_codigo IS NULL;

-- Restore imovel_descricao where it was nulled. Prefer keeping current value
-- if already set; otherwise put the original text back.
WITH snapshot(id, imovel_descricao) AS (
  VALUES
    ('30f0520c-660e-49ce-973e-7906c321be35'::uuid, 'Interesse no cód 806'),
    ('35a6497f-fed9-4ba4-86bd-ff50ee896bb5'::uuid, 'Cliente quer visitar o imóvel'),
    ('51bed07d-750f-4cac-b03c-af77f82a0a78'::uuid, 'Apartamentos na base de 400 mil no centro, sem necessidade de elevador'),
    ('60e01eef-9a96-4c81-ab0f-e86b1cb4570d'::uuid, 'Cliente tem dúvidas sobre vender o imóvel ainda financiado, procura apartamento para compra'),
    ('64e5ea6d-f1f2-4676-babd-99a32eafdb95'::uuid, 'Procuram casa para compra, que tenha 03 dormitórios e duas vagas de garagem'),
    ('678e46f7-e645-42a7-9e26-71ecd9c2d36f'::uuid, 'Qual andar é, de frente ou fundos e se esta ocupado'),
    ('6ed38278-c29e-4d1e-9391-0699532d7bac'::uuid, 'Cliente quer saber em qual andar fica e se o prédio possui elevador.'),
    ('813dae3a-d07e-4ab0-a6b6-02f8208625ab'::uuid, E'Cliente procura a primeira casa pelo Minha Casa, Minha Vida. Já havía conseguido uma proposta aprovada para um imóvel de R$ 220 mil, utilizando o subsídio federal, o programa Santa Rosa Verde e Amarela (R$ 18 mil) e o Porta de Entrada do Estado (R$ 20 mil). \nRenda familiar é de R$ 2.260.'),
    ('913e9a95-715d-4d38-be1f-85f9459679e0'::uuid, 'Cliente é proprietária do cód 1046, a mesma quer ver se há possibilidade de troca por outro imóvel.'),
    ('aec6bcaa-f8af-49df-813a-40eb801ef9cd'::uuid, 'Interesse no Residencial Cambará'),
    ('b1f35861-13ac-43d5-9abb-5b228be6df8b'::uuid, 'Procura casas geminadas e apartamento financiáveis para compra. Se interessou no Residencial Raizes e no cód 2940'),
    ('ec13fb7f-338f-470e-b6c4-643d5fd26d6c'::uuid, E'Cod 1210 se é financiável e em que lugar do bairro Central fica.\nCod 1072 em que lugar da Sulina Fica')
)
UPDATE public.attendances a
SET imovel_descricao = s.imovel_descricao
FROM snapshot s
WHERE a.id = s.id
  AND a.imovel_descricao IS NULL;

-- Populate interesse_descricao (free-form observation) only for rows that
-- have no property reference (no id, no ref, no code). Idempotent: only fills
-- when currently NULL. Does not overwrite anything.
DO $backfill$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.attendances
  SET interesse_descricao = imovel_descricao
  WHERE interesse_descricao IS NULL
    AND imovel_id IS NULL
    AND imovel_ref IS NULL
    AND imovel_codigo IS NULL
    AND imovel_descricao IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'atendimentos: interesse_descricao populated in % rows', v_count;
END;
$backfill$;

-- Tighten the profiles read policy the prior migration introduced.
-- Only members of the commercial team (admin/secretaria/corretor) should see
-- the assignment directory — this replaces the version that let every
-- authenticated user read every profile row referenced by an assignment.
DROP POLICY IF EXISTS "Attendance staff can view assignment profiles" ON public.profiles;
CREATE POLICY "Attendance staff can view assignment profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
    OR public.has_role(auth.uid(), 'corretor'::public.app_role)
  );
