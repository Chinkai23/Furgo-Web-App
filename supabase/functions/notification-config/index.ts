import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: corsHeaders });

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  if (!authorization || !supabaseUrl || !anonKey) return Response.json({ error: 'Sign in is required.' }, { status: 401, headers: corsHeaders });

  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return Response.json({ error: 'Sign in is required.' }, { status: 401, headers: corsHeaders });
  if (!vapidPublicKey) return Response.json({ error: 'Push delivery is not configured.' }, { status: 503, headers: corsHeaders });
  return Response.json({ vapidPublicKey }, { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } });
});
