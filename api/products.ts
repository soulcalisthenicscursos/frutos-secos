import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Product } from './types'
import { AuthError, requireBasicAuth } from './_auth'
import { SEED_PRODUCTS } from './_seed'
import {
  getSupabaseEnv,
  productToRow,
  restDeleteProduct,
  restGetProductId,
  restHasAnyProduct,
  restInsertProducts,
  restListProducts,
  restUpdateProduct,
  restUpsertProduct,
} from './supabaseRest'

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

async function seedIfEmpty(baseUrl: string, key: string): Promise<void> {
  const has = await restHasAnyProduct(baseUrl, key)
  if (has) return
  const rows = SEED_PRODUCTS.map((p) => productToRow(p))
  await restInsertProducts(baseUrl, key, rows)
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
  let baseUrl: string
  let key: string
  try {
    ;({ baseUrl, key } = getSupabaseEnv())
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
      await seedIfEmpty(baseUrl, key)
      const list = await restListProducts(baseUrl, key)
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
    try {
      await restUpsertProduct(baseUrl, key, productToRow(body.product))
      const list = await restListProducts(baseUrl, key)
      sendJson(res, 200, list)
    } catch (e) {
      console.error(e)
      sendJson(res, 500, {
        error: stringifySupabaseError(e),
        details: stringifySupabaseError(e),
      })
    }
    return
  }

  if (req.method === 'PUT') {
    const body = parseJsonBody(req) as { product?: Product } | null
    if (!body?.product) {
      sendJson(res, 400, { error: 'Bad Request' })
      return
    }
    try {
      const exists = await restGetProductId(baseUrl, key, body.product.id)
      if (!exists) {
        sendJson(res, 404, { error: 'Not Found' })
        return
      }
      await restUpdateProduct(baseUrl, key, body.product.id, productToRow(body.product))
      const list = await restListProducts(baseUrl, key)
      sendJson(res, 200, list)
    } catch (e) {
      console.error(e)
      sendJson(res, 500, { error: stringifySupabaseError(e) })
    }
    return
  }

  if (req.method === 'DELETE') {
    const body = parseJsonBody(req) as { id?: string } | null
    const id = body?.id
    if (!id) {
      sendJson(res, 400, { error: 'Bad Request' })
      return
    }
    try {
      await restDeleteProduct(baseUrl, key, id)
      const list = await restListProducts(baseUrl, key)
      sendJson(res, 200, list)
    } catch (e) {
      console.error(e)
      sendJson(res, 500, { error: stringifySupabaseError(e) })
    }
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
