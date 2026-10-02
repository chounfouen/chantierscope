import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { FormulaireConnexion } from '@/app/connexion/formulaire'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { utilisateurEventuel } from '@/lib/garde'
import { enDeveloppement } from '@/lib/env'
import { Icone } from '@/lib/icones'

export const metadata: Metadata = { title: 'Connexion' }

/** Comptes de demonstration, rappeles en developpement uniquement. */
const COMPTES_DEMO = [
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
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <Icone.projet className="text-muted-foreground size-7 shrink-0" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">ChantierScope</h1>
            <p className="text-muted-foreground text-sm">
              Suivi de l&apos;évolution d&apos;un chantier
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connexion</CardTitle>
          </CardHeader>
          <CardContent>
            {expiree && (
              <p className="text-muted-foreground bg-muted/60 mb-4 flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-relaxed">
                <Icone.alerte className="mt-0.5 size-3.5 shrink-0" />
                Votre session n&apos;est plus valable. Reconnectez-vous.
              </p>
            )}
            <FormulaireConnexion />
          </CardContent>
        </Card>

        {enDeveloppement() && (
          <>
            <Separator className="my-6" />
            <div className="text-muted-foreground text-xs">
              <p className="mb-2 font-medium">Comptes de démonstration</p>
              <ul className="space-y-1">
                {COMPTES_DEMO.map((c) => (
                  <li key={c.email} className="flex justify-between gap-4">
                    <span>{c.role}</span>
                    <code className="font-mono">{c.email}</code>
                  </li>
                ))}
              </ul>
              <p className="mt-2">
                Mot de passe commun, défini dans <code className="font-mono">src/db/seed</code>.
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
