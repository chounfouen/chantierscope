/**
 * Depot d'un fichier dans le magasin local, par URL signee.
 *
 * Pendant de l'URL de depot de Supabase pour le developpement : aucune
 * session n'est exigee, c'est la signature, emise par le serveur apres la
 * garde, qui autorise ce depot-la et lui seul, pendant quinze minutes.
 */

import { env } from '@/lib/env'
import { ecrireLocal, signatureValide } from '@/services/stockage'

export const dynamic = 'force-dynamic'

/** Une photo compressee pese environ 120 Ko ; au-dela de 3 Mo, ce n'en est pas une. */
const TAILLE_MAX = 3 * 1024 * 1024

export async function PUT(requete: Request) {
  const q = new URL(requete.url).searchParams
  const chemin = q.get('chemin') ?? ''
  const ok = signatureValide(
    env().AUTH_SECRET,
    'depot',
    chemin,
    Number(q.get('exp')),
    q.get('sig') ?? '',
  )
  if (!ok) return new Response('Signature invalide ou echue.', { status: 403 })
  if (requete.headers.get('content-type') !== 'image/webp') {
    return new Response('Seules les images WebP sont acceptees.', { status: 415 })
  }
  const contenu = new Uint8Array(await requete.arrayBuffer())
  if (contenu.byteLength === 0 || contenu.byteLength > TAILLE_MAX) {
    return new Response('Taille de fichier hors limites.', { status: 413 })
  }
  await ecrireLocal(chemin, contenu)
  return new Response(null, { status: 200 })
}
