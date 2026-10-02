'use client'

/**
 * Ecran du planning : le Gantt, et le panneau de la tache selectionnee.
 *
 * Le conducteur de travaux y modifie durees, contraintes et liaisons ; les
 * autres roles consultent. Glisser une barre n'ecrit rien : cela ouvre la
 * simulation avec le decalage correspondant, ou le conducteur voit les
 * consequences avant de decider quoi que ce soit.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  ajouterLiaisonAction,
  modifierTacheAction,
  supprimerLiaisonAction,
} from '@/app/(app)/projet/[id]/planning/actions'
import { Gantt } from '@/components/planning/gantt'
import { Button } from '@/components/ui/button'
import type { JourneeGrisee } from '@/db/compute/gantt'
import { dateDuJour } from '@/db/compute/gantt'
import { typeLiaison, type TypeLiaison } from '@/db/schema'
import { dateCourte, fcfa, pourcent } from '@/lib/format'
import { LIBELLE_LIAISON, type DonneesGantt } from '@/lib/gantt-donnees'
import { Icone } from '@/lib/icones'

const CHAMP =
  'border-input bg-background h-10 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40'

export function PlanningInteractif({
  projetId,
  donnees,
  grisees,
  editable,
  simulationPermise,
}: {
  projetId: string
  donnees: DonneesGantt
  grisees: JourneeGrisee[]
  editable: boolean
  simulationPermise: boolean
}) {
  const router = useRouter()
  const [selection, setSelection] = useState<string | null>(null)
  const element = donnees.elements.find((e) => e.id === selection && e.genre === 'tache')

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
      <Gantt
        donnees={donnees}
        grisees={grisees}
        selection={selection}
        surSelection={setSelection}
        {...(simulationPermise
          ? {
              surDeplacement: (id: string, decalage: number) =>
                router.push(`/projet/${projetId}/simulation?tache=${id}&decalage=${decalage}`),
            }
          : {})}
      />
      <aside aria-label="Tâche sélectionnée" className="rounded-xl border p-4 text-sm">
        {element ? (
          <Panneau
            key={element.id}
            projetId={projetId}
            donnees={donnees}
            id={element.id}
            editable={editable}
            simulationPermise={simulationPermise}
          />
        ) : (
          <p className="text-muted-foreground">
            Sélectionner une tâche dans le diagramme pour en voir le détail
            {editable ? ', modifier sa durée ou ses liaisons' : ''}.
            {simulationPermise && ' Glisser une barre ouvre la simulation, sans rien modifier.'}
          </p>
        )}
      </aside>
    </div>
  )
}

function Panneau({
  projetId,
  donnees,
  id,
  editable,
  simulationPermise,
}: {
  projetId: string
  donnees: DonneesGantt
  id: string
  editable: boolean
  simulationPermise: boolean
}) {
  const router = useRouter()
  const [enCours, demarrer] = useTransition()
  const parId = new Map(donnees.elements.map((e) => [e.id, e]))
  const e = parId.get(id)
  const debutIso = e ? dateDuJour(donnees.origine, e.debut).toISOString().slice(0, 10) : ''
  const [duree, setDuree] = useState(e ? String(e.fin - e.debut + 1) : '')
  const [debut, setDebut] = useState(debutIso)
  const [nouvelle, setNouvelle] = useState<{
    autre: string
    sens: 'amont' | 'aval'
    type: TypeLiaison
    decalage: string
  }>({
    autre: '',
    sens: 'aval',
    type: 'FD',
    decalage: '0',
  })
  if (!e) return null

  const entrantes = donnees.liaisons.filter((l) => l.avalId === id)
  const sortantes = donnees.liaisons.filter((l) => l.amontId === id)
  const autresTaches = donnees.elements
    .filter((x) => x.genre === 'tache' && x.id !== id)
    .sort((a, b) => a.codeWbs.localeCompare(b.codeWbs))

  function executer(action: () => Promise<{ ok: boolean; message: string }>) {
    demarrer(async () => {
      const r = await action()
      if (r.ok) {
        toast.success(r.message)
        router.refresh()
      } else toast.error(r.message)
    })
  }

  const ligneLiaison = (l: (typeof entrantes)[number], autreId: string) => {
    const autre = parId.get(autreId)
    return (
      <li key={l.id} className="flex items-start justify-between gap-2">
        <span className={l.critique ? 'text-etat-critique' : ''}>
          <span className="text-muted-foreground mr-1 font-mono text-xs">{autre?.codeWbs}</span>
          {autre?.nom}
          <span className="text-muted-foreground block text-xs">
            {LIBELLE_LIAISON[l.type]}
            {l.decalageJ !== 0 && `, ${l.decalageJ > 0 ? '+' : ''}${l.decalageJ} j`}
          </span>
        </span>
        {editable && (
          <button
            type="button"
            disabled={enCours}
            aria-label="Supprimer cette liaison"
            onClick={() => executer(() => supprimerLiaisonAction({ projetId, liaisonId: l.id }))}
            className="hover:bg-accent text-muted-foreground grid size-8 shrink-0 place-items-center rounded-md"
          >
            <Icone.supprimer className="size-4" />
          </button>
        )}
      </li>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-muted-foreground font-mono text-xs">{e.codeWbs}</p>
        <h2 className="font-medium">{e.nom}</h2>
        {e.critique && <p className="text-etat-critique text-xs">Sur le chemin critique</p>}
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Au plus tôt</dt>
        <dd>
          {e.debutTot && e.finTot ? `${dateCourte(e.debutTot)} → ${dateCourte(e.finTot)}` : '—'}
        </dd>
        <dt className="text-muted-foreground">Au plus tard</dt>
        <dd>
          {e.debutTard && e.finTard ? `${dateCourte(e.debutTard)} → ${dateCourte(e.finTard)}` : '—'}
        </dd>
        <dt className="text-muted-foreground">Marges</dt>
        <dd>
          totale {e.margeTotaleJ ?? '—'} j, libre {e.margeLibreJ ?? '—'} j
        </dd>
        <dt className="text-muted-foreground">Avancement</dt>
        <dd>{pourcent(e.avancement)}</dd>
        <dt className="text-muted-foreground">Budget</dt>
        <dd>{fcfa(e.budgetXof)}</dd>
      </dl>

      {editable && (
        <form
          className="space-y-2 border-t pt-3"
          onSubmit={(ev) => {
            ev.preventDefault()
            const dureeJ = Number(duree)
            const modifs: { dureeJ?: number; debutImpose?: string } = {}
            if (dureeJ !== e.fin - e.debut + 1) modifs.dureeJ = dureeJ
            if (debut !== debutIso) modifs.debutImpose = debut
            if (Object.keys(modifs).length === 0) return
            executer(() => modifierTacheAction({ projetId, tacheId: id, ...modifs }))
          }}
        >
          <p className="text-xs font-medium">Modifier la tâche</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Durée (jours)</span>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={duree}
                onChange={(ev) => setDuree(ev.target.value)}
                className={CHAMP}
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Pas avant le</span>
              <input
                type="date"
                min={donnees.origine}
                value={debut}
                onChange={(ev) => setDebut(ev.target.value)}
                className={CHAMP}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="h-9" disabled={enCours}>
              Recaler le planning
            </Button>
            {e.contrainte && (
              <Button
                type="button"
                variant="outline"
                className="h-9"
                disabled={enCours}
                onClick={() =>
                  executer(() => modifierTacheAction({ projetId, tacheId: id, debutImpose: null }))
                }
              >
                Retirer la contrainte
              </Button>
            )}
          </div>
        </form>
      )}

      <div className="space-y-1.5 border-t pt-3">
        <p className="text-xs font-medium">Prédécesseurs</p>
        {entrantes.length === 0 ? (
          <p className="text-muted-foreground text-xs">Aucun.</p>
        ) : (
          <ul className="space-y-1.5">{entrantes.map((l) => ligneLiaison(l, l.amontId))}</ul>
        )}
        <p className="pt-1 text-xs font-medium">Successeurs</p>
        {sortantes.length === 0 ? (
          <p className="text-muted-foreground text-xs">Aucun.</p>
        ) : (
          <ul className="space-y-1.5">{sortantes.map((l) => ligneLiaison(l, l.avalId))}</ul>
        )}
      </div>

      {editable && (
        <form
          className="space-y-2 border-t pt-3"
          onSubmit={(ev) => {
            ev.preventDefault()
            if (!nouvelle.autre) return
            const [amontId, avalId] =
              nouvelle.sens === 'aval' ? [id, nouvelle.autre] : [nouvelle.autre, id]
            executer(() =>
              ajouterLiaisonAction({
                projetId,
                amontId,
                avalId,
                type: nouvelle.type,
                decalageJ: Number(nouvelle.decalage) || 0,
              }),
            )
          }}
        >
          <p className="text-xs font-medium">Ajouter une liaison</p>
          <select
            aria-label="Sens de la liaison"
            value={nouvelle.sens}
            onChange={(ev) =>
              setNouvelle({ ...nouvelle, sens: ev.target.value as 'amont' | 'aval' })
            }
            className={CHAMP}
          >
            <option value="aval">Cette tâche précède…</option>
            <option value="amont">Cette tâche suit…</option>
          </select>
          <select
            aria-label="Autre tâche"
            value={nouvelle.autre}
            onChange={(ev) => setNouvelle({ ...nouvelle, autre: ev.target.value })}
            className={CHAMP}
          >
            <option value="">Choisir une tâche</option>
            {autresTaches.map((t) => (
              <option key={t.id} value={t.id}>
                {t.codeWbs} — {t.nom}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Type de liaison"
              value={nouvelle.type}
              onChange={(ev) => setNouvelle({ ...nouvelle, type: ev.target.value as TypeLiaison })}
              className={CHAMP}
            >
              {typeLiaison.enumValues.map((t) => (
                <option key={t} value={t}>
                  {LIBELLE_LIAISON[t]}
                </option>
              ))}
            </select>
            <input
              aria-label="Décalage en jours"
              type="number"
              inputMode="numeric"
              value={nouvelle.decalage}
              onChange={(ev) => setNouvelle({ ...nouvelle, decalage: ev.target.value })}
              className={CHAMP}
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            className="h-9"
            disabled={enCours || !nouvelle.autre}
          >
            Ajouter la liaison
          </Button>
        </form>
      )}

      {simulationPermise && (
        <Link
          href={`/projet/${projetId}/simulation?tache=${id}&decalage=10`}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 border-t pt-3 text-xs"
        >
          <Icone.simulation className="size-3.5" aria-hidden />
          Simuler un glissement de cette tâche
        </Link>
      )}
    </div>
  )
}
