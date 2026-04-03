import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export function getSupabaseAdmin(): SupabaseClient {
  const rawUrl = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!rawUrl || !key) {
    throw new Error('MISSING_SUPABASE_ENV')
  }
  const url = normalizeUrl(rawUrl)
  if (!url.startsWith('https://')) {
    throw new Error('SUPABASE_URL debe empezar con https://')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
