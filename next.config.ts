import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * Fichiers lus sur disque a l'execution par la route du rapport PDF : les
   * polices embarquees, et les planches statiques du jeu de demonstration,
   * qu'elle convertit en JPEG. Le dossier public n'est pas copie dans les
   * fonctions serverless : sans cette declaration, le rapport echouerait en
   * ligne et passerait en local.
   */
  outputFileTracingIncludes: {
    '/api/projet/\\[id\\]/rapport': [
      './src/services/rapport/polices/**/*',
      './public/uploads/demo/**/*',
    ],
  },
  async headers() {
    return [
      {
        // Le service worker ne doit jamais etre mis en cache par HTTP : une
        // version perimee resterait installee sur les telephones.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ]
  },
}

export default nextConfig
