/**
 * Conformite du beton en place : controle d'identite de la resistance a la
 * compression, selon l'annexe B de la NF EN 206.
 *
 * Sur chantier, on ne refait pas le controle de production de la centrale :
 * on verifie que le beton livre appartient bien a une production conforme a
 * sa classe. Le resultat d'un prelevement est la moyenne de ses eprouvettes ;
 * pour n resultats sur un meme volume coule (tableau B.1) :
 *
 *   n = 1      chaque resultat           >= fck - 4
 *   n = 2 a 4  moyenne des resultats     >= fck + 1, chaque resultat >= fck - 4
 *   n = 5 a 6  moyenne des resultats     >= fck + 2, chaque resultat >= fck - 4
 *
 * fck est la resistance caracteristique sur cylindre, premier nombre de la
 * classe : 25 MPa pour un C25/30, l'eprouvette courante etant le cylindre
 * 16 x 32. Un prelevement dont les eprouvettes s'ecartent de plus de 15 % de
 * leur moyenne n'est pas un resultat valable : il est signale, pas juge.
 *
 * L'essai a 7 jours n'entre pas dans la conformite. Il sert d'alerte
 * precoce : un beton qui n'atteint pas 60 % de fck a 7 jours a peu de
 * chances d'etre conforme a 28.
 *
 * Fonctions pures.
 */

export const AGE_CONFORMITE_J = 28
const AGE_PRECOCE_J = 7
/** Delai laisse au laboratoire pour rendre l'essai a 28 jours. */
const DELAI_RESULTAT_J = 3
const JOUR_MS = 86_400_000

export function fckDeClasse(classe: string): number | null {
  const m = /^C(\d{1,3})\/\d{1,3}$/.exec(classe.trim().toUpperCase())
  return m ? Number(m[1]) : null
}

export type Eprouvette = { prelevement: number; ageJ: number; resistanceMpa: number }

export type ResultatPrelevement = {
  prelevement: number
  moyenneMpa: number
  /** Ecart entre la plus forte et la plus faible eprouvette, rapporte a la moyenne. */
  etendue: number
  valable: boolean
}

export type EtatBeton =
  'SANS_ESSAI' | 'EN_ATTENTE' | 'RESULTAT_EN_RETARD' | 'CONFORME' | 'NON_CONFORME' | 'A_EXPLIQUER'

export type ConformiteCoulage = {
  fck: number | null
  etat: EtatBeton
  /** Date a laquelle les essais a 28 jours sont attendus. */
  echeance: string
  resultats28: ResultatPrelevement[]
  moyenne28: number | null
  /** Seuils appliques, pour les afficher a cote du verdict. */
  seuilMoyenne: number | null
  seuilIndividuel: number | null
  /** Vrai si l'essai a 7 jours annonce un risque. */
  alertePrecoce: boolean
  motif: string
}

function apres(date: string, jours: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + jours * JOUR_MS).toISOString().slice(0, 10)
}

function resultats(eprouvettes: readonly Eprouvette[], age: number): ResultatPrelevement[] {
  const parPrelevement = new Map<number, number[]>()
  for (const e of eprouvettes.filter((x) => x.ageJ === age)) {
    parPrelevement.set(e.prelevement, [
      ...(parPrelevement.get(e.prelevement) ?? []),
      e.resistanceMpa,
    ])
  }
  return [...parPrelevement.entries()]
    .sort(([a], [b]) => a - b)
    .map(([prelevement, v]) => {
      const moyenneMpa = v.reduce((s, x) => s + x, 0) / v.length
      const etendue = (Math.max(...v) - Math.min(...v)) / moyenneMpa
      return { prelevement, moyenneMpa, etendue, valable: v.length === 1 || etendue <= 0.15 }
    })
}

/** Majoration de la moyenne selon le nombre de resultats, tableau B.1. */
function majoration(n: number): number | null {
  if (n <= 1) return null
  if (n <= 4) return 1
  return 2
}

export function conformiteCoulage(p: {
  classeBeton: string
  dateCoulage: string
  eprouvettes: readonly Eprouvette[]
  aujourdhui: string
}): ConformiteCoulage {
  const fck = fckDeClasse(p.classeBeton)
  const echeance = apres(p.dateCoulage, AGE_CONFORMITE_J)
  const r28 = resultats(p.eprouvettes, AGE_CONFORMITE_J)
  const r7 = resultats(p.eprouvettes, AGE_PRECOCE_J)
  const alertePrecoce = fck !== null && r7.some((r) => r.moyenneMpa < 0.6 * fck)
  const base = {
    fck,
    echeance,
    resultats28: r28,
    moyenne28: null,
    seuilMoyenne: null,
    seuilIndividuel: fck === null ? null : fck - 4,
    alertePrecoce,
  }

  if (r28.length === 0) {
    if (p.eprouvettes.length === 0 && p.aujourdhui < echeance) {
      return { ...base, etat: 'SANS_ESSAI', motif: 'Premiers essais à venir.' }
    }
    const enRetard = p.aujourdhui > apres(echeance, DELAI_RESULTAT_J)
    return {
      ...base,
      etat: enRetard ? 'RESULTAT_EN_RETARD' : 'EN_ATTENTE',
      motif: enRetard
        ? 'Résultats à 28 jours attendus et non saisis.'
        : 'Essais à 28 jours à venir.',
    }
  }
  if (fck === null) {
    return { ...base, etat: 'A_EXPLIQUER', motif: `Classe ${p.classeBeton} non reconnue.` }
  }

  const valables = r28.filter((r) => r.valable)
  if (valables.length === 0) {
    return {
      ...base,
      etat: 'A_EXPLIQUER',
      motif: 'Éprouvettes trop dispersées (plus de 15 % de la moyenne) : résultat à expliquer.',
    }
  }
  const n = Math.min(valables.length, 6)
  const moyenne28 = valables.reduce((s, r) => s + r.moyenneMpa, 0) / valables.length
  const m = majoration(n)
  const seuilMoyenne = m === null ? null : fck + m
  const minimum = Math.min(...valables.map((r) => r.moyenneMpa))
  const individuelOk = minimum >= fck - 4
  const moyenneOk = seuilMoyenne === null || moyenne28 >= seuilMoyenne
  const conforme = individuelOk && moyenneOk
  const motif = conforme
    ? `Conforme : ${n} résultat${n > 1 ? 's' : ''}, moyenne ${moyenne28.toFixed(1)} MPa.`
    : !individuelOk
      ? `Résultat de ${minimum.toFixed(1)} MPa sous le seuil individuel de ${fck - 4} MPa.`
      : `Moyenne de ${moyenne28.toFixed(1)} MPa sous le seuil de ${seuilMoyenne} MPa.`
  return {
    ...base,
    etat: conforme ? 'CONFORME' : 'NON_CONFORME',
    moyenne28,
    seuilMoyenne,
    motif,
  }
}
