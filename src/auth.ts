/**
 * Authentification par identifiants, sessions JWT, cinq roles.
 *
 * Le choix des identifiants plutot qu'un fournisseur externe est delibere :
 * un chef de chantier n'a pas necessairement de compte Google, et
 * l'application doit fonctionner sur un telephone en fond de chantier, sans
 * redirection vers un service tiers.
 *
 * Le jeton porte le role et la liste des projets accessibles au moment de la
 * connexion, a titre indicatif : la garde (`src/lib/garde.ts`) les relit en
 * base a chaque requete, si bien qu'un compte desactive ou retire d'un projet
 * perd ses droits immediatement.
 *
 * Les essais sont limites : cinq echecs en quinze minutes bloquent l'adresse,
 * vingt bloquent l'adresse IP, le temps que la fenetre glisse.
 *
 * L'autorisation reelle n'est PAS dans ce fichier : elle est dans
 * `src/lib/garde.ts`, appelee en tete de chaque page protegee et de chaque
 * Server Action. Une session valide ne donne acces a rien par elle-meme.
 */

import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'
import { db } from '@/db/index'
import type { Role } from '@/db/schema'

const Identifiants = z.object({
  email: z.string().email(),
  motDePasse: z.string().min(1),
})

/** Fenetre et seuils de la limitation des essais. */
export const LIMITE_CONNEXION = { fenetreMinutes: 15, parAdresse: 5, parIp: 20 } as const

/** Refus distinct d'un mot de passe faux : le formulaire l'explique. */
export class TropDeTentatives extends CredentialsSignin {
  override code = 'trop_de_tentatives'
}

/**
 * Hachage de comparaison pour une adresse inconnue, de meme cout que les
 * vrais. Un hachage mal forme fait repondre bcrypt sans calcul, en zero
 * milliseconde contre quatre-vingts : la duree revelait alors quelles
 * adresses sont enregistrees.
 */
const HACHAGE_FACTICE = bcrypt.hashSync(randomUUID(), 10)

function adresseIp(requete: Request | undefined): string | null {
  const transmise = requete?.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return transmise || requete?.headers.get('x-real-ip') || null
}

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
        email: { label: 'Adresse électronique', type: 'email' },
        motDePasse: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(brut, requete) {
        const saisie = Identifiants.safeParse(brut)
        if (!saisie.success) return null
        const email = saisie.data.email
        const ip = adresseIp(requete)

        const [echecs] = await db().execute<{ adresse: number; ip: number }>(sql`
          select count(*) filter (where lower(email) = lower(${email}))::int as adresse,
                 count(*) filter (where ${ip}::text is not null and ip = ${ip})::int as ip
            from tentative_connexion
           where not reussie
             and le > now() - make_interval(mins => ${LIMITE_CONNEXION.fenetreMinutes})`)
        if (
          (echecs?.adresse ?? 0) >= LIMITE_CONNEXION.parAdresse ||
          (echecs?.ip ?? 0) >= LIMITE_CONNEXION.parIp
        ) {
          throw new TropDeTentatives()
        }

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
        const hash = compte?.motDePasseHash ?? HACHAGE_FACTICE
        const valide = await bcrypt.compare(saisie.data.motDePasse, hash)
        const reussie = compte !== undefined && compte.actif && valide

        await db().execute(sql`
          insert into tentative_connexion (email, ip, reussie)
          values (${email}, ${ip}, ${reussie})`)
        if (!reussie) return null

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
        token.emisLe = Date.now()
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.sub ?? ''
      session.user.role = token.role
      session.user.projetIds = token.projetIds
      session.user.emisLe = token.emisLe
      return session
    },
  },
})
