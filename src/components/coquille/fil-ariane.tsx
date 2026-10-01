import Link from 'next/link'
import { Icone } from '@/lib/icones'

export type Maillon = { libelle: string; href?: string }

export function FilAriane({ maillons }: { maillons: readonly Maillon[] }) {
  return (
    <nav aria-label="Fil d Ariane" className="text-muted-foreground flex items-center text-sm">
      {maillons.map((m, i) => (
        <span key={`${m.libelle}-${i}`} className="flex items-center">
          {i > 0 && <Icone.deplier className="mx-1 size-3.5 shrink-0 opacity-60" aria-hidden />}
          {m.href === undefined ? (
            <span className="text-foreground font-medium">{m.libelle}</span>
          ) : (
            <Link href={m.href} className="hover:text-foreground transition-colors">
              {m.libelle}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}
