import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Response('Faltan envs SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', {
      status: 500,
    })
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
