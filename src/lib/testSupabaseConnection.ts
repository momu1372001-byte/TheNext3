import { supabase } from './supabaseClient';

export async function testSupabaseConnection() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Supabase test failed:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return;
  }

  console.log('Supabase query succeeded:', data.length);
}