import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BasculeTheme } from '@/components/bascule-theme'
import { MenuUtilisateur } from '@/components/coquille/menu-utilisateur'
import { Navigation, type Groupe } from '@/components/coquille/navigation'
import { dbScript } from '@/db/index'
import { compteValide, projetsAccessibles } from '@/db/queries/lecture'
import { utilisateurEventuel, voitDonneesInternes } from '@/lib/garde'
import { Icone } from '@/lib/icones'

/**
 * Coquille de l'application.
 *
 * La redirection vers la connexion se fait ici plutot que dans un
 * intergiciel : toutes les pages protegees sont sous ce groupe de routes, et
 * un intergiciel imposerait de dedoubler la configuration d'authentification
 * pour rester compatible avec l'execution en peripherie.
 *
 * Cette redirection ne constitue PAS le controle d'acces : chaque page et
 * chaque action appelle `exiger()`, qui verifie le role et l'appartenance au
 * projet. Elle evite seulement d'afficher une page vide a un visiteur.
 */
export default async function CoquilleApplication({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const utilisateur = await utilisateurEventuel()
  if (!utilisateur) redirect('/connexion')

  const { db, fermer } = dbScript()
  let projets: Awaited<ReturnType<typeof projetsAccessibles>>
  let valide: boolean
  try {
    ;[valide, projets] = await Promise.all([
      compteValide(db, utilisateur.id),
      projetsAccessibles(db, utilisateur.id),
    ])
  } finally {
    await fermer()
  }

  // Un compte desactive ou disparu perd l'acces immediatement, sans attendre
  // l'expiration du jeton.
  if (!valide) redirect('/connexion?session=expiree')

  const projet = projets[0]
  const base = projet ? `/projet/${projet.id}` : '#'
  const interne = voitDonneesInternes(utilisateur.role)

  const groupes: Groupe[] = [
    {
      titre: 'Pilotage',
      entrees: [
        { libelle: 'Tableau de bord', href: base, icone: 'tableauBord' },
        { libelle: 'Planning', href: `${base}/planning`, icone: 'planning', aVenir: true },
        { libelle: 'Analyses', href: `${base}/analyses`, icone: 'analyses', aVenir: true },
      ],
    },
    {
      titre: 'Chantier',
      entrees: [
        // Le journal porte les effectifs : il suit la regle des donnees internes.
        ...(interne
          ? [{ libelle: 'Saisie journalière', href: `${base}/releve`, icone: 'releve' as const }]
          : []),
        { libelle: 'Plan interactif', href: `${base}/plan`, icone: 'plan', aVenir: true },
        { libelle: 'Photos', href: `${base}/photos`, icone: 'photos', aVenir: true },
      ],
    },
    {
      titre: 'Decision',
      entrees: [
        ...(interne
          ? [
              {
                libelle: 'Simulation',
                href: `${base}/simulation`,
                icone: 'simulation' as const,
                aVenir: true,
              },
            ]
          : []),
        { libelle: 'Rapports', href: `${base}/rapports`, icone: 'rapports', aVenir: true },
      ],
    },
  ]

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-background/80 border-border/70 sticky top-0 z-30 border-b backdrop-blur-xl">
        <div className="flex h-[3.25rem] items-center gap-3 px-4 sm:px-5">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <span
              aria-hidden
              className="bg-foreground text-background grid size-7 place-items-center rounded-lg"
            >
              <Icone.projet className="size-4" strokeWidth={2} />
            </span>
            <span className="text-[0.9375rem] font-semibold">ChantierScope</span>
          </Link>

          {projet && (
            <>
              <span aria-hidden className="bg-border hidden h-5 w-px lg:block" />
              <span className="text-muted-foreground hidden min-w-0 truncate text-[0.8125rem] lg:block">
                <span className="font-mono">{projet.code}</span>
                <span className="mx-1.5 opacity-40">—</span>
                {projet.lieu}
              </span>
            </>
          )}

          <div className="ml-auto flex items-center gap-1">
            <BasculeTheme />
            <span aria-hidden className="bg-border mx-1 h-5 w-px" />
            <MenuUtilisateur utilisateur={utilisateur} />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="bg-sidebar border-border/70 sticky top-[3.25rem] hidden h-[calc(100dvh-3.25rem)] w-[15rem] shrink-0 overflow-y-auto border-r px-2.5 py-5 md:block">
          <Navigation groupes={groupes} />
          <p className="text-muted-foreground/60 mt-8 px-3 text-[0.6875rem] leading-relaxed">
            Les entrees grisees correspondent aux ecrans prevus dans les sprints suivants du plan
            d&apos;implementation.
          </p>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
