/**
 * Schemas de saisie d'un releve journalier.
 *
 * Un schema par etape du formulaire, partage entre le navigateur et le
 * serveur. Le navigateur s'en sert pour refuser une etape incomplete avant de
 * passer a la suivante ; le serveur s'en sert pour refuser une charge utile
 * forgee. Ecrire la regle deux fois garantirait qu'elles divergent.
 *
 * Le releve complet est l'assemblage des etapes, plus les regles qui portent
 * sur plusieurs etapes a la fois : une journee arretee ne porte aucune
 * quantite, par exemple.
 *
 * Module pur : ni base, ni cadre applicatif. Il est importe par des
 * composants clients.
 */

import { z } from 'zod'
import { typeAlea, uniteMesure } from '@/db/schema'

/* -------------------------------------------------------------------------- */
/* Briques                                                                    */
/* -------------------------------------------------------------------------- */

/** Date de planning, sans heure ni fuseau. */
export const DateSimple = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.')
  .refine(dateExiste, 'Date inexistante.')

/**
 * `Date.parse` accepte le 30 fevrier et le reporte au 2 mars. Seul un
 * aller-retour prouve que la date existe au calendrier.
 */
function dateExiste(d: string): boolean {
  const t = Date.parse(`${d}T00:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d
}

const Identifiant = z.uuid('Identifiant invalide.')

/** Plafond d'heures par ouvrier et par jour, heures supplementaires comprises. */
export const HEURES_MAX_PAR_OUVRIER = 12

/** Nombre de decimales des quantites, aligne sur `numeric(14,3)`. */
const DECIMALES_QUANTITE = 3

function auPlusDecimales(v: number, decimales: number): boolean {
  const f = 10 ** decimales
  return Math.abs(Math.round(v * f) - v * f) < 1e-6
}

/**
 * Lecture d'un nombre saisi au clavier.
 *
 * Un telephone francophone propose la virgule comme separateur decimal ;
 * certains claviers numeriques proposent le point. Les deux sont acceptes,
 * ainsi que les espaces de groupement des milliers. Renvoie nul pour une
 * saisie vide ou illisible, plutot que zero : zero est une valeur, l'absence
 * de saisie n'en est pas une.
 */
export function lireNombre(saisie: string): number | null {
  const nettoyee = saisie.replace(/[\s  ]/g, '').replace(',', '.')
  if (nettoyee === '' || !/^-?\d*\.?\d+$|^-?\d+\.$/.test(nettoyee)) return null
  const v = Number(nettoyee)
  return Number.isFinite(v) ? v : null
}

/* -------------------------------------------------------------------------- */
/* Etapes                                                                     */
/* -------------------------------------------------------------------------- */

export const EtapeDateLot = z.object({
  date: DateSimple,
  lotId: Identifiant,
})

export const EtapeMeteo = z.object({
  /** Code WMO, de 0 a 99. */
  meteoCode: z.number().int().min(0).max(99).nullable(),
  temperatureC: z.number().min(-10).max(55).nullable(),
  precipitationsMm: z.number().min(0).max(500).nullable(),
  rafalesKmh: z.number().min(0).max(250).nullable(),
  /**
   * Vrai si le chef a corrige la valeur prechargee. Conserve pour qu'un
   * releve nocturne ulterieur n'ecrase pas une observation de terrain.
   */
  meteoCorrigee: z.boolean(),
})

export const EnginSaisi = z.object({
  ressourceId: Identifiant,
  heures: z
    .number('Heures attendues.')
    .positive('Des heures saisies sont strictement positives.')
    .max(2400)
    .refine((v) => auPlusDecimales(v, 2), 'Au plus 2 décimales.'),
})

export const EtapeMoyens = z
  .object({
    journeeTravaillee: z.boolean(),
    motifArret: z.string().trim().max(500).nullable(),
    effectifOuvriers: z.number().int().min(0).max(500),
    effectifEncadrement: z.number().int().min(0).max(50),
    /** Total des heures-ouvriers de la journee. */
    heuresTravaillees: z.number().min(0).max(9999.99),
    /**
     * Heures d'engin et de materiel. Valeur par defaut : un releve mis en
     * file avant leur introduction reste recevable.
     */
    engins: z
      .array(EnginSaisi)
      .max(30)
      .default([])
      .refine(
        (e) => new Set(e.map((x) => x.ressourceId)).size === e.length,
        'Un même engin est saisi deux fois.',
      ),
  })
  .superRefine((m, ctx) => {
    if (!m.journeeTravaillee && (m.motifArret === null || m.motifArret === '')) {
      ctx.addIssue({
        code: 'custom',
        path: ['motifArret'],
        message: 'Une journée non travaillée doit porter sa cause.',
      })
    }
    if (m.heuresTravaillees > m.effectifOuvriers * HEURES_MAX_PAR_OUVRIER) {
      ctx.addIssue({
        code: 'custom',
        path: ['heuresTravaillees'],
        message: `Au plus ${HEURES_MAX_PAR_OUVRIER} heures par ouvrier présent.`,
      })
    }
    if (m.journeeTravaillee && m.effectifOuvriers > 0 && m.heuresTravaillees === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['heuresTravaillees'],
        message: 'Les ouvriers présents ont forcément travaillé un nombre d’heures non nul.',
      })
    }
  })

export const QuantiteSaisie = z.object({
  ligneId: Identifiant,
  quantite: z
    .number()
    .positive('Une quantité saisie est strictement positive.')
    .max(99_999_999_999)
    .refine(
      (v) => auPlusDecimales(v, DECIMALES_QUANTITE),
      `Au plus ${DECIMALES_QUANTITE} décimales.`,
    ),
  commentaire: z.string().trim().max(500).nullable(),
})

export const EtapeQuantites = z.object({
  quantites: z
    .array(QuantiteSaisie)
    .max(200)
    .refine(
      (q) => new Set(q.map((l) => l.ligneId)).size === q.length,
      'Une même ligne du quantitatif est saisie deux fois.',
    ),
})

/** Classe de resistance du beton, NF EN 206 : C25/30, C30/37. */
export const CLASSE_BETON = /^C\d{1,3}\/\d{1,3}$/

const TexteCourt = z.string().trim().max(200)
const TexteFacultatif = TexteCourt.nullable()

export const CoulageSaisi = z.object({
  ouvrage: TexteCourt.min(2, 'Désigner l’ouvrage coulé.'),
  classeBeton: z
    .string()
    .trim()
    .toUpperCase()
    .regex(CLASSE_BETON, 'Classe attendue au format C25/30.'),
  volumeM3: z
    .number('Volume attendu.')
    .positive('Un volume coulé est strictement positif.')
    .max(2000)
    .refine((v) => auPlusDecimales(v, 2), 'Au plus 2 décimales.'),
  bonLivraison: TexteFacultatif,
  /** Essai au cone d'Abrams, facultatif. */
  affaissementMm: z.number().int().min(0).max(300).nullable(),
  eprouvettes: z.number().int().min(0).max(60),
  /** Point d'arret : vrai, faux, ou nul pour un beton non arme. */
  ferraillageReceptionne: z.boolean().nullable().default(null),
})

export const LivraisonSaisie = z
  .object({
    designation: TexteCourt.min(2, 'Désigner le matériau livré.'),
    fournisseur: TexteFacultatif,
    quantite: z
      .number('Quantité attendue.')
      .positive('Une quantité livrée est strictement positive.')
      .max(99_999_999_999)
      .refine(
        (v) => auPlusDecimales(v, DECIMALES_QUANTITE),
        `Au plus ${DECIMALES_QUANTITE} décimales.`,
      ),
    unite: z.enum(uniteMesure.enumValues),
    bonLivraison: TexteFacultatif,
    conforme: z.boolean(),
    reserve: z.string().trim().max(1000).nullable(),
  })
  .superRefine((l, ctx) => {
    if (!l.conforme && (l.reserve === null || l.reserve === '')) {
      ctx.addIssue({
        code: 'custom',
        path: ['reserve'],
        message: 'Une livraison non conforme porte sa réserve.',
      })
    }
  })

/**
 * Observations et journal de la journee. Les deux listes ont une valeur par
 * defaut : un releve mis en file hors ligne avant leur introduction reste
 * recevable.
 */
export const EtapeObservations = z.object({
  observations: z.string().trim().max(4000).nullable(),
  coulages: z.array(CoulageSaisi).max(20).default([]),
  livraisons: z.array(LivraisonSaisie).max(50).default([]),
})

export const AleaSaisi = z.object({
  type: z.enum(typeAlea.enumValues),
  gravite: z.number().int().min(1).max(4),
  description: z.string().trim().min(5, 'Décrire l’aléa en quelques mots.').max(2000),
  impactDelaiJ: z.number().int().min(0).max(365),
  impactCoutXof: z.number().int().min(0).max(1_000_000_000_000),
})

export const EtapeAlea = z.object({
  alea: AleaSaisi.nullable(),
})

/* -------------------------------------------------------------------------- */
/* Releve complet                                                             */
/* -------------------------------------------------------------------------- */

export const ReleveSaisi = z
  .object({
    /**
     * Identifiant genere par le navigateur, qui devient la cle primaire du
     * releve. Un releve mis en file hors ligne puis renvoye deux fois porte
     * le meme identifiant : le second envoi est reconnu, et non duplique.
     */
    id: Identifiant,
    /** Vrai pour soumettre a la validation, faux pour garder un brouillon. */
    soumettre: z.boolean(),
    /**
     * Horodatage de la saisie par le telephone, en millisecondes. Facultatif
     * pour les releves mis en file avant son introduction.
     */
    revision: z.number().int().nonnegative().optional(),
  })
  .extend(EtapeDateLot.shape)
  .extend(EtapeMeteo.shape)
  .and(EtapeMoyens)
  .and(EtapeQuantites)
  .and(EtapeObservations)
  .and(EtapeAlea)
  .superRefine((r, ctx) => {
    if (!r.journeeTravaillee && r.quantites.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['quantites'],
        message: 'Une journée non travaillée ne porte aucune quantité réalisée.',
      })
    }
    if (!r.journeeTravaillee && r.engins.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['engins'],
        message: 'Une journée non travaillée ne porte aucune heure d’engin.',
      })
    }
    if (!r.journeeTravaillee && r.coulages.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['coulages'],
        message: 'Une journée non travaillée ne porte aucun coulage.',
      })
    }
  })

export type ReleveSaisi = z.infer<typeof ReleveSaisi>
export type AleaSaisi = z.infer<typeof AleaSaisi>
export type QuantiteSaisie = z.infer<typeof QuantiteSaisie>
export type CoulageSaisi = z.infer<typeof CoulageSaisi>
export type EnginSaisi = z.infer<typeof EnginSaisi>
export type LivraisonSaisie = z.infer<typeof LivraisonSaisie>

/** Les etapes du formulaire, dans l'ordre, avec le schema qui les valide. */
export const ETAPES = [
  { cle: 'dateLot', titre: 'Date et lot', schema: EtapeDateLot },
  { cle: 'meteo', titre: 'Météo', schema: EtapeMeteo },
  { cle: 'moyens', titre: 'Effectifs et heures', schema: EtapeMoyens },
  { cle: 'quantites', titre: 'Quantités du jour', schema: EtapeQuantites },
  { cle: 'observations', titre: 'Observations et journal', schema: EtapeObservations },
  { cle: 'alea', titre: 'Aléa éventuel', schema: EtapeAlea },
] as const

export type CleEtape = (typeof ETAPES)[number]['cle']

/**
 * Premier message d'erreur par champ, pour l'affichage sous chaque champ.
 * Les erreurs qui ne visent aucun champ sont rangees sous la cle vide.
 */
export function erreursParChamp(erreur: z.ZodError): Record<string, string> {
  const resultat: Record<string, string> = {}
  for (const issue of erreur.issues) {
    const cle = issue.path.map(String).join('.')
    resultat[cle] ??= issue.message
  }
  return resultat
}

/* -------------------------------------------------------------------------- */
/* Libelles                                                                   */
/* -------------------------------------------------------------------------- */

export const LIBELLE_TYPE_ALEA: Record<(typeof typeAlea.enumValues)[number], string> = {
  INTEMPERIE: 'Intempérie',
  INCIDENT: 'Incident',
  NON_CONFORMITE: 'Non-conformité',
  AVENANT: 'Avenant',
  PANNE_ENGIN: 'Panne d’engin',
  RUPTURE_APPROVISIONNEMENT: 'Rupture d’approvisionnement',
  ADMINISTRATIF: 'Administratif',
}

/** Gravite d'un alea, de 1 a 4. */
export const LIBELLE_GRAVITE: Record<number, string> = {
  1: 'Mineure',
  2: 'Modérée',
  3: 'Majeure',
  4: 'Bloquante',
}
