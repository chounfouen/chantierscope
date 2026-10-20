/**
 * Etat du formulaire de saisie, et sa conversion en releve.
 *
 * Le formulaire garde les nombres sous forme de TEXTE tant que l'utilisateur
 * tape : convertir a chaque frappe transformerait « 12, » en 12 et effacerait
 * la virgule sous ses doigts. La conversion se fait a la validation d'une
 * etape et a l'envoi, par `lireNombre`, puis le schema de l'etape tranche.
 *
 * Module pur, sans React : il se teste sans navigateur.
 */

import type { TypeAlea, Unite } from '@/db/schema'
import { lireNombre, type ReleveSaisi } from '@/lib/releve'

export type EtatQuantite = { quantite: string; commentaire: string }

export type EtatCoulage = {
  ouvrage: string
  classeBeton: string
  volumeM3: string
  bonLivraison: string
  affaissementMm: string
  eprouvettes: string
}

export type EtatLivraison = {
  designation: string
  fournisseur: string
  quantite: string
  unite: Unite
  bonLivraison: string
  conforme: boolean
  reserve: string
}

export const COULAGE_VIDE: EtatCoulage = {
  ouvrage: '',
  classeBeton: 'C25/30',
  volumeM3: '',
  bonLivraison: '',
  affaissementMm: '',
  eprouvettes: '0',
}

export const LIVRAISON_VIDE: EtatLivraison = {
  designation: '',
  fournisseur: '',
  quantite: '',
  unite: 'T',
  bonLivraison: '',
  conforme: true,
  reserve: '',
}

export type EtatFormulaire = {
  id: string
  date: string
  lotId: string

  meteoCode: string
  temperatureC: string
  precipitationsMm: string
  rafalesKmh: string
  meteoCorrigee: boolean

  journeeTravaillee: boolean
  motifArret: string
  effectifOuvriers: string
  effectifEncadrement: string
  heuresTravaillees: string

  /** Par identifiant de ligne du quantitatif. */
  quantites: Record<string, EtatQuantite>
  observations: string
  /**
   * Journal de la journee. Facultatifs dans le type : un brouillon garde sur
   * le telephone avant leur introduction ne les porte pas.
   */
  coulages?: EtatCoulage[]
  livraisons?: EtatLivraison[]

  aleaDeclare: boolean
  alea: {
    type: TypeAlea
    gravite: string
    description: string
    impactDelaiJ: string
    impactCoutXof: string
  }
}

const ALEA_VIDE: EtatFormulaire['alea'] = {
  type: 'INCIDENT',
  gravite: '2',
  description: '',
  impactDelaiJ: '0',
  impactCoutXof: '0',
}

export function etatVierge(id: string, date: string, lotId: string): EtatFormulaire {
  return {
    id,
    date,
    lotId,
    meteoCode: '',
    temperatureC: '',
    precipitationsMm: '',
    rafalesKmh: '',
    meteoCorrigee: false,
    journeeTravaillee: true,
    motifArret: '',
    effectifOuvriers: '',
    effectifEncadrement: '',
    heuresTravaillees: '',
    quantites: {},
    observations: '',
    coulages: [],
    livraisons: [],
    aleaDeclare: false,
    alea: { ...ALEA_VIDE },
  }
}

/** Etat initial d'un releve existant, a modifier ou a rectifier. */
export function etatDepuisReleve(
  id: string,
  r: Omit<ReleveSaisi, 'id' | 'soumettre'>,
): EtatFormulaire {
  const texte = (v: number | null) => (v === null ? '' : enTexte(v))
  return {
    id,
    date: r.date,
    lotId: r.lotId,
    meteoCode: texte(r.meteoCode),
    temperatureC: texte(r.temperatureC),
    precipitationsMm: texte(r.precipitationsMm),
    rafalesKmh: texte(r.rafalesKmh),
    meteoCorrigee: r.meteoCorrigee,
    journeeTravaillee: r.journeeTravaillee,
    motifArret: r.motifArret ?? '',
    effectifOuvriers: enTexte(r.effectifOuvriers),
    effectifEncadrement: enTexte(r.effectifEncadrement),
    heuresTravaillees: enTexte(r.heuresTravaillees),
    quantites: Object.fromEntries(
      r.quantites.map((q) => [
        q.ligneId,
        { quantite: enTexte(q.quantite), commentaire: q.commentaire ?? '' },
      ]),
    ),
    observations: r.observations ?? '',
    coulages: r.coulages.map((c) => ({
      ouvrage: c.ouvrage,
      classeBeton: c.classeBeton,
      volumeM3: enTexte(c.volumeM3),
      bonLivraison: c.bonLivraison ?? '',
      affaissementMm: c.affaissementMm === null ? '' : String(c.affaissementMm),
      eprouvettes: String(c.eprouvettes),
    })),
    livraisons: r.livraisons.map((l) => ({
      designation: l.designation,
      fournisseur: l.fournisseur ?? '',
      quantite: enTexte(l.quantite),
      unite: l.unite,
      bonLivraison: l.bonLivraison ?? '',
      conforme: l.conforme,
      reserve: l.reserve ?? '',
    })),
    aleaDeclare: r.alea !== null,
    alea: r.alea
      ? {
          type: r.alea.type,
          gravite: String(r.alea.gravite),
          description: r.alea.description,
          impactDelaiJ: String(r.alea.impactDelaiJ),
          impactCoutXof: String(r.alea.impactCoutXof),
        }
      : { ...ALEA_VIDE },
  }
}

/** Nombre affiche dans un champ, avec la virgule decimale francaise. */
export function enTexte(v: number): string {
  return String(v).replace('.', ',')
}

/**
 * Nombre d'un champ. Un champ vide donne nul ; un champ illisible donne NaN,
 * que le schema refuse avec un message, plutot que zero, qui passerait.
 */
function nombre(saisie: string): number | null {
  if (saisie.trim() === '') return null
  return lireNombre(saisie) ?? Number.NaN
}

function texteOuNul(saisie: string): string | null {
  return saisie.trim() === '' ? null : saisie.trim()
}

/** Zero pour un champ vide : un effectif non renseigne est un effectif nul. */
function nombreOuZero(saisie: string): number {
  return nombre(saisie) ?? 0
}

/**
 * Releve a soumettre au schema. Les lignes du quantitatif laissees vides sont
 * omises : ne rien saisir sur une ligne n'est pas declarer zero.
 *
 * Le resultat n'est pas encore valide : c'est le schema qui le dira. Il est
 * type `unknown` pour qu'aucun appelant ne l'envoie sans l'avoir analyse.
 */
export function versReleve(e: EtatFormulaire, soumettre: boolean): unknown {
  const quantites = Object.entries(e.quantites)
    .filter(([, q]) => q.quantite.trim() !== '')
    .map(([ligneId, q]) => ({
      ligneId,
      quantite: nombre(q.quantite),
      commentaire: q.commentaire.trim() === '' ? null : q.commentaire.trim(),
    }))

  return {
    id: e.id,
    soumettre,
    date: e.date,
    lotId: e.lotId,
    meteoCode: nombre(e.meteoCode),
    temperatureC: nombre(e.temperatureC),
    precipitationsMm: nombre(e.precipitationsMm),
    rafalesKmh: nombre(e.rafalesKmh),
    meteoCorrigee: e.meteoCorrigee,
    journeeTravaillee: e.journeeTravaillee,
    motifArret: e.journeeTravaillee || e.motifArret.trim() === '' ? null : e.motifArret.trim(),
    effectifOuvriers: nombreOuZero(e.effectifOuvriers),
    effectifEncadrement: nombreOuZero(e.effectifEncadrement),
    heuresTravaillees: nombreOuZero(e.heuresTravaillees),
    quantites: e.journeeTravaillee ? quantites : [],
    observations: e.observations.trim() === '' ? null : e.observations.trim(),
    coulages: e.journeeTravaillee
      ? (e.coulages ?? []).map((c) => ({
          ouvrage: c.ouvrage.trim(),
          classeBeton: c.classeBeton.trim(),
          volumeM3: nombre(c.volumeM3),
          bonLivraison: texteOuNul(c.bonLivraison),
          affaissementMm: nombre(c.affaissementMm),
          eprouvettes: nombreOuZero(c.eprouvettes),
        }))
      : [],
    livraisons: (e.livraisons ?? []).map((l) => ({
      designation: l.designation.trim(),
      fournisseur: texteOuNul(l.fournisseur),
      quantite: nombre(l.quantite),
      unite: l.unite,
      bonLivraison: texteOuNul(l.bonLivraison),
      conforme: l.conforme,
      reserve: l.conforme ? null : texteOuNul(l.reserve),
    })),
    alea: e.aleaDeclare
      ? {
          type: e.alea.type,
          gravite: nombre(e.alea.gravite),
          description: e.alea.description.trim(),
          impactDelaiJ: nombreOuZero(e.alea.impactDelaiJ),
          impactCoutXof: nombreOuZero(e.alea.impactCoutXof),
        }
      : null,
  }
}

/** Heures proposees pour un effectif donne : une journee de huit heures. */
export function heuresProposees(effectifOuvriers: string): string {
  const n = lireNombre(effectifOuvriers)
  return n === null || n <= 0 ? '' : enTexte(n * 8)
}

/**
 * Identifiant d'un nouveau releve, genere dans le navigateur.
 *
 * Il ne doit PAS venir de la page : une page servie depuis le cache hors
 * ligne porterait le meme identifiant a chaque ouverture, et deux releves
 * saisis sans reseau s'ecraseraient l'un l'autre a la synchronisation.
 *
 * `crypto.randomUUID` n'existe qu'en contexte securise ; sur un telephone
 * qui joint un serveur de developpement en HTTP, on construit l'UUID v4 a
 * partir de `getRandomValues`, disponible partout.
 */
export function nouvelIdentifiant(alea: Pick<Crypto, 'getRandomValues'> = crypto): string {
  if (alea === crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const o = alea.getRandomValues(new Uint8Array(16))
  o[6] = ((o[6] ?? 0) & 0x0f) | 0x40
  o[8] = ((o[8] ?? 0) & 0x3f) | 0x80
  const h = [...o].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
