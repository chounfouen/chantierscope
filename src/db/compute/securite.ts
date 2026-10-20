/**
 * Indicateurs du registre de securite.
 *
 * Les deux taux de reference du BTP rapportent les accidents aux heures
 * travaillees, ce qui permet de comparer un chantier de vingt ouvriers a un
 * chantier de deux cents :
 *
 *   taux de frequence  TF = accidents avec arret x 1 000 000 / heures
 *   taux de gravite    TG = jours d'arret x 1 000 / heures
 *
 * Seuls les accidents avec arret entrent dans ces taux. Les accidents sans
 * arret, presqu'accidents et situations dangereuses sont comptes a part :
 * ils sont le terreau des accidents de demain, et c'est leur remontee qui
 * fait la prevention.
 *
 * Les heures sont celles des ouvriers, lues sur les releves valides. Fonctions
 * pures : la base fournit les evenements et les heures.
 */

import type { TypeEvenementSecurite } from '@/db/schema'

const JOUR_MS = 86_400_000

export type EvenementCompte = { date: string; type: TypeEvenementSecurite; joursArret: number }

export type IndicateursSecurite = {
  heures: number
  accidentsAvecArret: number
  accidentsSansArret: number
  /** Presqu'accidents et situations dangereuses : les signaux faibles. */
  signaux: number
  joursArret: number
  /** Nuls tant qu'aucune heure n'est travaillee. */
  tauxFrequence: number | null
  tauxGravite: number | null
  causeries: number
  visites: number
  /** Jours ecoules depuis le dernier accident avec arret, ou depuis l'origine. */
  joursSansAccident: number
}

export function indicateursSecurite(p: {
  evenements: readonly EvenementCompte[]
  heures: number
  origine: string
  aujourdhui: string
}): IndicateursSecurite {
  const passes = p.evenements.filter((e) => e.date <= p.aujourdhui)
  const compte = (...types: TypeEvenementSecurite[]) =>
    passes.filter((e) => types.includes(e.type)).length
  const avecArret = passes.filter((e) => e.type === 'ACCIDENT_AVEC_ARRET')
  const joursArret = avecArret.reduce((s, e) => s + e.joursArret, 0)
  const dernier =
    avecArret
      .map((e) => e.date)
      .sort()
      .at(-1) ?? p.origine
  const ecart = Math.round(
    (Date.parse(`${p.aujourdhui}T00:00:00Z`) - Date.parse(`${dernier}T00:00:00Z`)) / JOUR_MS,
  )
  return {
    heures: p.heures,
    accidentsAvecArret: avecArret.length,
    accidentsSansArret: compte('ACCIDENT_SANS_ARRET'),
    signaux: compte('PRESQU_ACCIDENT', 'SITUATION_DANGEREUSE'),
    joursArret,
    tauxFrequence: p.heures > 0 ? (avecArret.length * 1_000_000) / p.heures : null,
    tauxGravite: p.heures > 0 ? (joursArret * 1_000) / p.heures : null,
    causeries: compte('CAUSERIE'),
    visites: compte('VISITE'),
    joursSansAccident: Math.max(0, ecart),
  }
}

/**
 * Situation d'un sous-traitant : la part executee de son contrat, lue sur
 * l'avancement de ses lots pondere par leur budget. Un sous-traitant
 * titulaire de lots entiers est paye au rythme de ces lots.
 */
export function situationSousTraitant(p: {
  montantXof: number
  lots: readonly { budgetXof: number; valeurAcquiseXof: number }[]
}): { avancement: number; travauxXof: number } {
  const budget = p.lots.reduce((s, l) => s + l.budgetXof, 0)
  const acquis = p.lots.reduce((s, l) => s + l.valeurAcquiseXof, 0)
  const avancement = budget > 0 ? Math.min(1, acquis / budget) : 0
  return { avancement, travauxXof: Math.round(p.montantXof * avancement) }
}
