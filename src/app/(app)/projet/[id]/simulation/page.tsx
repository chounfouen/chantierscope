import type { Metadata } from 'next'
import { TitrePage } from '@/components/coquille/titre-page'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { Simulation } from '@/components/planning/simulation'
import { estOuvrable, ferie } from '@/db/compute/calendrier'
import { calculerReseau } from '@/db/compute/cpm'
import { journeesGrisees } from '@/db/compute/gantt'
import type { ContexteSimulation } from '@/db/compute/simulation'
import { db } from '@/db/index'
import { chargerPlanning, chargerScenarios, reseauDuPlanning } from '@/db/queries/planning'
import { aujourdhui } from '@/lib/format'
import { construireGantt } from '@/lib/gantt-donnees'
import { exigerPage, habilite, PEUT_PLANIFIER, VOIT_DONNEES_INTERNES } from '@/lib/garde'

export const metadata: Metadata = { title: 'Simulation' }

export default async function PageSimulation({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  // La simulation chiffre des penalites et expose la strategie de
  // l'entreprise : elle suit la regle des donnees internes.
  const utilisateur = await exigerPage(id, VOIT_DONNEES_INTERNES)
  const recherche = await searchParams

  const base = db()
  const [planning, scenarios] = await Promise.all([
    chargerPlanning(base, id),
    chargerScenarios(base, id),
  ])
  const reseau = reseauDuPlanning(planning)
  const donnees = construireGantt(planning, calculerReseau(reseau), aujourdhui())
  const grisees = journeesGrisees(
    donnees.origine,
    donnees.nombreJours,
    (d) => estOuvrable(d),
    (d) => ferie(d)?.nom ?? 'Repos hebdomadaire',
    planning.arrets,
  )

  const contexte: ContexteSimulation = {
    reseau,
    jalons: planning.jalons
      .filter((j) => j.tacheDeclenchanteId !== null)
      .map((j) => ({
        id: j.id,
        nom: j.nom,
        tacheDeclenchante: j.tacheDeclenchanteId as string,
        contractuel: j.contractuel,
      })),
    dureeContractuelleJ: planning.projet.dureeContractuelleJ,
    montantMarcheXof: planning.projet.montantMarcheXof,
    tauxPenaliteJournaliere: planning.projet.tauxPenaliteJournaliere,
  }

  // Scenario prepare depuis le Gantt, par glisser-deposer ou par le panneau.
  const tache = typeof recherche['tache'] === 'string' ? recherche['tache'] : ''
  const decalage = Number(recherche['decalage'])
  const valable = reseau.taches.some((t) => t.id === tache) && Number.isInteger(decalage)
  const initiale = valable ? { tacheId: tache, decalageJ: Math.max(0, decalage) } : null

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6">
      <FilAriane
        maillons={[
          { libelle: planning.projet.code, href: `/projet/${id}` },
          { libelle: 'Planning', href: `/projet/${id}/planning` },
          { libelle: 'Simulation' },
        ]}
      />
      <header className="mt-3">
        <TitrePage icone="simulation">Simulation d’aléa</TitrePage>
        <p className="text-muted-foreground mt-1.5 text-[0.9375rem]">
          Que se passe-t-il si une tâche glisse ? Le calcul ne modifie rien au planning.
        </p>
        {valable && decalage < 0 && (
          <p className="text-muted-foreground mt-1 text-sm">
            Une avance ne se simule pas : le décalage a été ramené à zéro.
          </p>
        )}
      </header>
      <div className="mt-5">
        <Simulation
          projetId={id}
          contexte={contexte}
          donnees={donnees}
          grisees={grisees}
          scenarios={scenarios}
          initiale={initiale}
          peutEnregistrer={habilite(utilisateur.role, PEUT_PLANIFIER)}
        />
      </div>
    </div>
  )
}
