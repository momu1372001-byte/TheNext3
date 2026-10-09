/*
# Revoke EXECUTE on handle_new_user from anon and authenticated

The trigger function `handle_new_user()` only needs to run as a database
trigger on `auth.users` insert. It should NOT be callable via the REST API
by any role. This revokes EXECUTE from anon and authenticated to close
that surface.
*/

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
