/**
 * Brouillon local du formulaire de releve.
 *
 * Sur un telephone d'entree de gamme, ouvrir l'appareil photo decharge
 * souvent l'onglet du navigateur : au retour, la page se recharge et tout ce
 * qui n'etait qu'en memoire est perdu. Le bouton retour, un appel recu ou un
 * lien touche par erreur ont le meme effet. Le formulaire est donc recopie
 * dans IndexedDB a chaque modification, photos comprises, et propose a la
 * reprise au chargement suivant.
 *
 * Le brouillon local n'est pas la file d'attente : il n'est jamais envoye de
 * lui-meme. Il disparait des que le releve est enregistre ou mis en file.
 *
 * Chaque brouillon porte son auteur : sur un telephone partage, le chef de
 * chantier suivant ne reprend pas la saisie de son collegue.
 */

import Dexie, { type EntityTable } from 'dexie'
import type { PhotoAEnvoyer } from '@/lib/photos/televersement'
import type { EtatFormulaire } from '@/lib/releve-formulaire'

export type BrouillonFormulaire = {
  /** Projet et releve concernes, voir `cleBrouillon`. */
  cle: string
  utilisateurId: string
  etat: EtatFormulaire
  /** Etape atteinte, pour reprendre la ou l'on s'etait arrete. */
  indice: number
  photos: PhotoAEnvoyer[]
  /** Derniere modification, en millisecondes. */
  majLe: number
}

/** Au-dela de deux semaines, un brouillon oublie n'est plus propose. */
export const DUREE_VIE_BROUILLON_MS = 14 * 24 * 3600 * 1000

class BaseBrouillons extends Dexie {
  brouillons!: EntityTable<BrouillonFormulaire, 'cle'>

  constructor() {
    super('chantierscope-brouillons')
    this.version(1).stores({ brouillons: 'cle, majLe' })
  }
}

let base: BaseBrouillons | undefined
function bd(): BaseBrouillons {
  base ??= new BaseBrouillons()
  return base
}

/**
 * Un nouveau releve a un seul brouillon par projet : on ne commence pas deux
 * journees a la fois. Un releve existant en cours de modification a le sien.
 */
export function cleBrouillon(projetId: string, releveId: string | null): string {
  return releveId === null ? `${projetId}:nouveau` : `${projetId}:${releveId}`
}

export async function lireBrouillon(
  cle: string,
  utilisateurId: string,
  maintenant: number = Date.now(),
): Promise<BrouillonFormulaire | null> {
  try {
    const b = await bd().brouillons.get(cle)
    if (!b || b.utilisateurId !== utilisateurId) return null
    if (maintenant - b.majLe > DUREE_VIE_BROUILLON_MS) {
      await bd().brouillons.delete(cle)
      return null
    }
    return b
  } catch {
    // Navigation privee ou stockage refuse : le formulaire marche sans.
    return null
  }
}

export async function ecrireBrouillon(b: BrouillonFormulaire): Promise<void> {
  try {
    await bd().brouillons.put(b)
  } catch {
    // Meme regle : l'absence de stockage ne doit pas bloquer la saisie.
  }
}

export async function effacerBrouillon(cle: string): Promise<void> {
  try {
    await bd().brouillons.delete(cle)
  } catch {
    // Rien a faire : le brouillon expirera de lui-meme.
  }
}
