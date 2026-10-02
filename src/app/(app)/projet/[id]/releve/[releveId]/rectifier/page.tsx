import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { SaisieRectification } from '@/components/saisie/saisie'
import { db } from '@/db/index'
import { chargerReferentielSaisie, chargerReleve, versSaisie } from '@/db/queries/saisie'
import { aujourdhui, dateLongue } from '@/lib/format'
import { actionsSurReleve, exigerPage, PEUT_VALIDER } from '@/lib/garde'
import { etatDepuisReleve, nouvelIdentifiant } from '@/lib/releve-formulaire'

export const metadata: Metadata = { title: 'Rectifier un relevé' }

export default async function RectifierReleve({
  params,
}: {
  params: Promise<{ id: string; releveId: string }>
}) {
  const { id, releveId } = await params
  const utilisateur = await exigerPage(id, PEUT_VALIDER)

  const base = db()
  const r = /^[0-9a-f-]{36}$/i.test(releveId) ? await chargerReleve(base, releveId) : null
  if (!r || r.projetId !== id) notFound()
  if (!actionsSurReleve(r.statut, utilisateur.role).includes('rectifier')) {
    redirect(`/projet/${id}/releve/${releveId}`)
  }

  // Le releve rectifie sort du cumul : ses quantites ne doivent pas compter
  // contre celles du rectificatif dans l'alerte de depassement. Le cumul
  // valide les inclut ; on les retire ligne par ligne.
  const referentiel = await chargerReferentielSaisie(base, id)
  const anciennes = new Map(r.quantites.map((q) => [q.ligneId, q.quantite]))
  for (const t of referentiel.taches) {
    for (const l of t.lignes) l.cumulValide -= anciennes.get(l.id) ?? 0
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <FilAriane
        maillons={[
          { libelle: 'Journal', href: `/projet/${id}/releve` },
          {
            libelle: `${r.lot.code} — ${dateLongue(r.date)}`,
            href: `/projet/${id}/releve/${r.id}`,
          },
          { libelle: 'Rectifier' },
        ]}
      />
      <p className="border-border bg-muted/40 mt-4 rounded-lg border p-3 text-sm">
        Le relevé validé sera conservé tel quel comme trace. Le rectificatif le remplace dans les
        indicateurs dès son enregistrement.
      </p>
      <div className="mt-4">
        <SaisieRectification
          ancienId={r.id}
          referentiel={referentiel}
          aujourdhui={aujourdhui()}
          initial={etatDepuisReleve(nouvelIdentifiant(), versSaisie(r))}
        />
      </div>
    </div>
  )
}
