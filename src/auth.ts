/**
 * Authentification par identifiants, sessions JWT, cinq roles.
 *
 * Le choix des identifiants plutot qu'un fournisseur externe est delibere :
 * un chef de chantier n'a pas necessairement de compte Google, et
 * l'application doit fonctionner sur un telephone en fond de chantier, sans
 * redirection vers un service tiers.
 *
 * Le jeton porte le role et la liste des projets accessibles. Cela evite une
 * requete par rendu, mais impose de rappeler que le jeton est un instantane :
 * un changement de role ne prend effet qu'a la session suivante. C'est
 * acceptable ici, ou les roles ne changent pas en cours de chantier.
 *
 * L'autorisation reelle n'est PAS dans ce fichier : elle est dans
 * `src/lib/garde.ts`, appelee en tete de chaque page protegee et de chaque
 * Server Action. Une session valide ne donne acces a rien par elle-meme.
 */

import bcrypt from 'bcryptjs'
import { sql } from 'drizzle-orm'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'
import { db } from '@/db/index'
import type { Role } from '@/db/schema'

const Identifiants = z.object({
  email: z.string().email(),
  motDePasse: z.string().min(1),
})

type CompteTrouve = {
  id: string
  email: string
  nom: string
  role: Role
  motDePasseHash: string
  actif: boolean
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt', maxAge: 60 * 60 * 12 },
  pages: { signIn: '/connexion' },
  trustHost: true,

  providers: [
    Credentials({
      credentials: {
        email: { label: 'Adresse electronique', type: 'email' },
        motDePasse: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(brut) {
        const saisie = Identifiants.safeParse(brut)
        if (!saisie.success) return null

        const comptes = await db().execute<CompteTrouve>(sql`
          select id, email, nom, role, mot_de_passe_hash as "motDePasseHash", actif
            from utilisateur
           where lower(email) = lower(${saisie.data.email})
           limit 1`)

        const compte = comptes[0]
        /**
         * Une comparaison est effectuee meme lorsque le compte n'existe pas,
         * pour que le temps de reponse ne revele pas quelles adresses sont
         * enregistrees.
         */
        const hash =
          compte?.motDePasseHash ??
          '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin'
        const valide = await bcrypt.compare(saisie.data.motDePasse, hash)

        if (!compte || !compte.actif || !valide) return null

        const projets = await db().execute<{ projetId: string }>(sql`
          select projet_id as "projetId" from acces_projet
           where utilisateur_id = ${compte.id}::uuid`)

        return {
          id: compte.id,
          email: compte.email,
          name: compte.nom,
          role: compte.role,
          projetIds: projets.map((p) => p.projetId),
        }
      },
    }),
  ],

  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.projetIds = user.projetIds
        token.sub = user.id
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.sub ?? ''
      session.user.role = token.role
      session.user.projetIds = token.projetIds
      return session
    },
  },
})
