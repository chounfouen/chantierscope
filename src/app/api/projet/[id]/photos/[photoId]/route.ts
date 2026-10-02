/**
 * Confirmation d'une photo deposee : verification des fichiers dans le
 * magasin, puis enregistrement en base.
 *
 * La taille est relue dans le magasin plutot que crue sur parole : c'est le
 * fichier reellement depose qui fait foi, et une photo dont le depot a
 * echoue ne laisse pas de ligne orpheline en base.
 */

import { db } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import { enregistrerPhoto } from '@/db/mutations/photo'
import { exiger, NonAuthentifie, NonAutorise, PEUT_SAISIR } from '@/lib/garde'
import { ConfirmationPhoto } from '@/lib/photo'
import { cheminPhoto, stockage } from '@/services/stockage'

export const dynamic = 'force-dynamic'

export async function PUT(
  requete: Request,
  ctx: { params: Promise<{ id: string; photoId: string }> },
) {
  const { id: projetId, photoId } = await ctx.params
  let auteurId: string
  try {
    auteurId = (await exiger(projetId, PEUT_SAISIR)).id
  } catch (e) {
    if (e instanceof NonAuthentifie)
      return Response.json({ message: 'Session expirée.' }, { status: 401 })
    if (e instanceof NonAutorise)
      return Response.json({ message: 'Accès refusé.' }, { status: 403 })
    throw e
  }
  if (!/^[0-9a-f-]{36}$/i.test(photoId))
    return Response.json({ message: 'Photo invalide.' }, { status: 400 })

  const corps = ConfirmationPhoto.safeParse(await requete.json().catch(() => null))
  if (!corps.success) return Response.json({ message: 'Photo invalide.' }, { status: 400 })

  const chemin = cheminPhoto(projetId, photoId, 'image')
  const cheminVignette = cheminPhoto(projetId, photoId, 'vignette')
  const s = stockage()
  const [octets, octetsVignette] = await Promise.all([s.taille(chemin), s.taille(cheminVignette)])
  if (octets === null || octetsVignette === null) {
    return Response.json({ message: 'Fichier de la photo absent du magasin.' }, { status: 409 })
  }

  try {
    const r = await enregistrerPhoto(
      db(),
      projetId,
      { id: photoId, chemin, cheminVignette, octets, ...corps.data },
      auteurId,
    )
    return Response.json({ ok: true, creee: r.creee })
  } catch (e) {
    if (e instanceof RefusMetier) return Response.json({ message: e.message }, { status: 409 })
    throw e
  }
}
