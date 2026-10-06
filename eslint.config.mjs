import next from 'eslint-config-next'
import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'

/**
 * Configuration plate native. eslint-config-next 16 exporte directement des
 * tableaux de configuration plate : le pont FlatCompat de @eslint/eslintrc
 * n'est plus necessaire, et provoque une erreur de structure circulaire.
 */
const eslintConfig = [
  ...next,
  ...coreWebVitals,
  ...typescript,
  prettier,
  {
    rules: {
      // Le typage explicite est la premiere defense des calculs metier.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-restricted-syntax': [
        'error',
        {
          // Les couleurs de serie passent par src/lib/viz.ts, les couleurs
          // d'etat par src/lib/etats.ts. Une couleur en dur dans un composant
          // echappe a la validation de la palette.
          selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/]',
          message:
            'Pas de couleur hexadecimale en dur. Utiliser les jetons de src/lib/viz.ts ou src/lib/etats.ts.',
        },
      ],
    },
  },
  {
    // La palette et les jetons d'etat portent les valeurs hexadecimales
    // validees : c'est leur role. Le peuplement porte les teintes de lot. La
    // palette d'impression reprend le theme clair pour le PDF, verifiee par
    // test contre la feuille de style.
    files: [
      'src/lib/viz.ts',
      'src/lib/etats.ts',
      'src/lib/viz-impression.ts',
      'src/db/seed/**/*.ts',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'coverage/**',
      'drizzle/**',
      'next-env.d.ts',
      // Copies de travail temporaires des sessions d'agent : ce sont des
      // instantanes d'anciens commits, pas du code du projet. Les analyser
      // ferait echouer la verification sur du code deja remplace.
      '.claude/**',
      'playwright-report/**',
      'test-results/**',
      // Composants generes par shadcn, non modifies.
      'src/components/ui/**',
    ],
  },
]

export default eslintConfig
