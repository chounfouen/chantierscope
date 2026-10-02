/**
 * Enregistrement d'une photo de chantier, une fois ses fichiers deposes.
 *
 * L'identifiant vient du navigateur, comme pour les releves : une photo
 * mise en file hors ligne puis renvoyee ne se duplique pas.
 *
 * Une photo peut s'ajouter a un releve deja valide : elle documente la
 * journee sans modifier ce que le releve engage, quantites et effectifs.
 */

import { sql } from 'drizzle-orm'
import type { db as instanceDb } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import { poserAuteur } from '@/db/mutations/releve'

type Db = ReturnType<typeof instanceDb>

export type PhotoAEnregistrer = {
  id: string
  releveId: string
  chemin: string
  cheminVignette: string
  largeur: number
  hauteur: number
  octets: number
  priseLe: string
  legende: string | null
}

/** Verifie que le releve existe et appartient au projet. */
export async function verifierRelevePhoto(
  db: Db,
  projetId: string,
  releveId: string,
): Promise<void> {
  const r = await db.execute<{ id: string }>(sql`
    select id from releve_journalier
     where id = ${releveId}::uuid and projet_id = ${projetId}::uuid`)
  if (r.length === 0) throw new RefusMetier('INTROUVABLE', 'Relevé introuvable pour cette photo.')
}

export async function enregistrerPhoto(
  db: Db,
  projetId: string,
  p: PhotoAEnregistrer,
  auteurId: string,
): Promise<{ creee: boolean }> {
  return db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    await verifierRelevePhoto(tx as unknown as Db, projetId, p.releveId)
    const lignes = await tx.execute<{ id: string }>(sql`
      insert into photo (id, projet_id, releve_journalier_id, chemin, chemin_vignette,
                         largeur, hauteur, octets, prise_le, legende)
      values (${p.id}::uuid, ${projetId}::uuid, ${p.releveId}::uuid, ${p.chemin}, ${p.cheminVignette},
              ${p.largeur}, ${p.hauteur}, ${p.octets}, ${p.priseLe}::timestamptz, ${p.legende})
      on conflict (id) do nothing
      returning id`)
    return { creee: lignes.length > 0 }
  })
}
