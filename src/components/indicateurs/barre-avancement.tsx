import { pourcent } from '@/lib/format'
import { teinteSerie } from '@/lib/viz'

/**
 * Barre d'avancement d'un lot : le prevu en trame claire, le realise en
 * teinte pleine par-dessus, sur la meme ligne de base.
 *
 * Les deux barres partagent la teinte du lot : la trame est la meme couleur
 * melangee a la surface, ce qui la lit comme « la meme chose, attendue » et
 * non comme une seconde serie. La partie claire qui depasse le realise est
 * le retard, visible d'un coup d'oeil ; un realise en avance recouvre la
 * trame, et l'ecart chiffre a droite le dit.
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
  const teinte = teinteSerie(rangCouleur)

  return (
    <div className="flex items-center gap-3">
      <div
        className="bg-muted relative h-2 flex-1 overflow-hidden rounded-full"
        role="img"
        aria-label={`${intitule} : ${pourcent(realise)} réalisés pour ${pourcent(prevu)} prévus`}
        title={`Prévu : ${pourcent(prevu)}, réalisé : ${pourcent(realise)}`}
      >
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.min(100, prevu * 100)}%`,
            background: `color-mix(in oklab, ${teinte} 32%, var(--card))`,
          }}
        />
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
          style={{ width: `${Math.min(100, realise * 100)}%`, background: teinte }}
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
