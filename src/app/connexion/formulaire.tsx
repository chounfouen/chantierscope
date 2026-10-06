'use client'

import { useActionState, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Icone } from '@/lib/icones'
import { seConnecter, type EtatConnexion } from '@/app/connexion/actions'

const INITIAL: EtatConnexion = { erreur: null, email: '' }

export type CompteDemo = { role: string; email: string }

function BoutonEnvoyer() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Connexion en cours...' : 'Se connecter'}
      {!pending && <Icone.suivant className="size-4" strokeWidth={2.5} />}
    </Button>
  )
}

export function FormulaireConnexion({ comptesDemo }: { comptesDemo: readonly CompteDemo[] }) {
  const [etat, action] = useActionState(seConnecter, INITIAL)
  const email = useRef<HTMLInputElement>(null)
  const motDePasse = useRef<HTMLInputElement>(null)

  // Un clic sur un compte de demonstration remplit l'adresse et passe au mot
  // de passe : seul ce dernier reste a taper.
  const choisir = (c: CompteDemo) => {
    if (!email.current) return
    email.current.value = c.email
    motDePasse.current?.focus()
  }

  return (
    <>
      <form action={action} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Adresse électronique</Label>
          <Input
            ref={email}
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            defaultValue={etat.email}
            required
            autoFocus
            placeholder="prenom.nom@entreprise.ci"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="motDePasse">Mot de passe</Label>
          <Input
            ref={motDePasse}
            id="motDePasse"
            name="motDePasse"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {etat.erreur !== null && (
          <p
            role="alert"
            className="[&>svg]:text-etat-critique flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm leading-snug font-semibold"
            style={{ background: 'color-mix(in oklab, var(--etat-critique) 12%, var(--card))' }}
          >
            <Icone.alerte className="mt-0.5 size-4 shrink-0" strokeWidth={2.25} />
            {etat.erreur}
          </p>
        )}

        <div className="pt-1">
          <BoutonEnvoyer />
        </div>
      </form>

      {comptesDemo.length > 0 && (
        <div className="border-border/70 mt-6 border-t pt-5">
          <p className="libelle-champ">Comptes de démonstration</p>
          <ul className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {comptesDemo.map((c) => (
              <li key={c.email}>
                <button
                  type="button"
                  onClick={() => choisir(c)}
                  aria-label={`Remplir avec le compte ${c.role}`}
                  className="hover:border-marque/50 hover:bg-marque-douce border-border flex w-full items-center gap-2.5 rounded-xl border-2 px-3 py-2 text-left transition-colors"
                >
                  <span className="pastille size-7 rounded-full">
                    <Icone.compte className="size-3.5" strokeWidth={2.25} aria-hidden />
                  </span>
                  <span className="min-w-0 text-[0.8125rem] leading-tight font-bold">{c.role}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
