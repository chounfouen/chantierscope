/**
 * Calculs de l'ecran d'analyses.
 *
 * Fonctions pures. Les jours sont comptes depuis l'ordre de service, bornes
 * incluses ; seuls les releves VALIDES entrent dans les series, comme dans
 * tous les indicateurs.
 */

import { avancementPrevu } from '@/db/compute/avancement'
import type { Nature, Unite } from '@/db/schema'

/* -------------------------------------------------------------------------- */
/* Entrees                                                                    */
/* -------------------------------------------------------------------------- */

export type ReleveAnalyse = {
  jour: number
  lotId: string
  ouvriers: number
  journeeTravaillee: boolean
  motifArret: string | null
}

export type QuantiteAnalyse = { ligneId: string; jour: number; quantite: number }

export type LigneAnalyse = {
  id: string
  tacheId: string
  designation: string
  unite: Unite
  quantitePrevue: number
  prixUnitaireXof: number
}

export type TacheAnalyse = {
  id: string
  lotId: string
  nature: Nature
  debut: number
  duree: number
}

export type EquipeAnalyse = { tacheId: string; ouvriers: number; debut: number; fin: number }

export type AleaAnalyse = {
  jour: number
  type: string
  gravite: number
  impactDelaiJ: number
}

/* -------------------------------------------------------------------------- */
/* Effectifs                                                                  */
/* -------------------------------------------------------------------------- */

export type PointEffectif = {
  jour: number
  /** Ouvriers releves, nul au-dela de la date d'analyse. */
  reel: number | null
  /** Ouvriers des equipes affectees au planning ce jour-la. */
  prevu: number
}

/**
 * Effectif ouvrier jour par jour, releve contre charge prevue.
 *
 * La charge prevue est celle des equipes affectees aux taches, sur leurs
 * dates d'affectation : la meme base que le budget de debourse. La serie se
 * prolonge au-dela de la date d'analyse, pour montrer la charge a venir.
 */
export function effectifs(
  releves: readonly ReleveAnalyse[],
  equipes: readonly EquipeAnalyse[],
  jourAnalyse: number,
  horizonJ: number,
): PointEffectif[] {
  const fin = jourAnalyse + horizonJ
  const reel = new Array<number>(jourAnalyse + 1).fill(0)
  for (const r of releves) if (r.jour >= 0 && r.jour <= jourAnalyse) reel[r.jour]! += r.ouvriers
  const prevu = new Array<number>(fin + 1).fill(0)
  for (const e of equipes) {
    for (let j = Math.max(0, e.debut); j <= Math.min(fin, e.fin); j++) prevu[j]! += e.ouvriers
  }
  return prevu.map((p, jour) => ({
    jour,
    reel: jour <= jourAnalyse ? (reel[jour] ?? 0) : null,
    prevu: p,
  }))
}

/* -------------------------------------------------------------------------- */
/* Materiaux                                                                  */
/* -------------------------------------------------------------------------- */

export type FamilleMateriau = 'BETON' | 'ACIER' | 'COFFRAGE'

export const MATERIAUX: Record<
  FamilleMateriau,
  { libelle: string; unite: string; unitesSource: Unite; motif: RegExp; facteur: number }
> = {
  BETON: { libelle: 'Béton', unite: 'm3', unitesSource: 'M3', motif: /b[ée]ton/i, facteur: 1 },
  // Le quantitatif compte l'acier en kilogrammes ; le chantier raisonne en tonnes.
  ACIER: { libelle: 'Acier', unite: 't', unitesSource: 'KG', motif: /acier/i, facteur: 1 / 1000 },
  COFFRAGE: {
    libelle: 'Coffrage',
    unite: 'm2',
    unitesSource: 'M2',
    motif: /^coffrage/i,
    facteur: 1,
  },
}

/** Famille d'une ligne de quantitatif, par son unite et sa designation. */
export function familleDe(l: Pick<LigneAnalyse, 'unite' | 'designation'>): FamilleMateriau | null {
  for (const [f, m] of Object.entries(MATERIAUX) as [
    FamilleMateriau,
    (typeof MATERIAUX)[FamilleMateriau],
  ][]) {
    if (l.unite === m.unitesSource && m.motif.test(l.designation)) return f
  }
  return null
}

export type PointMateriau = { jour: number; prevu: number; realise: number }

export type ConsommationMateriau = {
  famille: FamilleMateriau
  /** Quantite totale du marche, dans l'unite affichee. */
  total: number
  serie: PointMateriau[]
}

/**
 * Consommation cumulee des trois materiaux cles, prevue contre realisee.
 *
 * Le prevu applique a chaque ligne l'avancement planifie lineaire de sa
 * tache, comme la valeur planifiee ; le realise cumule les quantites des
 * releves valides.
 */
export function consommations(
  lignes: readonly LigneAnalyse[],
  taches: readonly TacheAnalyse[],
  quantites: readonly QuantiteAnalyse[],
  jourAnalyse: number,
): ConsommationMateriau[] {
  const tache = new Map(taches.map((t) => [t.id, t]))
  return (Object.keys(MATERIAUX) as FamilleMateriau[]).map((famille) => {
    const facteur = MATERIAUX[famille].facteur
    const retenues = lignes.filter((l) => familleDe(l) === famille)
    const ids = new Set(retenues.map((l) => l.id))

    const parJour = new Array<number>(jourAnalyse + 1).fill(0)
    for (const q of quantites) {
      if (ids.has(q.ligneId) && q.jour >= 0 && q.jour <= jourAnalyse) parJour[q.jour]! += q.quantite
    }

    let cumul = 0
    const serie = parJour.map((q, jour) => {
      cumul += q
      const prevu = retenues.reduce((s, l) => {
        const t = tache.get(l.tacheId)
        return s + (t ? avancementPrevu(t, jour) * l.quantitePrevue : 0)
      }, 0)
      return { jour, prevu: prevu * facteur, realise: cumul * facteur }
    })

    return {
      famille,
      total: retenues.reduce((s, l) => s + l.quantitePrevue, 0) * facteur,
      serie,
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Rendements                                                                 */
/* -------------------------------------------------------------------------- */

export type RendementNature = {
  nature: Nature
  /** Ouvriers-jours attribues aux taches de cette nature. */
  ouvriersJours: number
  /** Valeur des quantites produites, au prix du marche. */
  productionXof: number
  /** Valeur produite par ouvrier et par jour, constatee et prevue. */
  rendementReelXof: number | null
  rendementPrevuXof: number
  /** Rapport du constate au prevu : 1, rendement nominal. */
  indice: number | null
  /** Meme rapport sur les trente derniers jours. */
  indiceRecent: number | null
  /** Unite principale de la nature et quantite par ouvrier-jour. */
  unite: Unite
  quantiteParOuvrierJour: number | null
  quantitePrevueParOuvrierJour: number | null
}

export const FENETRE_RECENTE_J = 30

/**
 * Rendement par nature de tache : quantite produite par ouvrier et par jour.
 *
 * Le releve porte l'effectif d'un LOT pour la journee, pas celui de chaque
 * tache. L'effectif est donc reparti entre les taches du lot qui ont produit
 * ce jour-la, au prorata de l'equipe que le planning leur affecte : a
 * productivite egale, une tache servie par une equipe de dix produit cinq
 * fois plus qu'une tache servie par deux. Les journees d'un lot sans aucune
 * quantite relevee ne sont attribuees a aucune tache.
 *
 * Les natures ont des unites differentes : le rendement se compare donc a
 * son propre prevu, budget de la nature sur ouvriers-jours planifies, et
 * c'est l'indice, sans unite, qui rend les natures comparables entre elles.
 */
export function rendements(
  lignes: readonly LigneAnalyse[],
  taches: readonly TacheAnalyse[],
  equipes: readonly EquipeAnalyse[],
  releves: readonly ReleveAnalyse[],
  quantites: readonly QuantiteAnalyse[],
  jourAnalyse: number,
): RendementNature[] {
  const tache = new Map(taches.map((t) => [t.id, t]))
  const ligne = new Map(lignes.map((l) => [l.id, l]))
  const equipeTache = new Map<string, number>()
  const ouvriersJoursPrevus = new Map<string, number>()
  for (const e of equipes) {
    equipeTache.set(e.tacheId, Math.max(equipeTache.get(e.tacheId) ?? 0, e.ouvriers))
    ouvriersJoursPrevus.set(
      e.tacheId,
      (ouvriersJoursPrevus.get(e.tacheId) ?? 0) + e.ouvriers * Math.max(0, e.fin - e.debut + 1),
    )
  }

  /* Production par tache et par jour, en valeur et en quantite par unite. */
  type Production = { valeur: number; quantites: Map<Unite, number> }
  const production = new Map<string, Production>() // cle tache|jour
  const tachesActives = new Map<string, Set<string>>() // cle lot|jour
  for (const q of quantites) {
    if (q.jour > jourAnalyse) continue
    const l = ligne.get(q.ligneId)
    const t = l ? tache.get(l.tacheId) : undefined
    if (!l || !t) continue
    const cle = `${t.id}|${q.jour}`
    const p = production.get(cle) ?? { valeur: 0, quantites: new Map<Unite, number>() }
    p.valeur += q.quantite * l.prixUnitaireXof
    p.quantites.set(l.unite, (p.quantites.get(l.unite) ?? 0) + q.quantite)
    production.set(cle, p)
    const cleLot = `${t.lotId}|${q.jour}`
    const actives = tachesActives.get(cleLot) ?? new Set<string>()
    actives.add(t.id)
    tachesActives.set(cleLot, actives)
  }

  /* Ouvriers-jours attribues a chaque tache, au total et sur la fenetre recente. */
  const attribues = new Map<string, number>()
  const attribuesRecents = new Map<string, number>()
  const productionRecente = new Map<string, number>()
  for (const r of releves) {
    if (r.jour > jourAnalyse || r.ouvriers <= 0) continue
    const actives = [...(tachesActives.get(`${r.lotId}|${r.jour}`) ?? [])]
    if (actives.length === 0) continue
    const poids = actives.map((id) => equipeTache.get(id) ?? 1)
    const total = poids.reduce((a, b) => a + b, 0)
    const recent = r.jour > jourAnalyse - FENETRE_RECENTE_J
    actives.forEach((id, i) => {
      const part = (r.ouvriers * (poids[i] ?? 1)) / total
      attribues.set(id, (attribues.get(id) ?? 0) + part)
      if (recent) {
        attribuesRecents.set(id, (attribuesRecents.get(id) ?? 0) + part)
        productionRecente.set(
          id,
          (productionRecente.get(id) ?? 0) + (production.get(`${id}|${r.jour}`)?.valeur ?? 0),
        )
      }
    })
  }

  /* Agregation par nature. */
  const natures = [...new Set(taches.map((t) => t.nature))].sort()
  return natures
    .map((nature): RendementNature => {
      const ids = taches.filter((t) => t.nature === nature).map((t) => t.id)
      const lignesNature = lignes.filter((l) => ids.includes(l.tacheId))
      const budget = lignesNature.reduce((s, l) => s + l.quantitePrevue * l.prixUnitaireXof, 0)
      const prevusOJ = ids.reduce((s, id) => s + (ouvriersJoursPrevus.get(id) ?? 0), 0)

      // Unite principale : celle qui porte le plus de valeur dans la nature.
      const valeurParUnite = new Map<Unite, number>()
      for (const l of lignesNature) {
        valeurParUnite.set(
          l.unite,
          (valeurParUnite.get(l.unite) ?? 0) + l.quantitePrevue * l.prixUnitaireXof,
        )
      }
      const unite = [...valeurParUnite.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'U'
      const quantitePrevue = lignesNature
        .filter((l) => l.unite === unite)
        .reduce((s, l) => s + l.quantitePrevue, 0)

      let ouvriersJours = 0
      let productionXof = 0
      let quantite = 0
      let ojRecents = 0
      let prodRecente = 0
      for (const id of ids) {
        ouvriersJours += attribues.get(id) ?? 0
        ojRecents += attribuesRecents.get(id) ?? 0
        prodRecente += productionRecente.get(id) ?? 0
      }
      for (const [cle, p] of production) {
        if (!ids.includes(cle.split('|')[0] as string)) continue
        productionXof += p.valeur
        quantite += p.quantites.get(unite) ?? 0
      }

      const rendementPrevuXof = prevusOJ > 0 ? budget / prevusOJ : 0
      const rendementReelXof = ouvriersJours > 0 ? productionXof / ouvriersJours : null
      const reelRecent = ojRecents > 0 ? prodRecente / ojRecents : null
      return {
        nature,
        ouvriersJours,
        productionXof,
        rendementReelXof,
        rendementPrevuXof,
        indice:
          rendementReelXof !== null && rendementPrevuXof > 0
            ? rendementReelXof / rendementPrevuXof
            : null,
        indiceRecent:
          reelRecent !== null && rendementPrevuXof > 0 ? reelRecent / rendementPrevuXof : null,
        unite,
        quantiteParOuvrierJour: ouvriersJours > 0 ? quantite / ouvriersJours : null,
        quantitePrevueParOuvrierJour: prevusOJ > 0 ? quantitePrevue / prevusOJ : null,
      }
    })
    .filter((r) => r.ouvriersJours > 0)
}

/* -------------------------------------------------------------------------- */
/* Aleas et journees perdues                                                  */
/* -------------------------------------------------------------------------- */

export type RepartitionAleas = {
  type: string
  total: number
  /** Nombre d'aleas par gravite, de 1 a 4. */
  parGravite: [number, number, number, number]
  joursPerdus: number
}

/** Aleas survenus jusqu'a la date d'analyse, par type, du plus frequent au plus rare. */
export function repartitionAleas(
  aleas: readonly AleaAnalyse[],
  jourAnalyse: number,
): RepartitionAleas[] {
  const parType = new Map<string, RepartitionAleas>()
  for (const a of aleas) {
    if (a.jour > jourAnalyse) continue
    const r = parType.get(a.type) ?? {
      type: a.type,
      total: 0,
      parGravite: [0, 0, 0, 0],
      joursPerdus: 0,
    }
    r.total++
    const g = Math.min(4, Math.max(1, a.gravite)) - 1
    r.parGravite[g as 0 | 1 | 2 | 3] += 1
    r.joursPerdus += a.impactDelaiJ
    parType.set(a.type, r)
  }
  return [...parType.values()].sort((a, b) => b.total - a.total || a.type.localeCompare(b.type))
}

/** Jours perdus cumules par les aleas, jour par jour jusqu'a la date d'analyse. */
export function joursPerdusCumules(
  aleas: readonly AleaAnalyse[],
  jourAnalyse: number,
): { jour: number; cumul: number }[] {
  const parJour = new Array<number>(jourAnalyse + 1).fill(0)
  for (const a of aleas)
    if (a.jour >= 0 && a.jour <= jourAnalyse) parJour[a.jour]! += a.impactDelaiJ
  let cumul = 0
  return parJour.map((n, jour) => ({ jour, cumul: (cumul += n) }))
}

export type CauseArret = {
  cause: string
  /** Journees calendaires distinctes touchees. */
  journees: number
  /** Journees de lot non travaillees : un arret sur trois lots en compte trois. */
  journeesLot: number
}

/** Journees non travaillees par cause, de la plus frequente a la plus rare. */
export function arretsParCause(
  releves: readonly ReleveAnalyse[],
  jourAnalyse: number,
): CauseArret[] {
  const parCause = new Map<string, { jours: Set<number>; lots: number }>()
  for (const r of releves) {
    if (r.journeeTravaillee || r.jour > jourAnalyse) continue
    const cause = r.motifArret?.trim() || 'Cause non précisée'
    const c = parCause.get(cause) ?? { jours: new Set<number>(), lots: 0 }
    c.jours.add(r.jour)
    c.lots++
    parCause.set(cause, c)
  }
  return [...parCause.entries()]
    .map(([cause, c]) => ({ cause, journees: c.jours.size, journeesLot: c.lots }))
    .sort(
      (a, b) =>
        b.journees - a.journees || b.journeesLot - a.journeesLot || a.cause.localeCompare(b.cause),
    )
}
