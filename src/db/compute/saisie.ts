/**
 * Controle d'une quantite au moment de la saisie.
 *
 * Le chef de chantier saisit la quantite du jour ; il doit voir aussitot ce
 * qu'elle represente par rapport au prevu et au deja realise, et etre alerte
 * si elle fait depasser la quantite prevue.
 *
 * Un depassement n'est PAS refuse. Il est frequent et souvent legitime : un
 * metre du quantitatif sous-estime, un ouvrage repris. Le refuser pousserait
 * a saisir une quantite fausse pour passer le controle. Il est signale, et
 * l'avancement reste plafonne a cent pour cent par le noyau de calcul.
 *
 * Deux cumuls sont distingues. Le cumul VALIDE est celui qui alimente les
 * indicateurs. Le cumul EN ATTENTE regroupe les releves soumis mais pas
 * encore valides : il compte pour l'alerte, sans quoi deux releves
 * consecutifs non valides pourraient chacun passer sous le prevu et le
 * depasser ensemble.
 *
 * Fonction pure : ni base, ni horloge.
 */

export type EntreeControle = {
  quantitePrevue: number
  cumulValide: number
  cumulEnAttente: number
  /** Quantite du jour, nulle si rien n'est saisi sur la ligne. */
  saisie: number | null
}

export type ResultatControle = {
  /** Cumul connu avant la saisie, valide et en attente confondus. */
  cumulAvant: number
  /** Cumul apres prise en compte de la saisie. */
  cumulApres: number
  /** Reste a realiser avant la saisie, jamais negatif. */
  resteAvant: number
  /** Quantite au-dela du prevu apres la saisie, zero s'il n'y en a pas. */
  depassement: number
  /** Fraction du prevu atteinte apres la saisie, non plafonnee. */
  fractionApres: number
  niveau: 'vide' | 'normal' | 'solde' | 'depassement'
}

/**
 * Tolerance sur la comparaison au prevu. Les quantites ont trois decimales :
 * un ecart inferieur au demi-millieme est un artefact d'arrondi flottant, pas
 * un depassement.
 */
const TOLERANCE = 5e-4

export function controlerQuantite(e: EntreeControle): ResultatControle {
  const cumulAvant = arrondir(e.cumulValide + e.cumulEnAttente)
  const saisie = e.saisie ?? 0
  const cumulApres = arrondir(cumulAvant + saisie)
  const resteAvant = Math.max(0, arrondir(e.quantitePrevue - cumulAvant))
  const excedent = cumulApres - e.quantitePrevue
  const depassement = excedent > TOLERANCE ? arrondir(excedent) : 0
  const fractionApres = e.quantitePrevue > 0 ? cumulApres / e.quantitePrevue : 0

  let niveau: ResultatControle['niveau']
  if (e.saisie === null || e.saisie === 0) niveau = 'vide'
  else if (depassement > 0) niveau = 'depassement'
  else if (Math.abs(excedent) <= TOLERANCE) niveau = 'solde'
  else niveau = 'normal'

  return { cumulAvant, cumulApres, resteAvant, depassement, fractionApres, niveau }
}

function arrondir(v: number): number {
  return Math.round(v * 1000) / 1000
}
