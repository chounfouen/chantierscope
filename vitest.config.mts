import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.mts'],
    coverage: {
      provider: 'v8',
      include: ['src/db/compute/**/*.ts', 'src/lib/**/*.ts'],
      // Le noyau de calcul porte la logique metier : sa couverture est un
      // critere d'achevement du sprint 2, pas une statistique indicative.
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
})
