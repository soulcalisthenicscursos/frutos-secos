export type Route = '/' | '/gestion'

export function getRouteFromLocation(): Route {
  const p = window.location.pathname.replace(/\/+$/, '') || '/'
  if (p === '/gestion') return '/gestion'
  return '/'
}

export function navigate(to: Route): void {
  if (getRouteFromLocation() === to) return
  window.history.pushState({}, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

