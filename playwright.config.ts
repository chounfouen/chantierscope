/**
 * Parcours de bout en bout, sur la construction de production.
 *
 * Le serveur tourne sur la base de TEST, reconstruite avant la suite : les
 * parcours ecrivent des releves et ne doivent pas toucher au jeu de
 * demonstration. Le service worker n'est actif qu'en production, d'ou
 * `next start` plutot que `next dev`.
 *
 * Lancement : `npm run test:e2e` (construit l'application au prealable).
 */

import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

const PORT = 3100
const baseTest = process.env['DATABASE_URL_TEST']
const directTest = process.env['DIRECT_URL_TEST']

export default defineConfig({
  testDir: './e2e',
  // Les parcours partagent une base : ils s'executent l'un apres l'autre.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  globalSetup: './e2e/preparation.ts',
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'fr-FR',
    timezoneId: 'Africa/Abidjan',
    trace: 'retain-on-failure',
    // Rendu WebGL logiciel, pour la maquette 3D dans le navigateur sans ecran.
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
  },
  projects: [
    { name: 'bureau', use: { ...devices['Desktop Chrome'] } },
    { name: 'telephone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/connexion`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      ...(baseTest ? { DATABASE_URL: baseTest } : {}),
      ...(directTest ? { DIRECT_URL: directTest } : {}),
      AUTH_URL: `http://localhost:${PORT}`,
    },
  },
})
