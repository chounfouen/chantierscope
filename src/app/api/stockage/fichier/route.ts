/** Lecture d'un fichier du magasin local, par URL signee. */

import { env } from '@/lib/env'
import { lireLocal, signatureValide } from '@/services/stockage'

export const dynamic = 'force-dynamic'

export async function GET(requete: Request) {
  const q = new URL(requete.url).searchParams
  const chemin = q.get('chemin') ?? ''
  const ok = signatureValide(
    env().AUTH_SECRET,
    'lecture',
    chemin,
    Number(q.get('exp')),
    q.get('sig') ?? '',
  )
  if (!ok) return new Response(null, { status: 403 })
  const contenu = await lireLocal(chemin)
  if (!contenu) return new Response(null, { status: 404 })
  return new Response(new Uint8Array(contenu), {
    headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=3600' },
  })
}
