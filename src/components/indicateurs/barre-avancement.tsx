import { pourcent } from '@/lib/format'
import { teinteSerie } from '@/lib/viz'

/**
 * Barre d'avancement d'un lot : le realise en teinte pleine, le prevu marque
 * par un repere vertical.
 *
 * Un repere plutot qu'une seconde barre superposee : deux barres de longueurs
 * proches sont difficiles a departager, alors qu'un trait vertical se lit
 * immediatement comme un objectif.
 *
 * La valeur chiffree accompagne toujours la barre. Trois des huit teintes de
 * la palette passent sous 3:1 face au fond clair : la regle de relief impose
 * une etiquette directe visible.
 */
export function BarreAvancement({
  realise,
  prevu,
  rangCouleur,
  intitule,
}: {
  realise: number
  prevu: number
  rangCouleur: number
  intitule: string
}) {
  const ecart = realise - prevu
  const enRetard = ecart < -0.005

  return (
    <div className="flex items-center gap-3">
      <div
        className="bg-muted relative h-1.5 flex-1 overflow-hidden rounded-full"
        role="img"
        aria-label={`${intitule} : ${pourcent(realise)} realises pour ${pourcent(prevu)} prevus`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.min(100, realise * 100)}%`,
            background: teinteSerie(rangCouleur),
          }}
        />
        {/* Le repere du prevu porte un lisere de la couleur de fond, pour
            rester detachable de la barre qu il traverse. */}
        <div
          aria-hidden
          className="ring-card absolute top-0 h-full w-0.5 rounded-full ring-1"
          style={{
            left: `calc(${Math.min(100, prevu * 100)}% - 1px)`,
            background: 'var(--encre-secondaire)',
          }}
          title={`Prevu : ${pourcent(prevu)}`}
        />
      </div>

      <span className="chiffres-alignes w-[3.25rem] shrink-0 text-right text-sm font-medium">
        {pourcent(realise)}
      </span>
      <span
        className={`chiffres-alignes w-14 shrink-0 text-right text-xs ${
          enRetard ? 'text-etat-retard font-medium' : 'text-muted-foreground'
        }`}
      >
        {ecart >= 0 ? '+' : ''}
        {pourcent(ecart)}
      </span>
    </div>
  )
}
