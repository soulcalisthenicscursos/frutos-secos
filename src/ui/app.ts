import type { Product } from '../types'
import type { AdminAuth } from '../api/products'
import {
  apiCreateProduct,
  apiDeleteProduct,
  apiListProducts,
  apiUpdateProduct,
} from '../api/products'
import { getRouteFromLocation, navigate, type Route } from '../router'

let products: Product[] = []
let selectedId: string | null = null

const accentClasses = ['accent-a', 'accent-b', 'accent-c', 'accent-d']

function formatPrice(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;')
}

function cardAccent(index: number): string {
  return accentClasses[index % accentClasses.length]
}

function renderCatalogPage(root: HTMLElement): void {
  root.innerHTML = `
    <header class="site-header">
      <div class="header-inner">
        <h1 class="logo">Frutos secos</h1>
        <p class="tagline">Catálogo · frutos secos y más</p>
      </div>
    </header>
    <main class="main">
      <div id="catalog-grid" class="catalog-grid" aria-live="polite"></div>
    </main>

    <div id="product-modal" class="modal" hidden aria-hidden="true" role="dialog" aria-labelledby="product-title">
      <div class="modal-backdrop" data-close></div>
      <div class="modal-panel modal-panel-wide">
        <div class="modal-head">
          <h2 id="product-title">Producto</h2>
          <button type="button" class="btn btn-icon" id="close-product" aria-label="Cerrar">×</button>
        </div>
        <div class="modal-body" id="product-body"></div>
      </div>
    </div>
  `

  const grid = root.querySelector<HTMLElement>('#catalog-grid')!
  if (!products.length) {
    grid.innerHTML = '<p class="empty-msg">No hay productos cargados.</p>'
  } else {
    grid.innerHTML = products
      .map(
        (p, i) => `
      <article class="card ${cardAccent(i)}" data-id="${escapeAttr(p.id)}" tabindex="0" role="button" aria-label="Ver ${escapeAttr(p.name)}">
        <div class="card-image-wrap">
          <img src="${escapeAttr(p.imageUrl)}" alt="" loading="lazy" width="400" height="280" />
        </div>
        <div class="card-body">
          <span class="card-cat">${escapeHtml(p.category)}</span>
          <h3>${escapeHtml(p.name)}</h3>
          <p class="card-desc">${escapeHtml(p.description)}</p>
          <p class="card-price">${formatPrice(p.price)}</p>
        </div>
      </article>
    `
      )
      .join('')
  }

  const modal = root.querySelector<HTMLElement>('#product-modal')!
  const body = root.querySelector<HTMLElement>('#product-body')!

  function openModal(): void {
    modal.hidden = false
    modal.setAttribute('aria-hidden', 'false')
    document.body.style.overflow = 'hidden'
  }

  function closeModal(): void {
    modal.hidden = true
    modal.setAttribute('aria-hidden', 'true')
    document.body.style.overflow = ''
    selectedId = null
  }

  function renderSelected(): void {
    const p = products.find((x) => x.id === selectedId)
    if (!p) return
    root.querySelector('#product-title')!.textContent = p.name
    body.innerHTML = `
      <div class="product-detail">
        <div class="product-detail-img">
          <img src="${escapeAttr(p.imageUrl)}" alt="" loading="lazy" width="900" height="600" />
        </div>
        <div class="product-detail-info">
          <p class="product-detail-cat">${escapeHtml(p.category)}</p>
          <p class="product-detail-price">${formatPrice(p.price)}</p>
          <p class="product-detail-desc">${escapeHtml(p.description)}</p>
        </div>
      </div>
    `
  }

  grid.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')
    const id = el?.dataset.id
    if (!id) return
    selectedId = id
    renderSelected()
    openModal()
  })

  grid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')
    const id = el?.dataset.id
    if (!id) return
    e.preventDefault()
    selectedId = id
    renderSelected()
    openModal()
  })

  root.querySelector('#close-product')?.addEventListener('click', closeModal)
  modal.querySelector('[data-close]')?.addEventListener('click', closeModal)
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal()
  })
}

function renderGestionPage(root: HTMLElement): void {
  root.innerHTML = `
    <header class="site-header">
      <div class="header-inner">
        <h1 class="logo">Gestión</h1>
        <p class="tagline">Acceso simple para editar el catálogo</p>
        <a class="btn btn-ghost" href="/" data-link>Volver al catálogo</a>
      </div>
    </header>
    <main class="main main-narrow">
      <section class="panel" id="auth-panel">
        <h2 class="panel-title">Ingresar</h2>
        <form id="login-form" class="product-form">
          <label>Usuario <input name="user" type="text" autocomplete="username" required /></label>
          <label>Contraseña <input name="pass" type="password" autocomplete="current-password" required /></label>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Entrar</button>
          </div>
          <p class="hint">Esto protege la edición vía API. No es seguridad “bancaria”.</p>
        </form>
      </section>

      <section class="panel" id="admin-panel" hidden>
        <h2 class="panel-title">Productos</h2>
        <ul id="admin-list" class="admin-list"></ul>
        <div class="admin-toolbar" id="admin-form-toolbar">
          <button type="button" class="btn btn-primary" id="btn-new-product">Crear producto</button>
        </div>
        <div id="product-form-section" hidden>
          <h3 id="form-title" class="form-section-title">Nuevo producto</h3>
          <form id="product-form" class="product-form">
            <label>Nombre <input name="name" type="text" required autocomplete="off" /></label>
            <label>Precio (ARS) <input name="price" type="number" min="0" step="1" required /></label>
            <label>Categoría <input name="category" type="text" placeholder="Ej. Almendras" /></label>
            <label>URL de imagen <input name="imageUrl" type="text" required placeholder="https://..." inputmode="url" /></label>
            <label>Descripción <textarea name="description" rows="4"></textarea></label>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary" id="submit-product">Guardar</button>
              <button type="button" class="btn btn-ghost" id="cancel-form">Cancelar</button>
            </div>
          </form>
        </div>
      </section>
    </main>
  `

  const loginForm = root.querySelector<HTMLFormElement>('#login-form')!
  const authPanel = root.querySelector<HTMLElement>('#auth-panel')!
  const adminPanel = root.querySelector<HTMLElement>('#admin-panel')!
  const adminList = root.querySelector<HTMLElement>('#admin-list')!
  const formSection = root.querySelector<HTMLElement>('#product-form-section')!
  const formToolbar = root.querySelector<HTMLElement>('#admin-form-toolbar')!
  const btnNewProduct = root.querySelector<HTMLButtonElement>('#btn-new-product')!
  const form = root.querySelector<HTMLFormElement>('#product-form')!
  const cancelForm = root.querySelector<HTMLButtonElement>('#cancel-form')!

  let auth: AdminAuth | null = null
  let editingId: string | null = null

  function setFormOpen(open: boolean): void {
    formSection.hidden = !open
    formToolbar.hidden = open
  }

  function openProductFormNew(): void {
    editingId = null
    form.reset()
    fillForm(null)
    root.querySelector('#form-title')!.textContent = 'Nuevo producto'
    setFormOpen(true)
  }

  function openProductFormEdit(p: Product): void {
    editingId = p.id
    fillForm(p)
    root.querySelector('#form-title')!.textContent = 'Editar producto'
    setFormOpen(true)
  }

  function closeProductForm(): void {
    editingId = null
    form.reset()
    fillForm(null)
    root.querySelector('#form-title')!.textContent = 'Nuevo producto'
    setFormOpen(false)
  }

  function renderAdminList(): void {
    if (!products.length) {
      adminList.innerHTML = '<p class="admin-empty">Sin productos.</p>'
      return
    }
    adminList.innerHTML = products
      .map(
        (p) => `
      <li class="admin-row" data-id="${escapeAttr(p.id)}">
        <span class="admin-row-name">${escapeHtml(p.name)}</span>
        <span class="admin-row-price">${formatPrice(p.price)}</span>
        <div class="admin-row-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-action="edit" data-id="${escapeAttr(p.id)}">Editar</button>
          <button type="button" class="btn btn-danger btn-sm" data-action="delete" data-id="${escapeAttr(p.id)}">Borrar</button>
        </div>
      </li>
    `
      )
      .join('')
  }

  function fillForm(p: Product | null): void {
    ;(form.elements.namedItem('name') as HTMLInputElement).value = p?.name ?? ''
    ;(form.elements.namedItem('price') as HTMLInputElement).value =
      p != null ? String(p.price) : ''
    ;(form.elements.namedItem('description') as HTMLTextAreaElement).value =
      p?.description ?? ''
    ;(form.elements.namedItem('imageUrl') as HTMLInputElement).value =
      p?.imageUrl ?? ''
    ;(form.elements.namedItem('category') as HTMLInputElement).value =
      p?.category ?? ''
  }

  function readForm(): Omit<Product, 'id'> {
    const name = (form.elements.namedItem('name') as HTMLInputElement).value.trim()
    const priceRaw = (form.elements.namedItem('price') as HTMLInputElement).value
    const price = Number(priceRaw.replace(',', '.'))
    const description = (
      form.elements.namedItem('description') as HTMLTextAreaElement
    ).value.trim()
    const imageUrl = (form.elements.namedItem('imageUrl') as HTMLInputElement).value.trim()
    const category =
      (form.elements.namedItem('category') as HTMLInputElement).value.trim() ||
      'General'
    return { name, price, description, imageUrl, category }
  }

  function validate(data: Omit<Product, 'id'>): string | null {
    if (!data.name) return 'El nombre es obligatorio.'
    if (!Number.isFinite(data.price) || data.price < 0) return 'Precio inválido.'
    if (!data.imageUrl) return 'La URL de imagen es obligatoria.'
    return null
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const user = (loginForm.elements.namedItem('user') as HTMLInputElement).value.trim()
    const pass = (loginForm.elements.namedItem('pass') as HTMLInputElement).value
    auth = { user, pass }
    console.info(
      '[catalog-ui] login_submit: primero GET /api/products (Supabase); usuario/pass solo para guardar'
    )
    try {
      products = await apiListProducts()
      authPanel.hidden = true
      adminPanel.hidden = false
      renderAdminList()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo cargar el catálogo')
      auth = null
    }
  })

  adminList.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement
    const action = t.dataset.action
    const id = t.dataset.id
    if (!action || !id) return
    if (!auth) return

    if (action === 'delete') {
      if (!confirm('¿Borrar este producto?')) return
      try {
        products = await apiDeleteProduct(auth, id)
        if (editingId === id) closeProductForm()
        renderAdminList()
      } catch (err) {
        alert(err instanceof Error ? err.message : 'No se pudo borrar')
      }
      return
    }

    if (action === 'edit') {
      const p = products.find((x) => x.id === id)
      if (!p) return
      openProductFormEdit(p)
    }
  })

  btnNewProduct.addEventListener('click', () => openProductFormNew())

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!auth) return
    const data = readForm()
    const err = validate(data)
    if (err) return alert(err)
    try {
      const id = editingId ?? crypto.randomUUID()
      const next: Product = { ...data, id }
      products = editingId
        ? await apiUpdateProduct(auth, next)
        : await apiCreateProduct(auth, next)
      closeProductForm()
      renderAdminList()
    } catch (err2) {
      alert(err2 instanceof Error ? err2.message : 'No se pudo guardar')
    }
  })

  cancelForm.addEventListener('click', () => closeProductForm())
}

function wireSpaLinks(root: HTMLElement): void {
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-link]')
    if (!a) return
    const href = a.getAttribute('href')
    if (!href) return
    e.preventDefault()
    if (href === '/gestion') navigate('/gestion')
    else navigate('/')
  })
}

async function renderRoute(root: HTMLElement, route: Route): Promise<void> {
  if (!products.length) {
    try {
      products = await apiListProducts()
    } catch {
      products = []
    }
  }
  if (route === '/gestion') renderGestionPage(root)
  else renderCatalogPage(root)
  wireSpaLinks(root)
}

export async function mountApp(root: HTMLElement): Promise<void> {
  await renderRoute(root, getRouteFromLocation())
  window.addEventListener('popstate', () => {
    void renderRoute(root, getRouteFromLocation())
  })
}
