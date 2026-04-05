import type { Product } from '../types'

const UI_TAG = '[catalog-ui]'

function uiLog(step: string, data?: Record<string, unknown>): void {
  const line = { tag: UI_TAG, step, ts: new Date().toISOString(), ...data }
  console.info(JSON.stringify(line))
}

export type AdminAuth = { user: string; pass: string }

function authHeader(auth: AdminAuth): string {
  const token = btoa(`${auth.user}:${auth.pass}`)
  return `Basic ${token}`
}

async function readErrorMessage(res: Response): Promise<string> {
  const requestId = res.headers.get('x-catalog-request-id') ?? ''
  const ct = res.headers.get('content-type') ?? ''
  uiLog('api_error_response', {
    status: res.status,
    requestId,
    contentType: ct,
  })
  const text = await res.text()
  uiLog('api_error_body_raw', {
    length: text.length,
    preview: text.slice(0, 400),
  })
  try {
    const j: unknown = JSON.parse(text)
    if (j && typeof j === 'object') {
      const o = j as Record<string, unknown>
      const d = o.details
      const e = o.error
      uiLog('api_error_body_json', {
        error: typeof e === 'string' ? e.slice(0, 300) : e,
        details: typeof d === 'string' ? d.slice(0, 300) : d,
      })
      if (typeof d === 'string' && d) return d
      if (typeof e === 'string' && e) return e
    }
  } catch {
    uiLog('api_error_body_not_json', {})
  }
  return 'No se pudo cargar el catálogo'
}

export async function apiListProducts(): Promise<Product[]> {
  uiLog('apiListProducts_start', { path: '/api/products', method: 'GET' })
  const res = await fetch('/api/products', { method: 'GET' })
  const requestId = res.headers.get('x-catalog-request-id') ?? ''
  uiLog('apiListProducts_response', {
    status: res.status,
    ok: res.ok,
    requestId,
  })
  if (!res.ok) throw new Error(await readErrorMessage(res))
  const data: unknown = await res.json()
  const n = Array.isArray(data) ? data.length : -1
  uiLog('apiListProducts_ok', { rowCount: n })
  if (!Array.isArray(data)) return []
  return data as Product[]
}

export async function apiCreateProduct(auth: AdminAuth, product: Product): Promise<Product[]> {
  uiLog('apiCreateProduct_start', { id: product.id })
  const res = await fetch('/api/products', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader(auth),
    },
    body: JSON.stringify({ product }),
  })
  uiLog('apiCreateProduct_response', {
    status: res.status,
    requestId: res.headers.get('x-catalog-request-id') ?? '',
  })
  if (res.status === 401) throw new Error('Usuario o contraseña incorrectos')
  if (!res.ok) throw new Error(await readErrorMessage(res))
  return (await res.json()) as Product[]
}

export async function apiUpdateProduct(auth: AdminAuth, product: Product): Promise<Product[]> {
  uiLog('apiUpdateProduct_start', { id: product.id })
  const res = await fetch('/api/products', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader(auth),
    },
    body: JSON.stringify({ product }),
  })
  uiLog('apiUpdateProduct_response', {
    status: res.status,
    requestId: res.headers.get('x-catalog-request-id') ?? '',
  })
  if (res.status === 401) throw new Error('Usuario o contraseña incorrectos')
  if (!res.ok) throw new Error(await readErrorMessage(res))
  return (await res.json()) as Product[]
}

export async function apiDeleteProduct(auth: AdminAuth, id: string): Promise<Product[]> {
  uiLog('apiDeleteProduct_start', { id })
  const res = await fetch('/api/products', {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader(auth),
    },
    body: JSON.stringify({ id }),
  })
  uiLog('apiDeleteProduct_response', {
    status: res.status,
    requestId: res.headers.get('x-catalog-request-id') ?? '',
  })
  if (res.status === 401) throw new Error('Usuario o contraseña incorrectos')
  if (!res.ok) throw new Error(await readErrorMessage(res))
  return (await res.json()) as Product[]
}
