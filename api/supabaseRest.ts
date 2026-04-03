import type { Product } from './types'

function normalizeUrl(raw: string): string {
  const u = raw.trim().replace(/\/+$/, '')
  if (!u.startsWith('https://')) throw new Error('SUPABASE_URL debe empezar con https://')
  return u
}

export function getSupabaseEnv(): { baseUrl: string; key: string } {
  const rawUrl = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!rawUrl || !key) throw new Error('MISSING_SUPABASE_ENV')
  return { baseUrl: normalizeUrl(rawUrl), key }
}

function authHeaders(key: string, extra?: Record<string, string>): HeadersInit {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  }
}

async function readRestError(r: Response): Promise<never> {
  const text = await r.text()
  let j: { message?: string; details?: string; hint?: string }
  try {
    j = JSON.parse(text) as { message?: string; details?: string; hint?: string }
  } catch {
    throw new Error(text || `HTTP ${r.status}`)
  }
  const msg = [j.message, j.details, j.hint].filter(Boolean).join(' — ')
  throw new Error(msg || text || `HTTP ${r.status}`)
}

type ProductRow = {
  id: string
  name: string
  price: number | string
  description: string | null
  image_url: string
  category: string | null
  created_at?: string
}

export function rowToProduct(row: ProductRow): Product {
  const price =
    typeof row.price === 'string' ? Number.parseFloat(row.price) : row.price
  return {
    id: row.id,
    name: row.name,
    price: Number.isFinite(price) ? price : 0,
    description: row.description ?? '',
    imageUrl: row.image_url,
    category: row.category?.trim() ? row.category : 'General',
  }
}

export function productToRow(p: Product): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    description: p.description,
    image_url: p.imageUrl,
    category: p.category,
  }
}

export async function restListProducts(baseUrl: string, key: string): Promise<Product[]> {
  const url = `${baseUrl}/rest/v1/products?select=*&order=created_at.asc`
  const r = await fetch(url, { headers: authHeaders(key) })
  if (!r.ok) await readRestError(r)
  const data = (await r.json()) as ProductRow[]
  return Array.isArray(data) ? data.map(rowToProduct) : []
}

export async function restHasAnyProduct(baseUrl: string, key: string): Promise<boolean> {
  const url = `${baseUrl}/rest/v1/products?select=id&limit=1`
  const r = await fetch(url, { headers: authHeaders(key) })
  if (!r.ok) await readRestError(r)
  const data = (await r.json()) as { id: string }[]
  return Array.isArray(data) && data.length > 0
}

export async function restInsertProducts(
  baseUrl: string,
  key: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  const url = `${baseUrl}/rest/v1/products`
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      ...authHeaders(key),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!r.ok) await readRestError(r)
}

export async function restUpsertProduct(
  baseUrl: string,
  key: string,
  row: Record<string, unknown>
): Promise<void> {
  const url = `${baseUrl}/rest/v1/products?on_conflict=id`
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      ...authHeaders(key),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  })
  if (!r.ok) await readRestError(r)
}

export async function restGetProductId(
  baseUrl: string,
  key: string,
  id: string
): Promise<boolean> {
  const url = `${baseUrl}/rest/v1/products?select=id&id=eq.${encodeURIComponent(id)}&limit=1`
  const r = await fetch(url, { headers: authHeaders(key) })
  if (!r.ok) await readRestError(r)
  const data = (await r.json()) as { id: string }[]
  return Array.isArray(data) && data.length > 0
}

export async function restUpdateProduct(
  baseUrl: string,
  key: string,
  id: string,
  row: Record<string, unknown>
): Promise<void> {
  const url = `${baseUrl}/rest/v1/products?id=eq.${encodeURIComponent(id)}`
  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...authHeaders(key),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  })
  if (!r.ok) await readRestError(r)
}

export async function restDeleteProduct(
  baseUrl: string,
  key: string,
  id: string
): Promise<void> {
  const url = `${baseUrl}/rest/v1/products?id=eq.${encodeURIComponent(id)}`
  const r = await fetch(url, {
    method: 'DELETE',
    headers: authHeaders(key),
  })
  if (!r.ok) await readRestError(r)
}
