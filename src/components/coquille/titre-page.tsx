import { Icone, type NomIcone } from '@/lib/icones'

/**
 * Titre d'un ecran : une pastille a l'icone de l'ecran, puis le titre. La
 * pastille est la meme que dans la navigation : on sait ou l'on est.
 */
export function TitrePage({ icone, children }: { icone: NomIcone; children: React.ReactNode }) {
  const I = Icone[icone]
  return (
    <div className="flex items-center gap-3.5">
      <span className="pastille hidden size-11 rounded-2xl sm:grid">
        <I className="size-5" strokeWidth={2} aria-hidden />
      </span>
      <h1 className="text-[1.625rem] leading-tight font-extrabold tracking-tight">{children}</h1>
    </div>
  )
}
