import type { VercelRequest } from '@vercel/node'

export class AuthError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extraHeaders?: Record<string, string>
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

export function requireBasicAuth(req: VercelRequest): void {
  const user = process.env.ADMIN_USER ?? ''
  const pass = process.env.ADMIN_PASS ?? ''
  if (!user || !pass) {
    throw new AuthError(500, 'Faltan variables ADMIN_USER y ADMIN_PASS en Vercel')
  }

  const h = req.headers.authorization ?? ''
  const [scheme, token] = h.split(' ')
  if (scheme !== 'Basic' || !token) {
    throw new AuthError(401, 'Unauthorized', {
      'www-authenticate': 'Basic realm="gestion"',
    })
  }

  let decoded = ''
  try {
    decoded = Buffer.from(token, 'base64').toString('utf8')
  } catch {
    throw new AuthError(401, 'Unauthorized', {
      'www-authenticate': 'Basic realm="gestion"',
    })
  }
  const [u, p] = decoded.split(':')
  if (u !== user || p !== pass) {
    throw new AuthError(401, 'Unauthorized', {
      'www-authenticate': 'Basic realm="gestion"',
    })
  }
}
