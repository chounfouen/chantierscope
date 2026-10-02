/**
 * Matrice des droits.
 *
 * Logique pure, sans dependance au cadre applicatif ni a la session : elle se
 * teste sans navigateur, sans base et sans Next. C'est volontaire — une regle
 * d'autorisation qu'on ne peut pas tester facilement finit par ne pas etre
 * testee.
 *
 * L'application de ces regles a une session vit dans `garde.ts`.
 */

import type { Role, StatutReleve } from '@/db/schema'

export type Utilisateur = {
  id: string
  nom: string
  email: string
  role: Role
  projetIds: string[]
}

/** Levee quand l'utilisateur n'est pas authentifie. */
export class NonAuthentifie extends Error {
  constructor() {
    super('Authentification requise.')
    this.name = 'NonAuthentifie'
  }
}

/** Levee quand l'utilisateur est connu mais n'a pas le droit demande. */
export class NonAutorise extends Error {
  constructor(motif: string) {
    super(`Acces refuse : ${motif}`)
    this.name = 'NonAutorise'
  }
}

/**
 * Regroupements de roles, nommes par ce qu'ils autorisent plutot que par leur
 * composition. Un appelant ecrit `exiger(projetId, PEUT_VALIDER)` et non la
 * liste des roles : le jour ou la matrice change, un seul endroit bouge.
 */
export const PEUT_LIRE: readonly Role[] = ['CHEF_CHANTIER', 'CONDUCTEUR', 'MOE', 'MOA', 'ADMIN']
export const PEUT_SAISIR: readonly Role[] = ['CHEF_CHANTIER', 'CONDUCTEUR', 'ADMIN']
/** Separation des roles : celui qui saisit n'est pas celui qui engage. */
export const PEUT_VALIDER: readonly Role[] = ['CONDUCTEUR', 'ADMIN']
export const PEUT_PLANIFIER: readonly Role[] = ['CONDUCTEUR', 'ADMIN']
export const PEUT_OUVRIR_NON_CONFORMITE: readonly Role[] = ['MOE', 'CONDUCTEUR', 'ADMIN']
export const PEUT_ADMINISTRER: readonly Role[] = ['ADMIN']

/**
 * Roles autorises a voir les donnees internes de l'entreprise : couts,
 * effectifs, rendements, marges.
 *
 * Le maitre d'ouvrage suit son operation, il n'a pas a connaitre le prix de
 * revient de l'entreprise ni la taille de ses equipes. Le filtrage se fait
 * par selection de colonnes dans la requete, JAMAIS par masquage a
 * l'affichage : une donnee qui ne doit pas etre vue ne quitte pas le serveur.
 */
export const VOIT_DONNEES_INTERNES: readonly Role[] = [
  'CHEF_CHANTIER',
  'CONDUCTEUR',
  'MOE',
  'ADMIN',
]

export function voitDonneesInternes(role: Role): boolean {
  return VOIT_DONNEES_INTERNES.includes(role)
}

/** Verification pure : ce role fait-il partie des roles habilites ? */
export function habilite(role: Role, rolesAutorises: readonly Role[]): boolean {
  return rolesAutorises.includes(role)
}

/** Verification pure : cet utilisateur est-il rattache a ce projet ? */
export function rattacheAuProjet(utilisateur: Utilisateur, projetId: string): boolean {
  return utilisateur.projetIds.includes(projetId)
}

/**
 * Coeur de la garde, en fonction pure. Leve, ou ne fait rien.
 *
 * Separee de la lecture de session pour rester testable : c'est ici que se
 * decide l'autorisation, et c'est ici qu'elle est verifiee.
 */
export function verifierAcces(
  utilisateur: Utilisateur,
  projetId: string,
  rolesAutorises: readonly Role[],
): void {
  if (!habilite(utilisateur.role, rolesAutorises)) {
    throw new NonAutorise(`le role ${utilisateur.role} n est pas habilite pour cette operation`)
  }
  if (!rattacheAuProjet(utilisateur, projetId)) {
    throw new NonAutorise('ce projet n est pas accessible a cet utilisateur')
  }
}

/**
 * Circuit de validation d'un releve journalier.
 *
 *   BROUILLON -> SOUMIS -> VALIDE -> RECTIFIE
 *
 * Un releve se modifie tant qu'il n'est pas valide. Une fois valide il est
 * GELE : la base refuse toute modification, et une correction passe par un
 * releve rectificatif qui le remplace et le fait passer a `RECTIFIE`. Un
 * releve rectifie n'admet plus aucune action, il reste comme trace.
 *
 * La rectification est reservee aux roles qui valident : elle produit
 * directement un releve valide, et engage donc autant qu'une validation.
 */
export type ActionReleve = 'modifier' | 'soumettre' | 'valider' | 'rectifier'

export function actionsSurReleve(statut: StatutReleve, role: Role): ActionReleve[] {
  const saisit = habilite(role, PEUT_SAISIR)
  const valide = habilite(role, PEUT_VALIDER)
  switch (statut) {
    case 'BROUILLON':
      return saisit ? ['modifier', 'soumettre'] : []
    case 'SOUMIS':
      return [...(saisit ? (['modifier'] as const) : []), ...(valide ? (['valider'] as const) : [])]
    case 'VALIDE':
      return valide ? ['rectifier'] : []
    case 'RECTIFIE':
      return []
  }
}

export const LIBELLE_ROLE: Record<Role, string> = {
  CHEF_CHANTIER: 'Chef de chantier',
  CONDUCTEUR: 'Conducteur de travaux',
  MOE: 'Maitrise d oeuvre',
  MOA: 'Maitrise d ouvrage',
  ADMIN: 'Administration',
}
