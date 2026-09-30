/**
 * Cas de reference du chemin critique, calcule a la main.
 *
 * Ce reseau de dix taches a ete resolu au crayon avant d'ecrire une ligne de
 * code. Les valeurs attendues du fichier `cpm.test.ts` viennent de ce calcul
 * manuel, et non de l'execution du programme : c'est la seule facon qu'un
 * test ait valeur de preuve plutot que de constat.
 *
 * Il est destine a figurer en annexe du memoire, avec le calcul manuel en
 * regard de la sortie du programme.
 *
 * ---------------------------------------------------------------------------
 * RESEAU
 * ---------------------------------------------------------------------------
 *
 *            +---- B(8) ---- D(6) ----+
 *            |                        |
 *   A(5) ----+                        +---- F(4) ----+---- G(5) ----+
 *            |                        |              |              |
 *            +---- C(3) ---- E(7) ----+              +---- H(2) ----+
 *                                                                   |
 *                                                    I(3) ----------+
 *                                                      |
 *                                                    J(4)
 *
 * Toutes les liaisons sont de type fin-debut, sans decalage.
 * Convention : le jour 0 est le premier jour du reseau, les bornes sont
 * incluses, donc fin = debut + duree - 1.
 *
 * ---------------------------------------------------------------------------
 * PASSE AVANT — dates au plus tot
 * ---------------------------------------------------------------------------
 *
 *   A   debut 0                          fin 0 + 5 - 1 = 4
 *   B   debut fin(A) + 1 = 5             fin 5 + 8 - 1 = 12
 *   C   debut fin(A) + 1 = 5             fin 5 + 3 - 1 = 7
 *   D   debut fin(B) + 1 = 13            fin 13 + 6 - 1 = 18
 *   E   debut fin(C) + 1 = 8             fin 8 + 7 - 1 = 14
 *   F   debut max(fin D, fin E) + 1
 *             = max(18, 14) + 1 = 19     fin 19 + 4 - 1 = 22
 *   G   debut fin(F) + 1 = 23            fin 23 + 5 - 1 = 27
 *   H   debut fin(F) + 1 = 23            fin 23 + 2 - 1 = 24
 *   I   debut max(fin G, fin H) + 1
 *             = max(27, 24) + 1 = 28     fin 28 + 3 - 1 = 30
 *   J   debut fin(I) + 1 = 31            fin 31 + 4 - 1 = 34
 *
 *   Duree totale du reseau : 35 jours, du jour 0 au jour 34 inclus.
 *
 * ---------------------------------------------------------------------------
 * PASSE ARRIERE — dates au plus tard
 * ---------------------------------------------------------------------------
 *
 *   J   fin tard 34                      debut tard 34 - 4 + 1 = 31
 *   I   fin tard debut(J) - 1 = 30       debut tard 30 - 3 + 1 = 28
 *   G   fin tard debut(I) - 1 = 27       debut tard 27 - 5 + 1 = 23
 *   H   fin tard debut(I) - 1 = 27       debut tard 27 - 2 + 1 = 26
 *   F   fin tard min(debut G, debut H) - 1
 *               = min(23, 26) - 1 = 22   debut tard 22 - 4 + 1 = 19
 *   D   fin tard debut(F) - 1 = 18       debut tard 18 - 6 + 1 = 13
 *   E   fin tard debut(F) - 1 = 18       debut tard 18 - 7 + 1 = 12
 *   B   fin tard debut(D) - 1 = 12       debut tard 12 - 8 + 1 = 5
 *   C   fin tard debut(E) - 1 = 11       debut tard 11 - 3 + 1 = 9
 *   A   fin tard min(debut B, debut C) - 1
 *               = min(5, 9) - 1 = 4      debut tard 4 - 5 + 1 = 0
 *
 * ---------------------------------------------------------------------------
 * MARGES
 * ---------------------------------------------------------------------------
 *
 *   marge totale = debut tard - debut tot
 *   marge libre  = min(debut tot des successeurs) - fin tot - 1
 *
 *   tache   debut tot   debut tard   marge totale   marge libre   critique
 *     A         0            0             0             0          oui
 *     B         5            5             0             0          oui
 *     C         5            9             4             0          non
 *     D        13           13             0             0          oui
 *     E         8           12             4             4          non
 *     F        19           19             0             0          oui
 *     G        23           23             0             0          oui
 *     H        23           26             3             3          non
 *     I        28           28             0             0          oui
 *     J        31           31             0             0          oui
 *
 *   Chemin critique : A - B - D - F - G - I - J
 *   Verification : 5 + 8 + 6 + 4 + 5 + 3 + 4 = 35 jours. Coherent avec la
 *   duree totale de la passe avant.
 *
 *   Lecture des marges non nulles :
 *   - C dispose de 4 jours de marge totale mais d'aucune marge libre : la
 *     retarder repousse E, sans pour autant repousser la fin du projet.
 *   - E dispose de 4 jours de marge totale ET de 4 jours de marge libre : elle
 *     peut glisser de 4 jours sans gener personne.
 *   - H dispose de 3 jours dans les deux cas.
 * ---------------------------------------------------------------------------
 */

import type { Reseau } from '@/db/compute/types'

export const RESEAU_REFERENCE: Reseau = {
  taches: [
    { id: 'A', duree: 5 },
    { id: 'B', duree: 8 },
    { id: 'C', duree: 3 },
    { id: 'D', duree: 6 },
    { id: 'E', duree: 7 },
    { id: 'F', duree: 4 },
    { id: 'G', duree: 5 },
    { id: 'H', duree: 2 },
    { id: 'I', duree: 3 },
    { id: 'J', duree: 4 },
  ],
  liaisons: [
    { amont: 'A', aval: 'B', type: 'FD', decalage: 0 },
    { amont: 'A', aval: 'C', type: 'FD', decalage: 0 },
    { amont: 'B', aval: 'D', type: 'FD', decalage: 0 },
    { amont: 'C', aval: 'E', type: 'FD', decalage: 0 },
    { amont: 'D', aval: 'F', type: 'FD', decalage: 0 },
    { amont: 'E', aval: 'F', type: 'FD', decalage: 0 },
    { amont: 'F', aval: 'G', type: 'FD', decalage: 0 },
    { amont: 'F', aval: 'H', type: 'FD', decalage: 0 },
    { amont: 'G', aval: 'I', type: 'FD', decalage: 0 },
    { amont: 'H', aval: 'I', type: 'FD', decalage: 0 },
    { amont: 'I', aval: 'J', type: 'FD', decalage: 0 },
  ],
}

/**
 * Resultat du calcul manuel ci-dessus, recopie tel quel.
 *
 * Ces valeurs ne doivent JAMAIS etre corrigees pour faire passer un test. Si
 * le programme ne les retrouve pas, c'est le programme qui a tort, ou le
 * calcul manuel doit etre refait au crayon puis corrige ici en connaissance
 * de cause.
 */
export const ATTENDU_REFERENCE = {
  dureeTotale: 35,
  cheminCritique: ['A', 'B', 'D', 'F', 'G', 'I', 'J'],
  dates: {
    A: { debutTot: 0, finTot: 4, debutTard: 0, finTard: 4, margeTotale: 0, margeLibre: 0 },
    B: { debutTot: 5, finTot: 12, debutTard: 5, finTard: 12, margeTotale: 0, margeLibre: 0 },
    C: { debutTot: 5, finTot: 7, debutTard: 9, finTard: 11, margeTotale: 4, margeLibre: 0 },
    D: { debutTot: 13, finTot: 18, debutTard: 13, finTard: 18, margeTotale: 0, margeLibre: 0 },
    E: { debutTot: 8, finTot: 14, debutTard: 12, finTard: 18, margeTotale: 4, margeLibre: 4 },
    F: { debutTot: 19, finTot: 22, debutTard: 19, finTard: 22, margeTotale: 0, margeLibre: 0 },
    G: { debutTot: 23, finTot: 27, debutTard: 23, finTard: 27, margeTotale: 0, margeLibre: 0 },
    H: { debutTot: 23, finTot: 24, debutTard: 26, finTard: 27, margeTotale: 3, margeLibre: 3 },
    I: { debutTot: 28, finTot: 30, debutTard: 28, finTard: 30, margeTotale: 0, margeLibre: 0 },
    J: { debutTot: 31, finTot: 34, debutTard: 31, finTard: 34, margeTotale: 0, margeLibre: 0 },
  },
} as const
