REVOKE EXECUTE ON FUNCTION public.agenda_can_access(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.agenda_can_edit(uuid) FROM PUBLIC, anon, authenticated;