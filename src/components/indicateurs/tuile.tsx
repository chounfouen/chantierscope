import { Icone, type NomIcone } from '@/lib/icones'
import { cn } from '@/lib/utils'

export type Ton = 'neutre' | 'bon' | 'alerte' | 'critique'

const ENCRE: Record<Ton, string> = {
  neutre: 'text-foreground',
  bon: 'text-etat-acheve',
  alerte: 'text-etat-retard',
  critique: 'text-etat-critique',
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
}: {
  intitule: string
  valeur: string
  precision?: string
  icone: NomIcone
  ton?: Ton
}) {
  const IconeTuile = Icone[icone]
  return (
    <div className={cn('surface filet-haut px-4 py-3.5', FILET[ton])}>
      <div className="text-muted-foreground flex items-center justify-between gap-2">
        <span className="text-[0.6875rem] font-medium tracking-wide uppercase">{intitule}</span>
        <IconeTuile className="size-3.5 shrink-0 opacity-60" strokeWidth={1.75} aria-hidden />
      </div>
      <p className={cn('mt-2 text-[1.75rem] leading-none font-semibold', ENCRE[ton])}>{valeur}</p>
      {precision !== undefined && (
        <p className="text-muted-foreground mt-2 text-xs leading-snug">{precision}</p>
      )}
    </div>
  )
}
