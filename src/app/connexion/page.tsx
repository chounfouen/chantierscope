import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { FormulaireConnexion, type CompteDemo } from '@/app/connexion/formulaire'
import { Grue } from '@/components/coquille/grue'
import { utilisateurEventuel } from '@/lib/garde'
import { enDeveloppement } from '@/lib/env'
import { Icone } from '@/lib/icones'

export const metadata: Metadata = { title: 'Connexion' }

/** Comptes de demonstration, rappeles en developpement uniquement. */
const COMPTES_DEMO: CompteDemo[] = [
  { role: 'Chef de chantier', email: 'chef@chantierscope.test' },
  { role: 'Conducteur de travaux', email: 'conducteur@chantierscope.test' },
  { role: 'Maîtrise d’œuvre', email: 'moe@chantierscope.test' },
  { role: 'Maîtrise d’ouvrage', email: 'moa@chantierscope.test' },
  { role: 'Administration', email: 'admin@chantierscope.test' },
]

export default async function Connexion({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const { session } = await searchParams
  const expiree = session === 'expiree'

  // Une session expiree a deja ete invalidee cote base : on laisse la page
  // s'afficher plutot que de renvoyer vers une application inaccessible.
  if (!expiree && (await utilisateurEventuel())) redirect('/')

  return (
    <main
      className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10"
      style={{
        background:
          'radial-gradient(60rem 40rem at 10% -10%, var(--marque-douce), transparent 70%), radial-gradient(50rem 30rem at 110% 110%, var(--soleil-doux), transparent 70%), var(--background)',
      }}
    >
      <Grue className="absolute -right-10 -bottom-10 hidden h-80 md:block" />
      <div className="relative w-full max-w-[25rem]">
        <div className="entree mb-7 flex flex-col items-center text-center">
          <span
            aria-hidden
            className="bg-soleil text-soleil-encre grid size-16 -rotate-6 place-items-center rounded-2xl shadow-[0_5px_0_var(--soleil-encre)]"
          >
            <Icone.projet className="size-8" strokeWidth={2.25} />
          </span>
          <h1 className="mt-5 text-[1.75rem] font-extrabold tracking-tight">ChantierScope</h1>
          <p className="text-muted-foreground mt-1 text-[0.9375rem] font-semibold">
            Le suivi de votre chantier, jour après jour
          </p>
        </div>

        <section aria-labelledby="titre-connexion" className="surface entree entree-1 p-6 sm:p-7">
          <h2 id="titre-connexion" className="text-xl font-extrabold">
            Content de vous revoir
          </h2>
          <p className="text-muted-foreground mt-1 mb-5 text-sm">
            Connectez-vous pour retrouver l&apos;avancement du chantier.
          </p>
          {expiree && (
            <p className="bg-marque-douce mb-5 flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm leading-snug font-semibold">
              <Icone.alerte className="text-marque mt-0.5 size-4 shrink-0" strokeWidth={2.25} />
              Votre session n&apos;est plus valable. Reconnectez-vous.
            </p>
          )}
          <FormulaireConnexion comptesDemo={enDeveloppement() ? COMPTES_DEMO : []} />
        </section>

        {enDeveloppement() && (
          <p className="text-muted-foreground entree entree-2 mt-4 text-center text-xs">
            Mot de passe commun des comptes de démonstration, défini dans{' '}
            <code className="font-mono">src/db/seed</code>.
          </p>
        )}
      </div>
    </main>
  )
}
