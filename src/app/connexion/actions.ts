'use server'

import { AuthError } from 'next-auth'
import { z } from 'zod'
import { signIn } from '@/auth'

const Saisie = z.object({
  email: z.string().trim().email('Adresse électronique invalide'),
  motDePasse: z.string().min(1, 'Mot de passe requis'),
})

/** L'adresse est renvoyee pour la reafficher : React vide le formulaire apres envoi. */
export type EtatConnexion = { erreur: string | null; email: string }

/**
 * Tentative de connexion.
 *
 * Le message d'echec est volontairement unique et vague : distinguer
 * « adresse inconnue » de « mot de passe incorrect » revelerait quelles
 * adresses sont enregistrees.
 */
export async function seConnecter(_etat: EtatConnexion, donnees: FormData): Promise<EtatConnexion> {
  const email = String(donnees.get('email') ?? '')
  const saisie = Saisie.safeParse({
    email: donnees.get('email'),
    motDePasse: donnees.get('motDePasse'),
  })
  if (!saisie.success) {
    return { erreur: saisie.error.issues[0]?.message ?? 'Saisie invalide', email }
  }

  try {
    await signIn('credentials', {
      email: saisie.data.email,
      motDePasse: saisie.data.motDePasse,
      redirectTo: '/',
    })
    return { erreur: null, email }
  } catch (e) {
    if (e instanceof AuthError) {
      return { erreur: 'Adresse électronique ou mot de passe incorrect.', email }
    }
    // signIn signale la redirection par une levee : il faut la laisser passer.
    throw e
  }
}
