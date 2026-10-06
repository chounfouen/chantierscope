/**
 * Accessibilite : audit automatique axe-core de chaque ecran, regles WCAG 2.1
 * niveaux A et AA, en theme clair et en theme sombre ; puis un parcours au
 * clavier seul.
 *
 * Un audit automatique ne remplace pas une revue humaine, mais il ne laisse
 * passer ni un controle sans libelle, ni un contraste insuffisant, ni une
 * structure de titres incoherente.
 */

import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { connecter } from './outils'

const ECRANS = [
  '',
  '/planning',
  '/analyses',
  '/plan',
  '/maquette',
  '/photos',
  '/rapports',
  '/releve',
  '/releve/nouveau',
  '/simulation',
]

for (const theme of ['light', 'dark'] as const) {
  test(`aucune violation WCAG 2.1 AA, theme ${theme === 'light' ? 'clair' : 'sombre'}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'bureau', 'Audit fait une fois, au bureau.')
    test.setTimeout(180_000)
    await page.emulateMedia({ colorScheme: theme })
    const projet = await connecter(page, 'conducteur')

    const violations: string[] = []
    for (const ecran of ECRANS) {
      await page.goto(`/projet/${projet}${ecran}`)
      await page.waitForLoadState('networkidle')
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        // L'indicateur de developpement de Next n'existe pas en production.
        .exclude('nextjs-portal')
        .analyze()
      for (const v of r.violations) {
        violations.push(
          `${ecran || '/'} : ${v.id} (${v.impact}) — ${v.nodes
            .slice(0, 3)
            .map((n) => n.target.join(' '))
            .join(' | ')}`,
        )
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })
}

test('le tableau de bord se parcourt au clavier, foyer visible', async ({ page }, info) => {
  test.skip(info.project.name !== 'bureau', 'Clavier, au bureau.')
  const projet = await connecter(page, 'conducteur')
  await page.goto(`/projet/${projet}`)
  await expect(page.getByRole('region', { name: 'Indicateurs de synthèse' })).toBeVisible()

  // Tabulation jusqu'au premier lien de lot : chaque element atteint porte
  // un foyer visible, contour ou anneau.
  let atteint = false
  for (let i = 0; i < 40 && !atteint; i++) {
    await page.keyboard.press('Tab')
    const etat = await page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null
      if (!e || e === document.body) return null
      const s = getComputedStyle(e)
      const visible =
        (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none'
      return { texte: e.textContent ?? '', visible, href: e.getAttribute('href') ?? '' }
    })
    if (etat === null) continue
    expect(etat.visible, `foyer invisible sur « ${etat.texte.trim().slice(0, 40)} »`).toBe(true)
    atteint = etat.href.includes('/lot/')
  }
  expect(atteint).toBe(true)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/lot\//)
})
