/**
 * Magasin de fichiers des photos de chantier.
 *
 * Aucun binaire en base : la table `photo` ne garde qu'un chemin. Le fichier
 * va directement du navigateur au magasin, par une URL signee a duree de vie
 * courte, sans transiter par la fonction serverless dont la charge utile est
 * limitee.
 *
 * Deux pilotes, une seule interface :
 *
 * - Supabase Storage, en production : URL de depot signee par l'API de
 *   stockage, lecture par URL signee.
 * - Disque local, en developpement et sous test : les fichiers vont dans
 *   `.stockage/`, et les URL pointent vers un gestionnaire de route qui
 *   verifie une signature HMAC. Le parcours de televersement est ainsi le
 *   meme partout, signature comprise.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { env } from '@/lib/env'

export type Depot = { url: string; methode: 'PUT'; entetes: Record<string, string> }

export interface Stockage {
  /** URL a laquelle le navigateur depose le fichier. */
  urlDepot(chemin: string, typeContenu: string): Promise<Depot>
  /** URL de lecture, valable une heure. */
  urlLecture(chemin: string): Promise<string>
  /** Taille du fichier depose, nulle s'il n'existe pas. */
  taille(chemin: string): Promise<number | null>
  /** Contenu du fichier, lu par le serveur ; nul s'il n'existe pas. */
  lire(chemin: string): Promise<Uint8Array | null>
}

/** Duree de validite d'une URL de depot : le temps d'un envoi sur reseau lent. */
export const DUREE_DEPOT_S = 15 * 60
export const DUREE_LECTURE_S = 60 * 60

/**
 * Un chemin de photo est compose par le serveur, jamais recu du navigateur
 * tel quel. Ce controle est une seconde barriere : ni remontee de
 * repertoire, ni chemin absolu, ni caractere exotique.
 */
export function cheminValide(chemin: string): boolean {
  return (
    /^[a-z0-9][a-z0-9/_.-]{0,250}$/i.test(chemin) &&
    !chemin.includes('..') &&
    !chemin.includes('//') &&
    !chemin.endsWith('/')
  )
}

export function cheminPhoto(
  projetId: string,
  photoId: string,
  variante: 'image' | 'vignette',
): string {
  return `projets/${projetId}/photos/${photoId}${variante === 'vignette' ? '-vignette' : ''}.webp`
}

/** Fond de plan d'un niveau. Un identifiant neuf a chaque import : l'image remplacee ne reste pas en cache. */
export function cheminPlan(projetId: string, planId: string): string {
  return `projets/${projetId}/plans/${planId}.webp`
}

/** Maquette du batiment, convertie en GLB. Un identifiant neuf a chaque import. */
export function cheminMaquette(projetId: string, maquetteId: string): string {
  return `projets/${projetId}/maquettes/${maquetteId}.glb`
}

const estPlan = (chemin: string) => /^projets\/[^/]+\/plans\//.test(chemin)
const estMaquette = (chemin: string) => /^projets\/[^/]+\/maquettes\/[^/]+\.glb$/.test(chemin)

/**
 * Taille maximale d'un depot. Une photo compressee pese environ 120 Ko : au-dela
 * de 3 Mo, ce n'en est pas une. Un plan A0 converti en image de 8 192 pixels
 * peut atteindre une dizaine de mega-octets. Une maquette est bornee a
 * 50 Mo, limite par fichier du stockage Supabase de base.
 */
export function tailleMaxDepot(chemin: string): number {
  if (estMaquette(chemin)) return 50 * 1024 * 1024
  return (estPlan(chemin) ? 16 : 3) * 1024 * 1024
}

/** Type de contenu d'un fichier du magasin, deduit de son chemin, jamais du navigateur. */
export function typeContenu(chemin: string): 'model/gltf-binary' | 'image/webp' {
  return estMaquette(chemin) ? 'model/gltf-binary' : 'image/webp'
}

/* -------------------------------------------------------------------------- */
/* Signature des URL du pilote local                                          */
/* -------------------------------------------------------------------------- */

export function signer(
  secret: string,
  operation: 'depot' | 'lecture',
  chemin: string,
  expiration: number,
): string {
  return createHmac('sha256', secret)
    .update(`${operation}\n${chemin}\n${expiration}`)
    .digest('base64url')
}

/**
 * Verifie une signature et son echeance. Comparaison a temps constant : un
 * attaquant ne doit pas pouvoir deviner la signature octet par octet en
 * mesurant le temps de reponse.
 */
export function signatureValide(
  secret: string,
  operation: 'depot' | 'lecture',
  chemin: string,
  expiration: number,
  signature: string,
  maintenant: number = Date.now(),
): boolean {
  if (!Number.isFinite(expiration) || expiration * 1000 < maintenant) return false
  if (!cheminValide(chemin)) return false
  const attendue = Buffer.from(signer(secret, operation, chemin, expiration))
  const recue = Buffer.from(signature)
  return attendue.length === recue.length && timingSafeEqual(attendue, recue)
}

/* -------------------------------------------------------------------------- */
/* Pilote local                                                               */
/* -------------------------------------------------------------------------- */

export const RACINE_LOCALE = resolve(process.cwd(), '.stockage')

/** Chemin disque d'un fichier, confine a la racine du magasin local. */
export function fichierLocal(chemin: string): string {
  if (!cheminValide(chemin)) throw new Error(`Chemin de stockage invalide : ${chemin}`)
  const complet = resolve(RACINE_LOCALE, chemin)
  if (!complet.startsWith(RACINE_LOCALE + sep)) throw new Error('Chemin hors du magasin.')
  return complet
}

export function piloteLocal(secret: string): Stockage {
  const url = (operation: 'depot' | 'lecture', chemin: string, duree: number) => {
    const expiration = Math.floor(Date.now() / 1000) + duree
    const q = new URLSearchParams({
      chemin,
      exp: String(expiration),
      sig: signer(secret, operation, chemin, expiration),
    })
    return `/api/stockage/${operation === 'depot' ? 'depot' : 'fichier'}?${q.toString()}`
  }
  return {
    async urlDepot(chemin, typeContenu) {
      return {
        url: url('depot', chemin, DUREE_DEPOT_S),
        methode: 'PUT',
        entetes: { 'Content-Type': typeContenu },
      }
    },
    async urlLecture(chemin) {
      return url('lecture', chemin, DUREE_LECTURE_S)
    },
    async taille(chemin) {
      try {
        return (await stat(fichierLocal(chemin))).size
      } catch {
        return null
      }
    },
    lire: lireLocal,
  }
}

export async function ecrireLocal(chemin: string, contenu: Uint8Array): Promise<void> {
  const cible = fichierLocal(chemin)
  await mkdir(dirname(cible), { recursive: true })
  await writeFile(cible, contenu)
}

export async function lireLocal(chemin: string): Promise<Buffer | null> {
  try {
    return await readFile(fichierLocal(chemin))
  } catch {
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* Pilote Supabase                                                            */
/* -------------------------------------------------------------------------- */

export function piloteSupabase(
  urlBase: string,
  cleService: string,
  compartiment: string,
  transport: typeof fetch = fetch,
): Stockage {
  const api = `${urlBase.replace(/\/$/, '')}/storage/v1`
  const entetes = { Authorization: `Bearer ${cleService}`, apikey: cleService }

  async function appeler<T>(chemin: string, corps: unknown): Promise<T> {
    const r = await transport(`${api}${chemin}`, {
      method: 'POST',
      headers: { ...entetes, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    })
    if (!r.ok) throw new Error(`Stockage : ${r.status} sur ${chemin}`)
    return (await r.json()) as T
  }

  return {
    async urlDepot(chemin, typeContenu) {
      const { url } = await appeler<{ url: string }>(
        `/object/upload/sign/${compartiment}/${chemin}`,
        {},
      )
      return { url: `${api}${url}`, methode: 'PUT', entetes: { 'Content-Type': typeContenu } }
    },
    async urlLecture(chemin) {
      const { signedURL } = await appeler<{ signedURL: string }>(
        `/object/sign/${compartiment}/${chemin}`,
        { expiresIn: DUREE_LECTURE_S },
      )
      return `${api}${signedURL}`
    },
    async taille(chemin) {
      const r = await transport(`${api}/object/info/${compartiment}/${chemin}`, {
        headers: entetes,
      })
      if (!r.ok) return null
      const info = (await r.json()) as { size?: number; metadata?: { size?: number } }
      return info.size ?? info.metadata?.size ?? null
    },
    async lire(chemin) {
      const r = await transport(`${api}/object/authenticated/${compartiment}/${chemin}`, {
        headers: entetes,
      })
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : null
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Choix du pilote                                                            */
/* -------------------------------------------------------------------------- */

export function stockage(): Stockage {
  const e = env()
  if (e.SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY) {
    return piloteSupabase(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, e.SUPABASE_BUCKET_PHOTOS)
  }
  return piloteLocal(e.AUTH_SECRET)
}

/**
 * URL d'affichage d'une photo. Les planches du jeu de demonstration sont des
 * fichiers statiques publics, au chemin absolu ; les photos de chantier sont
 * dans le magasin, et se lisent par URL signee.
 */
export async function urlAffichage(chemin: string): Promise<string> {
  return chemin.startsWith('/') ? chemin : stockage().urlLecture(chemin)
}

const RACINE_PUBLIQUE = resolve(process.cwd(), 'public')

/**
 * Contenu d'une photo, lu par le serveur : pour le rapport PDF, qui embarque
 * les images. Meme partage que `urlAffichage` : planche statique publique ou
 * fichier du magasin.
 */
export async function lireFichier(chemin: string): Promise<Uint8Array | null> {
  if (!chemin.startsWith('/')) return stockage().lire(chemin)
  const complet = resolve(RACINE_PUBLIQUE, `.${chemin}`)
  if (!complet.startsWith(RACINE_PUBLIQUE + sep)) return null
  try {
    return await readFile(complet)
  } catch {
    return null
  }
}

/** Pour les tests : le chemin disque d'un fichier du magasin local. */
export function cheminDisque(chemin: string): string {
  return join(RACINE_LOCALE, chemin)
}
