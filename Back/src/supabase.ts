import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

export const supabaseAdmin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false }
});

export const supabaseAnon = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { persistSession: false }
});
