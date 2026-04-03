import type { Product } from './types'

export const SEED_PRODUCTS: Product[] = [
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
