/**
 * Extension des types de session pour porter le role et les projets
 * accessibles. Sans cela, `session.user.role` ne serait pas type et la garde
 * d'autorisation perdrait sa verification a la compilation.
 */

import type { Role } from '@/db/schema'
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: Role
      projetIds: string[]
    } & DefaultSession['user']
  }

  interface User {
    role: Role
    projetIds: string[]
  }
}

/**
 * next-auth reexporte le type JWT depuis @auth/core : c'est ce module qu'il
 * faut augmenter, sous peine de voir `token.role` retomber sur la signature
 * d'index et perdre son typage.
 */
declare module '@auth/core/jwt' {
  interface JWT {
    role: Role
    projetIds: string[]
  }
}
