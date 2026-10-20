/**
 * Verrou de recalcul par projet.
 *
 * `recompute` lit tout le contexte du projet, puis reecrit taches et
 * instantanes. Deux transactions simultanees sur le meme projet — un
 * conducteur qui valide pendant que la file hors ligne d'un chef rejoue un
 * releve avec alea, par exemple — pouvaient lire leur contexte avant que
 * l'autre ne soit validee : la seconde effacait alors les instantanes de la
 * premiere avec un calcul qui l'ignorait, et le tableau de bord restait faux
 * jusqu'au recalcul de la nuit, sans aucun message.
 *
 * Le verrou consultatif de transaction serialise ces ecritures projet par
 * projet. Il se pose en TETE de transaction, avant toute ecriture : pose plus
 * tard, il pourrait croiser les verrous de ligne d'une autre transaction et
 * provoquer un interblocage. Il est reentrant dans une meme transaction et se
 * libere tout seul a sa fin, validation comme annulation.
 */

import { sql } from 'drizzle-orm'

/** Tout ce qui sait executer une requete : instance ou transaction. */
type Executeur = { execute: (requete: ReturnType<typeof sql>) => Promise<unknown> }

export async function verrouillerProjet(executeur: Executeur, projetId: string): Promise<void> {
  await executeur.execute(sql`select pg_advisory_xact_lock(hashtextextended(${projetId}, 0))`)
}
