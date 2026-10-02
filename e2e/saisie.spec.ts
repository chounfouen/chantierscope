/**
 * Parcours de saisie journaliere : saisie, validation, gel, conflit, saisie
 * sans reseau, refus d'acces. Chaque parcours tourne au bureau et au
 * telephone ; les journees sont choisies libres en base a chaque execution.
 */

import { expect, test } from '@playwright/test'
import { base, connecter, journeesLibres, ligneOuverte, saisirReleve } from './outils'

test('saisie, validation, gel : l avancement bouge des la validation', async ({
  page,
  browser,
}) => {
  const [date] = await journeesLibres('Lots techniques', 1)
  const ligne = await ligneOuverte('Lots techniques')
  const projet = await connecter(page, 'chef')

  await page.goto(`/projet/${projet}/releve/nouveau`)
  await saisirReleve(page, {
    lot: 'Lots techniques',
    date: date as string,
    ouvriers: 6,
    quantite: { ligne, valeur: '3,5' },
  })
  await page.waitForURL(/\/releve\/[0-9a-f-]{36}$/)
  const fiche = page.url()
  await expect(page.getByText('Soumis', { exact: true })).toBeVisible()
  // Le chef de chantier ne valide pas ce qu'il a saisi.
  await expect(page.getByRole('button', { name: 'Valider' })).toHaveCount(0)

  const sql = base()
  const avancement = async () => {
    const [s] = await sql<
      { a: number }[]
    >`select avancement_pct::float8 as a from snapshot_avancement
                           where lot_id is null order by date desc limit 1`
    return Number(s?.a)
  }
  const avant = await avancement()

  const conducteur = await browser.newPage()
  await connecter(conducteur, 'conducteur')
  await conducteur.goto(fiche)
  await conducteur.getByRole('button', { name: 'Valider' }).click()
  await expect(conducteur.getByText('Validé', { exact: true })).toBeVisible()
  expect(await avancement()).toBeGreaterThan(avant)

  // Gele : plus de modification, seulement la rectification.
  await expect(conducteur.getByRole('link', { name: 'Modifier' })).toHaveCount(0)
  await expect(conducteur.getByRole('link', { name: 'Rectifier' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: 'Modifier' })).toHaveCount(0)
  await sql.end()
  await conducteur.close()
})

test('deux saisies sur le meme lot et le meme jour : la seconde est refusee clairement', async ({
  page,
  browser,
}) => {
  const [date] = (await journeesLibres('Second œuvre', 1)) as [string]
  const projet = await connecter(page, 'chef')
  const autre = await browser.newPage()
  await connecter(autre, 'conducteur')

  // Les deux formulaires sont ouverts avant le premier envoi.
  await page.goto(`/projet/${projet}/releve/nouveau`)
  await autre.goto(`/projet/${projet}/releve/nouveau`)
  await saisirReleve(page, { lot: 'Second œuvre', date, ouvriers: 4 })
  await page.waitForURL(/\/releve\/[0-9a-f-]{36}$/)

  await saisirReleve(autre, { lot: 'Second œuvre', date, ouvriers: 7 })
  await expect(autre.getByText(/existe déjà pour ce lot/)).toBeVisible()
  await expect(autre).toHaveURL(/nouveau/)

  const sql = base()
  const [n] = await sql<
    { n: number }[]
  >`select count(*)::int as n from releve_journalier r join lot l on l.id = r.lot_id
                         where r.date = ${date}::date and l.nom = 'Second œuvre'`
  expect(n?.n).toBe(1)
  await sql.end()
  await autre.close()
})

test('hors ligne : deux saisies en file arrivent en base au retour du reseau', async ({
  page,
  context,
}) => {
  const dates = await journeesLibres('Gros œuvre', 2)
  const projet = await connecter(page, 'chef')
  const journal = `/projet/${projet}/releve`

  // En ligne : le service worker s'installe et met les ecrans en cache.
  await page.goto(journal)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.goto(`${journal}/nouveau`)
  await page.goto(journal)

  const sql = base()
  const compter = async () => {
    const [n] = await sql<
      { n: number }[]
    >`select count(*)::int as n from releve_journalier r join lot l on l.id = r.lot_id
                           where l.nom = 'Gros œuvre' and r.date = any(${dates}::date[])`
    return Number(n?.n)
  }

  await context.setOffline(true)
  for (const date of dates) {
    await page.goto(`${journal}/nouveau`)
    await saisirReleve(page, { lot: 'Gros œuvre', date, ouvriers: 9 })
    await page.waitForURL((u) => !u.pathname.endsWith('/nouveau'))
  }
  expect(await compter()).toBe(0)
  await page.goto(journal)
  await expect(page.getByRole('status').filter({ hasText: 'Hors ligne' })).toBeVisible()

  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(compter, { timeout: 20_000 }).toBe(2)
  await sql.end()
})

test('le maitre d ouvrage n accede pas au journal de chantier', async ({ page }) => {
  const projet = await connecter(page, 'moa')
  await page.goto(`/projet/${projet}/releve`)
  await expect(page).toHaveURL(/acces-refuse/)
  await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible()
})
