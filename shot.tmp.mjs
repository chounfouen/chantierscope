import { chromium } from '@playwright/test'
const [,, chemin = '', compte = 'conducteur', theme = 'light', largeur = '1360', sortie = 'shot', action = ''] = process.argv
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +largeur, height: 900 }, colorScheme: theme })
p.on('pageerror', e => console.log('ERREUR', e.message))
await p.goto('http://localhost:3000/connexion', { timeout: 120000 })
await p.fill('input[name=email]', `${compte}@chantierscope.test`)
await p.fill('input[name=motDePasse]', 'chantier2026')
await p.click('button[type=submit]')
await p.waitForURL((u) => u.pathname.startsWith('/projet/'), { timeout: 60000 })
const id = new URL(p.url()).pathname.split('/')[2]
const t0 = Date.now()
await p.goto(`http://localhost:3000/projet/${id}${chemin}`, { timeout: 120000 })
await p.waitForLoadState('networkidle')
console.log('chargement', Date.now() - t0, 'ms')
if (action) await eval(action)
await p.waitForTimeout(800)
await p.screenshot({ path: `/tmp/claude-0/shots/${sortie}.png`, fullPage: true })
await b.close()
