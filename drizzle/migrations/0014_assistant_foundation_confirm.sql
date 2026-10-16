COMMENT ON FUNCTION public.assistant_current_scope() IS 'Assistant scope fingerprint; must match assistantScopeKey() in src/lib/agent/scope.ts.';
NOTIFY pgrst, 'reload schema';