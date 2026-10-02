/**
 * Parcours du planning et de la simulation, sprint 6.
 *
 * L'edition et le glisser-deposer se font a la souris, au bureau : ces
 * parcours ne tournent pas dans le projet telephone.
 */

import { expect, test } from '@playwright/test'
import { base, connecter } from './outils'

async function empreinteDates(): Promise<string> {
  const sql = base()
  try {
    const [e] = await sql<{ e: string }[]>`
      select md5(string_agg(code_wbs || date_debut_prevue || date_fin_prevue, '|' order by code_wbs)) as e
        from tache`
    return e?.e ?? ''
  } finally {
    await sql.end()
  }
}

async function idTache(code: string): Promise<string> {
  const sql = base()
  try {
    const [t] = await sql<{ id: string }[]>`select id from tache where code_wbs = ${code}`
    return t?.id as string
  } finally {
    await sql.end()
  }
}

test('le chemin critique affiche est celui calcule en base', async ({ page }) => {
  const projet = await connecter(page, 'conducteur')
  await page.goto(`/projet/${projet}/planning`)
  await expect(page.getByRole('img', { name: /Diagramme de Gantt/ })).toBeVisible()

  // La virtualisation ne joue pas sous cent lignes : toutes les barres sont rendues.
  const affichees = await page
    .locator('g[data-critique="oui"]')
    .evaluateAll((gs) => gs.map((g) => g.getAttribute('data-tache')))

  const sql = base()
  const enBase = await sql<{ id: string }[]>`
    select id from tache where parent_id is not null and critique`
  await sql.end()
  expect(affichees.sort()).toEqual(enBase.map((t) => t.id).sort())
})

test('une liaison qui fermerait un circuit est refusee en nommant les taches', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'telephone', 'Edition a la souris, au bureau.')
  const projet = await connecter(page, 'conducteur')
  await page.goto(`/projet/${projet}/planning`)

  const sql = base()
  const [avant] = await sql<{ n: number }[]>`select count(*)::int as n from liaison`

  // La reception precede le beton de proprete : boucle sur tout le chantier.
  await page.getByRole('button', { name: 'Nettoyage et réception', exact: true }).click()
  await page.getByLabel('Sens de la liaison').selectOption('aval')
  await page.getByLabel('Autre tâche').selectOption({ label: '03.1.1 — Béton de propreté' })
  await page.getByRole('button', { name: 'Ajouter la liaison' }).click()

  await expect(page.getByText(/fermerait un circuit/)).toBeVisible()
  await expect(page.getByText(/08\.1\.3 Nettoyage et réception/)).toBeVisible()
  const [apres] = await sql<{ n: number }[]>`select count(*)::int as n from liaison`
  await sql.end()
  expect(apres?.n).toBe(avant?.n)
})

test('dix jours sur les fondations : fin et penalite du calcul manuel', async ({ page }) => {
  const projet = await connecter(page, 'conducteur')
  const fondations = await idTache('03.1.1')
  await page.goto(`/projet/${projet}/simulation?tache=${fondations}&decalage=10`)

  const resultat = page.getByRole('region', { name: 'Résultat' })
  await expect(resultat.getByText('27/04/2027')).toBeVisible()
  await expect(resultat.getByText('11 561 412 F CFA', { exact: true })).toBeVisible()
  await expect(page.getByText(/jalons? contractuels? menacés?/)).toBeVisible()
})

test('glisser une barre ouvre la simulation sans rien ecrire', async ({ page }, info) => {
  test.skip(info.project.name === 'telephone', 'Glisser-deposer a la souris, au bureau.')
  const projet = await connecter(page, 'conducteur')
  await page.goto(`/projet/${projet}/planning`)
  const avant = await empreinteDates()

  await page.getByRole('button', { name: 'Mois', exact: true }).click()
  const barre = page.locator('g[data-critique="oui"]').nth(15)
  // Amener la barre dans la partie visible du diagramme, a droite du panneau
  // de l'arborescence qui reste colle a gauche et capterait le clic.
  await barre.evaluate((g) => {
    const c = g.closest('.overflow-auto') as HTMLElement
    const r = g.getBoundingClientRect()
    const rc = c.getBoundingClientRect()
    c.scrollLeft += r.left - rc.left - 450
    c.scrollTop += r.top - rc.top - 200
  })
  await page.waitForTimeout(200)
  const boite = await barre.boundingBox()
  if (!boite) throw new Error('Barre introuvable')
  // Quarante pixels au palier mois, quatre pixels par jour : dix jours.
  await page.mouse.move(boite.x + 10, boite.y + boite.height / 2)
  await page.mouse.down()
  await page.mouse.move(boite.x + 30, boite.y + boite.height / 2, { steps: 5 })
  await page.mouse.move(boite.x + 50, boite.y + boite.height / 2, { steps: 5 })
  await page.mouse.up()

  await page.waitForURL(/\/simulation\?tache=.+&decalage=10/)
  await expect(page.getByRole('region', { name: 'Résultat' })).toBeVisible()
  expect(await empreinteDates()).toBe(avant)
})

test('le conducteur modifie une duree, le planning se recale, puis revient', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'telephone', 'Edition a la souris, au bureau.')
  const projet = await connecter(page, 'conducteur')
  await page.goto(`/projet/${projet}/planning`)
  const avant = await empreinteDates()

  const tache = page.getByRole('complementary', { name: 'Tâche sélectionnée' })
  await page.getByRole('button', { name: 'Béton de propreté', exact: true }).click()
  const duree = tache.getByLabel('Durée (jours)')
  const initiale = await duree.inputValue()
  await duree.fill(String(Number(initiale) + 4))
  await tache.getByRole('button', { name: 'Recaler le planning' }).click()
  await expect(page.getByText(/Durée du réseau : 416 jours/)).toBeVisible()
  expect(await empreinteDates()).not.toBe(avant)

  await duree.fill(initiale)
  await tache.getByRole('button', { name: 'Recaler le planning' }).click()
  await expect(page.getByText(/Durée du réseau : 412 jours/)).toBeVisible()
  expect(await empreinteDates()).toBe(avant)
})

test('le maitre d ouvrage consulte le planning sans le modifier ni simuler', async ({ page }) => {
  const projet = await connecter(page, 'moa')
  await page.goto(`/projet/${projet}/planning`)
  await expect(page.getByRole('img', { name: /Diagramme de Gantt/ })).toBeVisible()
  await page.getByRole('button', { name: 'Béton de propreté', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Recaler le planning' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ajouter la liaison' })).toHaveCount(0)

  await page.goto(`/projet/${projet}/simulation`)
  await expect(page).toHaveURL(/acces-refuse/)
})
