/**
 * Objectifs mesurables de la conception, section 7 :
 *
 *   premier rendu utile sous 1,5 seconde en 4G,
 *   navigation entre ecrans sous 400 millisecondes,
 *   soumission d'un releve sous 1 seconde.
 *
 * La 4G bridee est le profil mobile de Lighthouse : 150 ms d'aller-retour,
 * 1,6 Mbit/s descendant, 750 kbit/s montant, processeur ralenti quatre fois.
 * Les mesures sont faites sur la construction de production servie en local :
 * en ligne, s'y ajoute la latence entre Abidjan et Francfort, a mesurer sur le
 * deploiement. Chaque mesure est ecrite dans le journal du parcours.
 */

import { expect, test, type Page } from '@playwright/test'
import { connecter, journeesLibres, saisirReleve } from './outils'

async function brider(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
}

test('premier rendu utile du tableau de bord sous 1,5 seconde en 4G', async ({ page }, info) => {
  test.skip(info.project.name !== 'telephone', 'Mesure faite sur le profil telephone.')
  const projet = await connecter(page, 'conducteur')
  // Un passage pour amorcer le serveur et le cache, puis la mesure, bridee.
  await page.goto(`/projet/${projet}`)
  await brider(page)
  await page.goto(`/projet/${projet}`, { waitUntil: 'load' })
  await expect(page.getByRole('region', { name: 'Indicateurs de synthèse' })).toBeVisible()

  const mesures = await page.evaluate(
    () =>
      new Promise<{ fcp: number; lcp: number }>((ok) => {
        const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1
        new PerformanceObserver((liste) => {
          const e = liste.getEntries()
          ok({ fcp, lcp: e[e.length - 1]?.startTime ?? -1 })
        }).observe({ type: 'largest-contentful-paint', buffered: true })
      }),
  )
  console.log(
    `4G bridée : premier rendu ${Math.round(mesures.fcp)} ms, plus grand rendu ${Math.round(mesures.lcp)} ms`,
  )
  expect(mesures.fcp).toBeGreaterThan(0)
  expect(mesures.lcp).toBeLessThan(1500)
})

test('navigation entre ecrans sous 400 millisecondes', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'Navigation par la barre laterale, au bureau.')
  const projet = await connecter(page, 'conducteur')
  await page.goto(`/projet/${projet}`)
  await expect(page.getByRole('region', { name: 'Indicateurs de synthèse' })).toBeVisible()
  // L'utilisateur lit l'ecran avant de cliquer : les prechargements aboutissent.
  await page.waitForLoadState('networkidle')

  // La duree est mesuree DANS la page, du clic a l'image qui suit l'insertion
  // du nouvel ecran. Un sondage depuis Playwright compterait aussi le dessin
  // differe des graphiques, qui suit l'affichage de l'ecran.
  const durees: Record<string, number> = {}
  for (const [lien, titre] of [
    ['Analyses', 'Analyses'],
    ['Plan interactif', 'Plan interactif'],
    ['Planning', 'Planning'],
    ['Rapports', 'Rapports hebdomadaires'],
    ['Tableau de bord', 'Résidence'],
  ] as const) {
    durees[lien] = await page.evaluate(
      ([lien, titre]) =>
        new Promise<number>((ok) => {
          const a = [
            ...document.querySelectorAll<HTMLAnchorElement>(
              'nav[aria-label="Navigation principale"] a',
            ),
          ].find((x) => x.textContent?.trim() === lien)
          const t0 = performance.now()
          const obs = new MutationObserver(() => {
            const h = document.querySelector('main h1')
            if (h?.textContent?.startsWith(titre)) {
              obs.disconnect()
              requestAnimationFrame(() => ok(performance.now() - t0))
            }
          })
          obs.observe(document.body, { subtree: true, childList: true, characterData: true })
          a?.click()
        }),
      [lien, titre] as const,
    )
    await page.waitForLoadState('networkidle')
  }
  console.log(
    `Navigation : ${Object.entries(durees)
      .map(([l, d]) => `${l} ${Math.round(d)} ms`)
      .join(', ')}`,
  )
  for (const d of Object.values(durees)) expect(d).toBeLessThan(400)
})

test('soumission d un releve sous 1 seconde en 4G', async ({ page }, info) => {
  test.skip(info.project.name !== 'telephone', 'Mesure faite sur le profil telephone.')
  const [date] = await journeesLibres('Charpente et couverture', 1)
  const projet = await connecter(page, 'chef')
  await page.goto(`/projet/${projet}/releve/nouveau`)
  await brider(page)

  // Duree de la requete d'envoi, de son emission a la fin de la reponse.
  let debut = 0
  page.on('request', (r) => {
    if (r.url().includes(`/api/projet/${projet}/releves`) && r.method() === 'POST')
      debut = Date.now()
  })
  const fin = page.waitForEvent('requestfinished', (r) =>
    r.url().includes(`/api/projet/${projet}/releves`),
  )
  await saisirReleve(page, { lot: 'Charpente et couverture', date: date as string, ouvriers: 5 })
  const requete = await fin
  const duree = Date.now() - debut
  expect((await requete.response())?.ok()).toBe(true)
  console.log(`4G bridée : relevé soumis en ${duree} ms`)
  expect(duree).toBeLessThan(1000)
})
