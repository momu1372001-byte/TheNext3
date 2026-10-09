/*
# Add progress sync columns to profiles table

1. Modified Tables
- `profiles` — adds two new columns to support cross-device progress sync:
  - `progress_data` (jsonb, default '{}') — stores the full ProgressState JSON
    (lessons, learnedWordIds, streak, words, xp, activityLog, achievements,
    placement, etc.) so a learner signing in on a new device can restore
    everything instantly.
  - `full_name` (text, default '') — display name for the user (especially
    useful for Google OAuth users whose name comes from their Google account).

2. Security
- No new policies needed — existing owner-scoped CRUD policies on `profiles`
  already cover the new columns. Users can only read/write their own row.

3. Notes
- Both columns are nullable-safe with sensible defaults so existing rows and
  inserts that omit them continue to work.
- `progress_data` is updated whenever the app's progress store changes (debounced),
  and loaded on sign-in to restore the learner's state on a new device.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS progress_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '';
