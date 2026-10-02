'use server'

import { AuthError } from 'next-auth'
import { z } from 'zod'
import { signIn } from '@/auth'

const Saisie = z.object({
  email: z.string().trim().email('Adresse électronique invalide'),
  motDePasse: z.string().min(1, 'Mot de passe requis'),
})

export type EtatConnexion = { erreur: string | null }

/**
 * Tentative de connexion.
 *
 * Le message d'echec est volontairement unique et vague : distinguer
 * « adresse inconnue » de « mot de passe incorrect » revelerait quelles
 * adresses sont enregistrees.
 */
export async function seConnecter(_etat: EtatConnexion, donnees: FormData): Promise<EtatConnexion> {
  const saisie = Saisie.safeParse({
    email: donnees.get('email'),
    motDePasse: donnees.get('motDePasse'),
  })
  if (!saisie.success) {
    return { erreur: saisie.error.issues[0]?.message ?? 'Saisie invalide' }
  }

  try {
    await signIn('credentials', {
      email: saisie.data.email,
      motDePasse: saisie.data.motDePasse,
      redirectTo: '/',
    })
    return { erreur: null }
  } catch (e) {
    if (e instanceof AuthError) {
      return { erreur: 'Adresse électronique ou mot de passe incorrect.' }
    }
    // signIn signale la redirection par une levee : il faut la laisser passer.
    throw e
  }
}
