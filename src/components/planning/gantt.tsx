'use client'

/**
 * Diagramme de Gantt, en SVG, developpe sur mesure.
 *
 * Toute la geometrie vient de `db/compute/gantt.ts`, testee a part ; ce
 * composant dessine. Organisation de l'ecran :
 *
 *   - un conteneur unique qui defile dans les deux sens ;
 *   - l'echelle de temps collee en haut, l'arborescence collee a gauche ;
 *   - une premiere ligne reservee aux jalons, puis une ligne par element de
 *     la WBS visible.
 *
 * Au-dela de cent lignes, seules celles proches de la vue sont rendues.
 *
 * Le glisser-deposer d'une barre ne modifie rien : il signale un decalage a
 * l'appelant, qui ouvre la simulation. Aucune ecriture avant confirmation.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BANDEAUX,
  dateDuJour,
  debutsDePeriode,
  defilementPourCentrer,
  enAttributPoints,
  fenetre,
  jourAuCentre,
  lignesVisibles,
  PALIERS,
  PIXELS_PAR_JOUR,
  repartirCouloirs,
  tracerLiaison,
  xDeJour,
  type JourneeGrisee,
  type Palier,
} from '@/db/compute/gantt'
import { ETAT } from '@/lib/etats'
import { dateCourte, fcfa, libelleGraduation, pourcent } from '@/lib/format'
import type { DonneesGantt, ElementGantt } from '@/lib/gantt-donnees'
import { Icone } from '@/lib/icones'
import { cn } from '@/lib/utils'
import { CHROME, teinteSerie } from '@/lib/viz'

export const HAUTEUR_LIGNE = 28
const LARGEUR_ARBRE = 300
const HAUTEUR_ENTETE = 48
const LIBELLE_PALIER: Record<Palier, string> = {
  jour: 'Jour',
  semaine: 'Semaine',
  mois: 'Mois',
  trimestre: 'Trimestre',
}

export type ProprietesGantt = {
  donnees: DonneesGantt
  grisees: readonly JourneeGrisee[]
  palierInitial?: Palier
  hauteur?: number
  /** Barres de reference, dessinees en pointilles : la superposition de la simulation. */
  fantomes?: Readonly<Record<string, { debut: number; fin: number }>>
  selection?: string | null
  surSelection?: (id: string) => void
  /** Present : les barres se deplacent a la souris, et le decalage est signale ici. */
  surDeplacement?: (id: string, decalageJ: number) => void
}

type Survol = { id: string; x: number; y: number }

function isoDuJour(origine: string, jour: number): string {
  return dateDuJour(origine, jour).toISOString().slice(0, 10)
}

export function Gantt({
  donnees,
  grisees,
  palierInitial = 'semaine',
  hauteur = 640,
  fantomes,
  selection = null,
  surSelection,
  surDeplacement,
}: ProprietesGantt) {
  const conteneur = useRef<HTMLDivElement>(null)
  const [palier, setPalier] = useState<Palier>(palierInitial)
  const [replies, setReplies] = useState<ReadonlySet<string>>(() => new Set())
  const [defilement, setDefilement] = useState({ haut: 0, vue: hauteur })
  const [survol, setSurvol] = useState<Survol | null>(null)
  const [glisse, setGlisse] = useState<{ id: string; origineX: number; decalage: number } | null>(
    null,
  )
  const centreEnAttente = useRef<number | null>(null)

  const ppj = PIXELS_PAR_JOUR[palier]
  const largeur = Math.ceil(xDeJour(donnees.nombreJours, palier))
  const parId = useMemo(() => new Map(donnees.elements.map((e) => [e.id, e])), [donnees.elements])

  /* --- Lignes visibles ------------------------------------------------------ */

  const lignes = useMemo(
    () => lignesVisibles(donnees.elements, replies),
    [donnees.elements, replies],
  )
  // La ligne 0 porte les jalons ; les elements commencent a la ligne 1.
  const rangParId = useMemo(() => new Map(lignes.map((l, i) => [l.id, i + 1])), [lignes])
  const totalLignes = lignes.length + 1
  const hauteurCorps = totalLignes * HAUTEUR_LIGNE
  const { debut: premiere, fin: derniere } = fenetre(
    defilement.haut,
    defilement.vue,
    HAUTEUR_LIGNE,
    totalLignes,
  )
  const rendues = lignes.slice(Math.max(0, premiere - 1), Math.max(0, derniere - 1))

  /* --- Defilement et zoom --------------------------------------------------- */

  const largeurVue = () => (conteneur.current?.clientWidth ?? 1000) - LARGEUR_ARBRE

  const centrerSur = useCallback(
    (jour: number, p: Palier) => {
      const c = conteneur.current
      if (!c) return
      c.scrollLeft = defilementPourCentrer(
        jour,
        p,
        largeurVue(),
        Math.ceil(xDeJour(donnees.nombreJours, p)),
      )
    },
    [donnees.nombreJours],
  )

  // Premier affichage : la date du jour au centre, a defaut la fin. La page
  // arrive en flux : au montage, le Gantt peut encore etre masque sous l'ecran
  // de chargement, sans largeur. On attend qu'il en ait une.
  useEffect(() => {
    let essais = 0
    let tache = 0
    const tenter = () => {
      const c = conteneur.current
      if (c && c.clientWidth > LARGEUR_ARBRE && c.scrollWidth > c.clientWidth) {
        centrerSur(donnees.aujourdhui ?? donnees.finContractuelle, palier)
        return
      }
      if (essais++ < 60) tache = requestAnimationFrame(tenter)
    }
    tenter()
    return () => cancelAnimationFrame(tache)
    // Une seule fois, au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apres un changement de palier, recentrer sur la journee qui etait au centre.
  useLayoutEffect(() => {
    if (centreEnAttente.current === null) return
    centrerSur(centreEnAttente.current, palier)
    centreEnAttente.current = null
  }, [palier, centrerSur])

  function changerPalier(p: Palier) {
    const c = conteneur.current
    if (c) centreEnAttente.current = jourAuCentre(c.scrollLeft, largeurVue(), palier)
    setPalier(p)
  }

  const image = useRef<number | null>(null)
  function surDefilement() {
    if (image.current !== null) return
    image.current = requestAnimationFrame(() => {
      image.current = null
      const c = conteneur.current
      if (c) setDefilement({ haut: c.scrollTop, vue: c.clientHeight - HAUTEUR_ENTETE })
    })
  }
  useEffect(
    () => () => {
      if (image.current !== null) cancelAnimationFrame(image.current)
    },
    [],
  )

  /* --- Geometrie des barres ------------------------------------------------- */

  const yCentre = (rang: number) => rang * HAUTEUR_LIGNE + HAUTEUR_LIGNE / 2
  const barre = (e: ElementGantt) => {
    const decalage = glisse?.id === e.id ? glisse.decalage : 0
    return { x0: xDeJour(e.debut + decalage, palier), x1: xDeJour(e.fin + 1 + decalage, palier) }
  }

  /* --- Liaisons ------------------------------------------------------------- */

  const traces = useMemo(() => {
    const hautVisible = premiere * HAUTEUR_LIGNE
    const basVisible = derniere * HAUTEUR_LIGNE
    const candidates = donnees.liaisons
      .map((l) => {
        const ra = rangParId.get(l.amontId)
        const rv = rangParId.get(l.avalId)
        const a = parId.get(l.amontId)
        const v = parId.get(l.avalId)
        if (ra === undefined || rv === undefined || !a || !v) return null
        const y0 = Math.min(yCentre(ra), yCentre(rv))
        const y1 = Math.max(yCentre(ra), yCentre(rv))
        if (y1 < hautVisible || y0 > basVisible) return null
        const points = tracerLiaison(
          { ...barre(a), y: yCentre(ra) },
          { ...barre(v), y: yCentre(rv) },
          l.type,
          HAUTEUR_LIGNE,
        )
        return { liaison: l, source: l.amontId, points }
      })
      .filter((x) => x !== null)
    const reparties = repartirCouloirs(candidates)
    return candidates.map((c, i) => ({ ...c, points: reparties[i] ?? c.points }))
    // `barre` depend de palier et glisse, deja dans les dependances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donnees.liaisons, rangParId, parId, palier, glisse, premiere, derniere])

  /* --- Glisser-deposer ------------------------------------------------------- */

  function debuterGlisse(e: React.PointerEvent, id: string) {
    if (!surDeplacement) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setGlisse({ id, origineX: e.clientX, decalage: 0 })
  }
  function poursuivreGlisse(e: React.PointerEvent) {
    if (!glisse) return
    const decalage = Math.round((e.clientX - glisse.origineX) / ppj)
    if (decalage !== glisse.decalage) setGlisse({ ...glisse, decalage })
  }
  function terminerGlisse() {
    if (!glisse) return
    const { id, decalage } = glisse
    setGlisse(null)
    if (decalage !== 0) surDeplacement?.(id, decalage)
    else surSelection?.(id)
  }

  /* --- Echelle ---------------------------------------------------------------- */

  const bandeaux = BANDEAUX[palier]
  const majeures = useMemo(
    () => debutsDePeriode(donnees.origine, donnees.nombreJours, bandeaux.majeure),
    [donnees.origine, donnees.nombreJours, bandeaux.majeure],
  )
  const mineures = useMemo(
    () => debutsDePeriode(donnees.origine, donnees.nombreJours, bandeaux.mineure),
    [donnees.origine, donnees.nombreJours, bandeaux.mineure],
  )

  const critiques = donnees.elements.filter((e) => e.critique).length
  const elementSurvole = survol ? parId.get(survol.id) : undefined

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Échelle de temps" className="segments">
          {PALIERS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={palier === p}
              onClick={() => changerPalier(p)}
              className="segment"
            >
              {LIBELLE_PALIER[p]}
            </button>
          ))}
        </div>
        {donnees.aujourdhui !== null && (
          <button
            type="button"
            onClick={() => centrerSur(donnees.aujourdhui ?? 0, palier)}
            className="relief bg-card border-input hover:bg-muted h-10 rounded-xl border-2 px-3.5 text-sm font-bold [--relief:var(--input)]"
          >
            Aujourd’hui
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            setReplies(
              replies.size > 0
                ? new Set()
                : new Set(donnees.elements.filter((e) => e.genre === 'lot').map((e) => e.id)),
            )
          }
          className="relief bg-card border-input hover:bg-muted h-10 rounded-xl border-2 px-3.5 text-sm font-bold [--relief:var(--input)]"
        >
          {replies.size > 0 ? 'Tout déplier' : 'Tout replier'}
        </button>
        <Legende />
      </div>

      <div
        ref={conteneur}
        onScroll={surDefilement}
        className="bg-background relative overflow-auto rounded-xl border"
        style={{ height: hauteur }}
      >
        <div className="relative" style={{ width: LARGEUR_ARBRE + largeur }}>
          {/* --- Entete ------------------------------------------------------ */}
          <div className="sticky top-0 z-20 flex" style={{ height: HAUTEUR_ENTETE }}>
            <div
              className="bg-background border-border sticky left-0 z-30 flex items-end border-r border-b px-3 pb-1.5 text-xs font-medium"
              style={{ width: LARGEUR_ARBRE, minWidth: LARGEUR_ARBRE }}
            >
              Tâche
            </div>
            <svg
              width={largeur}
              height={HAUTEUR_ENTETE}
              className="bg-background border-border border-b"
              aria-hidden
            >
              {majeures.map((g) => (
                <g key={`M${g.jour}`}>
                  <line
                    x1={xDeJour(g.jour, palier)}
                    x2={xDeJour(g.jour, palier)}
                    y1={0}
                    y2={22}
                    stroke={CHROME.grille}
                  />
                  <text
                    x={xDeJour(g.jour, palier) + 4}
                    y={15}
                    fontSize={11}
                    fill={CHROME.encrePrimaire}
                  >
                    {libelleGraduation(g.date, bandeaux.majeure, 'majeure')}
                  </text>
                </g>
              ))}
              {mineures.map((g) => (
                <g key={`m${g.jour}`}>
                  <line
                    x1={xDeJour(g.jour, palier)}
                    x2={xDeJour(g.jour, palier)}
                    y1={22}
                    y2={HAUTEUR_ENTETE}
                    stroke={CHROME.grille}
                  />
                  <text
                    x={xDeJour(g.jour, palier) + 3}
                    y={39}
                    fontSize={10}
                    fill={CHROME.encreSecondaire}
                  >
                    {libelleGraduation(g.date, bandeaux.mineure, 'mineure')}
                  </text>
                </g>
              ))}
              <line x1={0} x2={largeur} y1={22} y2={22} stroke={CHROME.grille} />
            </svg>
          </div>

          {/* --- Corps ------------------------------------------------------- */}
          <div className="flex">
            <div
              className="bg-background border-border sticky left-0 z-10 border-r"
              style={{ width: LARGEUR_ARBRE, minWidth: LARGEUR_ARBRE, height: hauteurCorps }}
            >
              <div
                className="text-muted-foreground absolute flex items-center gap-1.5 px-3 text-xs"
                style={{ top: 0, height: HAUTEUR_LIGNE }}
              >
                <Icone.jalon className="size-3.5" aria-hidden />
                Jalons
              </div>
              {rendues.map((l) => {
                const e = parId.get(l.id)
                if (!e) return null
                const rang = rangParId.get(l.id) ?? 0
                return (
                  <div
                    key={l.id}
                    className={cn(
                      'absolute flex w-full items-center gap-1 pr-2 text-xs',
                      e.genre !== 'tache' && 'font-medium',
                      selection === e.id && 'bg-accent',
                    )}
                    style={{
                      top: rang * HAUTEUR_LIGNE,
                      height: HAUTEUR_LIGNE,
                      paddingLeft: 8 + l.profondeur * 14,
                    }}
                  >
                    {l.aEnfants ? (
                      <button
                        type="button"
                        aria-expanded={!replies.has(l.id)}
                        aria-label={`${replies.has(l.id) ? 'Déplier' : 'Replier'} ${e.nom}`}
                        onClick={() => {
                          const s = new Set(replies)
                          if (s.has(l.id)) s.delete(l.id)
                          else s.add(l.id)
                          setReplies(s)
                        }}
                        className="hover:bg-accent grid size-5 shrink-0 place-items-center rounded"
                      >
                        <Icone.deplier
                          className={cn(
                            'size-3.5 transition-transform',
                            !replies.has(l.id) && 'rotate-90',
                          )}
                        />
                      </button>
                    ) : (
                      <span className="size-5 shrink-0" />
                    )}
                    {e.genre === 'lot' && (
                      <span
                        aria-hidden
                        className="h-3 w-1 shrink-0 rounded-full"
                        style={{ background: teinteSerie(e.rangCouleur) }}
                      />
                    )}
                    <span className="text-muted-foreground shrink-0 font-mono text-[0.6875rem]">
                      {e.codeWbs}
                    </span>
                    {/* L'etat critique est porte par une marque, le nom reste a
                        l'encre : le rouge d'etat est trop peu contraste pour
                        un texte courant. */}
                    {e.critique && (
                      <ETAT.CRITIQUE.icone
                        className={cn('size-3 shrink-0', ETAT.CRITIQUE.teinte)}
                        strokeWidth={2}
                        role="img"
                        aria-label="Critique"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => surSelection?.(e.id)}
                      className={cn('min-w-0 truncate text-left', e.critique && 'font-medium')}
                      title={e.critique ? `${e.nom}, sur le chemin critique` : e.nom}
                    >
                      {e.nom}
                    </button>
                  </div>
                )
              })}
            </div>

            <svg
              width={largeur}
              height={hauteurCorps}
              // Groupe et non image : les barres se manipulent, et une image
              // ne peut pas contenir d'elements interactifs.
              role="group"
              aria-label={`Diagramme de Gantt : ${donnees.elements.filter((e) => e.genre === 'tache').length} tâches, dont ${critiques} critiques`}
              onPointerMove={poursuivreGlisse}
              onPointerUp={terminerGlisse}
              onPointerLeave={() => setSurvol(null)}
              className="select-none"
            >
              <defs>
                <pattern
                  id="hachure-chome"
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="6"
                    stroke={ETAT.NON_TRAVAILLE.couleur}
                    strokeWidth="3"
                  />
                </pattern>
                <marker
                  id="fleche"
                  viewBox="0 0 6 6"
                  refX="5"
                  refY="3"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M0,0 L6,3 L0,6 z" fill={CHROME.encreSecondaire} />
                </marker>
                <marker
                  id="fleche-critique"
                  viewBox="0 0 6 6"
                  refX="5"
                  refY="3"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M0,0 L6,3 L0,6 z" fill={ETAT.CRITIQUE.couleur} />
                </marker>
              </defs>

              {/* Journees non travaillables, avec leur cause au survol. */}
              {grisees.map((g) => (
                <rect
                  key={`g${g.jour}`}
                  x={xDeJour(g.jour, palier)}
                  y={0}
                  width={Math.max(1, ppj)}
                  height={hauteurCorps}
                  fill="url(#hachure-chome)"
                  opacity={0.55}
                >
                  <title>{`${dateCourte(isoDuJour(donnees.origine, g.jour))} : ${g.cause}`}</title>
                </rect>
              ))}

              {mineures.map((g) => (
                <line
                  key={`q${g.jour}`}
                  x1={xDeJour(g.jour, palier)}
                  x2={xDeJour(g.jour, palier)}
                  y1={0}
                  y2={hauteurCorps}
                  stroke={CHROME.grille}
                  strokeWidth={0.5}
                />
              ))}
              <line
                x1={0}
                x2={largeur}
                y1={HAUTEUR_LIGNE}
                y2={HAUTEUR_LIGNE}
                stroke={CHROME.grille}
              />

              {/* Fin contractuelle. */}
              <line
                x1={xDeJour(donnees.finContractuelle + 1, palier)}
                x2={xDeJour(donnees.finContractuelle + 1, palier)}
                y1={0}
                y2={hauteurCorps}
                stroke={CHROME.encreSecondaire}
                strokeDasharray="4 4"
              >
                <title>Fin contractuelle</title>
              </line>

              {/* Jalons, sur la premiere ligne. */}
              {donnees.jalons.map((j) => {
                const x = xDeJour(j.jourPrevu + 1, palier)
                return (
                  <g key={j.id}>
                    <path
                      d={`M${x},${yCentre(0) - 7} l7,7 l-7,7 l-7,-7 z`}
                      fill={j.contractuel ? CHROME.encrePrimaire : 'var(--background)'}
                      stroke={CHROME.encrePrimaire}
                      strokeWidth={1.5}
                    >
                      <title>
                        {`${j.nom}${j.contractuel ? ' (contractuel)' : ''} — prévu le ${dateCourte(j.datePrevue)}${
                          j.dateReelle ? `, atteint le ${dateCourte(j.dateReelle)}` : ''
                        }`}
                      </title>
                    </path>
                    {j.jourReel !== null && (
                      <path
                        d={`M${xDeJour(j.jourReel + 1, palier)},${yCentre(0) - 4} l4,4 l-4,4 l-4,-4 z`}
                        fill={ETAT.ACHEVE.couleur}
                      >
                        <title>{`${j.nom} : atteint le ${dateCourte(j.dateReelle ?? '')}`}</title>
                      </path>
                    )}
                  </g>
                )
              })}

              {/* Liaisons, les critiques au-dessus. */}
              {[...traces]
                .sort((a, b) => Number(a.liaison.critique) - Number(b.liaison.critique))
                .map((t) => (
                  <polyline
                    key={t.liaison.id}
                    points={enAttributPoints(t.points)}
                    fill="none"
                    stroke={t.liaison.critique ? ETAT.CRITIQUE.couleur : CHROME.encreDiscrete}
                    strokeWidth={t.liaison.critique ? 1.5 : 1}
                    markerEnd={`url(#${t.liaison.critique ? 'fleche-critique' : 'fleche'})`}
                  />
                ))}

              {/* Barres. */}
              {rendues.map((l) => {
                const e = parId.get(l.id)
                const rang = rangParId.get(l.id)
                if (!e || rang === undefined) return null
                const { x0, x1 } = barre(e)
                const y = rang * HAUTEUR_LIGNE
                const teinte = teinteSerie(e.rangCouleur)
                const fantome = fantomes?.[e.id]

                if (e.genre !== 'tache') {
                  const epaisseur = e.genre === 'lot' ? 6 : 4
                  return (
                    <g key={e.id}>
                      <rect
                        x={x0}
                        y={y + HAUTEUR_LIGNE / 2 - epaisseur / 2}
                        width={Math.max(2, x1 - x0)}
                        height={epaisseur}
                        rx={1}
                        fill={e.genre === 'lot' ? teinte : CHROME.encreSecondaire}
                        opacity={e.genre === 'lot' ? 0.9 : 0.7}
                      />
                    </g>
                  )
                }

                const marge = e.margeTotaleJ ?? 0
                const xMarge = xDeJour(
                  e.fin + 1 + marge + (glisse?.id === e.id ? glisse.decalage : 0),
                  palier,
                )
                return (
                  <g
                    key={e.id}
                    data-tache={e.id}
                    data-critique={e.critique ? 'oui' : 'non'}
                    onPointerEnter={(ev) => setSurvol({ id: e.id, x: ev.clientX, y: ev.clientY })}
                    onPointerMove={(ev) =>
                      !glisse && setSurvol({ id: e.id, x: ev.clientX, y: ev.clientY })
                    }
                    onPointerDown={(ev) => debuterGlisse(ev, e.id)}
                    style={{ cursor: surDeplacement ? 'grab' : 'pointer' }}
                    role="button"
                    aria-label={`${e.codeWbs} ${e.nom}, ${pourcent(e.avancement)} réalisé${e.critique ? ', critique' : ''}`}
                    tabIndex={-1}
                  >
                    {fantome && (
                      <rect
                        x={xDeJour(fantome.debut, palier)}
                        y={y + 4}
                        width={Math.max(
                          2,
                          xDeJour(fantome.fin + 1, palier) - xDeJour(fantome.debut, palier),
                        )}
                        height={HAUTEUR_LIGNE - 8}
                        rx={3}
                        fill="none"
                        stroke={CHROME.encreSecondaire}
                        strokeDasharray="3 3"
                      />
                    )}
                    {marge > 0 && (
                      <line
                        x1={x1}
                        x2={xMarge}
                        y1={y + HAUTEUR_LIGNE / 2}
                        y2={y + HAUTEUR_LIGNE / 2}
                        stroke={CHROME.encreDiscrete}
                        strokeWidth={1}
                      />
                    )}
                    <rect
                      x={x0}
                      y={y + 7}
                      width={Math.max(2, x1 - x0)}
                      height={HAUTEUR_LIGNE - 14}
                      rx={3}
                      fill={teinte}
                      fillOpacity={0.3}
                      stroke={e.critique ? ETAT.CRITIQUE.couleur : teinte}
                      strokeWidth={e.critique ? 2 : 1}
                    />
                    {e.avancement > 0 && (
                      <rect
                        x={x0}
                        y={y + HAUTEUR_LIGNE / 2 - 3}
                        width={Math.max(1, (x1 - x0) * Math.min(1, e.avancement))}
                        height={6}
                        rx={1.5}
                        fill={teinte}
                      />
                    )}
                    {selection === e.id && (
                      <rect
                        x={x0 - 3}
                        y={y + 3}
                        width={x1 - x0 + 6}
                        height={HAUTEUR_LIGNE - 6}
                        rx={5}
                        fill="none"
                        stroke={CHROME.encrePrimaire}
                        strokeWidth={1}
                      />
                    )}
                    {glisse?.id === e.id && glisse.decalage !== 0 && (
                      <text
                        x={x1 + 6}
                        y={y + HAUTEUR_LIGNE / 2 + 4}
                        fontSize={11}
                        fontWeight={600}
                        fill={CHROME.encrePrimaire}
                      >
                        {`${glisse.decalage > 0 ? '+' : ''}${glisse.decalage} j`}
                      </text>
                    )}
                  </g>
                )
              })}

              {donnees.aujourdhui !== null && (
                <line
                  x1={xDeJour(donnees.aujourdhui, palier)}
                  x2={xDeJour(donnees.aujourdhui, palier)}
                  y1={0}
                  y2={hauteurCorps}
                  stroke={ETAT.EN_RETARD.couleur}
                  strokeWidth={1.5}
                >
                  <title>Aujourd’hui</title>
                </line>
              )}
            </svg>
          </div>
        </div>

        {elementSurvole && survol && !glisse && (
          <Infobulle element={elementSurvole} origine={donnees.origine} x={survol.x} y={survol.y} />
        )}
      </div>
    </div>
  )
}

function Infobulle({
  element: e,
  origine,
  x,
  y,
}: {
  element: ElementGantt
  origine: string
  x: number
  y: number
}) {
  const ligne = (terme: string, valeur: string) => (
    <div className="flex justify-between gap-6">
      <dt className="text-muted-foreground">{terme}</dt>
      <dd className="chiffres-alignes text-right">{valeur}</dd>
    </div>
  )
  return (
    <div
      role="tooltip"
      className="bg-popover text-popover-foreground pointer-events-none fixed z-50 w-72 rounded-lg border px-3 py-2 text-xs shadow-md"
      style={{
        left: Math.min(x + 14, (typeof window === 'undefined' ? 9999 : window.innerWidth) - 300),
        top: y + 14,
      }}
    >
      <p className="font-medium">
        <span className="text-muted-foreground mr-1.5 font-mono">{e.codeWbs}</span>
        {e.nom}
      </p>
      {e.critique && (
        <p className="mt-0.5 flex items-center gap-1">
          <ETAT.CRITIQUE.icone className={cn('size-3.5', ETAT.CRITIQUE.teinte)} aria-hidden />
          Sur le chemin critique
        </p>
      )}
      <dl className="mt-1.5 space-y-0.5">
        {ligne(
          'Prévu',
          `${dateCourte(isoDuJour(origine, e.debut))} au ${dateCourte(isoDuJour(origine, e.fin))}`,
        )}
        {e.debutTot &&
          e.finTot &&
          ligne('Au plus tôt', `${dateCourte(e.debutTot)} au ${dateCourte(e.finTot)}`)}
        {e.debutTard &&
          e.finTard &&
          ligne('Au plus tard', `${dateCourte(e.debutTard)} au ${dateCourte(e.finTard)}`)}
        {e.margeTotaleJ !== null && ligne('Marge totale', `${e.margeTotaleJ} j`)}
        {e.margeLibreJ !== null && ligne('Marge libre', `${e.margeLibreJ} j`)}
        {e.debutReel &&
          ligne(
            'Réel',
            `${dateCourte(e.debutReel)}${e.finReelle ? ` au ${dateCourte(e.finReelle)}` : ', en cours'}`,
          )}
        {ligne('Avancement', pourcent(e.avancement))}
        {ligne('Budget', fcfa(e.budgetXof))}
        {ligne('Valeur acquise', fcfa(e.valeurAcquiseXof))}
        {e.contrainte && ligne('Contrainte', 'début imposé')}
      </dl>
    </div>
  )
}

function Legende() {
  return (
    <ul className="text-muted-foreground ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <li className="flex items-center gap-1.5">
        <svg width="22" height="10" aria-hidden>
          <rect
            x="1"
            y="1"
            width="20"
            height="8"
            rx="2"
            fill="none"
            stroke={ETAT.CRITIQUE.couleur}
            strokeWidth="2"
          />
        </svg>
        Chemin critique
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="22" height="10" aria-hidden>
          <line x1="0" x2="22" y1="5" y2="5" stroke={CHROME.encreDiscrete} />
        </svg>
        Marge totale
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="14" height="14" aria-hidden>
          <path d="M7,0 l7,7 l-7,7 l-7,-7 z" fill={CHROME.encrePrimaire} />
        </svg>
        Jalon contractuel
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="14" height="14" aria-hidden>
          <path
            d="M7,1 l6,6 l-6,6 l-6,-6 z"
            fill="none"
            stroke={CHROME.encrePrimaire}
            strokeWidth="1.5"
          />
        </svg>
        Jalon interne
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="14" height="12" aria-hidden>
          <rect width="14" height="12" fill={ETAT.NON_TRAVAILLE.couleur} />
        </svg>
        Non travaillé
      </li>
    </ul>
  )
}
