import { redirect } from 'next/navigation'
import { db } from '@/db/index'
import { projetsAccessibles } from '@/db/queries/lecture'
import { utilisateurCourant } from '@/lib/garde'
import { Icone } from '@/lib/icones'

/**
 * Point d'entree. Tant que l'application ne gere qu'un projet, elle y
 * redirige directement plutot que d'imposer un ecran de selection a un seul
 * element.
 */
export default async function Accueil() {
  const utilisateur = await utilisateurCourant()

  const projets = await projetsAccessibles(db(), utilisateur.id)

  const premier = projets[0]
  if (premier) redirect(`/projet/${premier.id}`)

  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <span className="pastille mx-auto size-16 rounded-3xl">
        <Icone.projet className="size-8" strokeWidth={2} aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-extrabold tracking-tight">Aucun projet accessible</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Votre compte n&apos;est rattaché à aucun chantier. Demandez à l&apos;administrateur de vous
        donner accès à une opération.
      </p>
    </div>
  )
}
