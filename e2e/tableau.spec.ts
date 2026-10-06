/**
 * Parcours du tableau de bord et des analyses, sprint 7.
 *
 * Les chiffres affiches sont confrontes a la base : l'ecran ne doit rien
 * dire que les instantanes ne disent pas. La concordance avec le calcul de
 * reference au tableur est verifiee, elle, par la suite d'integration.
 */

import { expect, test, type Page } from '@playwright/test'
import { base, connecter } from './outils'

/** Format francais d'une fraction, comme l'ecran : 0,4364 devient « 43,6 % ». */
function pourcent(f: number): string {
  return `${(Math.round(f * 1000) / 10).toFixed(1).replace('.', ',')} %`
}

/** L'ecran emploie des espaces insecables ; on compare a espaces simples. */
async function texte(page: Page, selecteur: string): Promise<string> {
  return ((await page.locator(selecteur).first().textContent()) ?? '').replace(/\s+/g, ' ')
}

async function situation(): Promise<{ avancement: number; spi: number }> {
  const sql = base()
  try {
    const [s] = await sql<{ avancement: number; spi: number }[]>`
      select avancement_pct::float8 as avancement, spi::float8 as spi
        from snapshot_avancement
       where lot_id is null order by date desc limit 1`
    return s as { avancement: number; spi: number }
  } finally {
    await sql.end()
  }
}

test('le bandeau affiche les indicateurs des instantanes, avec leur tendance', async ({ page }) => {
  const projet = await connecter(page, 'conducteur')
  await page.goto(`/projet/${projet}`)
  const s = await situation()

  const bandeau = page.getByRole('region', { name: 'Indicateurs de synthèse' })
  await expect(bandeau).toBeVisible()
  const contenu = ((await bandeau.textContent()) ?? '').replace(/\s+/g, ' ')
  expect(contenu).toContain(pourcent(s.avancement))
  expect(contenu).toContain(s.spi.toFixed(3).replace('.', ','))
  expect(contenu).toContain('CPI — coût')
  expect(contenu).toMatch(/en 30 jours/)

  await expect(page.getByText('Coût estimé final', { exact: true })).toBeVisible()
  await expect(page.getByText(/Projection au rythme constaté/)).toBeVisible()
})

test('le panneau d alertes signale les jalons menaces et enonce ses regles', async ({ page }) => {
  const projet = await connecter(page, 'conducteur')
  await page.goto(`/projet/${projet}`)
  const panneau = page.getByRole('region', { name: 'Alertes' })
  await expect(panneau.locator('[data-regle="JALON_MENACE"]').first()).toBeVisible()
  await expect(panneau.locator('[data-regle="TACHE_CRITIQUE_EN_RETARD"]').first()).toBeVisible()
  await panneau.getByText('Règles appliquées').click()
  await expect(panneau.getByText(/ouverte depuis plus de 7 jours/)).toBeVisible()

  const jalons = page.getByRole('region', { name: 'Prochains jalons' })
  await expect(jalons.getByText('Achèvement du gros œuvre')).toBeVisible()
  await expect(jalons.getByText(/dans \d+ j/).first()).toBeVisible()
})

test('le tableau de bord se charge en moins d une seconde', async ({ page }, info) => {
  test.skip(info.project.name === 'telephone', 'Mesure faite une fois, au bureau.')
  const projet = await connecter(page, 'conducteur')
  // Premier passage pour amorcer le serveur, puis mesure.
  await page.goto(`/projet/${projet}`)
  const debut = Date.now()
  await page.goto(`/projet/${projet}`)
  await expect(page.getByRole('region', { name: 'Indicateurs de synthèse' })).toBeVisible()
  const duree = Date.now() - debut
  console.log(`Tableau de bord chargé en ${duree} ms`)
  expect(duree).toBeLessThan(1000)
})

test('le maitre d ouvrage ne voit ni cout ni effectif', async ({ page }) => {
  const projet = await connecter(page, 'moa')
  await page.goto(`/projet/${projet}`)
  await expect(page.getByRole('region', { name: 'Indicateurs de synthèse' })).toBeVisible()
  expect(await texte(page, 'main')).not.toMatch(/CPI|Coût réel|Coût estimé final/)
  await expect(
    page.getByRole('region', { name: 'Indicateurs de synthèse' }).getByText('Fin projetée'),
  ).toBeVisible()

  await page.goto(`/projet/${projet}/analyses`)
  await expect(page.getByRole('region', { name: 'Consommation des matériaux clés' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Effectifs' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Rendements par nature de tâche' })).toHaveCount(0)
})

test('l ecran d analyses montre ses six analyses, chacune lisible en tableau', async ({ page }) => {
  const projet = await connecter(page, 'conducteur')
  await page.goto(`/projet/${projet}/analyses`)
  for (const titre of [
    'Courbe en S',
    'Effectifs',
    'Consommation des matériaux clés',
    'Rendements par nature de tâche',
    'Aléas par type',
    'Jours perdus cumulés',
    'Journées non travaillables par cause',
  ]) {
    await expect(page.getByRole('region', { name: titre })).toBeVisible()
  }

  // Le total de beton affiche est celui du quantitatif.
  const sql = base()
  const [b] = await sql<{ total: number }[]>`
    select round(sum(quantite_prevue))::int as total from ligne_quantitatif
     where unite = 'M3' and designation ~* 'b[ée]ton'`
  await sql.end()
  const materiaux = page.getByRole('region', { name: 'Consommation des matériaux clés' })
  const entete = ((await materiaux.textContent()) ?? '').replace(/\s/g, '')
  expect(entete).toContain(`/${b?.total}m3`)

  const arrets = page.getByRole('region', { name: 'Journées non travaillables par cause' })
  await arrets.getByText('Voir les données en tableau').click()
  await expect(arrets.getByRole('table')).toBeVisible()
  await expect(arrets.getByRole('cell', { name: /Pluie/ }).first()).toBeVisible()
})
