/**
 * Parcours des livrables visuels du sprint 8 : timeline photographique, plan
 * interactif, rapport hebdomadaire.
 */

import { expect, test } from '@playwright/test'
import { connecter } from './outils'

test('la timeline montre chaque point de vue, et compare deux dates au volet', async ({ page }) => {
  const projet = await connecter(page, 'conducteur')
  await page.goto(`/projet/${projet}/photos`)
  const premier = page.getByRole('region', { name: 'Cage d’escalier centrale' })
  await expect(premier.getByRole('img')).toBeVisible()

  // Au premier cran du curseur, la photo montree est la toute premiere prise.
  const curseur = page.getByRole('slider').first()
  await curseur.focus()
  await page.keyboard.press('Home')
  await expect(premier.getByText(/^Prise du /)).toHaveText(/29 mars 2026/)

  await premier.getByRole('button', { name: 'Comparer deux dates' }).click()
  const comparaison = page.getByRole('group', { name: /Comparaison/ })
  await expect(comparaison.getByRole('slider', { name: 'Position du volet' })).toBeVisible()
  await expect(comparaison.getByText(/jours d’écart/)).toBeVisible()
})

test('la grille et les filtres se partagent par l adresse', async ({ page }) => {
  const projet = await connecter(page, 'moa')
  await page.goto(`/projet/${projet}/photos?vue=grille&du=2026-09-01`)
  await expect(page.getByRole('heading', { name: '30 septembre 2026' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /mars 2026/ })).toHaveCount(0)
})

test('le plan colore les zones et ouvre le detail des taches au clic', async ({ page }) => {
  const projet = await connecter(page, 'conducteur')
  await page.goto(`/projet/${projet}/plan`)
  await page.getByRole('button', { name: 'R+3' }).click()
  const zone = page.getByRole('button', { name: /R\+3 — Circulations/ })
  await expect(zone).toHaveAttribute('data-etat', 'CRITIQUE')
  await zone.click()
  const detail = page.getByRole('region', { name: 'Détail de la zone' })
  await expect(detail.getByText('Poteaux du R+3')).toBeVisible()

  // Rejouer au debut du chantier : rien n'est commence.
  await page.getByRole('slider').focus()
  await page.keyboard.press('Home')
  await expect(zone).toHaveAttribute('data-etat', 'NON_COMMENCE')
})

test('le rapport hebdomadaire se telecharge en PDF', async ({ page }) => {
  const projet = await connecter(page, 'conducteur')
  await page.goto(`/projet/${projet}/rapports`)
  const telechargement = page.waitForEvent('download')
  await page
    .getByRole('link', { name: /Télécharger le PDF/ })
    .first()
    .click()
  const fichier = await telechargement
  expect(fichier.suggestedFilename()).toMatch(/^rapport-LOG24-ABJ-2026-\d{4}-\d{2}-\d{2}\.pdf$/)
  const debut = Date.now()
  const r = await page.request.get(`/api/projet/${projet}/rapport`)
  console.log(`Rapport généré en ${Date.now() - debut} ms`)
  expect(r.headers()['content-type']).toBe('application/pdf')
  expect((await r.body()).subarray(0, 5).toString()).toBe('%PDF-')
})
