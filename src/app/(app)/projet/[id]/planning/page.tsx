import type { Metadata } from 'next'
import { TitrePage } from '@/components/coquille/titre-page'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { PanneauReference } from '@/components/planning/panneau-reference'
import { PlanningInteractif } from '@/components/planning/planning-interactif'
import { estOuvrable, ferie } from '@/db/compute/calendrier'
import { calculerReseau } from '@/db/compute/cpm'
import { journeesGrisees } from '@/db/compute/gantt'
import { dateApres, jourDepuis, reseauRejoue } from '@/db/compute/tableau'
import { db } from '@/db/index'
import { chargerContrat } from '@/db/queries/contrat'
import {
  chargerPlanning,
  dateEtat,
  referenceActive,
  reseauDuPlanning,
  suiviDuPlanning,
} from '@/db/queries/planning'
import { aujourdhui } from '@/lib/format'
import { construireGantt } from '@/lib/gantt-donnees'
import { exigerPage, habilite, PEUT_PLANIFIER, voitDonneesInternes } from '@/lib/garde'

export const metadata: Metadata = { title: 'Planning' }

export default async function Planning({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const utilisateur = await exigerPage(id)

  const base = db()
  const [planning, reference, etat, contrat] = await Promise.all([
    chargerPlanning(base, id),
    referenceActive(base, id),
    dateEtat(base, id),
    chargerContrat(base, id, aujourdhui()),
  ])
  const reseau = calculerReseau(reseauDuPlanning(planning))
  const origine = planning.projet.dateOrdreService

  // Le planning rejoue a la date d'etat, contre la fin contractuelle : ses
  // marges negatives disent ce qu'il faut rattraper, tache par tache.
  const suivi = suiviDuPlanning(planning)
  const recale =
    etat === null
      ? null
      : reseauRejoue(
          suivi.taches,
          suivi.liaisons,
          jourDepuis(origine, etat),
          // Butoir : la fin contractuelle EN VIGUEUR, prolongations comprises.
          contrat.cadre.dureeJ - 1,
        )
  const margesRecalees: Record<string, number> = {}
  for (const [idTache, d] of recale?.dates ?? []) margesRecalees[idTache] = d.margeTotale
  const negatives = Object.values(margesRecalees).filter((m) => m < 0)
  const donnees = construireGantt(planning, reseau, aujourdhui())
  const grisees = journeesGrisees(
    donnees.origine,
    donnees.nombreJours,
    (d) => estOuvrable(d),
    (d) => ferie(d)?.nom ?? 'Repos hebdomadaire',
    planning.arrets,
  )

  const finReseau = reseau.dureeTotale - contrat.cadre.dureeJ

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
      <PanneauReference
        projetId={id}
        reference={
          reference === null
            ? null
            : { ...reference, geleLe: new Date(reference.geleLe).toISOString() }
        }
        finCourante={dateApres(origine, reseau.dureeTotale - 1)}
        recale={
          etat === null || recale === null
            ? null
            : {
                dateEtat: etat,
                fin: dateApres(origine, recale.dureeTotale - 1),
                finContractuelle: contrat.cadre.finContractuelle,
                aRattraper: negatives.length,
                pireMargeJ: Math.min(0, ...negatives),
              }
        }
        editable={habilite(utilisateur.role, PEUT_PLANIFIER)}
      />
      <div className="mt-5">
        <PlanningInteractif
          margesRecalees={margesRecalees}
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
