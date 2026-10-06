/**
 * Cache par etiquette des lectures de synthese (conception, section 7,
 * regle 7).
 *
 * Le tableau de bord, les analyses et le plan relisent des donnees qui ne
 * changent qu'a la validation d'un releve, a une modification du planning ou
 * au recalcul nocturne. Elles sont mises en cache par projet ET par niveau
 * d'acces : l'exemplaire du maitre d'ouvrage, sans cout ni effectif, est une
 * entree distincte, et ne peut jamais servir a un role interne, ni
 * l'inverse.
 *
 * Toute ecriture qui change ces donnees invalide l'etiquette du projet. Depuis
 * une Server Action, `updateTag` garantit que l'auteur voit immediatement sa
 * propre ecriture ; depuis une route, l'etiquette est perimee sans delai de
 * grace.
 */

import { revalidatePath, revalidateTag, unstable_cache, updateTag } from 'next/cache'

export const etiquetteProjet = (projetId: string) => `projet:${projetId}`

/** Filet de securite : une entree oubliee par une invalidation vit une heure. */
const DUREE_MAX_S = 3600

/**
 * Lectures mises en cache, chacune avec la VERSION de la forme de son
 * resultat. Le cache survit aux redemarrages et aux deploiements, et sa cle
 * ne change pas quand le code change : une lecture qui gagne un champ
 * servirait sinon l'ancien resultat, sans ce champ, jusqu'a une heure. Toute
 * modification de la forme d'une lecture incremente sa version.
 */
const LECTURES = {
  synthese: 1,
  tableau: 1,
  analyses: 1,
  // 2 : fonds de plan importes, champ `plans`.
  plan: 2,
} as const

export type Lecture = keyof typeof LECTURES

export function enCacheProjet<R>(
  lecture: Lecture,
  projetId: string,
  interne: boolean,
  charger: () => Promise<R>,
): Promise<R> {
  return unstable_cache(
    charger,
    ['chantierscope', `${lecture}@${LECTURES[lecture]}`, projetId, interne ? 'interne' : 'externe'],
    {
      tags: [etiquetteProjet(projetId)],
      revalidate: DUREE_MAX_S,
    },
  )()
}

/** Apres une ecriture faite par une Server Action. */
export function invaliderDepuisAction(projetId: string): void {
  updateTag(etiquetteProjet(projetId))
  revalidatePath(`/projet/${projetId}`, 'layout')
}

/** Apres une ecriture faite par une route : releve hors ligne, tache nocturne. */
export function invaliderDepuisRoute(projetId: string): void {
  revalidateTag(etiquetteProjet(projetId), { expire: 0 })
}
