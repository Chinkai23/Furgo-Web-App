// Section: Supabase browser client
// Function: Configure the public project client for the static Furgo web app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// This publishable key is designed for browser use; never put a service-role key here.
export const SUPABASE_URL = 'https://oefhrnzwyocslrtpgnia.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_G5MbDsKB2nuQ8Sg_GGUg0A_sIsMTBq8';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

// Section: Malaysian phone formatting
// Function: Convert the customer-facing local 01 number to the E.164 form used by Supabase.
export function toMalaysianE164(value) {
  const local = String(value || '').trim().replace(/[\s()-]/g, '');
  if (!/^01(?:1[0-9]{8}|[02-9][0-9]{7})$/.test(local)) {
    throw new Error('Enter a valid Malaysian mobile number starting with 01.');
  }
  return `+60${local.slice(1)}`;
}
