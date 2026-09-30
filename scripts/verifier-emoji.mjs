/**
 * Aucun caractere emoji dans le code source ni dans l'interface.
 *
 * L'iconographie passe exclusivement par Lucide, via src/lib/icones.ts. Un
 * emoji est un caractere de texte : il change de dessin selon la plateforme,
 * n'a pas de taille controlable, et n'est pas annonce correctement par un
 * lecteur d'ecran.
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

const RACINE = 'src'
const EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.mjs', '.json'])

// Symboles et pictogrammes, emoticones, transports, drapeaux, symboles
// divers, dingbats, et les selecteurs de variation.
const EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u

async function* fichiers(dossier) {
  for (const entree of await readdir(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name)
    if (entree.isDirectory()) yield* fichiers(chemin)
    else if (EXTENSIONS.has(extname(entree.name))) yield chemin
  }
}

const trouves = []
for await (const chemin of fichiers(RACINE)) {
  const lignes = (await readFile(chemin, 'utf8')).split('\n')
  lignes.forEach((ligne, i) => {
    const m = EMOJI.exec(ligne)
    if (m) trouves.push(`${chemin}:${i + 1}  ${m[0]}  ${ligne.trim().slice(0, 80)}`)
  })
}

if (trouves.length > 0) {
  console.error(`${trouves.length} caractere(s) emoji trouve(s) :\n`)
  for (const t of trouves) console.error('  ' + t)
  console.error('\nUtiliser une icone Lucide via src/lib/icones.ts.')
  process.exit(1)
}
console.log('Aucun caractere emoji. Verification passee.')
