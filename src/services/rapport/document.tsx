/**
 * Rapport hebdomadaire, en composants React rendus en PDF.
 *
 * Quatre pages A4 : garde, synthese, periode, planche photographique et
 * jalons. Les couleurs viennent de la palette d'impression, reprise du theme
 * clair et verifiee par test ; tout texte est a l'encre, les teintes ne
 * servent qu'aux marques, toujours doublees d'un chiffre.
 */

import { join } from 'node:path'
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer'
import type { ReactNode } from 'react'
import {
  dateCourte,
  dateLongue,
  fcfa,
  indice,
  jours,
  libelleMeteo,
  pourcent,
  pourcentSigne,
} from '@/lib/format'
import { LIBELLE_GRAVITE, LIBELLE_TYPE_ALEA } from '@/lib/releve'
import { IMPRESSION } from '@/lib/viz-impression'
import type { ContenuRapport } from '@/services/rapport/contenu'

const POLICES = join(process.cwd(), 'src/services/rapport/polices')
Font.register({
  family: 'Liberation Sans',
  fonts: [
    { src: join(POLICES, 'LiberationSans-Regular.ttf') },
    { src: join(POLICES, 'LiberationSans-Bold.ttf'), fontWeight: 'bold' },
  ],
})
// Pas de cesure automatique : un mot coupe en francais par des regles
// anglaises se lit plus mal qu'une ligne courte.
Font.registerHyphenationCallback((mot) => [mot])

/**
 * Les formats francais emploient l'espace fine insecable, absente de la
 * police : elle devient une insecable ordinaire.
 */
const t = (texte: string) => texte.replace(/ /g, ' ')

const S = StyleSheet.create({
  page: {
    fontFamily: 'Liberation Sans',
    fontSize: 9.5,
    color: IMPRESSION.encrePrimaire,
    paddingTop: 42,
    paddingBottom: 48,
    paddingHorizontal: 44,
    lineHeight: 1.35,
  },
  pied: {
    position: 'absolute',
    bottom: 22,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: IMPRESSION.encreDiscrete,
  },
  h1: { fontSize: 22, fontWeight: 'bold' },
  h2: { fontSize: 12.5, fontWeight: 'bold', marginBottom: 6, marginTop: 14 },
  discret: { color: IMPRESSION.encreSecondaire },
  petit: { fontSize: 8, color: IMPRESSION.encreSecondaire },
  ligne: { flexDirection: 'row' },
  tuile: {
    width: '31.5%',
    borderTopWidth: 2,
    borderTopColor: IMPRESSION.ligneBase,
    backgroundColor: IMPRESSION.fond,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  tuileValeur: { fontSize: 15, fontWeight: 'bold', marginTop: 3, marginBottom: 3, lineHeight: 1.2 },
  table: { borderTopWidth: 1, borderTopColor: IMPRESSION.ligneBase },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: IMPRESSION.grille,
    paddingVertical: 3,
  },
  th: { fontWeight: 'bold', fontSize: 8, color: IMPRESSION.encreSecondaire },
})

function Pied({ c }: { c: ContenuRapport }) {
  return (
    <View style={S.pied} fixed>
      <Text>
        {t(
          `${c.projet.code} — rapport hebdomadaire du ${dateCourte(c.periode.debut)} au ${dateCourte(c.periode.fin)}`,
        )}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} sur ${totalPages}`} />
    </View>
  )
}

function Tableau({
  colonnes,
  lignes,
  largeurs,
}: {
  colonnes: string[]
  lignes: ReactNode[][]
  largeurs: number[]
}) {
  const cellule = (i: number) => ({
    width: `${largeurs[i]}%`,
    paddingRight: 4,
    textAlign: (i === 0 ? 'left' : 'right') as 'left' | 'right',
  })
  return (
    <View style={S.table}>
      <View style={S.tr}>
        {colonnes.map((c, i) => (
          <Text key={c} style={[S.th, cellule(i)]}>
            {c}
          </Text>
        ))}
      </View>
      {lignes.map((l, k) => (
        <View key={k} style={S.tr} wrap={false}>
          {l.map((v, i) => (
            <View key={i} style={cellule(i)}>
              {typeof v === 'string' ? <Text>{t(v)}</Text> : v}
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

function Tuile({
  intitule,
  valeur,
  precision,
}: {
  intitule: string
  valeur: string
  precision: string
}) {
  return (
    <View style={S.tuile}>
      <Text style={S.petit}>{intitule.toUpperCase()}</Text>
      <Text style={S.tuileValeur}>{t(valeur)}</Text>
      <Text style={S.petit}>{t(precision)}</Text>
    </View>
  )
}

function variation(v: number | null, format: (x: number) => string): string {
  if (v === null) return '—'
  return `${v >= 0 ? '+' : ''}${format(v)} sur la semaine`
}

export function RapportHebdomadaire({ c }: { c: ContenuRapport }) {
  const { fin, debut, projet, periodeLue: p } = c
  const pts = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} pts`

  return (
    <Document
      title={`Rapport hebdomadaire ${projet.code} au ${c.periode.fin}`}
      author={projet.entreprise}
      subject={projet.nom}
      language="fr"
    >
      {/* Page de garde ------------------------------------------------------ */}
      <Page size="A4" style={S.page}>
        <View style={{ marginTop: 150 }}>
          <Text style={[S.petit, { letterSpacing: 1 }]}>RAPPORT HEBDOMADAIRE D’AVANCEMENT</Text>
          <Text style={[S.h1, { marginTop: 10 }]}>{t(projet.nom)}</Text>
          <Text style={[S.discret, { marginTop: 6, fontSize: 11 }]}>{t(projet.lieu)}</Text>
          <View
            style={{
              marginTop: 36,
              borderTopWidth: 1,
              borderTopColor: IMPRESSION.ligneBase,
              paddingTop: 14,
            }}
          >
            {[
              ['Période', `du ${dateLongue(c.periode.debut)} au ${dateLongue(c.periode.fin)}`],
              ['Code du marché', projet.code],
              ['Maître d’ouvrage', projet.maitreOuvrage],
              ['Maîtrise d’œuvre', projet.maitreOeuvre],
              ['Entreprise', projet.entreprise],
              ['Ordre de service', dateLongue(projet.dateOrdreService)],
              ['Fin contractuelle', dateLongue(projet.dateFinContractuelle)],
            ].map(([cle, valeur]) => (
              <View key={cle} style={[S.ligne, { marginBottom: 5 }]}>
                <Text style={[S.discret, { width: 130 }]}>{cle}</Text>
                <Text style={{ flex: 1 }}>{t(valeur as string)}</Text>
              </View>
            ))}
          </View>
          <Text style={[S.petit, { marginTop: 40 }]}>
            {t(
              `Indicateurs établis sur les seuls relevés validés au ${dateLongue(c.periode.fin)}. Document produit par ChantierScope${
                c.interne ? ', diffusion interne : il comporte des données de coût.' : '.'
              }`,
            )}
          </Text>
        </View>
        <Pied c={c} />
      </Page>

      {/* Synthese et avancement par lot ------------------------------------- */}
      <Page size="A4" style={S.page}>
        <Text style={[S.h2, { marginTop: 0 }]}>Synthèse des indicateurs</Text>
        <View style={[S.ligne, { flexWrap: 'wrap', justifyContent: 'space-between' }]}>
          <Tuile
            intitule="Avancement"
            valeur={pourcent(fin.avancement)}
            precision={`${pourcent(fin.avancementPrevu)} prévus ; ${variation(fin.avancement - debut.avancement, pts)}`}
          />
          <Tuile
            intitule="Écart de délai"
            valeur={jours(-Math.round(fin.ecartDelaiJ))}
            precision={`lecture horizontale ; ${variation(-(fin.ecartDelaiJ - debut.ecartDelaiJ), (x) => jours(Math.round(x)).replace(/^\+/, ''))}`}
          />
          <Tuile
            intitule="SPI"
            valeur={fin.spi === null ? '—' : indice(fin.spi)}
            precision={variation(
              fin.spi !== null && debut.spi !== null ? fin.spi - debut.spi : null,
              indice,
            )}
          />
          {c.interne && (
            <Tuile
              intitule="CPI"
              valeur={fin.cpi === null ? '—' : indice(fin.cpi)}
              precision={variation(
                fin.cpi !== null && debut.cpi !== null ? fin.cpi - debut.cpi : null,
                indice,
              )}
            />
          )}
          {c.interne && (
            <Tuile
              intitule="Coût estimé final"
              valeur={fin.eac === null ? '—' : fcfa(fin.eac)}
              precision={fin.vac === null ? '' : `écart final ${fcfa(fin.vac)}`}
            />
          )}
          <Tuile
            intitule="Fin projetée"
            valeur={c.dateFinProjetee === null ? '—' : dateCourte(c.dateFinProjetee)}
            precision={
              fin.retardJ !== null && fin.retardJ > 0
                ? `${fin.retardJ} j de retard, pénalité prévue ${fcfa(fin.penaliteXof)}`
                : 'sans pénalité prévue'
            }
          />
        </View>

        <Text style={S.h2}>Avancement par lot</Text>
        <Tableau
          colonnes={['Lot', 'Budget', 'Prévu', 'Réalisé', '', 'Écart']}
          largeurs={[31, 21, 10, 10, 18, 10]}
          lignes={p.lots.map((l) => {
            const prevu = l.budget > 0 ? l.vp / l.budget : 0
            const teinte = IMPRESSION.series[l.rangCouleur] ?? IMPRESSION.series[0]
            return [
              `${l.code} ${l.nom}`,
              fcfa(l.budget),
              pourcent(prevu),
              pourcent(l.avancement),
              // Prevu en trame claire, realise plein, comme a l'ecran.
              <View
                key="barre"
                style={{ height: 6, marginTop: 3, marginLeft: 6, backgroundColor: IMPRESSION.fond }}
              >
                <View
                  style={{
                    position: 'absolute',
                    height: 6,
                    width: `${Math.min(100, prevu * 100)}%`,
                    backgroundColor: teinte,
                    opacity: 0.3,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    height: 6,
                    width: `${Math.min(100, l.avancement * 100)}%`,
                    backgroundColor: teinte,
                  }}
                />
              </View>,
              pourcentSigne(l.avancement - prevu),
            ]
          })}
        />

        <Text style={S.h2}>Faits marquants</Text>
        {c.faits.map((f) => (
          <View key={f} style={[S.ligne, { marginBottom: 3 }]}>
            <Text style={{ width: 10 }}>–</Text>
            <Text style={{ flex: 1 }}>{t(f)}</Text>
          </View>
        ))}
        <Pied c={c} />
      </Page>

      {/* Periode : aleas, meteo, effectifs ---------------------------------- */}
      <Page size="A4" style={S.page}>
        <Text style={[S.h2, { marginTop: 0 }]}>Aléas de la période</Text>
        {p.aleas.length === 0 ? (
          <Text style={S.discret}>
            Aucun aléa déclaré du {dateCourte(c.periode.debut)} au {dateCourte(c.periode.fin)}.
          </Text>
        ) : (
          <Tableau
            colonnes={['Aléa', 'Date', 'Gravité', 'Délai', 'Statut']}
            largeurs={[52, 12, 14, 10, 12]}
            lignes={p.aleas.map((a) => [
              `${LIBELLE_TYPE_ALEA[a.type as keyof typeof LIBELLE_TYPE_ALEA] ?? a.type}${a.lot ? `, ${a.lot}` : ''} : ${a.description}`,
              dateCourte(a.date),
              LIBELLE_GRAVITE[a.gravite] ?? String(a.gravite),
              `${a.impactDelaiJ} j`,
              a.statut === 'SOLDE'
                ? 'Soldé'
                : a.statut === 'EN_TRAITEMENT'
                  ? 'En traitement'
                  : 'Ouvert',
            ])}
          />
        )}

        <Text style={S.h2}>Météo et journées travaillées</Text>
        <Tableau
          colonnes={['Journée', 'Temps', 'Température', 'Pluie', 'Lots arrêtés']}
          largeurs={[24, 30, 16, 12, 18]}
          lignes={[...new Set(p.journees.map((j) => j.date))].map((date) => {
            const js = p.journees.filter((j) => j.date === date)
            const m = js.find((j) => j.meteoCode !== null) ?? js[0]
            const arretes = js.filter((j) => !j.journeeTravaillee).length
            return [
              dateLongue(date),
              libelleMeteo(m?.meteoCode ?? null),
              m?.temperatureC === null || m?.temperatureC === undefined
                ? '—'
                : `${m.temperatureC.toFixed(0)} °C`,
              m?.precipitationsMm === null || m?.precipitationsMm === undefined
                ? '—'
                : `${m.precipitationsMm.toFixed(1).replace('.', ',')} mm`,
              arretes === 0 ? '—' : `${arretes} sur ${js.length}`,
            ]
          })}
        />

        {c.interne && c.effectifs.length > 0 && (
          <>
            <Text style={S.h2}>Effectifs</Text>
            <Tableau
              colonnes={['Journée', 'Ouvriers relevés', 'Charge prévue', 'Écart']}
              largeurs={[40, 20, 20, 20]}
              lignes={c.effectifs.map((e) => [
                dateLongue(e.date),
                String(e.reel),
                String(e.prevu),
                `${e.reel - e.prevu >= 0 ? '+' : ''}${e.reel - e.prevu}`,
              ])}
            />
          </>
        )}

        {p.journees.some((j) => j.observations) && (
          <>
            <Text style={S.h2}>Observations des chefs de chantier</Text>
            {p.journees
              .filter((j) => j.observations)
              .map((j, k) => (
                <Text key={k} style={{ marginBottom: 3 }}>
                  {t(`${dateCourte(j.date)}, ${j.lot} : ${j.observations}`)}
                </Text>
              ))}
          </>
        )}
        <Pied c={c} />
      </Page>

      {/* Planche photographique et jalons ----------------------------------- */}
      <Page size="A4" style={S.page}>
        <Text style={[S.h2, { marginTop: 0 }]}>Planche photographique</Text>
        {c.photos.length === 0 ? (
          <Text style={S.discret}>Aucune photo disponible.</Text>
        ) : (
          <View style={[S.ligne, { flexWrap: 'wrap', justifyContent: 'space-between' }]}>
            {c.photos.map((ph, k) => (
              <View key={k} style={{ width: '48.5%', marginBottom: 10 }} wrap={false}>
                {/* Le moteur PDF ne porte pas de texte alternatif : la legende
                    ecrite sous l'image en tient lieu. */}
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={{ data: ph.jpeg, format: 'jpg' }} style={{ width: '100%' }} />
                <Text style={[S.petit, { marginTop: 3 }]}>
                  {t(`${ph.legende}, ${dateLongue(ph.date)}`)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={S.h2}>Jalons à venir</Text>
        {p.jalonsAVenir.length === 0 ? (
          <Text style={S.discret}>Aucun jalon à venir.</Text>
        ) : (
          <Tableau
            colonnes={['Jalon', 'Nature', 'Date prévue', 'Jours restants']}
            largeurs={[46, 16, 20, 18]}
            lignes={p.jalonsAVenir.map((j) => [
              j.nom,
              j.contractuel ? 'Contractuel' : 'Interne',
              dateCourte(j.datePrevue),
              `${Math.round((Date.parse(j.datePrevue) - Date.parse(c.periode.fin)) / 86_400_000)} j`,
            ])}
          />
        )}
        <Pied c={c} />
      </Page>
    </Document>
  )
}

export async function genererPdf(c: ContenuRapport): Promise<Buffer> {
  return renderToBuffer(<RapportHebdomadaire c={c} />)
}
