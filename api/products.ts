/**
 * Un solo archivo: evita que el bundler de Vercel falle al resolver imports locales (FUNCTION_INVOCATION_FAILED).
 * Supabase solo vía fetch → PostgREST.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = {
  runtime: 'nodejs20.x' as const,
}

interface Product {
  id: string
  name: string
  price: number
  description: string
  imageUrl: string
  category: string
}

const SEED: Product[] = [
  {
    id: 'seed-almendras',
    name: 'Almendras tostadas',
    price: 4500,
    description: 'Textura crocante, ideal para picoteo o repostería.',
    imageUrl: 'https://images.unsplash.com/photo-1508747703725-719777637510?w=800&q=80',
    category: 'Almendras',
  },
  {
    id: 'seed-nueces',
    name: 'Nueces mariposa',
    price: 5200,
    description: 'Mitades seleccionadas, sabor suave y mantecoso.',
    imageUrl: 'https://images.unsplash.com/photo-1606923821729-80bb683f4079?w=800&q=80',
    category: 'Nueces',
  },
  {
    id: 'seed-cashews',
    name: 'Castañas de cajú',
    price: 6100,
    description: 'Cremosas y versátiles para ensaladas o snacks.',
    imageUrl: 'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=800&q=80',
    category: 'Otros frutos',
  },
  {
    id: 'seed-pasas',
    name: 'Pasas de uva',
    price: 2800,
    description: 'Dulzor natural, perfectas con cereales o postres.',
    imageUrl: 'https://images.unsplash.com/photo-1596591606935-3546b0f6a8f7?w=800&q=80',
    category: 'Desecados',
  },
]

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

type Row = {
  id: string
  name: string
  price: number | string
  description: string | null
  image_url: string
  category: string | null
}

function rowToProduct(row: Row): Product {
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

function getEnv(): { baseUrl: string; key: string } {
  const raw = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!raw || !key) throw new Error('MISSING_SUPABASE_ENV')
  const baseUrl = raw.replace(/\/+$/, '')
  if (!baseUrl.startsWith('https://')) {
    throw new Error('SUPABASE_URL inválida')
  }
  return { baseUrl, key }
}

function hdr(key: string, extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  }
}

async function readErr(r: Response): Promise<never> {
  const text = await r.text()
  try {
    const j = JSON.parse(text) as {
      message?: string
      details?: string
      hint?: string
    }
    const msg = [j.message, j.details, j.hint].filter(Boolean).join(' — ')
    throw new Error(msg || text || `HTTP ${r.status}`)
  } catch (e) {
    if (e instanceof Error && !(e instanceof SyntaxError)) throw e
    throw new Error(text || `HTTP ${r.status}`)
  }
}

async function listProducts(base: string, key: string): Promise<Product[]> {
  const url = `${base}/rest/v1/products?select=*&order=created_at.asc`
  const r = await fetch(url, { headers: hdr(key) })
  if (!r.ok) await readErr(r)
  const data = (await r.json()) as Row[]
  return Array.isArray(data) ? data.map(rowToProduct) : []
}

async function hasAny(base: string, key: string): Promise<boolean> {
  const url = `${base}/rest/v1/products?select=id&limit=1`
  const r = await fetch(url, { headers: hdr(key) })
  if (!r.ok) await readErr(r)
  const data = (await r.json()) as { id: string }[]
  return Array.isArray(data) && data.length > 0
}

async function insertSeed(base: string, key: string): Promise<void> {
  const rows = SEED.map(productToRow)
  const r = await fetch(`${base}/rest/v1/products`, {
    method: 'POST',
    headers: {
      ...hdr(key),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!r.ok) await readErr(r)
}

async function seedIfEmpty(base: string, key: string): Promise<void> {
  if (await hasAny(base, key)) return
  await insertSeed(base, key)
}

async function upsert(base: string, key: string, row: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${base}/rest/v1/products?on_conflict=id`, {
    method: 'POST',
    headers: {
      ...hdr(key),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  })
  if (!r.ok) await readErr(r)
}

async function existsId(base: string, key: string, id: string): Promise<boolean> {
  const url = `${base}/rest/v1/products?select=id&id=eq.${encodeURIComponent(id)}&limit=1`
  const r = await fetch(url, { headers: hdr(key) })
  if (!r.ok) await readErr(r)
  const data = (await r.json()) as { id: string }[]
  return Array.isArray(data) && data.length > 0
}

async function patchProduct(
  base: string,
  key: string,
  id: string,
  row: Record<string, unknown>
): Promise<void> {
  const r = await fetch(`${base}/rest/v1/products?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      ...hdr(key),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  })
  if (!r.ok) await readErr(r)
}

async function delProduct(base: string, key: string, id: string): Promise<void> {
  const r = await fetch(`${base}/rest/v1/products?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: hdr(key),
  })
  if (!r.ok) await readErr(r)
}

class AuthErr extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly extra?: Record<string, string>
  ) {
    super(message)
    this.name = 'AuthErr'
  }
}

function requireAuth(req: VercelRequest): void {
  const user = process.env.ADMIN_USER ?? ''
  const pass = process.env.ADMIN_PASS ?? ''
  if (!user || !pass) throw new AuthErr(500, 'Faltan ADMIN_USER y ADMIN_PASS en Vercel')
  const h = req.headers.authorization ?? ''
  const [scheme, token] = h.split(' ')
  if (scheme !== 'Basic' || !token) {
    throw new AuthErr(401, 'Unauthorized', {
      'www-authenticate': 'Basic realm="gestion"',
    })
  }
  let decoded = ''
  try {
    decoded = Buffer.from(token, 'base64').toString('utf8')
  } catch {
    throw new AuthErr(401, 'Unauthorized', {
      'www-authenticate': 'Basic realm="gestion"',
    })
  }
  const [u, p] = decoded.split(':')
  if (u !== user || p !== pass) {
    throw new AuthErr(401, 'Unauthorized', {
      'www-authenticate': 'Basic realm="gestion"',
    })
  }
}

function parseBody(req: VercelRequest): unknown {
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

function strErr(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  try {
    let base: string
    let key: string
    try {
      const e = getEnv()
      base = e.baseUrl
      key = e.key
    } catch (e) {
      if (e instanceof Error && e.message === 'MISSING_SUPABASE_ENV') {
        res.status(500).json({
          error:
            'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel (Environment Variables).',
        })
        return
      }
      res.status(500).json({ error: strErr(e) })
      return
    }

    if (req.method === 'GET') {
      try {
        await seedIfEmpty(base, key)
        const list = await listProducts(base, key)
        res.status(200).json(list)
      } catch (e) {
        console.error(e)
        res.status(500).json({
          error:
            'Error al leer Supabase. Ejecutá supabase/migrations/001_products.sql y revisá la service_role JWT (eyJ…).',
          details: strErr(e),
        })
      }
      return
    }

    try {
      requireAuth(req)
    } catch (e) {
      if (e instanceof AuthErr) {
        if (e.extra) {
          for (const [k, v] of Object.entries(e.extra)) res.setHeader(k, v)
        }
        res.status(e.code).json({ error: e.message })
        return
      }
      res.status(500).json({ error: strErr(e) })
      return
    }

    if (req.method === 'POST') {
      const body = parseBody(req) as { product?: Product } | null
      if (!body?.product) {
        res.status(400).json({ error: 'Bad Request' })
        return
      }
      try {
        await upsert(base, key, productToRow(body.product))
        res.status(200).json(await listProducts(base, key))
      } catch (e) {
        res.status(500).json({ error: strErr(e), details: strErr(e) })
      }
      return
    }

    if (req.method === 'PUT') {
      const body = parseBody(req) as { product?: Product } | null
      if (!body?.product) {
        res.status(400).json({ error: 'Bad Request' })
        return
      }
      try {
        const ok = await existsId(base, key, body.product.id)
        if (!ok) {
          res.status(404).json({ error: 'Not Found' })
          return
        }
        await patchProduct(base, key, body.product.id, productToRow(body.product))
        res.status(200).json(await listProducts(base, key))
      } catch (e) {
        res.status(500).json({ error: strErr(e) })
      }
      return
    }

    if (req.method === 'DELETE') {
      const body = parseBody(req) as { id?: string } | null
      const id = body?.id
      if (!id) {
        res.status(400).json({ error: 'Bad Request' })
        return
      }
      try {
        await delProduct(base, key, id)
        res.status(200).json(await listProducts(base, key))
      } catch (e) {
        res.status(500).json({ error: strErr(e) })
      }
      return
    }

    res.status(405).send('Method Not Allowed')
  } catch (e) {
    console.error('api/products fatal', e)
    try {
      res.status(500).json({ error: 'Error interno', details: strErr(e) })
    } catch {
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  }
}
