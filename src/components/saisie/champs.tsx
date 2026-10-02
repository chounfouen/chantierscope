/**
 * Champs du formulaire de saisie, dimensionnes pour le telephone.
 *
 * Hauteur de 48 pixels, au-dessus de la cible tactile minimale de 44 : la
 * saisie se fait souvent d'une main, parfois avec des gants. Le texte est a
 * 16 pixels, seuil sous lequel Safari zoome de force sur le champ actif.
 *
 * Chaque champ porte son libelle, son aide et son erreur, reliees par
 * `aria-describedby` : un lecteur d'ecran annonce l'erreur avec le champ.
 */

import { useId } from 'react'
import { cn } from '@/lib/utils'

export const CLASSE_CHAMP =
  'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-destructive/20 h-12 w-full rounded-lg border px-3 text-base outline-none transition-colors focus-visible:ring-3 aria-invalid:ring-3 disabled:opacity-50'

type ProprietesChamp = {
  libelle: string
  aide?: string | undefined
  erreur?: string | undefined
  /** Unite affichee dans le champ, a droite : m3, h, FCFA. */
  unite?: string | undefined
  children: (attributs: {
    id: string
    'aria-invalid': boolean
    'aria-describedby': string | undefined
  }) => React.ReactNode
  className?: string
}

export function Champ({ libelle, aide, erreur, unite, children, className }: ProprietesChamp) {
  const id = useId()
  const idAide = `${id}-aide`
  const idErreur = `${id}-erreur`
  const decrit = [aide ? idAide : null, erreur ? idErreur : null].filter(Boolean).join(' ')

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {libelle}
      </label>
      <div className="relative">
        {children({
          id,
          'aria-invalid': erreur !== undefined,
          'aria-describedby': decrit === '' ? undefined : decrit,
        })}
        {unite && (
          <span
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm"
          >
            {unite}
          </span>
        )}
      </div>
      {aide && (
        <p id={idAide} className="text-muted-foreground text-xs">
          {aide}
        </p>
      )}
      {erreur && (
        <p id={idErreur} className="text-destructive text-sm" role="alert">
          {erreur}
        </p>
      )}
    </div>
  )
}

/** Champ numerique : clavier decimal du telephone, saisie libre en texte. */
export function ChampNombre({
  valeur,
  surChangement,
  decimal = true,
  ...champ
}: Omit<ProprietesChamp, 'children'> & {
  valeur: string
  surChangement: (v: string) => void
  decimal?: boolean
}) {
  return (
    <Champ {...champ}>
      {(a) => (
        <input
          {...a}
          type="text"
          inputMode={decimal ? 'decimal' : 'numeric'}
          autoComplete="off"
          value={valeur}
          onChange={(e) => surChangement(e.target.value)}
          className={cn(CLASSE_CHAMP, 'chiffres-alignes', champ.unite && 'pr-14')}
        />
      )}
    </Champ>
  )
}

/** Interrupteur oui ou non, en deux gros boutons plutot qu'une case a cocher. */
export function Bascule({
  libelle,
  valeur,
  surChangement,
  oui,
  non,
}: {
  libelle: string
  valeur: boolean
  surChangement: (v: boolean) => void
  oui: string
  non: string
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{libelle}</legend>
      <div className="grid grid-cols-2 gap-2">
        {[
          { v: true, texte: oui },
          { v: false, texte: non },
        ].map((o) => (
          <button
            key={o.texte}
            type="button"
            aria-pressed={valeur === o.v}
            onClick={() => surChangement(o.v)}
            className={cn(
              'h-12 rounded-lg border text-base transition-colors',
              valeur === o.v
                ? 'border-foreground bg-foreground text-background font-medium'
                : 'border-input hover:bg-accent',
            )}
          >
            {o.texte}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
