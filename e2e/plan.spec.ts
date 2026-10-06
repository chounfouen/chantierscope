/**
 * Parcours de l'edition du plan : import d'un plan AutoCAD (DXF) ou PDF,
 * dessin d'une zone, rattachement d'une tache, puis remise en etat.
 *
 * Tache de bureau : le dessin se fait a la souris, le parcours ne tourne
 * pas sur le profil telephone.
 */

import { expect, test, type Page } from '@playwright/test'
import { base, connecter } from './outils'

test.skip(({ isMobile }) => isMobile, 'Edition du plan : tache de bureau.')

async function ouvrirImport(page: Page, projet: string) {
  await page.goto(`/projet/${projet}/plan`)
  await page.getByRole('button', { name: 'Modifier le plan' }).click()
  await page.getByRole('button', { name: /Importer un plan|Remplacer le plan/ }).click()
  return page.getByRole('dialog', { name: 'Importer un plan de niveau' })
}

test('un plan AutoCAD en DXF s importe, puis on y dessine une zone', async ({ page }) => {
  const projet = await connecter(page, 'conducteur')
  const fenetre = await ouvrirImport(page, projet)
  await fenetre.getByRole('combobox').selectOption({ label: 'R+1' })
  await fenetre.locator('input[type=file]').setInputFiles('e2e/fixtures/plan-r1.dxf')

  // Les calques du fichier sont proposes ; le mobilier, gele, est decoche.
  await expect(fenetre.getByRole('checkbox', { name: /MURS/ })).toBeChecked()
  await expect(fenetre.getByRole('checkbox', { name: /MOBILIER/ })).not.toBeChecked()
  await expect(fenetre.getByText(/HATCH \(1\)/)).toBeVisible()
  await expect(fenetre.getByRole('img', { name: 'Aperçu du plan converti' })).toBeVisible()
  await expect(fenetre.getByText(/zones suivront/)).toHaveCount(0)
  await fenetre.getByRole('button', { name: 'Importer ce plan' }).click()
  await expect(page.getByText(/Plan importé\. 3 zones suivent/)).toBeVisible()

  const plan = page.getByRole('group', { name: /Plan du niveau R\+1/ })
  await expect(plan.locator('image')).toHaveCount(1)
  const sql = base()
  const [p] = await sql<{ largeur: number; hauteur: number; format: string }[]>`
    select largeur, hauteur, format_source as format from plan_niveau where niveau = 1`
  expect(p).toEqual({ largeur: 4096, hauteur: expect.any(Number), format: 'DXF' })

  // Dessin d'une zone : quatre clics, Entree, un nom, une tache.
  await page.getByRole('button', { name: 'Nouvelle zone' }).click()
  const boite = await plan.boundingBox()
  if (!boite) throw new Error('Plan invisible')
  for (const [fx, fy] of [
    [0.06, 0.08],
    [0.24, 0.08],
    [0.24, 0.38],
    [0.06, 0.38],
  ] as const) {
    await page.mouse.click(boite.x + boite.width * fx, boite.y + boite.height * fy)
  }
  await expect(page.getByText('4 sommets posés')).toBeVisible()
  await page.keyboard.press('Enter')
  const edition = page.getByRole('region', { name: 'Édition de la zone' })
  await edition.getByLabel('Nom de la zone').fill('R+1 — Logement 105')
  await edition.getByLabel('Rechercher une tâche').fill('04.2')
  await edition.getByRole('checkbox').first().check()
  await edition.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('Zone créée.')).toBeVisible()
  const zone = page.getByRole('button', { name: /R\+1 — Logement 105/ })
  await expect(zone).toBeVisible()
  const [z] = await sql<{ n: number }[]>`
    select count(*)::int as n from zone_tache zt join zone z on z.id = zt.zone_id
     where z.nom = 'R+1 — Logement 105'`
  expect(z?.n).toBe(1)

  // Remise en etat : la zone, puis le plan.
  page.on('dialog', (d) => void d.accept())
  await zone.click()
  await edition.getByRole('button', { name: 'Supprimer' }).click()
  await expect(page.getByText('Zone supprimée.')).toBeVisible()
  await page.getByRole('button', { name: 'Retirer le plan' }).click()
  await expect(page.getByText(/Plan retiré/)).toBeVisible()
  const [reste] = await sql<{ n: number }[]>`select count(*)::int as n from plan_niveau`
  expect(reste?.n).toBe(0)
  await sql.end()
})

test('un PDF s importe aussi, et un DWG est refuse avec la marche a suivre', async ({ page }) => {
  const projet = await connecter(page, 'conducteur')
  let fenetre = await ouvrirImport(page, projet)
  await fenetre.locator('input[type=file]').setInputFiles({
    name: 'plan.dwg',
    mimeType: 'application/acad',
    buffer: Buffer.from('AC1032\u0000\u0000\u0000donnees binaires'),
  })
  await expect(fenetre.getByRole('alert')).toContainText('Enregistrer sous, type « DXF »')
  await expect(fenetre.getByRole('button', { name: 'Importer ce plan' })).toBeDisabled()

  await fenetre.locator('input[type=file]').setInputFiles('e2e/fixtures/plan-r2.pdf')
  await expect(fenetre.getByRole('img', { name: 'Aperçu du plan converti' })).toBeVisible({
    timeout: 20_000,
  })
  await fenetre.getByRole('button', { name: 'Importer ce plan' }).click()
  await expect(page.getByText(/Plan importé/)).toBeVisible()
  const sql = base()
  const [p] = await sql<{ format: string; largeur: number }[]>`
    select format_source as format, largeur from plan_niveau where niveau = 0`
  expect(p).toEqual({ format: 'PDF', largeur: 4096 })

  page.on('dialog', (d) => void d.accept())
  await page.getByRole('button', { name: 'Retirer le plan' }).click()
  await expect(page.getByText(/Plan retiré/)).toBeVisible()
  await sql.end()
  fenetre = page.getByRole('dialog')
  await expect(fenetre).toHaveCount(0)
})

test('le maitre d ouvrage consulte le plan sans pouvoir le modifier', async ({ page }) => {
  const projet = await connecter(page, 'moa')
  await page.goto(`/projet/${projet}/plan`)
  await expect(page.getByRole('group', { name: /Plan du niveau/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Modifier le plan' })).toHaveCount(0)
})
