import type { Metadata } from 'next'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { SaisieDirecte } from '@/components/saisie/saisie'
import { db } from '@/db/index'
import { chargerReferentielSaisie } from '@/db/queries/saisie'
import { aujourdhui } from '@/lib/format'
import { exigerPage, PEUT_SAISIR } from '@/lib/garde'
import { DateSimple } from '@/lib/releve'
import { etatVierge } from '@/lib/releve-formulaire'

export const metadata: Metadata = { title: 'Nouveau relevé' }

export default async function NouveauReleve({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const utilisateur = await exigerPage(id, PEUT_SAISIR)
  const recherche = await searchParams

  const referentiel = await chargerReferentielSaisie(db(), id)
  const jour = aujourdhui()
  const dateDemandee = typeof recherche['date'] === 'string' ? recherche['date'] : ''
  const date =
    DateSimple.safeParse(dateDemandee).success && dateDemandee <= jour ? dateDemandee : jour
  const lotDemande = typeof recherche['lot'] === 'string' ? recherche['lot'] : ''
  const lot = referentiel.lots.find((l) => l.id === lotDemande) ?? referentiel.lots[0]

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <FilAriane
        maillons={[
          { libelle: referentiel.projet.code, href: `/projet/${id}` },
          { libelle: 'Journal', href: `/projet/${id}/releve` },
          { libelle: 'Nouveau relevé' },
        ]}
      />
      <div className="mt-4">
        <SaisieDirecte
          utilisateurId={utilisateur.id}
          mode="creation"
          referentiel={referentiel}
          aujourdhui={jour}
          // L'identifiant est attribue par le formulaire, dans le navigateur.
          initial={etatVierge('', date, lot?.id ?? '')}
        />
      </div>
    </div>
  )
}
