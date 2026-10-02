/**
 * File d'attente des releves saisis sans reseau.
 *
 * Un releve qui n'a pas pu atteindre le serveur est conserve dans IndexedDB,
 * qui survit a la fermeture de l'onglet, au redemarrage du telephone et a
 * l'absence de reseau pendant plusieurs jours. Il repart au retour de la
 * connexion.
 *
 * Trois proprietes tiennent la file honnete :
 *
 * - Chaque releve porte l'identifiant genere par le navigateur, cle de la
 *   file comme de la base. Renvoyer un releve deja recu met a jour sa ligne
 *   au lieu d'en creer une seconde ; remettre en file le meme releve remplace
 *   l'entree au lieu de la doubler.
 * - Chaque entree porte son AUTEUR. Sur un telephone partage, la file d'un
 *   chef de chantier ne doit pas partir sous la session du suivant : le
 *   releve lui serait attribue dans le journal d'audit.
 * - Un refus metier sort l'entree de la synchronisation mais la garde,
 *   avec le motif, jusqu'a ce que l'utilisateur en prenne connaissance. Rien
 *   n'est jamais perdu en silence.
 */

import Dexie, { type EntityTable } from 'dexie'
import { envoyerReleve, type IssueEnvoi } from '@/lib/hors-ligne/envoi'
import { televerserPhoto, type IssuePhoto, type PhotoAEnvoyer } from '@/lib/photos/televersement'
import type { ReleveSaisi } from '@/lib/releve'

export type EntreeFile = {
  /** Identifiant du releve, cle primaire. */
  id: string
  projetId: string
  utilisateurId: string
  releve: ReleveSaisi
  /** Horodatage de la mise en file, en millisecondes. */
  misEnFileLe: number
  tentatives: number
  etat: 'en_attente' | 'refuse'
  /** Motif du dernier echec, a afficher. */
  motif: string | null
}

/** Photo en attente : ses fichiers compresses voyagent avec elle. */
export type PhotoEnFile = PhotoAEnvoyer & {
  projetId: string
  utilisateurId: string
  misEnFileLe: number
  etat: 'en_attente' | 'refuse'
  motif: string | null
}

class BaseHorsLigne extends Dexie {
  releves!: EntityTable<EntreeFile, 'id'>
  photos!: EntityTable<PhotoEnFile, 'id'>

  constructor() {
    super('chantierscope-hors-ligne')
    this.version(1).stores({
      releves: 'id, [utilisateurId+projetId], etat, misEnFileLe',
    })
    this.version(2).stores({
      releves: 'id, [utilisateurId+projetId], etat, misEnFileLe',
      photos: 'id, [utilisateurId+projetId], releveId, misEnFileLe',
    })
  }
}

let base: BaseHorsLigne | undefined
function bd(): BaseHorsLigne {
  base ??= new BaseHorsLigne()
  return base
}

/** Notifie les composants affichant la file qu'elle a change. */
const EVENEMENT = 'chantierscope:file'
function signaler(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENEMENT))
}

export function surChangementFile(rappel: () => void): () => void {
  window.addEventListener(EVENEMENT, rappel)
  return () => window.removeEventListener(EVENEMENT, rappel)
}

export async function mettreEnFile(
  projetId: string,
  utilisateurId: string,
  releve: ReleveSaisi,
  motif: string | null = null,
  maintenant: number = Date.now(),
): Promise<void> {
  const existant = await bd().releves.get(releve.id)
  await bd().releves.put({
    id: releve.id,
    projetId,
    utilisateurId,
    releve,
    misEnFileLe: existant?.misEnFileLe ?? maintenant,
    tentatives: existant?.tentatives ?? 0,
    etat: 'en_attente',
    motif,
  })
  signaler()
}

export async function lister(projetId: string, utilisateurId: string): Promise<EntreeFile[]> {
  const entrees = await bd()
    .releves.where('[utilisateurId+projetId]')
    .equals([utilisateurId, projetId])
    .toArray()
  return entrees.sort((a, b) => a.misEnFileLe - b.misEnFileLe)
}

export async function retirer(id: string): Promise<void> {
  await bd().releves.delete(id)
  signaler()
}

export type BilanSynchronisation = {
  envoyes: number
  refuses: number
  restants: number
  /** Vrai si la synchronisation s'est interrompue faute de reseau. */
  interrompue: boolean
}

/**
 * Envoie les releves en attente de cet utilisateur, du plus ancien au plus
 * recent. L'ordre compte : un brouillon et sa version soumise mise en file
 * plus tard partagent le meme identifiant, mais deux releves distincts sur
 * deux journees doivent arriver dans l'ordre ou ils ont ete saisis.
 *
 * S'arrete au premier echec de reseau : inutile d'epuiser la batterie a
 * tenter les suivants. Une session expiree interrompt aussi : tous les envois
 * echoueraient de la meme maniere jusqu'a la reconnexion.
 */
export async function synchroniser(
  projetId: string,
  utilisateurId: string,
  envoyer: (projetId: string, r: ReleveSaisi) => Promise<IssueEnvoi> = envoyerReleve,
): Promise<BilanSynchronisation> {
  const bilan: BilanSynchronisation = { envoyes: 0, refuses: 0, restants: 0, interrompue: false }
  const entrees = (await lister(projetId, utilisateurId)).filter((e) => e.etat === 'en_attente')

  for (const [i, e] of entrees.entries()) {
    const issue = await envoyer(projetId, e.releve)
    if (issue.issue === 'enregistre') {
      await bd().releves.delete(e.id)
      bilan.envoyes++
      continue
    }
    if (issue.issue === 'refuse') {
      await bd().releves.update(e.id, {
        etat: 'refuse',
        motif: issue.message,
        tentatives: e.tentatives + 1,
      })
      bilan.refuses++
      continue
    }
    await bd().releves.update(e.id, { motif: issue.message, tentatives: e.tentatives + 1 })
    bilan.interrompue = true
    bilan.restants = entrees.length - i
    break
  }

  signaler()
  return bilan
}

/* -------------------------------------------------------------------------- */
/* Photos                                                                     */
/* -------------------------------------------------------------------------- */

export async function mettrePhotoEnFile(
  projetId: string,
  utilisateurId: string,
  photo: PhotoAEnvoyer,
  maintenant: number = Date.now(),
): Promise<void> {
  await bd().photos.put({
    ...photo,
    projetId,
    utilisateurId,
    misEnFileLe: maintenant,
    etat: 'en_attente',
    motif: null,
  })
  signaler()
}

export async function listerPhotos(
  projetId: string,
  utilisateurId: string,
): Promise<PhotoEnFile[]> {
  const p = await bd()
    .photos.where('[utilisateurId+projetId]')
    .equals([utilisateurId, projetId])
    .toArray()
  return p.sort((a, b) => a.misEnFileLe - b.misEnFileLe)
}

/**
 * Envoie les photos en attente. Une photo dont le releve est encore en file
 * attend : le serveur la refuserait, faute de releve auquel la rattacher.
 */
export async function synchroniserPhotos(
  projetId: string,
  utilisateurId: string,
  envoyer: (projetId: string, p: PhotoAEnvoyer) => Promise<IssuePhoto> = televerserPhoto,
): Promise<BilanSynchronisation> {
  const bilan: BilanSynchronisation = { envoyes: 0, refuses: 0, restants: 0, interrompue: false }
  const relevesEnFile = new Set(
    (await lister(projetId, utilisateurId)).filter((e) => e.etat === 'en_attente').map((e) => e.id),
  )
  const photos = (await listerPhotos(projetId, utilisateurId)).filter(
    (p) => p.etat === 'en_attente' && !relevesEnFile.has(p.releveId),
  )

  for (const [i, p] of photos.entries()) {
    const issue = await envoyer(projetId, p)
    if (issue.issue === 'enregistre') {
      await bd().photos.delete(p.id)
      bilan.envoyes++
    } else if (issue.issue === 'refuse') {
      await bd().photos.update(p.id, { etat: 'refuse', motif: issue.message })
      bilan.refuses++
    } else {
      await bd().photos.update(p.id, { motif: issue.message })
      bilan.interrompue = true
      bilan.restants = photos.length - i
      break
    }
  }
  signaler()
  return bilan
}

export async function retirerPhoto(id: string): Promise<void> {
  await bd().photos.delete(id)
  signaler()
}

/** Pour les tests : repart d'une base vide. */
export async function viderPourTest(): Promise<void> {
  await bd().releves.clear()
  await bd().photos.clear()
}
