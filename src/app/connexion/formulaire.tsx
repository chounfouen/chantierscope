'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Icone } from '@/lib/icones'
import { seConnecter, type EtatConnexion } from '@/app/connexion/actions'

const INITIAL: EtatConnexion = { erreur: null }

function BoutonEnvoyer() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? 'Connexion en cours...' : 'Se connecter'}
    </Button>
  )
}

export function FormulaireConnexion() {
  const [etat, action] = useActionState(seConnecter, INITIAL)

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Adresse electronique</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          placeholder="prenom.nom@entreprise.ci"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="motDePasse">Mot de passe</Label>
        <Input
          id="motDePasse"
          name="motDePasse"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {etat.erreur !== null && (
        <p role="alert" className="text-etat-critique flex items-start gap-2 text-sm">
          <Icone.alerte className="mt-0.5 size-4 shrink-0" />
          {etat.erreur}
        </p>
      )}

      <BoutonEnvoyer />
    </form>
  )
}
