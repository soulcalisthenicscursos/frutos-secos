export const config = { runtime: 'edge' }

export default function handler(_req: Request): Response {
  return Response.json({ ok: true, ts: new Date().toISOString() })
}
