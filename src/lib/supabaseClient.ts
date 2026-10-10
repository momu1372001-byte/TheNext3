
import { createClient } from '@supabase/supabase-js';

const EXPECTED_HOST = 'cbmhumdtthgoodwxgjmt.supabase.co';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !publishableKey) {
  throw new Error('Supabase environment variables are missing.');
}

let configuredHost: string;

try {
  const url = new URL(supabaseUrl);
  configuredHost = url.host;

  if (url.protocol !== 'https:') {
    throw new Error('HTTPS is required.');
  }
} catch {
  throw new Error('Invalid Supabase URL. HTTPS is required.');
}

if (configuredHost !== EXPECTED_HOST) {
  throw new Error(
    `Wrong Supabase project. Expected: ${EXPECTED_HOST}`,
  );
}

export const supabase = createClient(
  supabaseUrl,
  publishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export default supabase;