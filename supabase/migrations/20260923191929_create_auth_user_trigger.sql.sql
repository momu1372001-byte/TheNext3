/*
# Auto-create profile on Google OAuth sign-up

1. New Functions
- `handle_new_user()` — a trigger function that automatically creates a `profiles`
  row when a new user registers through ANY auth provider (email/password or
  Google OAuth). This ensures Google OAuth users get a profile row without
  needing a separate client-side insert (which is impossible during the OAuth
  redirect flow).

- The function copies `email` and `full_name` (from `raw_user_meta_data->>'full_name'`
  which Google populates) into the profiles table.

2. Security
- The function is `SECURITY DEFINER` so it can insert into `profiles` even though
  the trigger fires before the user's session is established.
- The trigger fires `AFTER INSERT ON auth.users` — only Supabase's auth system
  inserts into `auth.users`, so this is safe.
- `search_path` is set to `public` to prevent search_path injection.

3. Notes
- Uses `ON CONFLICT (id) DO NOTHING` so re-running the trigger (e.g. if the
  user already has a profile from a prior email signup) is a no-op.
- The `full_name` column was added in a prior migration and defaults to ''.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
