import type { Metadata } from 'next'
import { TitrePage } from '@/components/coquille/titre-page'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { PlanningInteractif } from '@/components/planning/planning-interactif'
import { estOuvrable, ferie } from '@/db/compute/calendrier'
import { calculerReseau } from '@/db/compute/cpm'
import { journeesGrisees } from '@/db/compute/gantt'
import { db } from '@/db/index'
import { chargerPlanning, reseauDuPlanning } from '@/db/queries/planning'
import { aujourdhui } from '@/lib/format'
import { construireGantt } from '@/lib/gantt-donnees'
import { exigerPage, habilite, PEUT_PLANIFIER, voitDonneesInternes } from '@/lib/garde'

export const metadata: Metadata = { title: 'Planning' }

export default async function Planning({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const utilisateur = await exigerPage(id)

  const planning = await chargerPlanning(db(), id)
  const reseau = calculerReseau(reseauDuPlanning(planning))
  const donnees = construireGantt(planning, reseau, aujourdhui())
  const grisees = journeesGrisees(
    donnees.origine,
    donnees.nombreJours,
    (d) => estOuvrable(d),
    (d) => ferie(d)?.nom ?? 'Repos hebdomadaire',
    planning.arrets,
  )

  const finReseau = reseau.dureeTotale - planning.projet.dureeContractuelleJ

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6">
      <FilAriane
        maillons={[
          { libelle: planning.projet.code, href: `/projet/${id}` },
          { libelle: 'Planning' },
        ]}
      />
      <header className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <TitrePage icone="planning">Planning</TitrePage>
          <p className="text-muted-foreground mt-1.5 text-[0.9375rem]">
            {reseau.cheminCritique.length} tâches critiques sur{' '}
            {planning.taches.filter((t) => t.feuille).length}. Réseau de {reseau.dureeTotale} jours
            {finReseau > 0
              ? `, soit ${finReseau} jours au-delà du délai contractuel.`
              : finReseau < 0
                ? `, ${-finReseau} jours de marge sur le délai contractuel.`
                : ', exactement le délai contractuel.'}
          </p>
        </div>
      </header>
      <div className="mt-5">
        <PlanningInteractif
          projetId={id}
          donnees={donnees}
          grisees={grisees}
          editable={habilite(utilisateur.role, PEUT_PLANIFIER)}
          simulationPermise={voitDonneesInternes(utilisateur.role)}
        />
      </div>
    </div>
  )
}
