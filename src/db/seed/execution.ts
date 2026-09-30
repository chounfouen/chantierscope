/**
 * Simulation de l'execution reelle du chantier.
 *
 * Point capital de la conception du jeu de donnees : la derive du planning
 * n'est PAS ecrite en dur. Aucune date n'est decalee a la main. La simulation
 * produit, jour par jour, des quantites realisees inferieures au rythme
 * necessaire, et des journees perdues pour intemperie ou rupture
 * d'approvisionnement. Le retard EMERGE de ces quantites.
 *
 * C'est la seule facon d'obtenir une demonstration coherente : si les dates
 * etaient decalees directement, les indicateurs calcules a partir des
 * quantites contrediraient l'histoire racontee.
 *
 * Trois causes de sous-performance sont modelisees :
 *   1. La meteo reelle d'Abidjan, qui bloque certaines natures d'ouvrage.
 *   2. Un rendement de lot inferieur a l'unite, marque sur le gros oeuvre.
 *   3. Une rupture d'approvisionnement en acier, qui arrete tout ferraillage.
 */

import { addDays, differenceInCalendarDays, formatISO, parseISO } from 'date-fns'
import { naturesBloquees, causeArret } from '@/db/compute/meteo'
import { DATE_ANALYSE, DATE_ORDRE_SERVICE } from '@/db/seed/catalogue'
import { hasard, GRAINE } from '@/db/seed/hasard'
import { chargerMeteo, type JourneeMeteo } from '@/db/seed/meteo'
import { calerPlanning, type Planning, type TachePlanning } from '@/db/seed/planning'
import type { Nature } from '@/db/schema'

/* -------------------------------------------------------------------------- */
/* Parametres du modele                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Rendement moyen par lot, rapporte au rythme planifie.
 *
 * Le gros oeuvre est volontairement sous-performant : c'est lui qui porte la
 * derive, et c'est le lot le plus lourd du marche, donc celui dont le retard
 * pese le plus sur l'avancement global. Les autres lots tournent proches du
 * prevu, avec la dispersion normale d'un chantier.
 */
const RENDEMENT_LOT: Record<string, number> = {
  '01': 1.0,
  '02': 1.0,
  '03': 0.995,
  '04': 0.985,
  '05': 1.0,
  '06': 0.99,
  '07': 1.0,
  '08': 1.0,
}

/** Rupture d'approvisionnement en acier : tout ferraillage s'arrete. */
const RUPTURE_ACIER = { debut: '2026-06-15', fin: '2026-06-20' }

/** Panne de la grue a tour. */
const PANNE_GRUE = { debut: '2026-05-11', fin: '2026-05-13' }

/** Effectif ouvrier type d'une tache, par nature d'ouvrage. */
const EFFECTIF_NATURE: Record<Nature, number> = {
  TERRASSEMENT: 8,
  VRD: 6,
  ENROBES: 8,
  FONDATION: 12,
  BETONNAGE: 14,
  LEVAGE: 4,
  MACONNERIE: 10,
  CHARPENTE: 8,
  ETANCHEITE: 6,
  ENDUIT: 12,
  INTERIEUR: 10,
  SUPPORT: 5,
}

/* -------------------------------------------------------------------------- */
/* Types produits                                                             */
/* -------------------------------------------------------------------------- */

export type QuantiteJour = {
  /** Indice de la ligne dans `tache.lignes`. */
  ligne: number
  quantite: number
}

export type ReleveSimule = {
  date: string
  lot: string
  effectifOuvriers: number
  effectifEncadrement: number
  heuresTravaillees: number
  meteo: JourneeMeteo
  journeeTravaillee: boolean
  motifArret: string | null
  observations: string | null
  /** Quantites realisees, par code de tache. */
  quantites: Map<string, QuantiteJour[]>
}

export type AleaSimule = {
  date: string
  lot: string | null
  tache: string | null
  type:
    | 'INTEMPERIE'
    | 'INCIDENT'
    | 'NON_CONFORMITE'
    | 'AVENANT'
    | 'PANNE_ENGIN'
    | 'RUPTURE_APPROVISIONNEMENT'
    | 'ADMINISTRATIF'
  gravite: number
  description: string
  impactDelaiJ: number
  impactCoutXof: number
  statut: 'OUVERT' | 'EN_TRAITEMENT' | 'SOLDE'
  resoluLe: string | null
}

export type Execution = {
  planning: Planning
  releves: ReleveSimule[]
  aleas: AleaSimule[]
  /** Dates reelles constatees, par code de tache. */
  reelles: Map<string, { debut: string | null; fin: string | null }>
  /** Quantites cumulees realisees, par code de tache puis indice de ligne. */
  cumuls: Map<string, number[]>
  dernierJour: number
}

/* -------------------------------------------------------------------------- */
/* Simulation                                                                 */
/* -------------------------------------------------------------------------- */

const jour = (n: number): string =>
  formatISO(addDays(parseISO(DATE_ORDRE_SERVICE), n), { representation: 'date' })

const indiceJour = (date: string): number =>
  differenceInCalendarDays(parseISO(date), parseISO(DATE_ORDRE_SERVICE))

export function simulerExecution(): Execution {
  const planning = calerPlanning()
  const meteo = chargerMeteo()
  const h = hasard(GRAINE)

  const dernierJour = indiceJour(DATE_ANALYSE)

  /** Predecesseurs, par code de tache aval. */
  const predecesseurs = new Map<string, { amont: string; type: string; decalage: number }[]>()
  for (const t of planning.taches) predecesseurs.set(t.code, [])
  for (const l of planning.liaisons) {
    predecesseurs.get(l.aval)?.push({ amont: l.amont, type: l.type, decalage: l.decalage })
  }

  /* Etat de chaque tache. */
  const cumuls = new Map<string, number[]>()
  const debutReel = new Map<string, number>()
  const finReelle = new Map<string, number>()
  for (const t of planning.taches)
    cumuls.set(
      t.code,
      t.lignes.map(() => 0),
    )

  const releves: ReleveSimule[] = []
  const aleas: AleaSimule[] = []

  /** Une tache est achevee quand toutes ses lignes atteignent le prevu. */
  const achevee = (t: TachePlanning): boolean => {
    const c = cumuls.get(t.code)
    if (!c) return false
    return t.lignes.every((ligne, i) => (c[i] ?? 0) >= ligne.quantite - 1e-6)
  }

  /** Les predecesseurs autorisent-ils le travail au jour j, dates REELLES ? */
  const pretAuTravail = (t: TachePlanning, j: number): boolean => {
    for (const p of predecesseurs.get(t.code) ?? []) {
      if (p.type === 'DD') {
        const d = debutReel.get(p.amont)
        if (d === undefined || j < d + p.decalage) return false
      } else {
        // FD, et par defaut les types rares, traites comme fin-debut.
        const f = finReelle.get(p.amont)
        if (f === undefined || j < f + 1 + p.decalage) return false
      }
    }
    return true
  }

  const dansFenetre = (j: number, f: { debut: string; fin: string }): boolean =>
    j >= indiceJour(f.debut) && j <= indiceJour(f.fin)

  /* --- Boucle journaliere -------------------------------------------------- */

  /** Journees d'arret meteo constatees, pour le regroupement en aleas. */
  const arretsMeteo: { j: number; cause: string; libelle: string; lots: Set<string> }[] = []

  for (let j = 0; j <= dernierJour; j++) {
    const date = jour(j)
    const m = meteo.get(date)
    if (!m) throw new Error(`Meteo absente pour ${date}. Relancer src/db/seed/meteo.ts.`)

    const bloquees = naturesBloquees(m)
    const cause = causeArret(m)
    const rupture = dansFenetre(j, RUPTURE_ACIER)
    const panne = dansFenetre(j, PANNE_GRUE)

    /** Travail du jour, par lot. */
    const travail = new Map<
      string,
      { quantites: Map<string, QuantiteJour[]>; ouvriers: number; bloque: boolean }
    >()

    for (const t of planning.taches) {
      if (achevee(t)) continue
      if (j < t.debut) continue
      if (!pretAuTravail(t, j)) continue

      const lot = t.lot
      if (!travail.has(lot)) {
        travail.set(lot, { quantites: new Map(), ouvriers: 0, bloque: false })
      }
      const etatLot = travail.get(lot) as NonNullable<ReturnType<typeof travail.get>>

      const empecheeMeteo = bloquees.has(t.nature)
      const empecheeGrue = panne && (t.nature === 'LEVAGE' || t.nature === 'BETONNAGE')

      if (empecheeMeteo || empecheeGrue) {
        etatLot.bloque = true
        continue
      }

      /* La tache travaille. */
      if (!debutReel.has(t.code)) debutReel.set(t.code, j)

      const rendement = Math.min(
        1.45,
        Math.max(0.35, (RENDEMENT_LOT[t.lot] ?? 1) * (1 + 0.1 * h.gaussien())),
      )

      const c = cumuls.get(t.code) as number[]
      const lignesDuJour: QuantiteJour[] = []

      t.lignes.forEach((ligne, i) => {
        const reste = ligne.quantite - (c[i] ?? 0)
        if (reste <= 1e-6) return

        // Le ferraillage s'arrete pendant la rupture d'approvisionnement.
        const ferraillage =
          ligne.unite === 'KG' && ligne.designation.toLowerCase().includes('acier')
        if (rupture && ferraillage) return

        const rythme = ligne.quantite / t.duree
        const produit = Math.min(reste, rythme * rendement)
        if (produit <= 1e-6) return

        c[i] = (c[i] ?? 0) + produit
        lignesDuJour.push({ ligne: i, quantite: arrondi(produit, 3) })
      })

      if (lignesDuJour.length > 0) {
        etatLot.quantites.set(t.code, lignesDuJour)
        etatLot.ouvriers += EFFECTIF_NATURE[t.nature]
      }

      if (achevee(t)) finReelle.set(t.code, j)
    }

    /* --- Redaction des releves du jour ------------------------------------ */

    const lotsArretes = new Set<string>()

    for (const [lot, etat] of travail) {
      const aProduit = etat.quantites.size > 0
      const journeeTravaillee = aProduit

      if (!journeeTravaillee) lotsArretes.add(lot)

      const ouvriers = aProduit ? etat.ouvriers + h.entier(-2, 3) : 0
      const encadrement = aProduit ? Math.ceil(ouvriers / 12) + 1 : 0
      const heures = aProduit ? arrondi(Math.max(0, ouvriers) * h.entre(7.2, 8.6), 2) : 0

      const motif = journeeTravaillee
        ? null
        : rupture && lot === '04'
          ? 'Rupture d approvisionnement en acier a beton'
          : panne && lot === '04'
            ? 'Grue a tour immobilisee, intervention du mainteneur'
            : (cause?.libelle ?? 'Aucune tache mobilisable ce jour')

      releves.push({
        date,
        lot,
        effectifOuvriers: Math.max(0, ouvriers),
        effectifEncadrement: encadrement,
        heuresTravaillees: heures,
        meteo: m,
        journeeTravaillee,
        motifArret: motif,
        observations: redigerObservation(h, m, journeeTravaillee, rupture, panne, lot),
        quantites: etat.quantites,
      })
    }

    if (cause && lotsArretes.size > 0) {
      arretsMeteo.push({ j, cause: cause.cause, libelle: cause.libelle, lots: lotsArretes })
    }
  }

  /* --- Aleas ------------------------------------------------------------- */

  aleas.push(...regrouperIntemperies(arretsMeteo))

  aleas.push({
    date: RUPTURE_ACIER.debut,
    lot: '04',
    tache: null,
    type: 'RUPTURE_APPROVISIONNEMENT',
    gravite: 4,
    description:
      'Rupture de stock du fournisseur d acier a beton. Aucune livraison de barres haute adherence ' +
      'pendant six jours. Le ferraillage des voiles et planchers est totalement interrompu.',
    impactDelaiJ: indiceJour(RUPTURE_ACIER.fin) - indiceJour(RUPTURE_ACIER.debut) + 1,
    impactCoutXof: 5_100_000,
    statut: 'SOLDE',
    resoluLe: RUPTURE_ACIER.fin,
  })

  aleas.push({
    date: PANNE_GRUE.debut,
    lot: '04',
    tache: null,
    type: 'PANNE_ENGIN',
    gravite: 3,
    description:
      'Avarie du variateur de la grue a tour. Immobilisation pendant trois jours dans l attente ' +
      'de la piece et de l intervention du mainteneur.',
    impactDelaiJ: 3,
    impactCoutXof: 4_200_000,
    statut: 'SOLDE',
    resoluLe: PANNE_GRUE.fin,
  })

  aleas.push(...nonConformites(h))

  aleas.sort((a, b) => a.date.localeCompare(b.date))

  /* --- Dates reelles ------------------------------------------------------ */

  const reelles = new Map<string, { debut: string | null; fin: string | null }>()
  for (const t of planning.taches) {
    const d = debutReel.get(t.code)
    const f = finReelle.get(t.code)
    reelles.set(t.code, {
      debut: d === undefined ? null : jour(d),
      fin: f === undefined ? null : jour(f),
    })
  }

  return { planning, releves, aleas, reelles, cumuls, dernierJour }
}

/* -------------------------------------------------------------------------- */
/* Fabrication des aleas                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Les journees d'arret meteo consecutives ou proches sont regroupees : un
 * conducteur de travaux declare une serie d'intemperies, pas vingt-et-un
 * aleas d'un jour.
 */
function regrouperIntemperies(
  arrets: { j: number; cause: string; libelle: string; lots: Set<string> }[],
): AleaSimule[] {
  const series: (typeof arrets)[] = []
  for (const a of arrets) {
    const derniere = series[series.length - 1]
    const precedent = derniere?.[derniere.length - 1]
    if (derniere && precedent && a.j - precedent.j <= 3) derniere.push(a)
    else series.push([a])
  }

  return series.map((serie) => {
    const premier = serie[0] as (typeof arrets)[number]
    const dernier = serie[serie.length - 1] as (typeof arrets)[number]
    const jours = serie.length
    const lots = new Set(serie.flatMap((a) => [...a.lots]))
    return {
      date: jour(premier.j),
      lot: lots.size === 1 ? ([...lots][0] as string) : null,
      tache: null,
      type: 'INTEMPERIE' as const,
      gravite: jours >= 4 ? 3 : jours >= 2 ? 2 : 1,
      description:
        jours === 1
          ? `Journee d arret pour intemperie. ${premier.libelle}.`
          : `Serie d intemperies sur ${jours} journees d arret. ${premier.libelle}.`,
      impactDelaiJ: jours,
      impactCoutXof: jours * 1_850_000,
      statut: 'SOLDE' as const,
      resoluLe: jour(dernier.j),
    }
  })
}

const NON_CONFORMITES = [
  {
    date: '2026-04-22',
    lot: '03',
    gravite: 3,
    description:
      'Enrobage insuffisant des aciers sur trois semelles isolees de l axe C. Reprise par ' +
      'ragreage et controle contradictoire demande par le bureau de controle.',
    cout: 2_400_000,
    resolu: '2026-05-04',
  },
  {
    date: '2026-06-02',
    lot: '04',
    gravite: 2,
    description:
      'Defaut de planeite du plancher haut du rez-de-chaussee, ecart de 18 mm sur une regle de ' +
      'deux metres. Rattrapage prevu a la chape.',
    cout: 1_150_000,
    resolu: '2026-06-18',
  },
  {
    date: '2026-07-14',
    lot: '04',
    gravite: 3,
    description:
      'Resistance a 28 jours insuffisante sur le prelevement du voile V12 du R+1, 24,3 MPa pour ' +
      '25 MPa requis. Carottage et essai complementaire demandes.',
    cout: 3_800_000,
    resolu: '2026-08-08',
  },
  {
    date: '2026-08-26',
    lot: '02',
    gravite: 2,
    description:
      'Pente insuffisante sur trente metres du reseau d eaux usees entre les regards R4 et R5. ' +
      'Repose du troncon exigee.',
    cout: 1_650_000,
    resolu: null,
  },
  {
    date: '2026-09-15',
    lot: '04',
    gravite: 2,
    description:
      'Fissuration de retrait sur l acrotere de la facade est. Traitement par pontage et ' +
      'reprise d etancheite a prevoir.',
    cout: 890_000,
    resolu: null,
  },
] as const

function nonConformites(h: ReturnType<typeof hasard>): AleaSimule[] {
  return NON_CONFORMITES.map((nc) => ({
    date: nc.date,
    lot: nc.lot,
    tache: null,
    type: 'NON_CONFORMITE' as const,
    gravite: nc.gravite,
    description: nc.description,
    impactDelaiJ: nc.resolu === null ? 0 : h.entier(2, 6),
    impactCoutXof: nc.cout,
    statut: nc.resolu === null ? ('EN_TRAITEMENT' as const) : ('SOLDE' as const),
    resoluLe: nc.resolu,
  }))
}

/* -------------------------------------------------------------------------- */
/* Observations de chantier                                                   */
/* -------------------------------------------------------------------------- */

const OBSERVATIONS_NORMALES = [
  'Journee sans incident.',
  'Livraison de materiaux conforme au bon de commande.',
  'Visite du bureau de controle, aucune reserve.',
  'Reunion de chantier hebdomadaire tenue sur site.',
  'Controle de reception des aciers avant coulage.',
  'Essai d affaissement au cone realise, resultat conforme.',
  'Nettoyage des acces et evacuation des gravats.',
  null,
  null,
  null,
]

function redigerObservation(
  h: ReturnType<typeof hasard>,
  m: JourneeMeteo,
  travaillee: boolean,
  rupture: boolean,
  panne: boolean,
  lot: string,
): string | null {
  if (!travaillee) {
    if (rupture && lot === '04') return 'Chantier a l arret sur le lot, aucune barre disponible.'
    if (panne && lot === '04') return 'Grue consignee, seules les taches au sol restent possibles.'
    return `Arret de production. Precipitations relevees : ${m.precipitationsMm} mm.`
  }
  if (m.precipitationsMm > 5) {
    return `Pluie intermittente, ${m.precipitationsMm} mm. Production ralentie en fin de journee.`
  }
  return h.choix(OBSERVATIONS_NORMALES)
}

function arrondi(v: number, d: number): number {
  const f = 10 ** d
  return Math.round(v * f) / f
}
