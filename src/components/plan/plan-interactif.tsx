'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  enregistrerZoneAction,
  retirerPlanAction,
  supprimerZoneAction,
} from '@/app/(app)/projet/[id]/plan/actions'
import { EditeurZone, type ZoneEnEdition } from '@/components/plan/editeur-zone'
import { ImportPlan } from '@/components/plan/import-plan'
import { Button } from '@/components/ui/button'
import type { TacheRattachable } from '@/db/queries/plan'
import { ETAT, type Etat } from '@/lib/etats'
import { dateCourte, dateLongue, pourcent } from '@/lib/format'
import { Icone } from '@/lib/icones'
import { cadreComplet, deplacer, niveauZoom, zoomer, ZOOM_MAX, type Cadre } from '@/lib/plan/cadre'
import {
  centre,
  GABARIT_SANS_PLAN,
  libelleNiveau,
  lirePolygone,
  type Gabarit,
  type Point,
} from '@/lib/plan/zones'

/** Etat d'une zone ou d'une tache a un jour echantillonne : reel, prevu, etat. */
export type Releve3 = [number, number, Etat]

export type ZonePlan = {
  id: string
  nom: string
  niveau: number
  pathSvg: string
  tacheIds: string[]
  /** Un element par date du curseur. */
  serie: Releve3[]
}

export type TachePlanAffichee = {
  id: string
  codeWbs: string
  nom: string
  lotId: string
  dateDebutPrevue: string
  dateFinPrevue: string
  critique: boolean
  serie: Releve3[]
}

export type PlanAffiche = {
  niveau: number
  url: string
  largeur: number
  hauteur: number
  nomFichier: string
  importeLe: string
}

const ETATS_LEGENDE: Etat[] = ['NON_COMMENCE', 'EN_COURS', 'EN_RETARD', 'CRITIQUE', 'ACHEVE']

/** Deplacement minimal, en pixels d'ecran, pour qu'un appui devienne un glissement. */
const SEUIL_GLISSEMENT = 4

export function PlanInteractif({
  projetId,
  dates,
  zones,
  taches,
  plans,
  editable,
  rattachables,
}: {
  projetId: string
  dates: string[]
  zones: ZonePlan[]
  taches: TachePlanAffichee[]
  plans: PlanAffiche[]
  editable: boolean
  rattachables: TacheRattachable[]
}) {
  const router = useRouter()
  const niveaux = useMemo(
    () =>
      [...new Set([...zones.map((z) => z.niveau), ...plans.map((p) => p.niveau)])].sort(
        (a, b) => a - b,
      ),
    [zones, plans],
  )
  const [niveau, setNiveau] = useState(niveaux[0] ?? 0)
  const [rang, setRang] = useState(Math.max(0, dates.length - 1))
  const [choisie, setChoisie] = useState<string | null>(null)
  const [modeEdition, setModeEdition] = useState(false)
  const [edition, setEdition] = useState<ZoneEnEdition | null>(null)
  const [importOuvert, setImportOuvert] = useState(false)
  const [enCours, demarrer] = useTransition()

  const plan = plans.find((p) => p.niveau === niveau) ?? null
  const gabarit: Gabarit = plan ?? GABARIT_SANS_PLAN
  // Le cadre vaut pour un niveau et un plan donnes : en changer montre tout le plan.
  const cle = `${niveau}:${gabarit.largeur}x${gabarit.hauteur}`
  const [etatCadre, setEtatCadre] = useState<{ cle: string; cadre: Cadre }>({
    cle,
    cadre: cadreComplet(gabarit),
  })
  const cadre = etatCadre.cle === cle ? etatCadre.cadre : cadreComplet(gabarit)
  const setCadre = useCallback(
    (suivant: Cadre | ((c: Cadre) => Cadre)) =>
      setEtatCadre((e) => {
        const actuel = e.cle === cle ? e.cadre : cadreComplet(gabarit)
        return { cle, cadre: typeof suivant === 'function' ? suivant(actuel) : suivant }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cle],
  )
  const [largeurPx, setLargeurPx] = useState(800)
  const [survol, setSurvol] = useState<Point | null>(null)

  const svg = useRef<SVGSVGElement>(null)
  const appui = useRef<{
    x: number
    y: number
    cadre: Cadre
    glisse: boolean
    sommet: number | null
  } | null>(null)
  const aGlisse = useRef(false)

  useEffect(() => {
    const el = svg.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => e && setLargeurPx(e.contentRect.width || 800))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /** Unites du plan par pixel d'ecran : etiquettes et poignees gardent leur taille. */
  const unite = cadre.l / Math.max(1, largeurPx)

  const versPlan = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const el = svg.current
      const m = el?.getScreenCTM()
      if (!el || !m) return null
      const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse())
      return [
        Math.min(gabarit.largeur, Math.max(0, p.x)),
        Math.min(gabarit.hauteur, Math.max(0, p.y)),
      ]
    },
    [gabarit.largeur, gabarit.hauteur],
  )

  // Zoom a la molette, Ctrl ou geste de pincement : la page continue de defiler sinon.
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const surMolette = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const p = versPlan(e.clientX, e.clientY)
      if (p) setCadre((c) => zoomer(c, Math.exp(-e.deltaY * 0.0025), p, gabarit))
    }
    el.addEventListener('wheel', surMolette, { passive: false })
    return () => el.removeEventListener('wheel', surMolette)
  }, [versPlan, gabarit, setCadre])

  const visibles = zones.filter((z) => z.niveau === niveau)
  const zone = zones.find((z) => z.id === choisie && z.niveau === niveau) ?? null
  const date = dates[rang] ?? ''
  const trace = edition?.trace === true

  const fermerContour = useCallback(() => {
    setEdition((e) => (e && e.points.length >= 3 ? { ...e, trace: false } : e))
  }, [])

  // Clavier pendant le trace : Entree ferme, Retour arriere retire, Echap annule.
  useEffect(() => {
    if (!trace) return
    const surTouche = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Enter') {
        e.preventDefault()
        fermerContour()
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        setEdition((z) => (z ? { ...z, points: z.points.slice(0, -1) } : z))
      } else if (e.key === 'Escape') {
        setEdition(null)
      }
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [trace, fermerContour])

  function changerNiveau(n: number) {
    setNiveau(n)
    setChoisie(null)
    setEdition(null)
  }

  function editerZone(z: ZonePlan) {
    setChoisie(z.id)
    setEdition({
      id: z.id,
      nom: z.nom,
      tacheIds: z.tacheIds,
      points: lirePolygone(z.pathSvg),
      trace: false,
    })
  }

  function enregistrer() {
    if (!edition) return
    const e = edition
    demarrer(async () => {
      const r = await enregistrerZoneAction({
        projetId,
        ...(e.id ? { id: e.id } : {}),
        nom: e.nom,
        niveau,
        points: e.points,
        tacheIds: e.tacheIds,
      })
      if (!r.ok) {
        toast.error(r.message)
        return
      }
      toast.success(r.message)
      setEdition(null)
      setChoisie(r.id)
      router.refresh()
    })
  }

  function supprimer(id: string, nom: string) {
    if (!window.confirm(`Supprimer la zone « ${nom} » ? Ses tâches ne sont pas touchées.`)) return
    demarrer(async () => {
      const r = await supprimerZoneAction({ projetId, zoneId: id })
      if (!r.ok) {
        toast.error(r.message)
        return
      }
      toast.success(r.message)
      setEdition(null)
      setChoisie(null)
      router.refresh()
    })
  }

  function retirerPlan() {
    if (!window.confirm(`Retirer le plan du niveau ${libelleNiveau(niveau)} ? Les zones restent.`))
      return
    demarrer(async () => {
      const r = await retirerPlanAction({ projetId, niveau })
      if (r.ok) toast.success(r.message)
      else toast.error(r.message)
      router.refresh()
    })
  }

  /* ------------------------------------------------------------------------ */
  /* Pointeur : glisser deplace le plan ou un sommet, cliquer pose un sommet  */
  /* ------------------------------------------------------------------------ */

  function surAppui(e: React.PointerEvent<SVGSVGElement>, sommet: number | null = null) {
    if (e.button !== 0) return
    appui.current = { x: e.clientX, y: e.clientY, cadre, glisse: false, sommet }
    aGlisse.current = false
    if (sommet !== null) {
      e.stopPropagation()
      e.currentTarget.setPointerCapture?.(e.pointerId)
    }
  }

  function surMouvement(e: React.PointerEvent<SVGSVGElement>) {
    if (trace) setSurvol(versPlan(e.clientX, e.clientY))
    const a = appui.current
    if (!a) return
    const dx = e.clientX - a.x
    const dy = e.clientY - a.y
    if (!a.glisse && Math.hypot(dx, dy) < SEUIL_GLISSEMENT) return
    if (!a.glisse) {
      a.glisse = true
      aGlisse.current = true
      svg.current?.setPointerCapture?.(e.pointerId)
    }
    if (a.sommet !== null) {
      const p = versPlan(e.clientX, e.clientY)
      const i = a.sommet
      if (p) {
        setEdition((z) => (z ? { ...z, points: z.points.map((q, j) => (j === i ? p : q)) } : z))
      }
      return
    }
    const k = a.cadre.l / Math.max(1, largeurPx)
    setCadre(deplacer(a.cadre, -dx * k, -dy * k, gabarit))
  }

  function surRelache(e: React.PointerEvent<SVGSVGElement>) {
    const a = appui.current
    appui.current = null
    if (!a || a.glisse || !trace || a.sommet !== null) return
    const p = versPlan(e.clientX, e.clientY)
    if (!p || !edition) return
    const premier = edition.points[0]
    // Un clic pres du premier sommet ferme le contour.
    if (
      premier &&
      edition.points.length >= 3 &&
      Math.hypot(p[0] - premier[0], p[1] - premier[1]) < 10 * unite
    ) {
      fermerContour()
      return
    }
    setEdition({ ...edition, points: [...edition.points, p] })
  }

  const enEdition = modeEdition && editable
  const remplissage = plan ? 0.42 : 0.55
  const pointsEdition = edition?.points ?? []
  const zoom = niveauZoom(cadre, gabarit)
  const zoneEditee = edition?.id ?? null

  return (
    <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section aria-label="Plan de niveau" className="surface overflow-hidden">
        <div className="border-border/70 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div role="group" aria-label="Niveau" className="segments">
            {niveaux.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={n === niveau}
                onClick={() => changerNiveau(n)}
                className="segment"
              >
                {libelleNiveau(n)}
              </button>
            ))}
          </div>
          {editable && (
            <Button
              variant={enEdition ? 'default' : 'outline'}
              size="sm"
              aria-pressed={enEdition}
              onClick={() => {
                setModeEdition(!enEdition)
                setEdition(null)
              }}
            >
              <Icone.modifier className="size-4" aria-hidden />
              {enEdition ? 'Terminer les modifications' : 'Modifier le plan'}
            </Button>
          )}
        </div>

        {enEdition && (
          <div className="bg-marque-douce/60 border-border/70 flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
            <Button size="sm" variant="outline" onClick={() => setImportOuvert(true)}>
              <Icone.importer className="size-4" aria-hidden />
              {plan ? 'Remplacer le plan' : 'Importer un plan'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={trace}
              onClick={() => {
                setChoisie(null)
                setEdition({ nom: '', tacheIds: [], points: [], trace: true })
              }}
            >
              <Icone.dessiner className="size-4" aria-hidden />
              Nouvelle zone
            </Button>
            {plan && (
              <Button
                size="sm"
                variant="ghost"
                onClick={retirerPlan}
                disabled={enCours}
                className="text-muted-foreground ml-auto"
              >
                Retirer le plan
              </Button>
            )}
          </div>
        )}

        <div className="relative">
          <svg
            ref={svg}
            viewBox={`${cadre.x} ${cadre.y} ${cadre.l} ${cadre.h}`}
            className={`bg-card block h-auto w-full touch-none select-none ${trace ? 'cursor-crosshair' : zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
            style={{ aspectRatio: `${gabarit.largeur} / ${gabarit.hauteur}` }}
            role="group"
            aria-label={`Plan du niveau ${libelleNiveau(niveau)}${date ? ` au ${dateLongue(date)}` : ''}`}
            onPointerDown={(e) => surAppui(e)}
            onPointerMove={surMouvement}
            onPointerUp={surRelache}
            onPointerLeave={() => setSurvol(null)}
          >
            {plan && (
              <image
                href={plan.url}
                x={0}
                y={0}
                width={plan.largeur}
                height={plan.hauteur}
                className="fond-plan"
                preserveAspectRatio="none"
              />
            )}
            {visibles.map((z) => {
              if (z.id === zoneEditee) return null
              const [reel, , etat] = z.serie[rang] ?? [0, 0, 'NON_COMMENCE']
              const [cx, cy] = centre(z.pathSvg)
              const actif = z.id === choisie
              const nomCourt = z.nom.split('—')[1]?.trim() ?? z.nom
              const agir = () => {
                if (aGlisse.current || trace) return
                if (enEdition) editerZone(z)
                else setChoisie(actif ? null : z.id)
              }
              return (
                <g
                  key={z.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={actif}
                  aria-label={`${z.nom} : ${ETAT[etat].libelle}, ${pourcent(reel, 0)} réalisés`}
                  onClick={agir}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      if (enEdition) editerZone(z)
                      else setChoisie(actif ? null : z.id)
                    }
                  }}
                  className="cursor-pointer outline-none [&:focus-visible>path]:stroke-[var(--encre-primaire)]"
                  data-etat={etat}
                >
                  <path
                    d={z.pathSvg}
                    fill={ETAT[etat].couleur}
                    fillOpacity={remplissage}
                    stroke={actif ? 'var(--encre-primaire)' : ETAT[etat].couleur}
                    strokeWidth={actif ? 3 : 1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={cx}
                    y={cy - 3 * unite}
                    textAnchor="middle"
                    fontSize={12.5 * unite}
                    fontWeight={700}
                    fill="var(--encre-primaire)"
                    stroke="var(--card)"
                    strokeWidth={3 * unite}
                    paintOrder="stroke"
                  >
                    {nomCourt}
                  </text>
                  <text
                    x={cx}
                    y={cy + 14 * unite}
                    textAnchor="middle"
                    fontSize={13.5 * unite}
                    fontWeight={800}
                    fill="var(--encre-primaire)"
                    stroke="var(--card)"
                    strokeWidth={3 * unite}
                    paintOrder="stroke"
                  >
                    {pourcent(reel, 0)}
                  </text>
                </g>
              )
            })}

            {edition && (
              <g aria-hidden>
                {pointsEdition.length > 0 && (
                  <path
                    d={`M${pointsEdition.map((p) => p.join(' ')).join('L')}${
                      trace ? (survol ? `L${survol.join(' ')}` : '') : 'Z'
                    }`}
                    fill={trace ? 'none' : 'var(--marque)'}
                    fillOpacity={0.18}
                    stroke="var(--marque)"
                    strokeWidth={2.5}
                    strokeDasharray={trace ? '6 4' : undefined}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {pointsEdition.map(([x, y], i) => (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r={(i === 0 && trace ? 8 : 6.5) * unite}
                    fill="var(--card)"
                    stroke="var(--marque)"
                    strokeWidth={2.5}
                    vectorEffect="non-scaling-stroke"
                    className={trace ? '' : 'cursor-move'}
                    onPointerDown={
                      trace
                        ? undefined
                        : (e) => surAppui(e as unknown as React.PointerEvent<SVGSVGElement>, i)
                    }
                  />
                ))}
              </g>
            )}
          </svg>

          <div className="absolute right-3 bottom-3 flex flex-col gap-1.5">
            <BoutonCarte
              libelle="Zoomer"
              disabled={zoom >= ZOOM_MAX}
              onClick={() =>
                setCadre((c) => zoomer(c, 1.6, [c.x + c.l / 2, c.y + c.h / 2], gabarit))
              }
            >
              <Icone.zoomAvant className="size-4" aria-hidden />
            </BoutonCarte>
            <BoutonCarte
              libelle="Dézoomer"
              disabled={zoom <= 1}
              onClick={() =>
                setCadre((c) => zoomer(c, 1 / 1.6, [c.x + c.l / 2, c.y + c.h / 2], gabarit))
              }
            >
              <Icone.zoomArriere className="size-4" aria-hidden />
            </BoutonCarte>
            <BoutonCarte
              libelle="Voir tout le plan"
              disabled={zoom <= 1}
              onClick={() => setCadre(cadreComplet(gabarit))}
            >
              <Icone.recadrer className="size-4" aria-hidden />
            </BoutonCarte>
          </div>
        </div>

        <div className="border-border/70 space-y-3 border-t px-4 py-3">
          <ul aria-label="Légende des états" className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            {ETATS_LEGENDE.map((e) => {
              const I = ETAT[e].icone
              return (
                <li
                  key={e}
                  className="flex items-center gap-1.5 font-semibold"
                  title={ETAT[e].definition}
                >
                  <span
                    aria-hidden
                    className="size-3 rounded"
                    style={{ background: ETAT[e].couleur, opacity: 0.85 }}
                  />
                  <I className={`size-3.5 ${ETAT[e].teinte}`} strokeWidth={2} aria-hidden />
                  {ETAT[e].libelle}
                </li>
              )
            })}
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
                className="accent-marque min-w-48 flex-1"
                aria-valuetext={dateLongue(date)}
              />
              <span className="chiffres-alignes text-sm font-extrabold">{dateCourte(date)}</span>
            </label>
          )}
          <p className="text-muted-foreground text-xs">
            {plan
              ? `Plan : ${plan.nomFichier}. Ctrl et molette pour zoomer, glisser pour se déplacer.`
              : 'Aucun plan importé pour ce niveau : les zones sont dessinées sur un gabarit.'}
          </p>
        </div>
      </section>

      <section
        aria-label={edition ? 'Édition de la zone' : 'Détail de la zone'}
        className="surface overflow-hidden"
        aria-live="polite"
      >
        {edition ? (
          <EditeurZone
            zone={edition}
            taches={rattachables}
            enCours={enCours}
            surChangement={setEdition}
            surEnregistrer={enregistrer}
            surAnnuler={() => setEdition(null)}
            surRedessiner={() => setEdition({ ...edition, points: [], trace: true })}
            surSupprimer={edition.id ? () => supprimer(edition.id as string, edition.nom) : null}
          />
        ) : enEdition ? (
          <div className="space-y-3 px-5 py-6">
            <h2 className="text-base font-extrabold">Modifier le plan</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Importer le plan du niveau depuis AutoCAD (export DXF), un PDF ou une image, puis
              dessiner les zones dessus et leur rattacher les tâches qui s’y exécutent. Cliquer sur
              une zone existante pour la modifier.
            </p>
            <p className="text-sm font-bold">
              {visibles.length} zone{visibles.length > 1 ? 's' : ''} sur ce niveau
            </p>
          </div>
        ) : zone === null ? (
          <div className="grid place-items-center gap-3 px-6 py-12 text-center">
            <span className="pastille size-12 rounded-2xl">
              <Icone.zone className="size-6" strokeWidth={2} aria-hidden />
            </span>
            <p className="text-sm font-bold">Aucune zone sélectionnée</p>
            <p className="text-muted-foreground max-w-64 text-sm">
              Cliquer une zone du plan pour voir ses tâches. Le niveau {libelleNiveau(niveau)}{' '}
              compte {visibles.length} zone{visibles.length > 1 ? 's' : ''}.
            </p>
          </div>
        ) : (
          <>
            <div className="border-border/70 border-b px-5 py-4">
              <h2 className="text-base font-extrabold">{zone.nom}</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {date ? `Au ${dateLongue(date)} : ` : ''}
                <span className="text-foreground font-bold">
                  {pourcent(zone.serie[rang]?.[0] ?? 0)}
                </span>{' '}
                réalisés pour {pourcent(zone.serie[rang]?.[1] ?? 0)} prévus
              </p>
            </div>
            <ul className="divide-border/60 divide-y">
              {zone.tacheIds
                .map((id) => taches.find((t) => t.id === id))
                .filter((t): t is TachePlanAffichee => t !== undefined)
                .map((t) => {
                  const [reel, prevu, etat] = t.serie[rang] ?? [0, 0, 'NON_COMMENCE']
                  const I = ETAT[etat].icone
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
                          <I
                            className={`size-3.5 ${ETAT[etat].teinte}`}
                            strokeWidth={2.25}
                            aria-hidden
                          />
                          {ETAT[etat].libelle}
                        </span>
                        <span className="chiffres-alignes">
                          {pourcent(reel, 0)} réalisés, {pourcent(prevu, 0)} prévus
                        </span>
                        <span>
                          du {dateCourte(t.dateDebutPrevue)} au {dateCourte(t.dateFinPrevue)}
                        </span>
                        {t.critique && <span className="font-bold">chemin critique</span>}
                      </p>
                    </li>
                  )
                })}
              {zone.tacheIds.length === 0 && (
                <li className="text-muted-foreground px-5 py-4 text-sm">
                  Aucune tâche rattachée à cette zone.
                </li>
              )}
            </ul>
          </>
        )}
      </section>

      {editable && importOuvert && (
        <ImportPlan
          projetId={projetId}
          niveaux={niveaux}
          niveauInitial={niveau}
          zonesParNiveau={
            new Map(niveaux.map((n) => [n, zones.filter((z) => z.niveau === n).length]))
          }
          plansParNiveau={new Set(plans.map((p) => p.niveau))}
          ouvert
          surFermeture={(importe) => {
            setImportOuvert(false)
            if (importe !== undefined) changerNiveau(importe)
          }}
        />
      )}
    </div>
  )
}

function BoutonCarte({
  libelle,
  disabled,
  onClick,
  children,
}: {
  libelle: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={libelle}
      title={libelle}
      disabled={disabled}
      onClick={onClick}
      className="bg-card/95 border-border hover:bg-muted grid size-9 place-items-center rounded-xl border shadow-sm transition-colors disabled:opacity-40"
    >
      {children}
    </button>
  )
}
