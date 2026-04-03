/** Tipos solo para `/api` (sin importar desde `src/`, evita fallos de bundle en Vercel). */
export interface Product {
  id: string
  name: string
  price: number
  description: string
  imageUrl: string
  category: string
}
