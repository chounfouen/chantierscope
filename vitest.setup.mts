import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

// Les tests de calcul sont deterministes. Toute dependance a l'horloge
// systeme doit etre injectee explicitement, jamais lue depuis Date.now().
process.env['TZ'] = 'Africa/Abidjan'
