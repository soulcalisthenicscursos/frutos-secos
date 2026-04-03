import type { Product } from '../types'

export type AdminAuth = { user: string; pass: string }

function authHeader(auth: AdminAuth): string {
  const token = btoa(`${auth.user}:${auth.pass}`)
  return `Basic ${token}`
}

export async function apiListProducts(): Promise<Product[]> {
  const res = await fetch('/api/products', { method: 'GET' })
  if (!res.ok) throw new Error('No se pudo cargar el catálogo')
  const data: unknown = await res.json()
  if (!Array.isArray(data)) return []
  return data as Product[]
}

export async function apiCreateProduct(auth: AdminAuth, product: Product): Promise<Product[]> {
  const res = await fetch('/api/products', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader(auth),
    },
    body: JSON.stringify({ product }),
  })
  if (res.status === 401) throw new Error('Usuario o contraseña incorrectos')
  if (!res.ok) throw new Error('No se pudo crear el producto')
  return (await res.json()) as Product[]
}

export async function apiUpdateProduct(auth: AdminAuth, product: Product): Promise<Product[]> {
  const res = await fetch('/api/products', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader(auth),
    },
    body: JSON.stringify({ product }),
  })
  if (res.status === 401) throw new Error('Usuario o contraseña incorrectos')
  if (!res.ok) throw new Error('No se pudo actualizar el producto')
  return (await res.json()) as Product[]
}

export async function apiDeleteProduct(auth: AdminAuth, id: string): Promise<Product[]> {
  const res = await fetch('/api/products', {
    method: 'DELETE',
    headers: {
      'content-type': 'application/json',
      authorization: authHeader(auth),
    },
    body: JSON.stringify({ id }),
  })
  if (res.status === 401) throw new Error('Usuario o contraseña incorrectos')
  if (!res.ok) throw new Error('No se pudo borrar el producto')
  return (await res.json()) as Product[]
}

