import type { Metadata } from 'next'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { PlanInteractif, type Releve3 } from '@/components/plan/plan-interactif'
import { joursEchantillonnes, rejouerZones } from '@/db/compute/plan'
import { dateApres, jourDepuis } from '@/db/compute/tableau'
import { db } from '@/db/index'
import { chargerPlan } from '@/db/queries/plan'
import { exigerPage } from '@/lib/garde'
import { dateLongue } from '@/lib/format'

export const metadata: Metadata = { title: 'Plan interactif' }

export default async function Plan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await exigerPage(id)
  const d = await chargerPlan(db(), id)

  if (d.dateAnalyse === null || d.zones.length === 0) {
    return (
      <div className="mx-auto max-w-[78rem] px-4 py-6 sm:px-6 lg:px-8">
        <FilAriane maillons={[{ libelle: 'Plan interactif' }]} />
        <p className="text-muted-foreground mt-6 text-sm">
          Aucune zone ou aucun instantané pour ce chantier : le plan n’est pas disponible.
        </p>
      </div>
    )
  }

  // Chaque semaine depuis l'ordre de service, et la date de la situation.
  const jours = joursEchantillonnes(jourDepuis(d.origine, d.dateAnalyse))
  // Les taches sont rejouees comme des zones d'une seule tache : meme calcul,
  // pour le detail affiche au clic.
  const etats = rejouerZones(
    [...d.zones, ...d.taches.map((t) => ({ id: `t:${t.id}`, tacheIds: [t.id] }))],
    d.taches,
    d.quantites,
    jours,
  )
  const serie = (cle: string): Releve3[] =>
    etats.map((m) => {
      const e = m.get(cle)
      return e ? [e.reel, e.prevu, e.etat] : [0, 0, 'NON_COMMENCE']
    })

  return (
    <div className="mx-auto max-w-[78rem] px-4 py-6 sm:px-6 lg:px-8">
      <FilAriane maillons={[{ libelle: 'Plan interactif' }]} />
      <header className="mt-2.5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-[1.375rem] font-semibold">Plan interactif</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Zones colorées selon l’avancement de leurs tâches, pondéré par le budget
          </p>
        </div>
        <p className="text-muted-foreground text-xs">Situation au {dateLongue(d.dateAnalyse)}</p>
      </header>
      <PlanInteractif
        projetId={id}
        dates={jours.map((j) => dateApres(d.origine, j))}
        zones={d.zones.map((z) => ({ ...z, serie: serie(z.id) }))}
        taches={d.taches.map((t) => ({
          id: t.id,
          codeWbs: t.codeWbs,
          nom: t.nom,
          lotId: t.lotId,
          dateDebutPrevue: t.dateDebutPrevue,
          dateFinPrevue: t.dateFinPrevue,
          critique: t.critique,
          serie: serie(`t:${t.id}`),
        }))}
      />
    </div>
  )
}
