/**
 * Rapport hebdomadaire en PDF, genere a la demande.
 *
 * Rien n'est stocke : le rapport est un calcul sur les instantanes et les
 * releves valides, refait a chaque telechargement. Le maitre d'ouvrage
 * recoit la meme semaine sans les donnees de cout ni les effectifs.
 */

import { db } from '@/db/index'
import { exiger, NonAuthentifie, NonAutorise, voitDonneesInternes } from '@/lib/garde'
import { DateSimple } from '@/lib/releve'
import { assemblerRapport, PeriodeHorsSituation } from '@/services/rapport/contenu'
import { genererPdf } from '@/services/rapport/document'

export const dynamic = 'force-dynamic'

export async function GET(requete: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projetId } = await ctx.params
  let interne: boolean
  try {
    const u = await exiger(projetId)
    interne = voitDonneesInternes(u.role)
  } catch (e) {
    if (e instanceof NonAuthentifie) return new Response(null, { status: 401 })
    if (e instanceof NonAutorise) return new Response(null, { status: 403 })
    throw e
  }

  const brut = new URL(requete.url).searchParams.get('fin')
  const fin = brut === null || brut === '' ? undefined : DateSimple.safeParse(brut)
  if (fin !== undefined && !fin.success) {
    return Response.json({ erreur: 'Date de fin invalide.' }, { status: 400 })
  }

  try {
    const contenu = await assemblerRapport(db(), projetId, interne, fin?.data)
    if (contenu === null) {
      return Response.json(
        { erreur: 'Aucune situation calculée pour ce chantier.' },
        { status: 404 },
      )
    }
    const pdf = await genererPdf(contenu)
    const nom = `rapport-${contenu.projet.code}-${contenu.periode.fin}.pdf`
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nom}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e) {
    if (e instanceof PeriodeHorsSituation)
      return Response.json({ erreur: e.message }, { status: 400 })
    throw e
  }
}
