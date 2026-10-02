/**
 * Palette d'impression, pour le rapport PDF.
 *
 * Le moteur PDF ne lit pas les variables CSS : il lui faut des valeurs
 * explicites. Ce sont exactement celles du THEME CLAIR de `globals.css`, le
 * papier etant blanc, et un test les confronte a la feuille de style : une
 * modification de la palette validee qui oublierait ce fichier fait echouer
 * la suite. Les encres, definies en oklch dans la feuille de style, sont ici
 * converties en hexadecimal ; le test refait la conversion.
 *
 * Seul module, avec `globals.css`, autorise a porter des valeurs
 * hexadecimales de couleur.
 */

export const IMPRESSION = {
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  etats: {
    NON_COMMENCE: '#898781',
    EN_COURS: '#fab219',
    ACHEVE: '#0ca30c',
    EN_RETARD: '#ec835a',
    CRITIQUE: '#d03b3b',
    NON_TRAVAILLE: '#e1e0d9',
  },
  encrePrimaire: '#101419',
  encreSecondaire: '#484e55',
  encreDiscrete: '#7b8187',
  grille: '#e4e6e9',
  ligneBase: '#ced1d6',
  fond: '#f2f4f6',
} as const

/** Equivalences des cles d'impression et des variables de la feuille de style. */
export const VARIABLES_ENCRE = {
  encrePrimaire: '--encre-primaire',
  encreSecondaire: '--encre-secondaire',
  encreDiscrete: '--encre-discrete',
  grille: '--grille',
  ligneBase: '--ligne-base',
  fond: '--muted',
} as const
