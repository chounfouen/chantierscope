/**
 * Application de la matrice des droits a la session courante.
 *
 * Une session valide ne donne acces a rien par elle-meme. Toute page protegee
 * et toute Server Action appelle une garde de ce module, qui verifie trois
 * choses : l'existence d'une session, le role, et l'appartenance au projet.
 *
 * Le choix d'une garde applicative plutot que de la Row Level Security de
 * PostgreSQL est justifie en section 11.8 de la conception : le navigateur ne
 * parle jamais directement a la base. La RLS reste activee en refus general,
 * comme filet de securite ; l'autorisation utile est ici.
 *
 * La matrice elle-meme vit dans `droits.ts`, sans dependance au cadre, pour
 * rester testable sans navigateur ni base.
 */

import { redirect } from 'next/navigation'
import { cache } from 'react'
import { auth } from '@/auth'
import { db } from '@/db/index'
import { etatCompte } from '@/db/queries/lecture'
import {
  NonAuthentifie,
  PEUT_LIRE,
  verifierAcces,
  habilite,
  NonAutorise,
  type Utilisateur,
} from '@/lib/droits'
import type { Role } from '@/db/schema'

export * from '@/lib/droits'

/**
 * Utilisateur de la session, ou levee. N'effectue aucun controle de droit.
 *
 * Le role, les projets accessibles et l'etat du compte sont RELUS EN BASE, et
 * non pris dans le jeton : un compte desactive, retrogade ou retire d'un
 * projet perd ses droits a la requete suivante, y compris dans les Server
 * Actions et les routes d'API. Un jeton emis avant un changement de mot de
 * passe est refuse. `cache` limite la relecture a une requete par rendu.
 */
export const utilisateurCourant = cache(async (): Promise<Utilisateur> => {
  const session = await auth()
  if (!session?.user?.id) throw new NonAuthentifie()
  const compte = await etatCompte(db(), session.user.id)
  if (!compte || !compte.actif) throw new NonAuthentifie()
  if ((session.user.emisLe ?? 0) < compte.sessionsValidesApres) throw new NonAuthentifie()
  return {
    id: session.user.id,
    nom: session.user.name ?? '',
    email: session.user.email ?? '',
    role: compte.role,
    projetIds: compte.projetIds,
  }
})

/** Utilisateur de la session, ou nul. Pour les pages qui s'adaptent. */
export async function utilisateurEventuel(): Promise<Utilisateur | null> {
  try {
    return await utilisateurCourant()
  } catch {
    return null
  }
}

/**
 * Garde principale : session, role, et appartenance au projet.
 *
 * A appeler en tete de chaque page protegee et de chaque Server Action, sans
 * exception. Elle renvoie l'utilisateur, ce qui la rend difficile a omettre
 * puisque la suite du code en a besoin.
 */
export async function exiger(
  projetId: string,
  rolesAutorises: readonly Role[] = PEUT_LIRE,
): Promise<Utilisateur> {
  const u = await utilisateurCourant()
  verifierAcces(u, projetId, rolesAutorises)
  return u
}

/** Variante sans projet, pour les operations d'administration. */
export async function exigerRole(rolesAutorises: readonly Role[]): Promise<Utilisateur> {
  const u = await utilisateurCourant()
  if (!habilite(u.role, rolesAutorises)) {
    throw new NonAutorise(`le role ${u.role} n est pas habilite pour cette operation`)
  }
  return u
}

/**
 * Garde des pages : comme `exiger`, mais un refus devient une redirection.
 *
 * En production, React masque le message des erreurs levees cote serveur :
 * la frontiere d'erreur ne peut donc pas distinguer un refus d'acces d'une
 * panne, et l'utilisateur lirait « une erreur est survenue » la ou il n'a
 * simplement pas le droit. La redirection vers un ecran dedie dit la verite.
 *
 * Les Server Actions et les gestionnaires de route gardent `exiger`, dont ils
 * traduisent eux-memes le refus.
 */
export async function exigerPage(
  projetId: string,
  rolesAutorises: readonly Role[] = PEUT_LIRE,
): Promise<Utilisateur> {
  try {
    return await exiger(projetId, rolesAutorises)
  } catch (e) {
    if (e instanceof NonAuthentifie) redirect('/connexion')
    if (e instanceof NonAutorise) redirect('/acces-refuse')
    throw e
  }
}
