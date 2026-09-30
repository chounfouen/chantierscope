import { BasculeTheme } from '@/components/bascule-theme'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ETAT, ETATS } from '@/lib/etats'
import { fcfa, fcfaCompact, indice, jours, pourcent, quantite } from '@/lib/format'
import { Icone } from '@/lib/icones'
import { SERIES } from '@/lib/viz'

/**
 * Page de reference des fondations, sprint 0.
 *
 * Elle n'a pas de valeur metier : elle rend visibles les jetons de couleur, la
 * table d'icones et les fonctions de formatage, pour qu'une derive se voie
 * immediatement. Elle sera remplacee par le selecteur de projet au sprint 4.
 */

const LOTS = [
  'Installation de chantier',
  'Terrassement et VRD',
  'Fondations',
  'Gros oeuvre',
  'Charpente et couverture',
  'Second oeuvre',
  'Lots techniques',
  'Finitions et exterieurs',
]

export default function Accueil() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Icone.projet className="text-muted-foreground mt-1 size-7 shrink-0" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">ChantierScope</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Suivi de l&apos;evolution d&apos;un chantier de genie civil
            </p>
          </div>
        </div>
        <BasculeTheme />
      </header>

      <Separator className="my-8" />

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icone.cout className="text-muted-foreground size-4" />
              Formatage des montants
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="chiffres-alignes grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Montant du marche</dt>
              <dd className="text-right font-medium">{fcfa(1_156_141_200)}</dd>
              <dt className="text-muted-foreground">Forme compacte</dt>
              <dd className="text-right font-medium">{fcfaCompact(1_156_141_200)}</dd>
              <dt className="text-muted-foreground">Valeur acquise</dt>
              <dd className="text-right font-medium">{fcfaCompact(517_077_955)}</dd>
              <dt className="text-muted-foreground">Beton coule</dt>
              <dd className="text-right font-medium">{quantite(1284.5, 'M3')}</dd>
              <dt className="text-muted-foreground">Acier pose</dt>
              <dd className="text-right font-medium">{quantite(97.42, 'T')}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icone.tableauBord className="text-muted-foreground size-4" />
              Indicateurs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="chiffres-alignes grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Avancement global</dt>
              <dd className="text-right font-medium">{pourcent(0.447)}</dd>
              <dt className="text-muted-foreground">Ecart de delai</dt>
              <dd className="text-etat-retard text-right font-medium">{jours(-14)}</dd>
              <dt className="text-muted-foreground">SPI</dt>
              <dd className="text-right font-medium">{indice(0.902)}</dd>
              <dt className="text-muted-foreground">CPI</dt>
              <dd className="text-right font-medium">{indice(0.981)}</dd>
              <dt className="text-muted-foreground">Penalite projetee</dt>
              <dd className="text-right font-medium">{fcfa(16_186_000)}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold tracking-tight">Etats d&apos;avancement</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Palette de statut, reservee. Chaque etat porte une icone et un libelle : la couleur ne
          porte jamais seule le sens.
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {ETATS.map((code) => {
            const etat = ETAT[code]
            const IconeEtat = etat.icone
            return (
              <li key={code}>
                <Badge
                  variant="outline"
                  className="gap-1.5 py-1 font-normal"
                  title={etat.definition}
                >
                  <span
                    aria-hidden
                    className={`size-2.5 shrink-0 rounded-full ${etat.fond}`}
                    style={code === 'NON_TRAVAILLE' ? undefined : { background: etat.couleur }}
                  />
                  <IconeEtat className="size-3.5" />
                  {etat.libelle}
                </Badge>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold tracking-tight">Identite des lots</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Huit teintes categorielles dans un ordre fixe, jamais cycle. Palette validee contre les
          surfaces reelles de l&apos;application, en clair et en sombre.
        </p>
        <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {LOTS.map((nom, rang) => (
            <li key={nom} className="flex items-center gap-2.5 text-sm">
              <span
                aria-hidden
                className="h-3 w-8 shrink-0 rounded-sm"
                style={{ background: SERIES[rang] }}
              />
              <span className="text-muted-foreground tabular-nums">
                {String(rang + 1).padStart(2, '0')}
              </span>
              {nom}
            </li>
          ))}
        </ul>
      </section>

      <Separator className="my-8" />

      <footer className="text-muted-foreground flex items-center gap-2 text-xs">
        <Icone.valide className="text-etat-acheve size-4" />
        Sprint 1 — schema et jeu de donnees en place. Etape suivante : le noyau de calcul.
      </footer>
    </div>
  )
}
