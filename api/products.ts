import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Product } from '../src/types'
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

function errPayload(e: unknown): { error: string } {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message: unknown }).message
    return { error: typeof m === 'string' ? m : String(m) }
  }
  return { error: String(e) }
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
  const { count, error: countError } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
  if (countError) throw countError
  if ((count ?? 0) > 0) return
  const rows = SEED_PRODUCTS.map((p) => productToRow(p))
  const { error } = await supabase.from('products').insert(rows)
  if (error) throw error
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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e) {
    if (e instanceof Error && e.message === 'MISSING_SUPABASE_ENV') {
      res.status(500).json({
        error:
          'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel (Settings → Environment Variables).',
      })
      return
    }
    res.status(500).json(errPayload(e))
    return
  }

  if (req.method === 'GET') {
    try {
      await seedIfEmpty(supabase)
      const list = await listProducts(supabase)
      res.status(200).json(list)
      return
    } catch (e) {
      console.error(e)
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: unknown }).message)
          : String(e)
      res.status(500).json({
        error:
          'No se pudo leer la base. Revisá: tabla public.products (SQL), claves de Supabase (service_role JWT o sb_secret) y SUPABASE_URL.',
        details: msg,
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
      res.status(e.statusCode).json({ error: e.message })
      return
    }
    res.status(500).json(errPayload(e))
    return
  }

  if (req.method === 'POST') {
    const body = parseJsonBody(req) as { product?: Product } | null
    if (!body?.product) {
      res.status(400).json({ error: 'Bad Request' })
      return
    }
    const { error } = await supabase
      .from('products')
      .upsert(productToRow(body.product), { onConflict: 'id' })
    if (error) {
      console.error(error)
      res.status(500).json({ error: error.message })
      return
    }
    const list = await listProducts(supabase)
    res.status(200).json(list)
    return
  }

  if (req.method === 'PUT') {
    const body = parseJsonBody(req) as { product?: Product } | null
    if (!body?.product) {
      res.status(400).json({ error: 'Bad Request' })
      return
    }
    const { data: existing, error: exErr } = await supabase
      .from('products')
      .select('id')
      .eq('id', body.product.id)
      .maybeSingle()
    if (exErr) {
      console.error(exErr)
      res.status(500).json({ error: exErr.message })
      return
    }
    if (!existing) {
      res.status(404).json({ error: 'Not Found' })
      return
    }
    const { error } = await supabase
      .from('products')
      .update(productToRow(body.product))
      .eq('id', body.product.id)
    if (error) {
      console.error(error)
      res.status(500).json({ error: error.message })
      return
    }
    const list = await listProducts(supabase)
    res.status(200).json(list)
    return
  }

  if (req.method === 'DELETE') {
    const body = parseJsonBody(req) as { id?: string } | null
    const id = body?.id
    if (!id) {
      res.status(400).json({ error: 'Bad Request' })
      return
    }
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) {
      console.error(error)
      res.status(500).json({ error: error.message })
      return
    }
    const list = await listProducts(supabase)
    res.status(200).json(list)
    return
  }

  res.status(405).send('Method Not Allowed')
}
