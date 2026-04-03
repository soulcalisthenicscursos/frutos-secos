import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Product } from './types'
import { AuthError, requireBasicAuth } from './_auth'
import { SEED_PRODUCTS } from './_seed'
import { getSupabaseAdmin } from './supabaseAdmin'

type ProductRow = {
  id: string
  name: string
  price: number | string
  description: string | null
  image_url: string
  category: string | null
}

function rowToProduct(row: ProductRow): Product {
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

function productToRow(p: Product): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    description: p.description,
    image_url: p.imageUrl,
    category: p.category,
  }
}

function stringifySupabaseError(e: unknown): string {
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>
    const parts = [
      o.message,
      o.details,
      o.hint,
      o.code,
    ].filter((x) => typeof x === 'string' && x.length > 0)
    if (parts.length) return parts.join(' — ')
  }
  if (e instanceof Error) return e.message
  return String(e)
}

function errPayload(e: unknown): { error: string } {
  return { error: stringifySupabaseError(e) }
}

async function listProducts(
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as ProductRow[] | null)?.map(rowToProduct) ?? []
}

async function seedIfEmpty(
  supabase: ReturnType<typeof getSupabaseAdmin>
): Promise<void> {
  const { data, error } = await supabase.from('products').select('id').limit(1)
  if (error) throw error
  if (data && data.length > 0) return
  const rows = SEED_PRODUCTS.map((p) => productToRow(p))
  const { error: insErr } = await supabase.from('products').insert(rows)
  if (insErr) throw insErr
}

function parseJsonBody(req: VercelRequest): unknown {
  if (req.body == null) return null
  if (typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as unknown
    } catch {
      return null
    }
  }
  return null
}

function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.status(status)
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function handle(req: VercelRequest, res: VercelResponse): Promise<void> {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e) {
    if (e instanceof Error && e.message === 'MISSING_SUPABASE_ENV') {
      sendJson(res, 500, {
        error:
          'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel (Settings → Environment Variables).',
      })
      return
    }
    sendJson(res, 500, errPayload(e))
    return
  }

  if (req.method === 'GET') {
    try {
      await seedIfEmpty(supabase)
      const list = await listProducts(supabase)
      sendJson(res, 200, list)
      return
    } catch (e) {
      console.error(e)
      sendJson(res, 500, {
        error:
          'No se pudo leer la base. Ejecutá el SQL de supabase/migrations/001_products.sql y revisá las env vars.',
        details: stringifySupabaseError(e),
      })
      return
    }
  }

  try {
    requireBasicAuth(req)
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.extraHeaders) {
        for (const [k, v] of Object.entries(e.extraHeaders)) {
          res.setHeader(k, v)
        }
      }
      sendJson(res, e.statusCode, { error: e.message })
      return
    }
    sendJson(res, 500, errPayload(e))
    return
  }

  if (req.method === 'POST') {
    const body = parseJsonBody(req) as { product?: Product } | null
    if (!body?.product) {
      sendJson(res, 400, { error: 'Bad Request' })
      return
    }
    const { error } = await supabase
      .from('products')
      .upsert(productToRow(body.product), { onConflict: 'id' })
    if (error) {
      console.error(error)
      sendJson(res, 500, { error: error.message, details: stringifySupabaseError(error) })
      return
    }
    const list = await listProducts(supabase)
    sendJson(res, 200, list)
    return
  }

  if (req.method === 'PUT') {
    const body = parseJsonBody(req) as { product?: Product } | null
    if (!body?.product) {
      sendJson(res, 400, { error: 'Bad Request' })
      return
    }
    const { data: existing, error: exErr } = await supabase
      .from('products')
      .select('id')
      .eq('id', body.product.id)
      .maybeSingle()
    if (exErr) {
      console.error(exErr)
      sendJson(res, 500, { error: exErr.message })
      return
    }
    if (!existing) {
      sendJson(res, 404, { error: 'Not Found' })
      return
    }
    const { error } = await supabase
      .from('products')
      .update(productToRow(body.product))
      .eq('id', body.product.id)
    if (error) {
      console.error(error)
      sendJson(res, 500, { error: error.message })
      return
    }
    const list = await listProducts(supabase)
    sendJson(res, 200, list)
    return
  }

  if (req.method === 'DELETE') {
    const body = parseJsonBody(req) as { id?: string } | null
    const id = body?.id
    if (!id) {
      sendJson(res, 400, { error: 'Bad Request' })
      return
    }
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) {
      console.error(error)
      sendJson(res, 500, { error: error.message })
      return
    }
    const list = await listProducts(supabase)
    sendJson(res, 200, list)
    return
  }

  res.status(405).setHeader('content-type', 'text/plain; charset=utf-8')
  res.end('Method Not Allowed')
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  try {
    await handle(req, res)
  } catch (e) {
    console.error('api/products unhandled', e)
    try {
      sendJson(res, 500, {
        error: 'Error interno en /api/products',
        details: stringifySupabaseError(e),
      })
    } catch {
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  }
}
