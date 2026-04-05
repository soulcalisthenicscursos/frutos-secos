/**
 * Runtime Edge: sin @vercel/node.
 * Logs: Vercel → proyecto → Logs → filtrar "catalog-api" (nunca logueamos secretos).
 */
export const config = { runtime: 'edge' }

const TAG = 'catalog-api'

type Ctx = { requestId: string }

function log(ctx: Ctx, step: string, data?: Record<string, string | number | boolean | undefined>): void {
  const line = JSON.stringify({
    tag: TAG,
    requestId: ctx.requestId,
    step,
    ts: new Date().toISOString(),
    ...data,
  })
  console.log(line)
}

function hostOnly(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname
  } catch {
    return '(url inválida)'
  }
}

/** Solo tipo y longitud; nunca el valor de la clave. */
function keyMeta(key: string): { keyKind: string; keyLength: number } {
  const keyLength = key.length
  if (key.startsWith('eyJ')) return { keyKind: 'jwt_service_role', keyLength }
  if (key.startsWith('sb_secret_')) return { keyKind: 'sb_secret', keyLength }
  if (key.startsWith('sb_publishable_')) return { keyKind: 'sb_publishable_wrong_for_server', keyLength }
  return { keyKind: 'other', keyLength }
}

function withRequestIdHeader(
  res: Response,
  requestId: string
): Response {
  const h = new Headers(res.headers)
  h.set('x-catalog-request-id', requestId)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h })
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

function getEnv(ctx: Ctx): { baseUrl: string; key: string } {
  const raw = process.env.SUPABASE_URL?.trim()
  const keyRaw = process.env.SUPABASE_SERVICE_ROLE_KEY
  log(ctx, 'env_check', {
    hasSupabaseUrl: raw ? 1 : 0,
    hasServiceKeyVar: keyRaw != null && keyRaw !== '' ? 1 : 0,
  })
  if (!raw || keyRaw == null || keyRaw === '') throw new Error('MISSING_SUPABASE_ENV')
  const key = sanitizeSecret(keyRaw)
  if (!key) throw new Error('MISSING_SUPABASE_ENV')
  const baseUrl = raw.replace(/\/+$/, '')
  if (!baseUrl.startsWith('https://')) {
    throw new Error('SUPABASE_URL inválida')
  }
  const km = keyMeta(key)
  log(ctx, 'env_ok', {
    supabaseHost: hostOnly(baseUrl),
    ...km,
    adminUserSet: process.env.ADMIN_USER ? 1 : 0,
    adminPassSet: process.env.ADMIN_PASS ? 1 : 0,
  })
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

async function supabaseFetch(
  ctx: Ctx,
  op: string,
  url: string,
  init?: RequestInit
): Promise<Response> {
  let pathPreview = url
  try {
    const u = new URL(url)
    pathPreview = u.pathname + u.search
    if (pathPreview.length > 160) pathPreview = pathPreview.slice(0, 160) + '…'
  } catch {
    pathPreview = '(url parse error)'
  }
  const t0 = Date.now()
  log(ctx, 'supabase_fetch_start', { op, pathPreview })
  const r = await fetch(url, init)
  log(ctx, 'supabase_fetch_done', {
    op,
    httpStatus: r.status,
    ms: Date.now() - t0,
  })
  return r
}

async function readErr(ctx: Ctx, op: string, r: Response): Promise<never> {
  const text = await r.text()
  const preview = text.length > 500 ? text.slice(0, 500) + '…' : text
  log(ctx, 'supabase_error_body', { op, httpStatus: r.status, bodyPreview: preview })
  try {
    const j = JSON.parse(text) as {
      message?: string
      details?: string
      hint?: string
      code?: string
    }
    log(ctx, 'supabase_error_json', {
      op,
      code: j.code ?? '',
      message: (j.message ?? '').slice(0, 200),
    })
    const msg = [j.message, j.details, j.hint].filter(Boolean).join(' — ')
    throw new Error(msg || text || `HTTP ${r.status}`)
  } catch (e) {
    if (e instanceof Error && !(e instanceof SyntaxError)) throw e
    throw new Error(text || `HTTP ${r.status}`)
  }
}

async function listProducts(ctx: Ctx, base: string, key: string): Promise<Product[]> {
  const url = `${base}/rest/v1/products?select=*&order=created_at.asc`
  const r = await supabaseFetch(ctx, 'listProducts', url, { headers: hdr(key) })
  if (!r.ok) await readErr(ctx, 'listProducts', r)
  const data = (await r.json()) as Row[]
  const n = Array.isArray(data) ? data.length : 0
  log(ctx, 'listProducts_ok', { rowCount: n })
  return Array.isArray(data) ? data.map(rowToProduct) : []
}

async function hasAny(ctx: Ctx, base: string, key: string): Promise<boolean> {
  const url = `${base}/rest/v1/products?select=id&limit=1`
  const r = await supabaseFetch(ctx, 'hasAny', url, { headers: hdr(key) })
  if (!r.ok) await readErr(ctx, 'hasAny', r)
  const data = (await r.json()) as { id: string }[]
  const any = Array.isArray(data) && data.length > 0
  log(ctx, 'hasAny_result', { hasRows: any ? 1 : 0 })
  return any
}

async function insertSeed(ctx: Ctx, base: string, key: string): Promise<void> {
  const rows = SEED.map(productToRow)
  const r = await supabaseFetch(ctx, 'insertSeed', `${base}/rest/v1/products`, {
    method: 'POST',
    headers: {
      ...hdr(key),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!r.ok) await readErr(ctx, 'insertSeed', r)
  log(ctx, 'insertSeed_ok', { seedCount: rows.length })
}

async function seedIfEmpty(ctx: Ctx, base: string, key: string): Promise<void> {
  if (await hasAny(ctx, base, key)) {
    log(ctx, 'seed_skip', { reason: 'table_has_rows' })
    return
  }
  log(ctx, 'seed_run', { reason: 'table_empty' })
  await insertSeed(ctx, base, key)
}

async function upsert(
  ctx: Ctx,
  base: string,
  key: string,
  row: Record<string, unknown>
): Promise<void> {
  const r = await supabaseFetch(
    ctx,
    'upsert',
    `${base}/rest/v1/products?on_conflict=id`,
    {
      method: 'POST',
      headers: {
        ...hdr(key),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(row),
    }
  )
  if (!r.ok) await readErr(ctx, 'upsert', r)
}

async function existsId(ctx: Ctx, base: string, key: string, id: string): Promise<boolean> {
  const url = `${base}/rest/v1/products?select=id&id=eq.${encodeURIComponent(id)}&limit=1`
  const r = await supabaseFetch(ctx, 'existsId', url, { headers: hdr(key) })
  if (!r.ok) await readErr(ctx, 'existsId', r)
  const data = (await r.json()) as { id: string }[]
  return Array.isArray(data) && data.length > 0
}

async function patchProduct(
  ctx: Ctx,
  base: string,
  key: string,
  id: string,
  row: Record<string, unknown>
): Promise<void> {
  const r = await supabaseFetch(
    ctx,
    'patchProduct',
    `${base}/rest/v1/products?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: {
        ...hdr(key),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    }
  )
  if (!r.ok) await readErr(ctx, 'patchProduct', r)
}

async function delProduct(ctx: Ctx, base: string, key: string, id: string): Promise<void> {
  const r = await supabaseFetch(
    ctx,
    'delProduct',
    `${base}/rest/v1/products?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: hdr(key),
    }
  )
  if (!r.ok) await readErr(ctx, 'delProduct', r)
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

function requireAuth(ctx: Ctx, request: Request): void {
  const user = process.env.ADMIN_USER ?? ''
  const pass = process.env.ADMIN_PASS ?? ''
  log(ctx, 'auth_check', {
    adminUserLen: user.length,
    adminPassLen: pass.length,
  })
  if (!user || !pass) throw new AuthErr(500, 'Faltan ADMIN_USER y ADMIN_PASS en Vercel')
  const h = request.headers.get('authorization') ?? ''
  const hasBasic = h.startsWith('Basic ')
  log(ctx, 'auth_header', { hasBasic: hasBasic ? 1 : 0 })
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
  const ok = u === user && p === pass
  log(ctx, 'auth_result', { ok: ok ? 1 : 0 })
  if (!ok) {
    throw new AuthErr(401, 'Unauthorized', {
      'www-authenticate': 'Basic realm="gestion"',
    })
  }
}

function jsonResponse(
  data: unknown,
  status = 200,
  headers?: Record<string, string>
): Response {
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
  const requestId = crypto.randomUUID()
  const ctx: Ctx = { requestId }

  const respond = (res: Response): Response => withRequestIdHeader(res, requestId)

  try {
    log(ctx, 'handler_enter', {
      method: request.method,
      urlPath: new URL(request.url).pathname,
    })

    let base: string
    let key: string
    try {
      const e = getEnv(ctx)
      base = e.baseUrl
      key = e.key
    } catch (e) {
      log(ctx, 'env_error', { message: strErr(e) })
      if (e instanceof Error && e.message === 'MISSING_SUPABASE_ENV') {
        return respond(
          jsonResponse(
            {
              error:
                'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel (Environment Variables).',
            },
            500
          )
        )
      }
      return respond(jsonResponse({ error: strErr(e) }, 500))
    }

    if (request.method === 'GET') {
      try {
        await seedIfEmpty(ctx, base, key)
        const list = await listProducts(ctx, base, key)
        log(ctx, 'GET_ok', { productCount: list.length })
        return respond(jsonResponse(list, 200))
      } catch (e) {
        log(ctx, 'GET_fail', { message: strErr(e) })
        return respond(
          jsonResponse(
            {
              error:
                'Error de Supabase/PostgREST. Revisá: tabla public.products (SQL), clave service_role JWT (eyJ…), y que la URL sea https://xxx.supabase.co',
              details: strErr(e),
            },
            500
          )
        )
      }
    }

    try {
      requireAuth(ctx, request)
    } catch (e) {
      if (e instanceof AuthErr) {
        const h: Record<string, string> = {}
        if (e.extra) Object.assign(h, e.extra)
        log(ctx, 'auth_fail_response', { status: e.code })
        return respond(jsonResponse({ error: e.message }, e.code, h))
      }
      return respond(jsonResponse({ error: strErr(e) }, 500))
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      body = null
    }
    log(ctx, 'mutation_body', {
      hasBody: body != null ? 1 : 0,
    })

    if (request.method === 'POST') {
      const b = body as { product?: Product } | null
      if (!b?.product) return respond(jsonResponse({ error: 'Bad Request' }, 400))
      try {
        await upsert(ctx, base, key, productToRow(b.product))
        const list = await listProducts(ctx, base, key)
        log(ctx, 'POST_ok', { productCount: list.length })
        return respond(jsonResponse(list, 200))
      } catch (e) {
        log(ctx, 'POST_fail', { message: strErr(e) })
        return respond(jsonResponse({ error: strErr(e), details: strErr(e) }, 500))
      }
    }

    if (request.method === 'PUT') {
      const b = body as { product?: Product } | null
      if (!b?.product) return respond(jsonResponse({ error: 'Bad Request' }, 400))
      try {
        const ok = await existsId(ctx, base, key, b.product.id)
        if (!ok) return respond(jsonResponse({ error: 'Not Found' }, 404))
        await patchProduct(ctx, base, key, b.product.id, productToRow(b.product))
        const list = await listProducts(ctx, base, key)
        log(ctx, 'PUT_ok', { productCount: list.length })
        return respond(jsonResponse(list, 200))
      } catch (e) {
        log(ctx, 'PUT_fail', { message: strErr(e) })
        return respond(jsonResponse({ error: strErr(e) }, 500))
      }
    }

    if (request.method === 'DELETE') {
      const b = body as { id?: string } | null
      const id = b?.id
      if (!id) return respond(jsonResponse({ error: 'Bad Request' }, 400))
      try {
        await delProduct(ctx, base, key, id)
        const list = await listProducts(ctx, base, key)
        log(ctx, 'DELETE_ok', { productCount: list.length })
        return respond(jsonResponse(list, 200))
      } catch (e) {
        log(ctx, 'DELETE_fail', { message: strErr(e) })
        return respond(jsonResponse({ error: strErr(e) }, 500))
      }
    }

    log(ctx, 'method_not_allowed', {})
    return respond(new Response('Method Not Allowed', { status: 405 }))
  } catch (e) {
    log(ctx, 'handler_fatal', { message: strErr(e) })
    return respond(jsonResponse({ error: 'Error interno', details: strErr(e) }, 500))
  }
}
