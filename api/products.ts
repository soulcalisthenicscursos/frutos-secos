/**
 * Runtime Edge: sin @vercel/node (evita crashes de invocación en Vercel).
 * Supabase vía fetch → PostgREST.
 */
export const config = { runtime: 'edge' as const }

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

function sanitizeSecret(raw: string): string {
  let s = raw.trim()
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1)
  }
  if (s.toLowerCase().startsWith('bearer ')) s = s.slice(7).trim()
  return s.trim()
}

function getEnv(): { baseUrl: string; key: string } {
  const raw = process.env.SUPABASE_URL?.trim()
  const keyRaw = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!raw || keyRaw == null || keyRaw === '') throw new Error('MISSING_SUPABASE_ENV')
  const key = sanitizeSecret(keyRaw)
  if (!key) throw new Error('MISSING_SUPABASE_ENV')
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
    Accept: 'application/json',
    'Accept-Profile': 'public',
    'Content-Profile': 'public',
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

function requireAuth(request: Request): void {
  const user = process.env.ADMIN_USER ?? ''
  const pass = process.env.ADMIN_PASS ?? ''
  if (!user || !pass) throw new AuthErr(500, 'Faltan ADMIN_USER y ADMIN_PASS en Vercel')
  const h = request.headers.get('authorization') ?? ''
  const [scheme, token] = h.split(' ')
  if (scheme !== 'Basic' || !token) {
    throw new AuthErr(401, 'Unauthorized', {
      'www-authenticate': 'Basic realm="gestion"',
    })
  }
  let decoded: string
  try {
    decoded = atob(token)
  } catch {
    throw new AuthErr(401, 'Unauthorized', {
      'www-authenticate': 'Basic realm="gestion"',
    })
  }
  const i = decoded.indexOf(':')
  const u = i === -1 ? decoded : decoded.slice(0, i)
  const p = i === -1 ? '' : decoded.slice(i + 1)
  if (u !== user || p !== pass) {
    throw new AuthErr(401, 'Unauthorized', {
      'www-authenticate': 'Basic realm="gestion"',
    })
  }
}

function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
  const h = new Headers({ 'content-type': 'application/json; charset=utf-8' })
  if (headers) {
    for (const [k, v] of Object.entries(headers)) h.set(k, v)
  }
  return new Response(JSON.stringify(data), { status, headers: h })
}

function strErr(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

export default async function handler(request: Request): Promise<Response> {
  try {
    let base: string
    let key: string
    try {
      const e = getEnv()
      base = e.baseUrl
      key = e.key
    } catch (e) {
      if (e instanceof Error && e.message === 'MISSING_SUPABASE_ENV') {
        return json(
          {
            error:
              'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel (Environment Variables).',
          },
          500
        )
      }
      return json({ error: strErr(e) }, 500)
    }

    if (request.method === 'GET') {
      try {
        await seedIfEmpty(base, key)
        const list = await listProducts(base, key)
        return json(list, 200)
      } catch (e) {
        return json(
          {
            error:
              'Error de Supabase/PostgREST. Revisá: tabla public.products (SQL), clave service_role JWT (eyJ…), y que la URL sea https://xxx.supabase.co',
            details: strErr(e),
          },
          500
        )
      }
    }

    try {
      requireAuth(request)
    } catch (e) {
      if (e instanceof AuthErr) {
        const h: Record<string, string> = {}
        if (e.extra) Object.assign(h, e.extra)
        return json({ error: e.message }, e.code, h)
      }
      return json({ error: strErr(e) }, 500)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      body = null
    }

    if (request.method === 'POST') {
      const b = body as { product?: Product } | null
      if (!b?.product) return json({ error: 'Bad Request' }, 400)
      try {
        await upsert(base, key, productToRow(b.product))
        return json(await listProducts(base, key), 200)
      } catch (e) {
        return json({ error: strErr(e), details: strErr(e) }, 500)
      }
    }

    if (request.method === 'PUT') {
      const b = body as { product?: Product } | null
      if (!b?.product) return json({ error: 'Bad Request' }, 400)
      try {
        const ok = await existsId(base, key, b.product.id)
        if (!ok) return json({ error: 'Not Found' }, 404)
        await patchProduct(base, key, b.product.id, productToRow(b.product))
        return json(await listProducts(base, key), 200)
      } catch (e) {
        return json({ error: strErr(e) }, 500)
      }
    }

    if (request.method === 'DELETE') {
      const b = body as { id?: string } | null
      const id = b?.id
      if (!id) return json({ error: 'Bad Request' }, 400)
      try {
        await delProduct(base, key, id)
        return json(await listProducts(base, key), 200)
      } catch (e) {
        return json({ error: strErr(e) }, 500)
      }
    }

    return new Response('Method Not Allowed', { status: 405 })
  } catch (e) {
    return json({ error: 'Error interno', details: strErr(e) }, 500)
  }
}
