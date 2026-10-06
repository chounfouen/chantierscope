import type { Metadata } from 'next'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { PlanInteractif, type Releve3 } from '@/components/plan/plan-interactif'
import { joursEchantillonnes, rejouerZones } from '@/db/compute/plan'
import { dateApres, jourDepuis } from '@/db/compute/tableau'
import { db } from '@/db/index'
import { chargerPlan, tachesRattachables } from '@/db/queries/plan'
import { enCacheProjet } from '@/lib/cache'
import { dateLongue } from '@/lib/format'
import { exigerPage, habilite, PEUT_PLANIFIER } from '@/lib/garde'
import { Icone } from '@/lib/icones'
import { urlAffichage } from '@/services/stockage'

export const metadata: Metadata = { title: 'Plan interactif' }

export default async function Plan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const utilisateur = await exigerPage(id)
  const editable = habilite(utilisateur.role, PEUT_PLANIFIER)
  // Le plan ne porte aucune donnee interne : une seule entree pour tous.
  const [d, rattachables] = await Promise.all([
    enCacheProjet('plan', id, false, () => chargerPlan(db(), id)),
    editable ? tachesRattachables(db(), id) : Promise.resolve([]),
  ])
  // Les URL de lecture sont signees pour une heure : jamais mises en cache.
  const plans = await Promise.all(
    d.plans.map(async (p) => ({ ...p, url: await urlAffichage(p.chemin) })),
  )

  const vide = d.zones.length === 0 && d.plans.length === 0
  // Chaque semaine depuis l'ordre de service, et la date de la situation.
  const jours =
    d.dateAnalyse === null ? [] : joursEchantillonnes(jourDepuis(d.origine, d.dateAnalyse))
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
          <h1 className="text-[1.625rem] font-extrabold tracking-tight">Plan interactif</h1>
          <p className="text-muted-foreground mt-1 text-[0.9375rem]">
            Chaque zone prend l’état de ses tâches, pondéré par leur budget
          </p>
        </div>
        {d.dateAnalyse && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold">
            <Icone.calendrier className="size-3.5" aria-hidden />
            Situation au {dateLongue(d.dateAnalyse)}
          </p>
        )}
      </header>
      {vide && !editable ? (
        <div className="surface mt-5 grid place-items-center gap-3 px-6 py-14 text-center">
          <span className="pastille size-12 rounded-2xl">
            <Icone.plan className="size-6" aria-hidden />
          </span>
          <p className="font-bold">Le plan de ce chantier n’est pas encore disponible</p>
          <p className="text-muted-foreground max-w-md text-sm">
            Le conducteur de travaux importe les plans de niveau et y dessine les zones.
          </p>
        </div>
      ) : (
        <PlanInteractif
          projetId={id}
          dates={jours.map((j) => dateApres(d.origine, j))}
          zones={d.zones.map((z) => ({ ...z, serie: serie(z.id) }))}
          plans={plans.map((p) => ({
            niveau: p.niveau,
            url: p.url,
            largeur: p.largeur,
            hauteur: p.hauteur,
            nomFichier: p.nomFichier,
            importeLe: p.importeLe,
          }))}
          editable={editable}
          rattachables={rattachables}
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
      )}
    </div>
  )
}
