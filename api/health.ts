import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { runtime: 'nodejs20.x' as const }

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.status(200).json({ ok: true, ts: new Date().toISOString() })
}
