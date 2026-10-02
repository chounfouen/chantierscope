'use client'

/**
 * Ecran de simulation d'alea.
 *
 * Le calcul tourne dans le navigateur, a chaque modification du scenario : le
 * moteur est pur et le reseau tient en quelques kilooctets, le resultat est
 * donc instantane. Rien n'est ecrit en base, sauf, a la demande, les
 * hypotheses d'un scenario, pour le presenter en reunion de chantier.
 */

import { addDays, formatISO, parseISO } from 'date-fns'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  enregistrerScenarioAction,
  supprimerScenarioAction,
} from '@/app/(app)/projet/[id]/simulation/actions'
import { Gantt } from '@/components/planning/gantt'
import { Tuile } from '@/components/indicateurs/tuile'
import { Button } from '@/components/ui/button'
import type { JourneeGrisee } from '@/db/compute/gantt'
import { simuler, type ContexteSimulation } from '@/db/compute/simulation'
import type { ScenarioEnregistre } from '@/db/queries/planning'
import { dateCourte, dateLongue, fcfa, instant } from '@/lib/format'
import { fantomesDe, ganttSimule, type DonneesGantt } from '@/lib/gantt-donnees'
import { ETAT } from '@/lib/etats'
import { Icone } from '@/lib/icones'

type Ligne = { cle: number; tacheId: string; decalageJ: string; allongementJ: string }

const CHAMP =
  'border-input bg-background h-10 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40'

export function Simulation({
  projetId,
  contexte,
  donnees,
  grisees,
  scenarios,
  initiale,
  peutEnregistrer,
}: {
  projetId: string
  contexte: ContexteSimulation
  donnees: DonneesGantt
  grisees: JourneeGrisee[]
  scenarios: ScenarioEnregistre[]
  initiale: { tacheId: string; decalageJ: number } | null
  peutEnregistrer: boolean
}) {
  const router = useRouter()
  const [enCours, demarrer] = useTransition()
  const [lignes, setLignes] = useState<Ligne[]>(() =>
    initiale
      ? [
          {
            cle: 1,
            tacheId: initiale.tacheId,
            decalageJ: String(initiale.decalageJ),
            allongementJ: '0',
          },
        ]
      : [{ cle: 1, tacheId: '', decalageJ: '10', allongementJ: '0' }],
  )
  const [nom, setNom] = useState('')
  const [description, setDescription] = useState('')

  const taches = useMemo(
    () =>
      donnees.elements
        .filter((e) => e.genre === 'tache')
        .sort((a, b) => a.codeWbs.localeCompare(b.codeWbs)),
    [donnees.elements],
  )
  const nomDe = useMemo(() => new Map(taches.map((t) => [t.id, `${t.codeWbs} ${t.nom}`])), [taches])

  const perturbations = lignes
    .filter((l) => l.tacheId !== '')
    .map((l) => ({
      tache: l.tacheId,
      decalageJ: Math.max(0, Math.round(Number(l.decalageJ) || 0)),
      allongementJ: Math.max(0, Math.round(Number(l.allongementJ) || 0)),
    }))
    .filter((p) => p.decalageJ > 0 || p.allongementJ > 0)

  // Cle stable du scenario : le calcul ne se refait que si elle change.
  const cle = JSON.stringify(perturbations)
  const resultat = useMemo(() => {
    const p = JSON.parse(cle) as typeof perturbations
    return p.length > 0 ? simuler(contexte, p) : null
  }, [contexte, cle])
  const donneesSimulees = useMemo(
    () => (resultat ? ganttSimule(donnees, resultat.simule) : donnees),
    [donnees, resultat],
  )
  const fantomes = useMemo(() => fantomesDe(donnees), [donnees])

  const date = (jour: number) =>
    formatISO(addDays(parseISO(donnees.origine), jour), { representation: 'date' })

  function modifierLigne(cle: number, m: Partial<Ligne>) {
    setLignes(lignes.map((l) => (l.cle === cle ? { ...l, ...m } : l)))
  }

  function charger(s: ScenarioEnregistre) {
    setLignes(
      s.perturbations.map((p, i) => ({
        cle: i + 1,
        tacheId: p.tacheId,
        decalageJ: String(p.decalageJ),
        allongementJ: String(p.allongementJ),
      })),
    )
    setNom(s.nom)
    setDescription(s.description ?? '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="titre-scenario" className="rounded-xl border p-4">
          <h2 id="titre-scenario" className="text-sm font-medium">
            Scénario
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Un retard de démarrage repousse la tâche sans toucher à son réseau ; un allongement
            augmente sa durée. Le reste du planning réagit par ses liaisons.
          </p>
          <ul className="mt-3 space-y-2">
            {lignes.map((l) => (
              <li key={l.cle} className="grid gap-2 sm:grid-cols-[1fr_7rem_7rem_2.5rem]">
                <select
                  aria-label="Tâche perturbée"
                  value={l.tacheId}
                  onChange={(e) => modifierLigne(l.cle, { tacheId: e.target.value })}
                  className={CHAMP}
                >
                  <option value="">Choisir une tâche</option>
                  {taches.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.codeWbs} — {t.nom}
                      {t.critique ? ' (critique)' : ''}
                    </option>
                  ))}
                </select>
                <label className="grid gap-0.5 text-xs">
                  <span className="text-muted-foreground">Retard (j)</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={l.decalageJ}
                    onChange={(e) => modifierLigne(l.cle, { decalageJ: e.target.value })}
                    className={CHAMP}
                  />
                </label>
                <label className="grid gap-0.5 text-xs">
                  <span className="text-muted-foreground">Allongement (j)</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={l.allongementJ}
                    onChange={(e) => modifierLigne(l.cle, { allongementJ: e.target.value })}
                    className={CHAMP}
                  />
                </label>
                <button
                  type="button"
                  aria-label="Retirer cette perturbation"
                  disabled={lignes.length === 1}
                  onClick={() => setLignes(lignes.filter((x) => x.cle !== l.cle))}
                  className="hover:bg-accent text-muted-foreground grid size-10 place-items-center self-end rounded-lg disabled:opacity-40"
                >
                  <Icone.supprimer className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            className="mt-2 h-9"
            onClick={() =>
              setLignes([
                ...lignes,
                {
                  cle: Math.max(...lignes.map((l) => l.cle)) + 1,
                  tacheId: '',
                  decalageJ: '5',
                  allongementJ: '0',
                },
              ])
            }
          >
            <Icone.ajouter className="size-4" />
            Ajouter une perturbation
          </Button>
        </section>

        {peutEnregistrer && (
          <section aria-labelledby="titre-enregistrer" className="rounded-xl border p-4">
            <h2 id="titre-enregistrer" className="text-sm font-medium">
              Enregistrer le scénario
            </h2>
            <form
              className="mt-2 space-y-2"
              onSubmit={(e) => {
                e.preventDefault()
                demarrer(async () => {
                  const r = await enregistrerScenarioAction({
                    projetId,
                    nom,
                    description: description.trim() === '' ? null : description,
                    perturbations: perturbations.map((p) => ({
                      tacheId: p.tache,
                      decalageJ: p.decalageJ,
                      allongementJ: p.allongementJ,
                    })),
                  })
                  if (r.ok) {
                    toast.success(r.message)
                    router.refresh()
                  } else toast.error(r.message)
                })
              }}
            >
              <input
                aria-label="Nom du scénario"
                placeholder="Nom, par exemple « Rupture d’acier de dix jours »"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className={CHAMP}
              />
              <textarea
                aria-label="Description"
                placeholder="Contexte, hypothèses, décision attendue"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={`${CHAMP} h-auto py-2`}
              />
              <Button
                type="submit"
                className="h-9"
                disabled={enCours || perturbations.length === 0}
              >
                Enregistrer
              </Button>
              <p className="text-muted-foreground text-xs">
                Seules les hypothèses sont conservées. Le résultat sera recalculé sur le planning du
                moment.
              </p>
            </form>
          </section>
        )}
      </div>

      {resultat ? (
        <>
          <section aria-label="Résultat" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tuile
              intitule="Fin du réseau"
              valeur={dateCourte(date(resultat.dureeSimuleeJ - 1))}
              precision={`référence ${dateCourte(date(resultat.dureeReferenceJ - 1))}`}
              icone="calendrier"
              ton={resultat.allongementJ > 0 ? 'alerte' : 'neutre'}
            />
            <Tuile
              intitule="Allongement"
              valeur={`${resultat.allongementJ} j`}
              precision={
                resultat.allongementJ === 0 ? 'absorbé par les marges' : 'sur la durée du réseau'
              }
              icone="planning"
              ton={resultat.allongementJ > 0 ? 'alerte' : 'bon'}
            />
            <Tuile
              intitule="Retard contractuel"
              valeur={`${resultat.retardJ} j`}
              precision={`fin contractuelle ${dateCourte(date(contexte.dureeContractuelleJ - 1))}`}
              icone="jalon"
              ton={resultat.retardJ > 0 ? 'critique' : 'bon'}
            />
            <Tuile
              intitule="Pénalité"
              valeur={fcfa(resultat.penaliteXof)}
              precision={`dont ${fcfa(resultat.penaliteSupplementaireXof)} dus au scénario`}
              icone="cout"
              ton={resultat.penaliteXof > 0 ? 'critique' : 'bon'}
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section aria-labelledby="titre-jalons" className="rounded-xl border p-4">
              <h2 id="titre-jalons" className="text-sm font-medium">
                Jalons
              </h2>
              <table className="mt-2 w-full text-sm">
                <thead className="text-muted-foreground text-left text-xs">
                  <tr>
                    <th className="py-1 font-normal">Jalon</th>
                    <th className="py-1 text-right font-normal">Référence</th>
                    <th className="py-1 text-right font-normal">Simulé</th>
                    <th className="py-1 text-right font-normal">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {resultat.jalons.map((j) => (
                    <tr key={j.id} className="border-t">
                      <td className="py-1.5">
                        {j.nom}
                        {j.contractuel && (
                          <span className="text-muted-foreground ml-1 text-xs">(contractuel)</span>
                        )}
                      </td>
                      <td className="chiffres-alignes py-1.5 text-right">
                        {dateCourte(date(j.jourReference))}
                      </td>
                      <td className="chiffres-alignes py-1.5 text-right">
                        {dateCourte(date(j.jourSimule))}
                      </td>
                      <td
                        className={`chiffres-alignes py-1.5 text-right ${
                          j.glissementJ > 0 && j.contractuel ? 'font-semibold' : ''
                        }`}
                      >
                        {j.glissementJ > 0 ? `+${j.glissementJ} j` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {resultat.jalonsMenaces.length > 0 && (
                <p className="[&>svg]:text-etat-critique mt-2 flex items-center gap-1.5 text-xs font-medium">
                  <Icone.alerte className="size-3.5" aria-hidden />
                  {resultat.jalonsMenaces.length} jalon
                  {resultat.jalonsMenaces.length > 1
                    ? 's contractuels menacés'
                    : ' contractuel menacé'}
                </p>
              )}
            </section>

            <section aria-labelledby="titre-critiques" className="rounded-xl border p-4">
              <h2 id="titre-critiques" className="text-sm font-medium">
                Effet sur le chemin critique
              </h2>
              {resultat.devenuesCritiques.length === 0 && resultat.liberees.length === 0 ? (
                <p className="text-muted-foreground mt-2 text-sm">
                  Le chemin critique est inchangé.
                </p>
              ) : (
                <div className="mt-2 space-y-3 text-sm">
                  {resultat.devenuesCritiques.length > 0 && (
                    <div>
                      <p className="flex items-center gap-1 text-xs font-medium">
                        <ETAT.CRITIQUE.icone
                          className={`size-3.5 ${ETAT.CRITIQUE.teinte}`}
                          aria-hidden
                        />
                        Deviennent critiques
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {resultat.devenuesCritiques.map((id) => (
                          <li key={id}>{nomDe.get(id)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {resultat.liberees.length > 0 && (
                    <div>
                      <p className="text-muted-foreground text-xs font-medium">Cessent de l’être</p>
                      <ul className="mt-1 space-y-0.5">
                        {resultat.liberees.map((id) => (
                          <li key={id}>{nomDe.get(id)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          <section aria-labelledby="titre-superposition" className="space-y-2">
            <h2 id="titre-superposition" className="text-sm font-medium">
              Planning simulé, référence en pointillés
            </h2>
            <Gantt
              key={cle}
              donnees={donneesSimulees}
              grisees={grisees}
              fantomes={fantomes}
              palierInitial="mois"
              hauteur={560}
            />
          </section>
        </>
      ) : (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
          Choisir une tâche et un retard ou un allongement pour voir l’effet sur le planning.
        </p>
      )}

      {scenarios.length > 0 && (
        <section aria-labelledby="titre-scenarios" className="rounded-xl border p-4">
          <h2 id="titre-scenarios" className="text-sm font-medium">
            Scénarios enregistrés
          </h2>
          <ul className="mt-2 divide-y">
            {scenarios.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.nom}</p>
                  <p className="text-muted-foreground text-xs">
                    {s.perturbations
                      .map(
                        (p) =>
                          `${nomDe.get(p.tacheId)?.split(' ')[0] ?? '?'} ${
                            p.decalageJ > 0 ? `+${p.decalageJ} j` : ''
                          }${p.allongementJ > 0 ? ` allongée de ${p.allongementJ} j` : ''}`,
                      )
                      .join(' ; ')}
                    {' — '}
                    {s.auteur ?? 'compte supprimé'}, {instant(new Date(s.creeLe))}
                  </p>
                  {s.description && <p className="mt-0.5 text-xs">{s.description}</p>}
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8"
                    onClick={() => charger(s)}
                  >
                    Rejouer
                  </Button>
                  {peutEnregistrer && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8"
                      disabled={enCours}
                      onClick={() =>
                        demarrer(async () => {
                          const r = await supprimerScenarioAction({ projetId, scenarioId: s.id })
                          if (r.ok) router.refresh()
                          else toast.error(r.message)
                        })
                      }
                    >
                      <Icone.supprimer className="size-4" />
                      <span className="sr-only">Supprimer {s.nom}</span>
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-muted-foreground text-xs">
        Simulation calculée sur le planning de référence du {dateLongue(donnees.origine)} : elle
        mesure l’effet d’un aléa sur le réseau, sans rien modifier.
      </p>
    </div>
  )
}
