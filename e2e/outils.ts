import { expect, type Page } from '@playwright/test'
import { config } from 'dotenv'
import postgres from 'postgres'

config({ path: '.env.local', quiet: true })

export const MOT_DE_PASSE = 'chantier2026'

/** Acces direct a la base de test, pour verifier ce que l'ecran affirme. */
export function base() {
  return postgres(process.env['DIRECT_URL_TEST'] as string, { max: 1, onnotice: () => {} })
}

export async function connecter(page: Page, compte: string): Promise<string> {
  await page.goto('/connexion')
  await page.fill('input[name=email]', `${compte}@chantierscope.test`)
  await page.fill('input[name=motDePasse]', MOT_DE_PASSE)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => u.pathname.startsWith('/projet/'))
  return new URL(page.url()).pathname.split('/')[2] as string
}

/**
 * Remplit un releve de bout en bout. La date est passee explicitement : deux
 * parcours sur le meme lot et le meme jour entreraient en conflit, et c'est
 * justement ce que l'un d'eux verifie.
 */
export async function saisirReleve(
  page: Page,
  o: {
    lot: string
    date: string
    ouvriers: number
    /** Quantite a saisir sur une ligne designee par son libelle. */
    quantite?: { ligne: string; valeur: string }
    soumettre?: boolean
  },
): Promise<void> {
  await page.getByLabel('Date de la journée').fill(o.date)
  await page.getByText(o.lot, { exact: true }).click()
  await suivant(page) // vers meteo
  await suivant(page) // vers moyens
  await page.getByLabel('Ouvriers').fill(String(o.ouvriers))
  await page.getByRole('button', { name: /Journée normale/ }).click()
  await suivant(page) // vers quantites
  if (o.quantite) {
    const champ = page.getByLabel(o.quantite.ligne, { exact: true })
    if (!(await champ.isVisible())) await page.getByText(/Autres tâches du lot/).click()
    await champ.fill(o.quantite.valeur)
  }
  await suivant(page) // photos
  await suivant(page) // observations
  await suivant(page) // alea
  await suivant(page) // recapitulatif
  await expect(page.getByRole('heading', { name: 'Récapitulatif et envoi' })).toBeVisible()
  await page
    .getByRole('button', { name: o.soumettre === false ? 'Brouillon' : 'Soumettre' })
    .click()
}

async function suivant(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Suivant' }).click()
}

/**
 * Journees sans releve pour ce lot, entre l'ordre de service et la veille.
 * Le jeu de demonstration en compte peu : dimanches, feries, arrets.
 */
export async function journeesLibres(lotNom: string, nombre: number): Promise<string[]> {
  const sql = base()
  try {
    const lignes = await sql<{ d: string }[]>`
      select to_char(d, 'YYYY-MM-DD') as d
        from projet p,
             generate_series(p.date_ordre_service, current_date - 1, interval '1 day') d
       where not exists (
               select 1 from releve_journalier r join lot l on l.id = r.lot_id
                where l.nom = ${lotNom} and r.date = d::date and r.statut <> 'RECTIFIE')
       order by d desc
       limit ${nombre}`
    if (lignes.length < nombre) throw new Error(`Pas assez de journees libres pour ${lotNom}.`)
    return lignes.map((l) => l.d)
  } finally {
    await sql.end()
  }
}

/**
 * Une ligne du lot encore loin d'etre soldee, a designation unique dans le
 * lot : une quantite validee y fait forcement bouger l'avancement.
 */
export async function ligneOuverte(lotNom: string): Promise<string> {
  const sql = base()
  try {
    const [l] = await sql<{ designation: string }[]>`
      select q.designation
        from ligne_quantitatif q
        join tache t on t.id = q.tache_id
        join lot l on l.id = t.lot_id
       where l.nom = ${lotNom} and t.methode_avancement = 'UNITES_PHYSIQUES'
         and q.quantite_prevue - coalesce((
               select sum(rq.quantite_realisee) from releve_quantite rq
                 join releve_journalier r on r.id = rq.releve_journalier_id
                where rq.ligne_quantitatif_id = q.id), 0) > 20
         and (select count(*) from ligne_quantitatif q2 join tache t2 on t2.id = q2.tache_id
               where t2.lot_id = l.id and q2.designation = q.designation) = 1
       order by t.code_wbs limit 1`
    if (!l) throw new Error(`Aucune ligne ouverte dans ${lotNom}.`)
    return l.designation
  } finally {
    await sql.end()
  }
}
