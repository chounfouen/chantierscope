import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // La base d'integration est reconstruite une fois pour toute la suite.
    globalSetup: ['./vitest.globalsetup.mts'],
    // Les tests d'integration partagent une base : les fichiers ne peuvent
    // pas s'executer en parallele les uns des autres.
    fileParallelism: false,
    testTimeout: 30_000,
    setupFiles: ['./vitest.setup.mts'],
    coverage: {
      provider: 'v8',
      include: ['src/db/compute/**/*.ts', 'src/lib/**/*.ts', 'src/db/recompute.ts'],
      // Le noyau de calcul porte la logique metier : sa couverture est un
      // critere d'achevement du sprint 2, pas une statistique indicative.
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
})
