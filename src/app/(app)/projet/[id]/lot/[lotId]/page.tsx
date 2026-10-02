import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { FilAriane } from '@/components/coquille/fil-ariane'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { db } from '@/db/index'
import { chargerLot } from '@/db/queries/lecture'
import { ETAT, type Etat } from '@/lib/etats'
import { exigerPage } from '@/lib/garde'
import { dateCourte, fcfa, fcfaNu, pourcent, quantite } from '@/lib/format'
import { Icone } from '@/lib/icones'
import { teinteSerie } from '@/lib/viz'

export const metadata: Metadata = { title: 'Quantitatif du lot' }

/** Etat d'une tache, deduit de son avancement, de ses dates et de sa criticite. */
function etatTache(t: {
  avancement: number
  dateDebutReelle: string | null
  dateFinPrevue: string
  critique: boolean
}): Etat {
  if (t.avancement >= 0.9999) return 'ACHEVE'
  if (t.dateDebutReelle === null) return 'NON_COMMENCE'
  const aujourdhui = new Date().toISOString().slice(0, 10)
  if (t.dateFinPrevue < aujourdhui) return t.critique ? 'CRITIQUE' : 'EN_RETARD'
  return 'EN_COURS'
}

export default async function VueLot({
  params,
}: {
  params: Promise<{ id: string; lotId: string }>
}) {
  const { id, lotId } = await params
  await exigerPage(id)

  const detail = await chargerLot(db(), lotId)

  // La garde porte sur le projet de l'adresse : un lot d'un autre projet ne
  // doit pas se lire en changeant seulement son identifiant.
  if (detail.projet.id !== id) notFound()

  const { lot, projet, taches } = detail

  const budget = taches.reduce((t, x) => t + x.poidsBudgetaireXof, 0)
  const acquis = taches.reduce(
    (t, x) => t + x.lignes.reduce((s, l) => s + l.valeurAcquiseXof, 0),
    0,
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <FilAriane
        maillons={[
          { libelle: projet.code, href: `/projet/${projet.id}` },
          { libelle: `Lot ${lot.code}` },
        ]}
      />

      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-1.5 h-4 w-1.5 shrink-0 rounded-full"
            style={{ background: teinteSerie(lot.rangCouleur) }}
          />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{lot.nom}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Lot {lot.code} — {taches.length} tâches, budget {fcfa(lot.budgetXof)}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1.5 font-normal">
          <Icone.tableauBord className="size-3.5" />
          {pourcent(budget > 0 ? acquis / budget : 0)} réalisés
        </Badge>
      </header>

      <div className="mt-6 space-y-5">
        {taches.map((t) => {
          const etat = ETAT[etatTache(t)]
          const IconeEtat = etat.icone
          const acquisTache = t.lignes.reduce((s, l) => s + l.valeurAcquiseXof, 0)

          return (
            <Card key={t.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <CardTitle className="text-base font-medium">
                    <span className="text-muted-foreground mr-2 font-mono text-xs">
                      {t.codeWbs}
                    </span>
                    {t.nom}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    {t.critique && (
                      <Badge variant="outline" className="text-etat-critique gap-1 font-normal">
                        <Icone.alerte className="size-3" />
                        Chemin critique
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className="gap-1.5 font-normal"
                      title={etat.definition}
                    >
                      <IconeEtat className="size-3.5" style={{ color: etat.couleur }} />
                      {etat.libelle}
                    </Badge>
                  </div>
                </div>

                <dl className="text-muted-foreground mt-1 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                  <div className="flex gap-1.5">
                    <dt>Prévu</dt>
                    <dd className="text-foreground">
                      {dateCourte(t.dateDebutPrevue)} au {dateCourte(t.dateFinPrevue)}
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt>Réel</dt>
                    <dd className="text-foreground">
                      {t.dateDebutReelle === null
                        ? 'non démarré'
                        : `${dateCourte(t.dateDebutReelle)} au ${
                            t.dateFinReelle === null ? '...' : dateCourte(t.dateFinReelle)
                          }`}
                    </dd>
                  </div>
                  {t.margeTotaleJ !== null && (
                    <div className="flex gap-1.5">
                      <dt>Marge totale</dt>
                      <dd className="text-foreground">{t.margeTotaleJ} j</dd>
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <dt>Avancement</dt>
                    <dd className="text-foreground font-medium">{pourcent(t.avancement)}</dd>
                  </div>
                </dl>
              </CardHeader>

              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Désignation</TableHead>
                      <TableHead className="text-right">Prévu</TableHead>
                      <TableHead className="text-right">Réalisé</TableHead>
                      <TableHead className="text-right">Reste</TableHead>
                      <TableHead className="text-right">Avancement</TableHead>
                      <TableHead className="text-right">Prix unitaire</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead className="text-right">Valeur acquise</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="chiffres-alignes">
                    {t.lignes.map((l) => {
                      const reste = Math.max(0, l.quantitePrevue - l.quantiteRealisee)
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium">{l.designation}</TableCell>
                          <TableCell className="text-right">
                            {quantite(l.quantitePrevue, l.unite)}
                          </TableCell>
                          <TableCell className="text-right">
                            {quantite(l.quantiteRealisee, l.unite)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-right">
                            {quantite(reste, l.unite)}
                          </TableCell>
                          <TableCell className="text-right">{pourcent(l.avancement)}</TableCell>
                          <TableCell className="text-muted-foreground text-right">
                            {fcfaNu(l.prixUnitaireXof)}
                          </TableCell>
                          <TableCell className="text-right">{fcfaNu(l.montantXof)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {fcfaNu(Math.round(l.valeurAcquiseXof))}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    <TableRow className="border-t-2 font-medium">
                      <TableCell colSpan={6}>Total de la tâche</TableCell>
                      <TableCell className="text-right">{fcfaNu(t.poidsBudgetaireXof)}</TableCell>
                      <TableCell className="text-right">
                        {fcfaNu(Math.round(acquisTache))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <p className="text-muted-foreground mt-2 text-xs">
                  Montants en FCFA. Seuls les relevés validés sont comptés.
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
