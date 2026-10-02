/**
 * Change le mot de passe d'un compte, par exemple ceux du jeu de
 * demonstration apres la mise en ligne : leur mot de passe commun est public.
 *
 *   npm run compte:mot-de-passe -- conducteur@chantierscope.test
 *
 * Le mot de passe est lu sur l'entree standard, jamais en argument : il
 * finirait dans l'historique du terminal.
 */

import bcrypt from 'bcryptjs'
import { createInterface } from 'node:readline/promises'
import { dbScript } from '@/db/index'

const email = process.argv[2]
if (!email) {
  console.error('Adresse du compte attendue en argument.')
  process.exit(1)
}

const lecteur = createInterface({ input: process.stdin, output: process.stdout, terminal: false })
const motDePasse = (
  await lecteur.question('Nouveau mot de passe, douze caracteres au moins : ')
).trim()
lecteur.close()
if (motDePasse.length < 12) {
  console.error('Mot de passe trop court.')
  process.exit(1)
}

const { client, fermer } = dbScript()
try {
  const lignes = await client`
    update utilisateur set mot_de_passe_hash = ${bcrypt.hashSync(motDePasse, 12)}
     where lower(email) = lower(${email}) returning email`
  console.log(
    lignes.length === 1 ? `Mot de passe change pour ${email}.` : `Compte introuvable : ${email}.`,
  )
  if (lignes.length !== 1) process.exitCode = 1
} finally {
  await fermer()
}
