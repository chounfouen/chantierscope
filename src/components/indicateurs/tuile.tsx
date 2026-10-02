import { ETAT, type Etat } from '@/lib/etats'
import { Icone, type NomIcone } from '@/lib/icones'
import { cn } from '@/lib/utils'
import { CHROME, MARQUE, SERIES } from '@/lib/viz'

export type Ton = 'neutre' | 'bon' | 'alerte' | 'critique'

/**
 * Repere d'etat a cote du chiffre : une icone de la palette d'etats, avec son
 * libelle pour les lecteurs d'ecran. Le chiffre reste a l'encre : comme
 * texte, les teintes d'etat n'atteignent pas le contraste requis dans les deux
 * themes.
 */
const REPERE: Record<Exclude<Ton, 'neutre'>, { etat: Etat; libelle: string }> = {
  bon: { etat: 'ACHEVE', libelle: 'conforme' },
  alerte: { etat: 'EN_RETARD', libelle: 'à surveiller' },
  critique: { etat: 'CRITIQUE', libelle: 'critique' },
}

const FILET: Record<Ton, string> = {
  neutre: 'border-t-border',
  bon: 'border-t-etat-acheve',
  alerte: 'border-t-etat-retard',
  critique: 'border-t-etat-critique',
}

/**
 * Tuile d'indicateur.
 *
 * Le ton est porte par un filet superieur ET par la couleur du chiffre : la
 * couleur seule ne doit jamais etre le support de l'information. Le filet
 * reste visible en contraste force, ou les couleurs de texte sont ecrasees.
 *
 * Le chiffre garde les chiffres proportionnels : un grand nombre isole se lit
 * mieux ainsi, la chasse fixe etant reservee aux colonnes qui s'alignent.
 */
export function Tuile({
  intitule,
  valeur,
  precision,
  icone,
  ton = 'neutre',
  tendance,
}: {
  intitule: string
  valeur: string
  precision?: string
  icone: NomIcone
  ton?: Ton
  /** Evolution sur la fenetre de tendance, et sa lecture en clair. */
  tendance?: { serie: readonly (number | null)[]; libelle: string; sens: Sens }
}) {
  const IconeTuile = Icone[icone]
  return (
    <div className={cn('surface filet-haut px-4 py-3.5', FILET[ton])}>
      <div className="text-muted-foreground flex items-center justify-between gap-2">
        <span className="text-[0.6875rem] font-medium tracking-wide uppercase">{intitule}</span>
        <IconeTuile className="size-3.5 shrink-0 opacity-60" strokeWidth={1.75} aria-hidden />
      </div>
      <p className="mt-2 flex items-center gap-2 text-[1.75rem] leading-none font-semibold">
        <span>{valeur}</span>
        {ton !== 'neutre' && <Repere {...REPERE[ton]} />}
      </p>
      {precision !== undefined && (
        <p className="text-muted-foreground mt-2 text-xs leading-snug">{precision}</p>
      )}
      {tendance !== undefined && (
        <div className="border-border/60 mt-3 flex items-center gap-3 border-t pt-2.5">
          <Etincelle serie={tendance.serie} />
          <p className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
            <IconeSens sens={tendance.sens} />
            <span className="chiffres-alignes truncate">{tendance.libelle}</span>
          </p>
        </div>
      )}
    </div>
  )
}

function Repere({ etat, libelle }: { etat: Etat; libelle: string }) {
  const I = ETAT[etat].icone
  return (
    <span className="flex">
      <I className={cn('size-5', ETAT[etat].teinte)} strokeWidth={2} aria-hidden />
      <span className="sr-only">, {libelle}</span>
    </span>
  )
}

export type Sens = 'hausse' | 'baisse' | 'stable'

function IconeSens({ sens }: { sens: Sens }) {
  const I = Icone[sens]
  return <I className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
}

/**
 * Courbe miniature des trente derniers jours.
 *
 * Une seule serie, donc le premier emplacement de la palette et aucune
 * legende : l'intitule de la tuile la nomme. Le dernier point, la valeur du
 * jour, est marque. L'echelle est propre a chaque tuile : la miniature montre
 * une forme, la valeur se lit dans le chiffre et dans la variation ecrite a
 * cote, jamais sur la courbe.
 */
function Etincelle({ serie }: { serie: readonly (number | null)[] }) {
  const L = 88
  const H = 24
  const valeurs = serie.filter((v): v is number => v !== null)
  if (valeurs.length < 2) return <span className="h-6 w-[88px] shrink-0" aria-hidden />
  const min = Math.min(...valeurs)
  const max = Math.max(...valeurs)
  const etendue = max - min || 1
  const pas = L / (serie.length - 1)
  const points: [number, number][] = []
  serie.forEach((v, i) => {
    if (v !== null) points.push([i * pas, H - 3 - ((v - min) / etendue) * (H - 6)])
  })
  const dernier = points[points.length - 1] as [number, number]
  return (
    <svg
      width={L}
      height={H}
      viewBox={`0 0 ${L} ${H}`}
      className="shrink-0 overflow-visible"
      aria-hidden
    >
      <line
        x1={0}
        x2={L}
        y1={H - 0.5}
        y2={H - 0.5}
        stroke={CHROME.grille}
        strokeWidth={MARQUE.hairline}
      />
      <polyline
        points={points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
        fill="none"
        stroke={SERIES[0]}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={dernier[0]}
        cy={dernier[1]}
        r={2.5}
        fill={SERIES[0]}
        stroke="var(--card)"
        strokeWidth={1.5}
      />
    </svg>
  )
}
