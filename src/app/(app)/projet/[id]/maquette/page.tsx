import type { Metadata } from 'next'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { TitrePage } from '@/components/coquille/titre-page'
import { MaquetteInteractive } from '@/components/maquette/maquette-interactive'
import type { Releve3 } from '@/components/plan/plan-interactif'
import { joursEchantillonnes, rejouerZones } from '@/db/compute/plan'
import { dateApres, jourDepuis } from '@/db/compute/tableau'
import { db } from '@/db/index'
import { chargerMaquette } from '@/db/queries/maquette'
import { tachesRattachables } from '@/db/queries/plan'
import { enCacheProjet } from '@/lib/cache'
import { dateLongue } from '@/lib/format'
import { exigerPage, habilite, PEUT_PLANIFIER } from '@/lib/garde'
import { Icone } from '@/lib/icones'
import {
  classer,
  correspond,
  groupes as grouper,
  proposerRegles,
  tachesParElement,
} from '@/lib/maquette/regles'
import { urlAffichage } from '@/services/stockage'

export const metadata: Metadata = { title: 'Maquette 3D' }

export default async function Maquette({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const utilisateur = await exigerPage(id)
  const editable = habilite(utilisateur.role, PEUT_PLANIFIER)
  // Comme le plan, la maquette ne porte aucune donnee interne.
  const [d, rattachables] = await Promise.all([
    enCacheProjet('maquette', id, false, () => chargerMaquette(db(), id)),
    editable ? tachesRattachables(db(), id) : Promise.resolve([]),
  ])
  // L'URL de lecture est signee pour une heure : jamais mise en cache.
  const url = d.maquette ? await urlAffichage(d.maquette.chemin) : null
  const etages = d.maquette?.etages ?? []

  const elements = classer(d.elements, etages)
  const regles = d.regles.map((r) => ({
    tacheId: r.tacheId,
    famille: r.famille,
    niveau: r.niveau,
    nomContient: r.nomContient,
  }))
  const { groupes, groupeDe } = grouper(tachesParElement(elements, regles))

  // Chaque semaine depuis l'ordre de service, et la date de la situation.
  const jours =
    d.dateAnalyse === null ? [] : joursEchantillonnes(jourDepuis(d.origine, d.dateAnalyse))
  const etats = rejouerZones(
    [...groupes, ...d.taches.map((t) => ({ id: `t:${t.id}`, tacheIds: [t.id] }))],
    d.taches,
    d.quantites,
    jours,
  )
  const serie = (cle: string): Releve3[] =>
    etats.map((m) => {
      const e = m.get(cle)
      return e ? [e.reel, e.prevu, e.etat] : [0, 0, 'NON_COMMENCE']
    })

  const propositions = editable
    ? proposerRegles(rattachables, elements, new Set(d.regles.map((r) => r.tacheId)))
    : []

  return (
    <div className="mx-auto max-w-[78rem] px-4 py-6 sm:px-6 lg:px-8">
      <FilAriane maillons={[{ libelle: 'Maquette 3D' }]} />
      <header className="mt-2.5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <TitrePage icone="maquette">Maquette 3D</TitrePage>
          <p className="text-muted-foreground mt-1.5 text-[0.9375rem]">
            Chaque élément du bâtiment prend l’état des tâches qui le réalisent
          </p>
        </div>
        {d.dateAnalyse && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold">
            <Icone.calendrier className="size-3.5" aria-hidden />
            Situation au {dateLongue(d.dateAnalyse)}
          </p>
        )}
      </header>
      <MaquetteInteractive
        projetId={id}
        url={url}
        nomFichier={d.maquette?.nomFichier ?? null}
        etages={etages}
        dates={jours.map((j) => dateApres(d.origine, j))}
        elements={elements.map((e) => ({
          id: e.globalId,
          famille: e.famille,
          nom: e.nom,
          etage: e.etage,
          niveau: e.niveau,
          groupe: groupeDe.get(e.globalId) ?? null,
        }))}
        groupes={groupes.map((g) => ({ ...g, serie: serie(g.id) }))}
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
        regles={d.regles.map((r) => ({
          ...r,
          elements: elements.filter((e) => correspond(e, r)).length,
        }))}
        editable={editable}
        rattachables={rattachables}
        propositions={propositions}
      />
    </div>
  )
}
