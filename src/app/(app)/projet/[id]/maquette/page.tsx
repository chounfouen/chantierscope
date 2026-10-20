import type { Metadata } from 'next'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { TitrePage } from '@/components/coquille/titre-page'
import { MaquetteInteractive } from '@/components/maquette/maquette-interactive'
import type { Releve3 } from '@/components/plan/plan-interactif'
import { calendrierDepuis } from '@/db/compute/ouvre'
import { joursEchantillonnes, rejouerZones } from '@/db/compute/plan'
import { dateApres, jourDepuis } from '@/db/compute/tableau'
import { db } from '@/db/index'
import { betonParTache, chargerMaquette } from '@/db/queries/maquette'
import { tachesRattachables } from '@/db/queries/plan'
import { enCacheProjet } from '@/lib/cache'
import { dateLongue, nombre, pourcentSigne } from '@/lib/format'
import { ETAT } from '@/lib/etats'
import { exigerPage, habilite, PEUT_PLANIFIER } from '@/lib/garde'
import { Icone } from '@/lib/icones'
import {
  classer,
  correspond,
  groupes as grouper,
  proposerRegles,
  tachesParElement,
} from '@/lib/maquette/regles'
import { comparerMetre, FAMILLES_BETON, SEUIL_ECART_METRE } from '@/lib/maquette/metre'
import { urlAffichage } from '@/services/stockage'

export const metadata: Metadata = { title: 'Maquette 3D' }

export default async function Maquette({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const utilisateur = await exigerPage(id)
  const editable = habilite(utilisateur.role, PEUT_PLANIFIER)
  // Comme le plan, la maquette ne porte aucune donnee interne.
  const [d, rattachables, beton] = await Promise.all([
    enCacheProjet('maquette', id, false, () => chargerMaquette(db(), id)),
    editable ? tachesRattachables(db(), id) : Promise.resolve([]),
    betonParTache(db(), id),
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
  const parElement = tachesParElement(elements, regles)
  const { groupes, groupeDe } = grouper(parElement)
  const metre = comparerMetre({
    taches: beton,
    elements: d.elements.map((e) => ({
      globalId: e.globalId,
      volumeM3: e.volumeM3 ?? null,
      source: e.sourceQuantite ?? null,
    })),
    tachesParElement: parElement,
    tachesBeton: new Set(regles.filter((r) => FAMILLES_BETON.has(r.famille)).map((r) => r.tacheId)),
  })

  // Chaque semaine depuis l'ordre de service, et la date de la situation.
  const jours =
    d.dateAnalyse === null ? [] : joursEchantillonnes(jourDepuis(d.origine, d.dateAnalyse))
  const etats = rejouerZones(
    [...groupes, ...d.taches.map((t) => ({ id: `t:${t.id}`, tacheIds: [t.id] }))],
    d.taches,
    d.quantites,
    jours,
    calendrierDepuis(d.origine),
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

      {metre.length > 0 && d.maquette && (
        <section aria-labelledby="titre-metre" className="surface mt-5 overflow-hidden">
          <h2
            id="titre-metre"
            className="border-border/70 border-b px-5 py-3.5 text-base font-extrabold"
          >
            Métré de la maquette et quantitatif du marché
          </h2>
          <p className="text-muted-foreground px-5 pt-3 text-sm">
            Volume des éléments rattachés à chaque tâche, lu dans les quantités IFC ou calculé sur
            la géométrie, face au béton prévu au quantitatif. Au-delà de{' '}
            {pourcentSigne(SEUIL_ECART_METRE, 0).replace('+', '')}, le métré mérite d’être repris
            avant le décompte ; une tâche modélisée sans ligne de béton signale un oubli.
          </p>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full text-sm">
              <caption className="sr-only">
                Volumes de béton par tâche : maquette, quantitatif, écart
              </caption>
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-bold">
                    Tâche
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-bold">
                    Maquette
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-bold">
                    Quantitatif
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-bold">
                    Écart
                  </th>
                </tr>
              </thead>
              <tbody>
                {metre.map((l) => {
                  const fort = l.ecart !== null && Math.abs(l.ecart) > SEUIL_ECART_METRE
                  return (
                    <tr key={l.tacheId} className="border-border/60 border-t">
                      <td className="px-3 py-2">
                        <span className="text-muted-foreground mr-1.5 font-mono text-xs">
                          {l.codeWbs}
                        </span>
                        {l.tache}
                        {l.elements > 0 && (
                          <span className="text-muted-foreground block text-xs">
                            {l.elements} élément{l.elements > 1 ? 's' : ''}
                            {l.source === 'GEOMETRIE' && ', volume géométrique'}
                            {l.source === 'QTO' && ', quantités IFC'}
                          </span>
                        )}
                      </td>
                      <td className="chiffres-alignes px-3 py-2 text-right whitespace-nowrap">
                        {l.maquetteM3 === null ? 'non modélisé' : `${nombre(l.maquetteM3, 1)} m³`}
                      </td>
                      <td className="chiffres-alignes px-3 py-2 text-right whitespace-nowrap">
                        {l.quantitatifM3 === null
                          ? 'aucune ligne de béton'
                          : `${nombre(l.quantitatifM3, 1)} m³`}
                      </td>
                      <td className="chiffres-alignes px-3 py-2 text-right font-bold whitespace-nowrap">
                        {/* Le texte garde sa teinte, lisible sur les deux themes ; l'icone porte l'etat. */}
                        {fort && (
                          <ETAT.CRITIQUE.icone
                            className={`mr-1 inline size-3.5 align-[-2px] ${ETAT.CRITIQUE.teinte}`}
                            aria-label="Hors tolérance"
                          />
                        )}
                        {l.ecart === null ? '—' : pourcentSigne(l.ecart)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
