export function requireBasicAuth(req: Request): void {
  const user = process.env.ADMIN_USER ?? ''
  const pass = process.env.ADMIN_PASS ?? ''
  if (!user || !pass) {
    throw new Response('Faltan envs ADMIN_USER/ADMIN_PASS', { status: 500 })
  }

  const h = req.headers.get('authorization') || ''
  const [scheme, token] = h.split(' ')
  if (scheme !== 'Basic' || !token) {
    throw new Response('Unauthorized', {
      status: 401,
      headers: { 'www-authenticate': 'Basic realm="gestion"' },
    })
  }

  let decoded = ''
  try {
    decoded = Buffer.from(token, 'base64').toString('utf8')
  } catch {
    throw new Response('Unauthorized', { status: 401 })
  }
  const [u, p] = decoded.split(':')
  if (u !== user || p !== pass) {
    throw new Response('Unauthorized', { status: 401 })
  }
}

