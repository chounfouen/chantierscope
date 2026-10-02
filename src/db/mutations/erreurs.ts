/**
 * Refus metier des mutations.
 *
 * Distincts des erreurs techniques : un refus metier s'explique a
 * l'utilisateur en clair et ne doit pas etre retente, une erreur technique
 * se journalise et peut l'etre. La file hors ligne s'appuie sur cette
 * distinction pour savoir si un releve en attente doit etre renvoye.
 *
 * Les messages sont destines a l'ecran : ils sont accentues.
 */

export type CodeRefus = 'CONFLIT' | 'GELE' | 'INCOHERENT' | 'INTROUVABLE'

export class RefusMetier extends Error {
  constructor(
    readonly code: CodeRefus,
    message: string,
  ) {
    super(message)
    this.name = 'RefusMetier'
  }
}

/** Code d'erreur leve par le declencheur de gel, migration 0003. */
const SQLSTATE_GEL = 'CS001'
/** Violation d'unicite. */
const SQLSTATE_UNICITE = '23505'

/** Code SQLSTATE d'une erreur du pilote, quel que soit l'enrobage de Drizzle. */
export function codeSql(e: unknown): string | undefined {
  let courant: unknown = e
  for (let i = 0; i < 4 && courant !== null && typeof courant === 'object'; i++) {
    const code = (courant as { code?: unknown }).code
    if (typeof code === 'string' && code.length === 5) return code
    courant = (courant as { cause?: unknown }).cause
  }
  return undefined
}

export function estGel(e: unknown): boolean {
  return codeSql(e) === SQLSTATE_GEL
}

export function estViolationUnicite(e: unknown): boolean {
  return codeSql(e) === SQLSTATE_UNICITE
}
