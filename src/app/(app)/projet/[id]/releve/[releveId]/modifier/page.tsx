import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { SaisieDirecte } from '@/components/saisie/saisie'
import { db } from '@/db/index'
import { chargerReferentielSaisie, chargerReleve, versSaisie } from '@/db/queries/saisie'
import { aujourdhui, dateLongue } from '@/lib/format'
import { actionsSurReleve, exigerPage, PEUT_SAISIR } from '@/lib/garde'
import { etatDepuisReleve } from '@/lib/releve-formulaire'

export const metadata: Metadata = { title: 'Modifier un relevé' }

export default async function ModifierReleve({
  params,
}: {
  params: Promise<{ id: string; releveId: string }>
}) {
  const { id, releveId } = await params
  const utilisateur = await exigerPage(id, PEUT_SAISIR)

  const base = db()
  const r = /^[0-9a-f-]{36}$/i.test(releveId) ? await chargerReleve(base, releveId) : null
  if (!r || r.projetId !== id) notFound()
  // Un releve valide ne se modifie pas : il se rectifie.
  if (!actionsSurReleve(r.statut, utilisateur.role).includes('modifier')) {
    redirect(`/projet/${id}/releve/${releveId}`)
  }

  const referentiel = await chargerReferentielSaisie(base, id, releveId)

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <FilAriane
        maillons={[
          { libelle: 'Journal', href: `/projet/${id}/releve` },
          {
            libelle: `${r.lot.code} — ${dateLongue(r.date)}`,
            href: `/projet/${id}/releve/${r.id}`,
          },
          { libelle: 'Modifier' },
        ]}
      />
      <div className="mt-4">
        <SaisieDirecte
          mode="modification"
          referentiel={referentiel}
          aujourdhui={aujourdhui()}
          initial={etatDepuisReleve(r.id, versSaisie(r))}
        />
      </div>
    </div>
  )
}
