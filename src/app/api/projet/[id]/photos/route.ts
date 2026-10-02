/**
 * Preparation du depot d'une photo : deux URL signees, image et vignette.
 *
 * Le chemin est compose ici, a partir du projet et de l'identifiant de la
 * photo ; le navigateur ne choisit jamais ou il ecrit.
 */

import { db } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import { verifierRelevePhoto } from '@/db/mutations/photo'
import { exiger, NonAuthentifie, NonAutorise, PEUT_SAISIR } from '@/lib/garde'
import { PreparationPhoto } from '@/lib/photo'
import { cheminPhoto, stockage } from '@/services/stockage'

export const dynamic = 'force-dynamic'

export async function POST(requete: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projetId } = await ctx.params
  try {
    await exiger(projetId, PEUT_SAISIR)
  } catch (e) {
    if (e instanceof NonAuthentifie)
      return Response.json({ message: 'Session expirée.' }, { status: 401 })
    if (e instanceof NonAutorise)
      return Response.json({ message: 'Accès refusé.' }, { status: 403 })
    throw e
  }

  const corps = PreparationPhoto.safeParse(await requete.json().catch(() => null))
  if (!corps.success) return Response.json({ message: 'Demande invalide.' }, { status: 400 })

  try {
    await verifierRelevePhoto(db(), projetId, corps.data.releveId)
  } catch (e) {
    if (e instanceof RefusMetier) return Response.json({ message: e.message }, { status: 409 })
    throw e
  }

  const s = stockage()
  const [image, vignette] = await Promise.all([
    s.urlDepot(cheminPhoto(projetId, corps.data.photoId, 'image'), 'image/webp'),
    s.urlDepot(cheminPhoto(projetId, corps.data.photoId, 'vignette'), 'image/webp'),
  ])
  return Response.json({ image, vignette })
}
