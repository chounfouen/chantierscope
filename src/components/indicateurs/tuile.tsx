import { Compteur, type FormatCompteur } from '@/components/indicateurs/anime'
import { ETAT, type Etat } from '@/lib/etats'
import { Icone, type NomIcone } from '@/lib/icones'
import { cn } from '@/lib/utils'
import { CHROME, MARQUE, SERIES } from '@/lib/viz'

export type Ton = 'neutre' | 'bon' | 'alerte' | 'critique'

/**
 * Pastille d'etat de la tuile : icone teintee et libelle a l'encre, sur un
 * fond legerement teinte. Le libelle ecrit porte le sens ; la teinte le
 * renforce sans jamais le porter seule.
 */
const ETIQUETTE: Record<Exclude<Ton, 'neutre'>, { etat: Etat; libelle: string }> = {
  bon: { etat: 'ACHEVE', libelle: 'Bon' },
  alerte: { etat: 'EN_RETARD', libelle: 'À surveiller' },
  critique: { etat: 'CRITIQUE', libelle: 'Critique' },
}

/**
 * Tuile d'indicateur.
 *
 * Une pastille d'icone, l'intitule en clair, un grand chiffre qui defile
 * jusqu'a sa valeur, l'etat ecrit en toutes lettres, et la tendance des
 * trente derniers jours.
 */
export function Tuile({
  intitule,
  valeur,
  anime,
  precision,
  icone,
  ton = 'neutre',
  tendance,
  className,
}: {
  intitule: string
  valeur: string
  /** Valeur numerique a animer ; a defaut, `valeur` s'affiche telle quelle. */
  anime?: { valeur: number; format: FormatCompteur }
  precision?: string
  icone: NomIcone
  ton?: Ton
  /** Evolution sur la fenetre de tendance, et sa lecture en clair. */
  tendance?: { serie: readonly (number | null)[]; libelle: string; sens: Sens }
  className?: string
}) {
  const IconeTuile = Icone[icone]
  return (
    <div className={cn('surface flex flex-col px-5 py-4', className)}>
      <div className="flex items-center gap-2.5">
        <span className="pastille size-9">
          <IconeTuile className="size-[1.125rem]" strokeWidth={2} aria-hidden />
        </span>
        <span className="text-muted-foreground text-sm leading-tight font-bold">{intitule}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <p className="chiffres-alignes text-[2.125rem] leading-none font-extrabold tracking-tight">
          {anime ? <Compteur valeur={anime.valeur} format={anime.format} /> : valeur}
        </p>
        {ton !== 'neutre' && <Etiquette {...ETIQUETTE[ton]} />}
      </div>
      {precision !== undefined && (
        <p className="text-muted-foreground mt-2 text-[0.8125rem] leading-snug">{precision}</p>
      )}
      {tendance !== undefined && (
        <div className="mt-auto pt-3">
          <div className="bg-muted/70 rounded-xl px-3 pt-2 pb-1.5">
            <Etincelle serie={tendance.serie} />
            <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs font-semibold">
              <IconeSens sens={tendance.sens} />
              <span className="chiffres-alignes">{tendance.libelle}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function Etiquette({ etat, libelle }: { etat: Etat; libelle: string }) {
  const I = ETAT[etat].icone
  return (
    <span
      className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold"
      style={{ background: `color-mix(in oklab, ${ETAT[etat].couleur} 16%, var(--card))` }}
    >
      <I className={cn('size-3.5', ETAT[etat].teinte)} strokeWidth={2.25} aria-hidden />
      {libelle}
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
 * legende : l'intitule de la tuile la nomme. La valeur du jour est au bout
 * du trait. L'echelle est propre a chaque tuile : la miniature montre une
 * forme, la valeur se lit dans le chiffre et dans la variation ecrite
 * dessous, jamais sur la courbe.
 */
function Etincelle({ serie }: { serie: readonly (number | null)[] }) {
  const L = 88
  const H = 24
  const valeurs = serie.filter((v): v is number => v !== null)
  if (valeurs.length < 2) return <span className="block h-6 w-full" aria-hidden />
  const min = Math.min(...valeurs)
  const max = Math.max(...valeurs)
  const etendue = max - min || 1
  const pas = L / (serie.length - 1)
  const points: [number, number][] = []
  serie.forEach((v, i) => {
    if (v !== null) points.push([i * pas, H - 3 - ((v - min) / etendue) * (H - 6)])
  })
  return (
    <svg
      viewBox={`0 0 ${L} ${H}`}
      preserveAspectRatio="none"
      className="block h-6 w-full overflow-visible"
      aria-hidden
    >
      <line
        x1={0}
        x2={L}
        y1={H - 0.5}
        y2={H - 0.5}
        stroke={CHROME.grille}
        strokeWidth={MARQUE.hairline}
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
        fill="none"
        stroke={SERIES[0]}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
