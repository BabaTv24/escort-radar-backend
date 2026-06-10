import { createClient } from '@supabase/supabase-js';

console.log('SUPABASE URL', import.meta.env.VITE_SUPABASE_URL);
console.log('SUPABASE KEY EXISTS', !!import.meta.env.VITE_SUPABASE_ANON_KEY);

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  }
);
