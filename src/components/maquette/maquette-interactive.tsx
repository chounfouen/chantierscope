'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  ajouterReglesAction,
  retirerMaquetteAction,
  supprimerRegleAction,
} from '@/app/(app)/projet/[id]/maquette/actions'
import { ImportMaquette } from '@/components/maquette/import-maquette'
import type { VueMaquette } from '@/components/maquette/visionneuse'
import type { Releve3, TachePlanAffichee } from '@/components/plan/plan-interactif'
import { Button } from '@/components/ui/button'
import type { RegleLue } from '@/db/queries/maquette'
import type { TacheRattachable } from '@/db/queries/plan'
import { ETAT, type Etat } from '@/lib/etats'
import { dateCourte, dateLongue, pourcent } from '@/lib/format'
import { Icone } from '@/lib/icones'
import type { Etage } from '@/lib/maquette/ifc'
import { FAMILLES, type Famille, type Proposition } from '@/lib/maquette/regles'
import { libelleNiveau } from '@/lib/plan/zones'

// Le moteur 3D, lourd, n'est charge que dans le navigateur et sur cet ecran.
const Visionneuse = dynamic(
  () => import('@/components/maquette/visionneuse').then((m) => m.Visionneuse),
  {
    ssr: false,
    loading: () => (
      <div className="text-muted-foreground grid h-full place-items-center text-sm">
        Chargement du moteur 3D…
      </div>
    ),
  },
)

/** Element tel qu'envoye a l'ecran : identifiant, famille, nom, etage, niveau, groupe. */
export type ElementAffiche = {
  id: string
  famille: Famille
  nom: string | null
  etage: string | null
  niveau: number | null
  groupe: string | null
}

export type GroupeAffiche = { id: string; tacheIds: string[]; serie: Releve3[] }

export type RegleAffichee = RegleLue & { elements: number }

const ETATS_LEGENDE: Etat[] = ['NON_COMMENCE', 'EN_COURS', 'EN_RETARD', 'CRITIQUE', 'ACHEVE']

export function MaquetteInteractive({
  projetId,
  url,
  nomFichier,
  etages,
  dates,
  elements,
  groupes,
  taches,
  regles,
  editable,
  rattachables,
  propositions,
}: {
  projetId: string
  url: string | null
  nomFichier: string | null
  etages: Etage[]
  dates: string[]
  elements: ElementAffiche[]
  groupes: GroupeAffiche[]
  taches: TachePlanAffichee[]
  regles: RegleAffichee[]
  editable: boolean
  rattachables: TacheRattachable[]
  propositions: Proposition[]
}) {
  const router = useRouter()
  const [rang, setRang] = useState(Math.max(0, dates.length - 1))
  const [niveauMax, setNiveauMax] = useState<number | null>(null)
  const [selection, setSelection] = useState<string | null>(null)
  const [onglet, setOnglet] = useState<'detail' | 'rattachements'>('detail')
  const [importOuvert, setImportOuvert] = useState(false)
  const [chargement, setChargement] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()

  const groupeParId = useMemo(() => new Map(groupes.map((g) => [g.id, g])), [groupes])
  const tacheParId = useMemo(() => new Map(taches.map((t) => [t.id, t])), [taches])
  const elementParId = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements])

  const etatDe = (e: ElementAffiche): Etat | null => {
    if (e.groupe === null) return null
    return groupeParId.get(e.groupe)?.serie[rang]?.[2] ?? 'NON_COMMENCE'
  }

  const vue: VueMaquette = useMemo(() => {
    const etats = new Map<string, Etat>()
    for (const e of elements) {
      const s = e.groupe === null ? null : groupeParId.get(e.groupe)?.serie[rang]?.[2]
      if (e.groupe !== null) etats.set(e.id, s ?? 'NON_COMMENCE')
    }
    const visibles =
      niveauMax === null
        ? null
        : new Set(
            elements.filter((e) => e.niveau === null || e.niveau <= niveauMax).map((e) => e.id),
          )
    return { etats, visibles, selection }
  }, [elements, groupeParId, rang, niveauMax, selection])

  // Bilan par etat, a la date du curseur : l'alternative lisible a la vue 3D.
  const bilan = useMemo(() => {
    const n = new Map<Etat | 'NEUTRE', number>()
    for (const e of elements) {
      const k = vue.etats.get(e.id) ?? 'NEUTRE'
      n.set(k, (n.get(k) ?? 0) + 1)
    }
    return n
  }, [elements, vue])

  const element = selection ? (elementParId.get(selection) ?? null) : null
  const date = dates[rang] ?? ''

  function retirer() {
    if (!window.confirm('Retirer la maquette ? Les rattachements des tâches sont conservés.'))
      return
    demarrer(async () => {
      const r = await retirerMaquetteAction({ projetId })
      if (r.ok) toast.success(r.message)
      else toast.error(r.message)
      router.refresh()
    })
  }

  if (url === null) {
    return (
      <div className="surface mt-5 grid place-items-center gap-3 px-6 py-14 text-center">
        <span className="pastille size-14 rounded-2xl">
          <Icone.maquette className="size-7" strokeWidth={2} aria-hidden />
        </span>
        <p className="text-lg font-extrabold">Aucune maquette pour ce chantier</p>
        <p className="text-muted-foreground max-w-md text-sm">
          {editable
            ? 'Importer l’export IFC de la maquette du bâtiment : chaque mur, poteau ou dalle prendra la couleur de l’avancement de ses tâches.'
            : 'Le conducteur de travaux importe la maquette du bâtiment et y rattache les tâches.'}
        </p>
        {editable && (
          <Button onClick={() => setImportOuvert(true)} size="lg" className="mt-2">
            <Icone.importer className="size-4" aria-hidden />
            Importer une maquette IFC
          </Button>
        )}
        {importOuvert && (
          <ImportMaquette
            projetId={projetId}
            remplace={false}
            surFermeture={() => setImportOuvert(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section aria-label="Maquette 3D" className="surface overflow-hidden">
        <div className="border-border/70 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div role="group" aria-label="Étages montrés" className="segments">
            <button
              type="button"
              aria-pressed={niveauMax === null}
              onClick={() => setNiveauMax(null)}
              className="segment"
            >
              Tout
            </button>
            {etages.map((e) => (
              <button
                key={e.nom}
                type="button"
                aria-pressed={niveauMax === e.niveau}
                onClick={() => setNiveauMax(e.niveau)}
                className="segment"
                title={`Montrer jusqu’à ${e.nom}`}
              >
                {e.nom}
              </button>
            ))}
          </div>
          {editable && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setImportOuvert(true)}>
                <Icone.importer className="size-4" aria-hidden />
                Remplacer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={retirer}
                disabled={enCours}
                className="text-muted-foreground"
              >
                Retirer
              </Button>
            </div>
          )}
        </div>

        <div className="bg-muted/40 relative h-[26rem] sm:h-[32rem]">
          <Visionneuse
            url={url}
            vue={vue}
            surSelection={(id) => {
              setSelection(id)
              if (id) setOnglet('detail')
            }}
            surChargement={(r) => setChargement(r.ok ? null : r.message)}
            libelle={`Maquette du bâtiment${date ? ` au ${dateLongue(date)}` : ''}, colorée selon l’avancement. Le détail est donné dans le panneau voisin.`}
          />
          {chargement && (
            <p
              role="alert"
              className="bg-card absolute inset-x-4 top-4 rounded-xl px-4 py-3 text-sm font-semibold"
            >
              {chargement}
            </p>
          )}
        </div>

        <div className="border-border/70 space-y-3 border-t px-4 py-3">
          <ul aria-label="Légende des états" className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            {ETATS_LEGENDE.map((e) => {
              const I = ETAT[e].icone
              return (
                <li key={e} className="flex items-center gap-1.5 font-semibold">
                  <span
                    aria-hidden
                    className="size-3 rounded"
                    style={{ background: ETAT[e].couleur }}
                  />
                  <I className={`size-3.5 ${ETAT[e].teinte}`} strokeWidth={2} aria-hidden />
                  {ETAT[e].libelle}
                </li>
              )
            })}
            <li className="text-muted-foreground flex items-center gap-1.5 font-semibold">
              <span aria-hidden className="bg-muted-foreground/30 size-3 rounded" />
              Sans tâche rattachée
            </li>
          </ul>
          {dates.length > 0 && (
            <label className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="flex items-center gap-2 text-sm font-bold">
                <span className="pastille size-7">
                  <Icone.calendrier className="size-3.5" strokeWidth={2.25} aria-hidden />
                </span>
                Rejouer l’avancement
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(0, dates.length - 1)}
                value={rang}
                onChange={(e) => setRang(Number(e.target.value))}
                className="min-w-48 flex-1"
                aria-valuetext={dateLongue(date)}
              />
              <span className="chiffres-alignes text-sm font-extrabold">{dateCourte(date)}</span>
            </label>
          )}
          <p className="text-muted-foreground text-xs">
            {nomFichier ? `Maquette : ${nomFichier}. ` : ''}Faire glisser pour tourner, clic droit
            ou deux doigts pour se déplacer, molette pour zoomer.
          </p>
        </div>
      </section>

      <section className="surface overflow-hidden" aria-label="Détail de la maquette">
        {editable && (
          <div className="border-border/70 border-b px-4 py-3">
            <div role="tablist" aria-label="Panneau" className="segments w-fit">
              <button
                type="button"
                role="tab"
                aria-selected={onglet === 'detail'}
                onClick={() => setOnglet('detail')}
                className="segment"
              >
                Avancement
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={onglet === 'rattachements'}
                onClick={() => setOnglet('rattachements')}
                className="segment"
              >
                Rattachements
              </button>
            </div>
          </div>
        )}

        {onglet === 'rattachements' && editable ? (
          <Rattachements
            // Nouvelles propositions apres une ecriture : on repart de zero,
            // toutes cochees.
            key={propositions.map((p) => `${p.tacheId}:${p.famille}:${p.niveau}`).join('|')}
            projetId={projetId}
            etages={etages}
            elements={elements}
            regles={regles}
            rattachables={rattachables}
            propositions={propositions}
          />
        ) : element ? (
          <DetailElement
            element={element}
            etat={etatDe(element)}
            taches={(element.groupe ? (groupeParId.get(element.groupe)?.tacheIds ?? []) : [])
              .map((id) => tacheParId.get(id))
              .filter((t): t is TachePlanAffichee => t !== undefined)}
            rang={rang}
            projetId={projetId}
            surFermeture={() => setSelection(null)}
          />
        ) : (
          <div className="px-5 py-4" aria-live="polite">
            <h2 className="text-base font-extrabold">
              {date ? `Au ${dateLongue(date)}` : 'Avancement'}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Cliquer un élément de la maquette pour voir ses tâches.
            </p>
            <ul aria-label="Éléments par état" className="mt-4 space-y-2">
              {[...ETATS_LEGENDE, 'NEUTRE' as const].map((k) => {
                const n = bilan.get(k) ?? 0
                if (n === 0) return null
                return (
                  <li key={k} className="flex items-center gap-3 text-sm">
                    <span
                      aria-hidden
                      className="size-3.5 shrink-0 rounded"
                      style={{
                        background:
                          k === 'NEUTRE' ? 'var(--muted-foreground)' : ETAT[k as Etat].couleur,
                        opacity: k === 'NEUTRE' ? 0.3 : 1,
                      }}
                    />
                    <span className="flex-1 font-semibold">
                      {k === 'NEUTRE' ? 'Sans tâche rattachée' : ETAT[k as Etat].libelle}
                    </span>
                    <span className="chiffres-alignes font-extrabold">{n}</span>
                    <span className="text-muted-foreground w-16 text-right text-xs">
                      élément{n > 1 ? 's' : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
            <h3 className="mt-6 text-sm font-extrabold">Tâches suivies sur la maquette</h3>
            <ul className="divide-border/60 mt-2 divide-y">
              {taches.map((t) => {
                const [reel, , etat] = t.serie[rang] ?? [0, 0, 'NON_COMMENCE']
                const I = ETAT[etat].icone
                return (
                  <li key={t.id} className="flex items-center gap-2.5 py-2 text-sm">
                    <I
                      className={`size-4 shrink-0 ${ETAT[etat].teinte}`}
                      strokeWidth={2.25}
                      aria-hidden
                    />
                    <span className="text-muted-foreground font-mono text-xs">{t.codeWbs}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{t.nom}</span>
                    <span className="chiffres-alignes font-bold">{pourcent(reel, 0)}</span>
                    <span className="sr-only">{ETAT[etat].libelle}</span>
                  </li>
                )
              })}
              {taches.length === 0 && (
                <li className="text-muted-foreground py-3 text-sm">
                  Aucune tâche rattachée à la maquette pour l’instant.
                </li>
              )}
            </ul>
          </div>
        )}
      </section>

      {importOuvert && (
        <ImportMaquette projetId={projetId} remplace surFermeture={() => setImportOuvert(false)} />
      )}
    </div>
  )
}

function DetailElement({
  element,
  etat,
  taches,
  rang,
  projetId,
  surFermeture,
}: {
  element: ElementAffiche
  etat: Etat | null
  taches: TachePlanAffichee[]
  rang: number
  projetId: string
  surFermeture: () => void
}) {
  return (
    <div aria-live="polite">
      <div className="border-border/70 flex items-start gap-3 border-b px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-xs font-bold uppercase">
            {FAMILLES[element.famille]}
            {element.etage ? ` · ${element.etage}` : ''}
          </p>
          <h2 className="mt-0.5 text-base leading-snug font-extrabold">
            {element.nom ?? 'Élément sans nom'}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
            {etat ? (
              <>
                <span
                  aria-hidden
                  className="size-3 rounded"
                  style={{ background: ETAT[etat].couleur }}
                />
                {ETAT[etat].libelle}
              </>
            ) : (
              <span className="text-muted-foreground">Aucune tâche rattachée</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={surFermeture}
          aria-label="Fermer le détail"
          className="hover:bg-muted grid size-8 place-items-center rounded-lg"
        >
          <Icone.fermer className="size-4" aria-hidden />
        </button>
      </div>
      <ul className="divide-border/60 divide-y">
        {taches.map((t) => {
          const [reel, prevu, e] = t.serie[rang] ?? [0, 0, 'NON_COMMENCE']
          const I = ETAT[e].icone
          return (
            <li key={t.id} className="px-5 py-3">
              <Link
                href={`/projet/${projetId}/lot/${t.lotId}`}
                className="text-[0.9375rem] font-bold hover:underline"
              >
                <span className="text-muted-foreground mr-1.5 font-mono text-xs font-medium">
                  {t.codeWbs}
                </span>
                {t.nom}
              </Link>
              <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                <span className="text-foreground flex items-center gap-1 font-bold">
                  <I className={`size-3.5 ${ETAT[e].teinte}`} strokeWidth={2.25} aria-hidden />
                  {ETAT[e].libelle}
                </span>
                <span className="chiffres-alignes">
                  {pourcent(reel, 0)} réalisés, {pourcent(prevu, 0)} prévus
                </span>
                <span>
                  du {dateCourte(t.dateDebutPrevue)} au {dateCourte(t.dateFinPrevue)}
                </span>
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Rattachements({
  projetId,
  etages,
  elements,
  regles,
  rattachables,
  propositions,
}: {
  projetId: string
  etages: Etage[]
  elements: ElementAffiche[]
  regles: RegleAffichee[]
  rattachables: TacheRattachable[]
  propositions: Proposition[]
}) {
  const router = useRouter()
  const [enCours, demarrer] = useTransition()
  const [retenues, setRetenues] = useState<Set<number>>(
    () => new Set(propositions.map((_, i) => i)),
  )
  const [nouvelle, setNouvelle] = useState({
    tacheId: '',
    famille: 'MURS' as Famille,
    niveau: '' as string,
    nomContient: '',
  })
  const tacheParId = useMemo(() => new Map(rattachables.map((t) => [t.id, t])), [rattachables])

  const apercu = useMemo(() => {
    const mot = nouvelle.nomContient.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    return elements.filter(
      (e) =>
        e.famille === nouvelle.famille &&
        (nouvelle.niveau === '' || e.niveau === Number(nouvelle.niveau)) &&
        (mot === '' ||
          (e.nom ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').includes(mot)),
    ).length
  }, [elements, nouvelle])

  const executer = (f: () => Promise<{ ok: boolean; message: string }>) =>
    demarrer(async () => {
      const r = await f()
      if (r.ok) toast.success(r.message)
      else toast.error(r.message)
      router.refresh()
    })

  const libelleEtage = (n: number | null) =>
    n === null ? 'tous les étages' : (etages.find((e) => e.niveau === n)?.nom ?? libelleNiveau(n))

  return (
    <div className="divide-border/70 divide-y">
      {propositions.length > 0 && (
        <div className="space-y-3 px-5 py-4">
          <h2 className="text-base font-extrabold">
            {propositions.length} rattachement{propositions.length > 1 ? 's' : ''} proposé
            {propositions.length > 1 ? 's' : ''}
          </h2>
          <p className="text-muted-foreground text-sm">
            D’après le nom des tâches et celui des éléments de la maquette. Vérifier, décocher au
            besoin, puis ajouter.
          </p>
          <ul className="border-border/70 max-h-64 overflow-y-auto rounded-xl border">
            {propositions.map((p, i) => {
              const t = tacheParId.get(p.tacheId)
              return (
                <li key={i} className="border-border/50 border-b last:border-b-0">
                  <label className="hover:bg-muted/60 flex cursor-pointer items-start gap-2.5 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={retenues.has(i)}
                      onChange={() => {
                        const s = new Set(retenues)
                        if (s.has(i)) s.delete(i)
                        else s.add(i)
                        setRetenues(s)
                      }}
                      className="mt-0.5 size-4 shrink-0"
                    />
                    <span className="min-w-0 text-sm leading-snug">
                      <span className="text-muted-foreground mr-1.5 font-mono text-xs">
                        {t?.codeWbs}
                      </span>
                      <span className="font-semibold">{t?.nom}</span>
                      <span className="text-muted-foreground block text-xs">
                        {FAMILLES[p.famille]}, {libelleEtage(p.niveau)}
                        {p.nomContient ? `, nom contenant « ${p.nomContient} »` : ''} : {p.elements}{' '}
                        élément{p.elements > 1 ? 's' : ''}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <Button
            disabled={enCours || retenues.size === 0}
            onClick={() =>
              executer(() =>
                ajouterReglesAction({
                  projetId,
                  regles: propositions
                    .filter((_, i) => retenues.has(i))
                    .map(({ tacheId, famille, niveau, nomContient }) => ({
                      tacheId,
                      famille,
                      niveau,
                      nomContient,
                    })),
                }),
              )
            }
          >
            Ajouter {retenues.size} rattachement{retenues.size > 1 ? 's' : ''}
          </Button>
        </div>
      )}

      <form
        className="space-y-2.5 px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!nouvelle.tacheId) return
          executer(() =>
            ajouterReglesAction({
              projetId,
              regles: [
                {
                  tacheId: nouvelle.tacheId,
                  famille: nouvelle.famille,
                  niveau: nouvelle.niveau === '' ? null : Number(nouvelle.niveau),
                  nomContient: nouvelle.nomContient.trim() || null,
                },
              ],
            }),
          )
        }}
      >
        <h2 className="text-base font-extrabold">Rattacher une tâche</h2>
        <select
          aria-label="Tâche"
          value={nouvelle.tacheId}
          onChange={(e) => setNouvelle({ ...nouvelle, tacheId: e.target.value })}
          className="champ champ-compact"
        >
          <option value="">Choisir une tâche</option>
          {rattachables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.codeWbs} — {t.nom}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <select
            aria-label="Famille d’ouvrages"
            value={nouvelle.famille}
            onChange={(e) => setNouvelle({ ...nouvelle, famille: e.target.value as Famille })}
            className="champ champ-compact"
          >
            {(Object.keys(FAMILLES) as Famille[]).map((f) => (
              <option key={f} value={f}>
                {FAMILLES[f]}
              </option>
            ))}
          </select>
          <select
            aria-label="Étage"
            value={nouvelle.niveau}
            onChange={(e) => setNouvelle({ ...nouvelle, niveau: e.target.value })}
            className="champ champ-compact"
          >
            <option value="">Tous les étages</option>
            {etages.map((e) => (
              <option key={e.nom} value={e.niveau}>
                {e.nom}
              </option>
            ))}
          </select>
        </div>
        <input
          aria-label="Mot contenu dans le nom des éléments, facultatif"
          placeholder="Mot du nom des éléments (facultatif), par exemple « voile »"
          value={nouvelle.nomContient}
          onChange={(e) => setNouvelle({ ...nouvelle, nomContient: e.target.value })}
          maxLength={60}
          className="champ champ-compact"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm" aria-live="polite">
            <span className="text-foreground font-extrabold">{apercu}</span> élément
            {apercu > 1 ? 's' : ''} concerné{apercu > 1 ? 's' : ''}
          </p>
          <Button
            type="submit"
            variant="outline"
            disabled={enCours || !nouvelle.tacheId || apercu === 0}
          >
            <Icone.ajouter className="size-4" aria-hidden />
            Rattacher
          </Button>
        </div>
      </form>

      <div className="px-5 py-4">
        <h2 className="text-base font-extrabold">
          {regles.length} rattachement{regles.length > 1 ? 's' : ''}
        </h2>
        <ul className="mt-2 space-y-1.5">
          {regles.map((r) => (
            <li key={r.id} className="flex items-start gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="leading-snug">
                  <span className="text-muted-foreground mr-1.5 font-mono text-xs">
                    {r.codeWbs}
                  </span>
                  <span className="font-semibold">{r.nomTache}</span>
                </p>
                <p className="text-muted-foreground text-xs">
                  {FAMILLES[r.famille]}, {libelleEtage(r.niveau)}
                  {r.nomContient ? `, nom contenant « ${r.nomContient} »` : ''} : {r.elements}{' '}
                  élément{r.elements > 1 ? 's' : ''}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Retirer le rattachement de ${r.codeWbs}`}
                disabled={enCours}
                onClick={() => executer(() => supprimerRegleAction({ projetId, regleId: r.id }))}
                className="text-muted-foreground hover:bg-muted grid size-8 shrink-0 place-items-center rounded-lg"
              >
                <Icone.supprimer className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
