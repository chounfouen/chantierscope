/**
 * Service worker de ChantierScope.
 *
 * Objet unique : que l'ecran de saisie s'ouvre et fonctionne sans reseau.
 * Les releves saisis hors ligne ne passent PAS par ici : ils sont gardes dans
 * IndexedDB par la page elle-meme, qui les envoie au retour du reseau. Le
 * service worker ne fait que servir les pages et les ressources deja vues.
 *
 *   ressources statiques  cache d'abord : leur nom contient une empreinte,
 *                         une version donnee ne change jamais ;
 *   pages                 reseau d'abord, cache en secours : une page a jour
 *                         quand c'est possible, la derniere vue sinon ;
 *   API, actions, RSC     jamais mis en cache.
 *
 * Les pages en cache portent les donnees du compte connecte. Elles sont
 * effacees des qu'une requete vise l'ecran de connexion : deconnexion,
 * session expiree, changement d'utilisateur sur un telephone partage.
 *
 * Fichier servi tel quel, hors de la chaine de construction : JavaScript
 * simple, sans import.
 */

const VERSION = 'v1'
const STATIQUE = `chantierscope-statique-${VERSION}`
const PAGES = `chantierscope-pages-${VERSION}`
const SECOURS = '/hors-ligne'

self.addEventListener('install', (evenement) => {
  evenement.waitUntil(
    caches
      .open(PAGES)
      .then((c) => c.add(SECOURS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (evenement) => {
  evenement.waitUntil(
    caches
      .keys()
      .then((noms) =>
        Promise.all(
          noms
            .filter((n) => n.startsWith('chantierscope-') && n !== STATIQUE && n !== PAGES)
            .map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (evenement) => {
  const requete = evenement.request
  if (requete.method !== 'GET') return

  const url = new URL(requete.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname === '/connexion') {
    evenement.waitUntil(viderPages())
    return
  }
  if (url.pathname.startsWith('/api/')) return

  if (url.pathname.startsWith('/_next/static/')) {
    evenement.respondWith(cacheDabord(requete))
    return
  }

  // Charge utile RSC d'une navigation interne : jamais en cache. En cas
  // d'echec, le routeur bascule sur une navigation complete, que le
  // gestionnaire ci-dessous sert depuis le cache.
  if (requete.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) return

  if (requete.mode === 'navigate') {
    evenement.respondWith(reseauDabord(requete))
  }
})

async function cacheDabord(requete) {
  const enCache = await caches.match(requete)
  if (enCache) return enCache
  const reponse = await fetch(requete)
  if (reponse.ok) {
    const cache = await caches.open(STATIQUE)
    cache.put(requete, reponse.clone())
  }
  return reponse
}

async function reseauDabord(requete) {
  try {
    const reponse = await fetch(requete)
    // Une redirection mene en general a la connexion : on ne la retient pas
    // comme version de la page demandee.
    if (reponse.ok && !reponse.redirected) {
      const cache = await caches.open(PAGES)
      cache.put(cleDePage(requete.url), reponse.clone())
    }
    return reponse
  } catch {
    const cache = await caches.open(PAGES)
    return (
      (await cache.match(cleDePage(requete.url))) ||
      (await cache.match(SECOURS)) ||
      new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain' } })
    )
  }
}

/**
 * Cle de cache d'une page : son chemin, sans parametres. L'ecran de saisie
 * appele avec ou sans lot pre-selectionne est le meme ecran.
 */
function cleDePage(adresse) {
  const url = new URL(adresse)
  return url.origin + url.pathname
}

async function viderPages() {
  const cache = await caches.open(PAGES)
  const cles = await cache.keys()
  await Promise.all(
    cles.filter((c) => new URL(c.url).pathname !== SECOURS).map((c) => cache.delete(c)),
  )
}
