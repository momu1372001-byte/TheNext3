/*
# Create profiles table for user accounts

1. New Tables
- `profiles` — stores per-user learning profile data (level, daily goal,
  streak, XP, etc.) so that signed-in learners can sync their progress
  across devices.  Each row is owned by the auth user it belongs to.

  Columns:
  - `id` (uuid, PK, references auth.users) — the user's auth ID
  - `email` (text) — cached email for display
  - `level` (text) — CEFR level: A1, A2, B1, B2, C1
  - `daily_goal` (integer) — words per day target
  - `streak` (integer) — consecutive days streak
  - `xp` (integer) — total experience points
  - `learned_word_ids` (text[]) — array of learned word IDs
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

2. Security
- Enable RLS on `profiles`.
- Owner-scoped CRUD: each authenticated user can only access their own row.
- The `id` column defaults to `auth.uid()` so inserts that omit it succeed.

3. Notes
- This is an OPTIONAL login — the app still works fully without signing in
  (using localStorage).  When a user signs in, their profile is synced to
  this table.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  level text NOT NULL DEFAULT 'A1',
  daily_goal integer NOT NULL DEFAULT 10,
  streak integer NOT NULL DEFAULT 0,
  xp integer NOT NULL DEFAULT 0,
  learned_word_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON profiles;
CREATE POLICY "delete_own_profile" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);
