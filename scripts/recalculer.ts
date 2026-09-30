/**
 * Recalcul manuel du cache d'un projet.
 *
 * Utile apres une reprise de donnees, une migration, ou simplement pour
 * verifier que l'invariant tient : le cache doit se reconstruire a l'identique
 * a partir de la seule source de verite.
 */

import { dbScript } from '@/db/index'
import { premierProjetId } from '@/db/queries/contexte'
import { recalculerProjet } from '@/db/mutations/releve'
import { fcfa, indice, pourcent } from '@/lib/format'

const { db, fermer } = dbScript()

try {
  const projetId = await premierProjetId(db)
  const r = await recalculerProjet(db, projetId)

  console.log(`Recalcul du projet, date d analyse ${r.dateAnalyse}`)
  console.log(`  taches mises a jour   ${r.taches}`)
  console.log(`  instantanes ecrits    ${r.instantanes}`)
  console.log(`  avancement            ${pourcent(r.avancement)}`)
  console.log(`  valeur planifiee      ${fcfa(r.valeurPlanifieeXof)}`)
  console.log(`  valeur acquise        ${fcfa(r.valeurAcquiseXof)}`)
  console.log(`  cout reel             ${fcfa(r.coutReelXof)}`)
  console.log(`  SPI                   ${r.spi === null ? '—' : indice(r.spi)}`)
  console.log(`  CPI                   ${r.cpi === null ? '—' : indice(r.cpi)}`)
  console.log(`  ecart de delai        ${r.ecartDelaiJ.toFixed(1)} jours`)
  console.log(`  duree                 ${r.dureeMs} ms`)
} finally {
  await fermer()
}
