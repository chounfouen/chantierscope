import { signOut } from '@/auth'
import { Button } from '@/components/ui/button'
import { LIBELLE_ROLE, type Utilisateur } from '@/lib/droits'
import { Icone } from '@/lib/icones'

/** Initiales, pour la pastille d identite. */
function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? '')
    .join('')
}

export function MenuUtilisateur({ utilisateur }: { utilisateur: Utilisateur }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="hidden text-right leading-tight sm:block">
        <p className="text-[0.8125rem] font-medium">{utilisateur.nom}</p>
        <p className="text-muted-foreground text-[0.6875rem]">{LIBELLE_ROLE[utilisateur.role]}</p>
      </div>

      <span
        aria-hidden
        className="bg-secondary text-secondary-foreground grid size-8 shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold"
        title={`${utilisateur.nom} — ${utilisateur.email}`}
      >
        {initiales(utilisateur.nom)}
      </span>

      <form
        action={async () => {
          'use server'
          await signOut({ redirectTo: '/connexion' })
        }}
      >
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground size-8"
          aria-label="Se deconnecter"
        >
          <Icone.deconnexion className="size-4" strokeWidth={1.75} />
        </Button>
      </form>
    </div>
  )
}
