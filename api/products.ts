import type { Product } from '../src/types'
import { requireBasicAuth } from './_auth'
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

async function listProducts(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as ProductRow[] | null)?.map(rowToProduct) ?? []
}

async function seedIfEmpty(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<void> {
  const { count, error: countError } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
  if (countError) throw countError
  if ((count ?? 0) > 0) return
  const rows = SEED_PRODUCTS.map((p) => productToRow(p))
  const { error } = await supabase.from('products').insert(rows)
  if (error) throw error
}

export default async function handler(req: Request): Promise<Response> {
  const supabase = getSupabaseAdmin()

  if (req.method === 'GET') {
    try {
      await seedIfEmpty(supabase)
    } catch (e) {
      console.error(e)
      return new Response(
        JSON.stringify({
          error:
            'No se pudo leer la base. ¿Creaste la tabla products y las variables de entorno?',
        }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      )
    }
    try {
      const list = await listProducts(supabase)
      return Response.json(list)
    } catch (e) {
      console.error(e)
      return new Response(JSON.stringify({ error: 'Error al listar productos' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    }
  }

  try {
    requireBasicAuth(req)
  } catch (res) {
    if (res instanceof Response) return res
    return new Response('Unauthorized', { status: 401 })
  }

  if (req.method === 'POST') {
    const body = (await req.json().catch(() => null)) as { product?: Product } | null
    if (!body?.product) return new Response('Bad Request', { status: 400 })
    const { error } = await supabase
      .from('products')
      .upsert(productToRow(body.product), { onConflict: 'id' })
    if (error) {
      console.error(error)
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }
    const list = await listProducts(supabase)
    return Response.json(list)
  }

  if (req.method === 'PUT') {
    const body = (await req.json().catch(() => null)) as { product?: Product } | null
    if (!body?.product) return new Response('Bad Request', { status: 400 })
    const { data: existing, error: exErr } = await supabase
      .from('products')
      .select('id')
      .eq('id', body.product.id)
      .maybeSingle()
    if (exErr) {
      console.error(exErr)
      return new Response(JSON.stringify({ error: exErr.message }), { status: 500 })
    }
    if (!existing) return new Response('Not Found', { status: 404 })
    const { error } = await supabase
      .from('products')
      .update(productToRow(body.product))
      .eq('id', body.product.id)
    if (error) {
      console.error(error)
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }
    const list = await listProducts(supabase)
    return Response.json(list)
  }

  if (req.method === 'DELETE') {
    const body = (await req.json().catch(() => null)) as { id?: string } | null
    const id = body?.id
    if (!id) return new Response('Bad Request', { status: 400 })
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) {
      console.error(error)
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }
    const list = await listProducts(supabase)
    return Response.json(list)
  }

  return new Response('Method Not Allowed', { status: 405 })
}
