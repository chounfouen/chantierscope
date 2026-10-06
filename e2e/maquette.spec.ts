/**
 * Parcours de la maquette 3D : affichage colore, selection d'un element,
 * rattachements proposes, import d'une maquette IFC, lecture seule du
 * maitre d'ouvrage.
 */

import { expect, test } from '@playwright/test'
import { base, connecter } from './outils'

test('la maquette se colore et montre les taches de l element clique', async ({ page }) => {
  const projet = await connecter(page, 'conducteur')
  await page.goto(`/projet/${projet}/maquette`)
  const vue = page.getByRole('img', { name: /Maquette du bâtiment/ })
  await expect(vue).toBeVisible()
  await expect(vue.locator('canvas')).toBeVisible()
  // Bilan lisible sans la 3D : chaque etat avec son nombre d'elements.
  const detail = page.getByRole('region', { name: 'Détail de la maquette' })
  await expect(
    detail.getByRole('list', { name: 'Éléments par état' }).getByText('Achevé', { exact: true }),
  ).toBeVisible()
  await expect(detail.getByText('Tâches suivies sur la maquette')).toBeVisible()

  // Jusqu'au R+2, un clic au centre tombe sur un element de cet etage.
  await page.getByRole('button', { name: 'R+2', exact: true }).click()
  const boite = await vue.boundingBox()
  if (!boite) throw new Error('Vue invisible')
  await page.waitForTimeout(500)
  await page.mouse.click(boite.x + boite.width * 0.5, boite.y + boite.height * 0.55)
  await expect(detail.getByRole('button', { name: 'Fermer le détail' })).toBeVisible()
  await expect(detail.getByText(/· R\+2$/)).toBeVisible()
})

test('un rattachement retire est repropose, puis rajoute', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Edition : tache de bureau.')
  const projet = await connecter(page, 'conducteur')
  await page.goto(`/projet/${projet}/maquette`)
  await page.getByRole('tab', { name: 'Rattachements' }).click()
  await expect(page.getByText('25 rattachements')).toBeVisible()
  await page.getByRole('button', { name: 'Retirer le rattachement de 04.1.1' }).click()
  await expect(page.getByText('Rattachement retiré.')).toBeVisible()
  await expect(page.getByText('1 rattachement proposé')).toBeVisible()
  await expect(page.getByText(/Poteaux, RDC : 15 éléments/)).toBeVisible()
  await page.getByRole('button', { name: 'Ajouter 1 rattachement' }).click()
  await expect(page.getByText('1 rattachement ajouté.')).toBeVisible()
  await expect(page.getByText('25 rattachements')).toBeVisible()
})

test('une maquette IFC s importe, et un fichier Revit est refuse avec la marche a suivre', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Import : tache de bureau.')
  const projet = await connecter(page, 'conducteur')
  await page.goto(`/projet/${projet}/maquette`)
  await page.getByRole('button', { name: 'Remplacer' }).click()
  const fenetre = page.getByRole('dialog', { name: 'Importer la maquette du bâtiment' })
  const fichier = fenetre.locator('input[type=file]')

  await fichier.setInputFiles({
    name: 'projet.rvt',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  })
  await expect(fenetre.getByRole('alert')).toContainText('Fichier, Exporter, IFC')

  await fichier.setInputFiles('src/db/seed/residence-palmiers.ifc')
  await expect(fenetre.getByText('289 éléments sur 6 étages, schéma IFC4')).toBeVisible({
    timeout: 30_000,
  })
  await expect(fenetre.getByText('Portes et fenêtres · 96')).toBeVisible()
  await fenetre.getByRole('button', { name: 'Importer cette maquette' }).click()
  await expect(page.getByText('Maquette importée : 289 éléments sur 6 étages.')).toBeVisible()

  const sql = base()
  const [m] = await sql<{ chemin: string; n: number; regles: number }[]>`
    select chemin, (select count(*)::int from element_maquette) as n,
           (select count(*)::int from regle_maquette) as regles from maquette`
  expect(m?.chemin).toMatch(/^projets\/.+\/maquettes\/.+\.glb$/)
  expect(m?.n).toBe(289)
  expect(m?.regles).toBe(25)
  await sql.end()
  // La nouvelle maquette s'affiche, avec les memes rattachements.
  await expect(
    page.getByRole('img', { name: /Maquette du bâtiment/ }).locator('canvas'),
  ).toBeVisible()
})

test('le maitre d ouvrage consulte la maquette sans pouvoir la modifier', async ({ page }) => {
  const projet = await connecter(page, 'moa')
  await page.goto(`/projet/${projet}/maquette`)
  await expect(page.getByRole('img', { name: /Maquette du bâtiment/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Rattachements' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Remplacer' })).toHaveCount(0)
})
