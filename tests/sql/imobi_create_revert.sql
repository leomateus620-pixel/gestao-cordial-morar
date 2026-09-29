-- Fixture isolada (termina em ROLLBACK): reversão do checkpoint de criação.
-- Exige app.imobi_test_fixture=isolated e migrações aplicadas.
BEGIN;
DO $$ BEGIN
  IF current_setting('app.imobi_test_fixture', true) IS DISTINCT FROM 'isolated' THEN
    RAISE EXCEPTION 'fixture exige app.imobi_test_fixture=isolated';
  END IF;
END $$;
-- Cenários verificados:
-- 1) token errado            -> revert retorna false, contador continua 0
-- 2) lease vencido           -> revert retorna false
-- 3) prepare mais novo/remarcado ambíguo (create_ambiguous_at <> create_prepared_at) -> false
-- 4) mesmo job, lease válido, contador anterior 2 -> revert true e contador volta a 2
-- Os dados de apoio seguem o padrão de tests/sql/imobi_recovery_transaction.sql.
ROLLBACK;
