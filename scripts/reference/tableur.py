"""
Calcul de reference au tableur des indicateurs du tableau de bord.

Le critere d'achevement du sprint 7 exige que les treize indicateurs affiches
concordent avec un calcul de reference etabli au tableur, a trois dates.
Ce script construit ce classeur :

1. il extrait de la base les SEULES donnees sources — quantitatif, dates
   prevues, methodes d'avancement, releves valides, moyens, aleas, equipes
   affectees — sans lire aucune valeur derivee ni aucun instantane ;
2. il ecrit un classeur dont chaque grandeur est une FORMULE du tableur,
   redigee d'apres les regles de la conception (sections 4.1 a 4.3) et non
   d'apres le code de l'application ;
3. il fait recalculer le classeur par LibreOffice, sans interface, et relit
   les valeurs obtenues dans `docs/reference/indicateurs.json`.

Le test `src/db/compute/tableau.reference.integration.test.ts` confronte
ensuite ce fichier aux indicateurs que l'application calcule depuis ses
instantanes.

Le classeur recalcule est conserve dans `docs/reference/` : il s'ouvre dans
n'importe quel tableur, et chaque chiffre s'y lit avec sa formule.

Usage, depuis la racine du depot, sur une base fraichement peuplee :

    npm run db:reset
    python3 scripts/reference/tableur.py

Dependances : psql, LibreOffice (soffice) et le module openpyxl.
"""

import csv
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import date, timedelta

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SORTIE = os.path.join(RACINE, "docs", "reference")

# Trois dates d'analyse : avant les fondations achevees, au coeur du gros
# oeuvre, et la derniere journee entierement validee du jeu de
# demonstration : les releves posterieurs sont en attente, et les suites
# d'integration les valident.
DATES = ["2026-05-15", "2026-07-31", "2026-09-27"]

# Parametres du modele de cout, section 4.3 de la conception.
PARAMETRES = [
    ("Taux horaire ouvrier, FCFA", 1400),
    ("Coût journalier d'un encadrant, FCFA", 42000),
    ("Part matériaux du prix unitaire", 0.58),
    ("Frais de chantier par jour calendaire, FCFA", 300000),
    ("Heures planifiées par ouvrier et par jour", 8),
    ("Ouvriers par encadrant", 12),
]
# Cellules des parametres, dans l'ordre ci-dessus, puis le projet.
P_TAUX_H, P_ENC, P_MAT, P_FRAIS, P_HJOUR, P_OUV = (f"Parametres!$B${i}" for i in range(2, 8))
P_ORIGINE, P_DUREE, P_MONTANT, P_PENALITE = (f"Parametres!$B${i}" for i in range(9, 13))


# --------------------------------------------------------------------------- #
# Extraction                                                                  #
# --------------------------------------------------------------------------- #


def url_base() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    with open(os.path.join(RACINE, ".env.local"), encoding="utf-8") as f:
        for ligne in f:
            if ligne.startswith("DATABASE_URL="):
                return ligne.split("=", 1)[1].strip().strip('"')
    sys.exit("DATABASE_URL introuvable.")


def requete(sql: str) -> list[dict]:
    sortie = subprocess.run(
        ["psql", url_base(), "--csv", "-c", sql],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return list(csv.DictReader(io.StringIO(sortie)))


def jour(texte: str) -> date:
    return date.fromisoformat(texte)


def extraire() -> dict:
    projet = requete(
        """select date_ordre_service as origine, duree_contractuelle_j as duree,
                  montant_marche_xof as montant, taux_penalite_journaliere as taux
             from projet order by code limit 1"""
    )[0]
    lots = requete("select code from lot order by ordre")
    taches = requete(
        """select t.code_wbs, l.code as lot, t.methode_avancement as methode,
                  t.date_debut_prevue as debut, t.duree_prevue_j as duree
             from tache t join lot l on l.id = t.lot_id
            where t.parent_id is not null order by t.code_wbs"""
    )
    lignes = requete(
        """select q.id, t.code_wbs, l.code as lot, q.designation, q.unite,
                  q.quantite_prevue as prevue, q.prix_unitaire_xof as pu
             from ligne_quantitatif q
             join tache t on t.id = q.tache_id join lot l on l.id = t.lot_id
            order by t.code_wbs, q.designation, q.id"""
    )
    quantites = requete(
        """select rq.ligne_quantitatif_id as ligne, r.date, sum(rq.quantite_realisee) as quantite
             from releve_quantite rq join releve_journalier r on r.id = rq.releve_journalier_id
            where r.statut = 'VALIDE' group by 1, 2 order by 2, 1"""
    )
    moyens = requete(
        """select l.code as lot, r.date, r.heures_travaillees as heures,
                  r.effectif_encadrement as encadrement
             from releve_journalier r join lot l on l.id = r.lot_id
            where r.statut = 'VALIDE' order by r.date, l.code"""
    )
    aleas = requete(
        """select coalesce(l.code, '') as lot, a.date, a.impact_cout_xof as cout
             from alea a left join lot l on l.id = a.lot_id order by a.date"""
    )
    equipes = requete(
        """select l.code as lot, a.date_debut as debut, a.date_fin as fin,
                  round(a.quantite * r.capacite)::int as ouvriers
             from affectation a join ressource r on r.id = a.ressource_id
             join tache t on t.id = a.tache_id join lot l on l.id = t.lot_id
            where r.type = 'EQUIPE' order by l.code, a.date_debut"""
    )
    return {
        "projet": projet,
        "lots": lots,
        "taches": taches,
        "lignes": lignes,
        "quantites": quantites,
        "moyens": moyens,
        "aleas": aleas,
        "equipes": equipes,
    }


# --------------------------------------------------------------------------- #
# Classeur                                                                    #
# --------------------------------------------------------------------------- #

GRAS = Font(bold=True)

# Les codes sont prefixes pour qu'aucun tableur ne les lise comme des nombres :
# « 01 » deviendrait 1 et ne correspondrait plus dans un critere.
def code_lot(c: str) -> str:
    return f"LOT-{c}" if c else "SANS-LOT"


def entete(feuille, titres: list[str]) -> None:
    feuille.append(titres)
    for cellule in feuille[1]:
        cellule.font = GRAS


def construire(d: dict, chemin: str) -> None:
    classeur = Workbook()
    lisez = classeur.active
    lisez.title = "Lisez-moi"
    for ligne in (__doc__ or "").strip().splitlines():
        lisez.append([ligne])
    lisez.column_dimensions["A"].width = 100

    # --- Parametres ---------------------------------------------------------
    par = classeur.create_sheet("Parametres")
    entete(par, ["Paramètre", "Valeur"])
    for libelle, valeur in PARAMETRES:
        par.append([libelle, valeur])
    p = d["projet"]
    par.append(["Projet", None])
    par.append(["Ordre de service", jour(p["origine"])])
    par.append(["Durée contractuelle, jours", int(p["duree"])])
    par.append(["Montant du marché, FCFA", int(p["montant"])])
    par.append(["Pénalité journalière, fraction du marché", float(p["taux"])])
    par.column_dimensions["A"].width = 46

    # --- Dates d'analyse ------------------------------------------------------
    dat = classeur.create_sheet("Dates")
    entete(dat, ["Date d'analyse", "Jour depuis l'ordre de service"])
    for i, texte in enumerate(DATES, start=2):
        dat.append([jour(texte), f"=A{i}-{P_ORIGINE}"])

    def cellule_date(n: int) -> str:
        return f"Dates!$A${n + 2}"

    def cellule_jour(n: int) -> str:
        return f"Dates!$B${n + 2}"

    # --- Donnees sources ------------------------------------------------------
    cles_lignes = {l["id"]: f"Q{i:03d}" for i, l in enumerate(d["lignes"], start=1)}

    qte = classeur.create_sheet("Quantites")
    entete(qte, ["Ligne", "Date", "Quantité validée"])
    for q in d["quantites"]:
        qte.append([cles_lignes[q["ligne"]], jour(q["date"]), float(q["quantite"])])
    nq = len(d["quantites"]) + 1

    moy = classeur.create_sheet("Moyens")
    entete(moy, ["Lot", "Date", "Heures ouvriers", "Encadrants"])
    for m in d["moyens"]:
        moy.append([code_lot(m["lot"]), jour(m["date"]), float(m["heures"]), int(m["encadrement"])])
    nm = len(d["moyens"]) + 1

    ale = classeur.create_sheet("Aleas")
    entete(ale, ["Lot", "Date", "Impact de coût"])
    for a in d["aleas"]:
        ale.append([code_lot(a["lot"]), jour(a["date"]), int(a["cout"])])
    na = len(d["aleas"]) + 1

    equ = classeur.create_sheet("Equipes")
    entete(equ, ["Lot", "Début", "Fin", "Ouvriers"])
    for e in d["equipes"]:
        equ.append([code_lot(e["lot"]), jour(e["debut"]), jour(e["fin"]), int(e["ouvriers"])])
    ne = len(d["equipes"]) + 1

    # --- Lignes de quantitatif ------------------------------------------------
    # Par date : cumul valide, valeur acquise plafonnee (4.1), ligne achevee.
    lig = classeur.create_sheet("Lignes")
    titres = ["Clé", "Tâche", "Lot", "Désignation", "Quantité prévue", "Prix unitaire", "Montant"]
    for t in DATES:
        titres += [f"Cumul au {t}", f"Acquis au {t}", f"Achevée au {t}"]
    entete(lig, titres)
    nl = len(d["lignes"]) + 1
    for i, l in enumerate(d["lignes"], start=2):
        rang = [
            cles_lignes[l["id"]],
            f"T-{l['code_wbs']}",
            code_lot(l["lot"]),
            l["designation"],
            float(l["prevue"]),
            float(l["pu"]),
            f"=E{i}*F{i}",
        ]
        for n in range(len(DATES)):
            c = get_column_letter(8 + 3 * n)
            rang += [
                f'=SUMIFS(Quantites!$C$2:$C${nq},Quantites!$A$2:$A${nq},A{i},'
                f'Quantites!$B$2:$B${nq},"<="&{cellule_date(n)})',
                f"=MIN({c}{i},E{i})*F{i}",
                f"=IF({c}{i}>=E{i}-0.000001,1,0)",
            ]
        lig.append(rang)

    def col_ligne(n: int, decalage: int) -> str:
        c = get_column_letter(8 + 3 * n + decalage)
        return f"Lignes!${c}$2:${c}${nl}"

    # --- Taches feuilles ------------------------------------------------------
    # Avancement selon la methode (4.1), valeur acquise, avancement prevu
    # lineaire bornes incluses, valeur planifiee.
    tac = classeur.create_sheet("Taches")
    titres = ["Tâche", "Lot", "Méthode", "Début prévu", "Durée", "Budget", "Budget arrondi", "Jour de début"]
    for t in DATES:
        titres += [f"Avancement au {t}", f"VA au {t}", f"Prévu au {t}", f"VP au {t}"]
    entete(tac, titres)
    nt = len(d["taches"]) + 1
    lignes_tache = f"Lignes!$B$2:$B${nl}"
    montants = f"Lignes!$G$2:$G${nl}"
    for i, t in enumerate(d["taches"], start=2):
        rang = [
            f"T-{t['code_wbs']}",
            code_lot(t["lot"]),
            t["methode"],
            jour(t["debut"]),
            int(t["duree"]),
            f"=SUMIFS({montants},{lignes_tache},A{i})",
            f"=ROUND(F{i},0)",
            f"=D{i}-{P_ORIGINE}",
        ]
        for n in range(len(DATES)):
            j = cellule_jour(n)
            frac, va, prevu = (get_column_letter(9 + 4 * n + k) for k in range(3))
            unites = f"IF(F{i}>0,SUMIFS({col_ligne(n, 1)},{lignes_tache},A{i})/F{i},0)"
            jalons = f"IF(F{i}>0,SUMIFS({montants},{lignes_tache},A{i},{col_ligne(n, 2)},1)/F{i},0)"
            tout_ou_rien = (
                f"IF(AND(COUNTIFS({lignes_tache},A{i})>0,"
                f"COUNTIFS({lignes_tache},A{i},{col_ligne(n, 2)},0)=0),1,0)"
            )
            rang += [
                f'=IF(C{i}="UNITES_PHYSIQUES",{unites},IF(C{i}="JALONS_PONDERES",{jalons},'
                f'IF(C{i}="ZERO_CENT",{tout_ou_rien},{prevu}{i})))',
                f"=ROUND(MIN(1,MAX(0,{frac}{i}))*F{i},0)",
                f"=IF({j}<H{i},0,IF(E{i}<=0,1,MIN(1,({j}-H{i}+1)/E{i})))",
                f"={prevu}{i}*G{i}",
            ]
        tac.append(rang)

    def col_tache(n: int, decalage: int) -> str:
        c = get_column_letter(9 + 4 * n + decalage)
        return f"Taches!${c}$2:${c}${nt}"

    # --- Effectif planifie, jour par jour et par lot ----------------------------
    codes = [code_lot(l["code"]) for l in d["lots"]]
    debut_eq = min(jour(e["debut"]) for e in d["equipes"])
    fin_eq = max(jour(e["fin"]) for e in d["equipes"])
    deb = classeur.create_sheet("Debourse")
    titres = ["Date"]
    for c in codes:
        titres += [f"Ouvriers {c}", f"Encadrants {c}"]
    entete(deb, titres)
    jours_eq = (fin_eq - debut_eq).days + 1
    for k in range(jours_eq):
        i = k + 2
        rang = [debut_eq + timedelta(days=k)]
        for n, c in enumerate(codes):
            o = get_column_letter(2 + 2 * n)
            rang += [
                f'=SUMIFS(Equipes!$D$2:$D${ne},Equipes!$A$2:$A${ne},"{c}",'
                f'Equipes!$B$2:$B${ne},"<="&$A{i},Equipes!$C$2:$C${ne},">="&$A{i})',
                f"=IF({o}{i}>0,ROUNDUP({o}{i}/{P_OUV},0)+1,0)",
            ]
        deb.append(rang)
    nd = jours_eq + 1

    # --- Lots -------------------------------------------------------------------
    lot = classeur.create_sheet("Lots")
    titres = ["Lot", "Budget de vente", "Heures prévues", "Encadrement prévu", "Budget au coût"]
    for t in DATES:
        titres += [
            f"Heures au {t}",
            f"Encadrement au {t}",
            f"Aléas au {t}",
            f"VA au {t}",
            f"VP au {t}",
            f"CR au {t}",
        ]
    entete(lot, titres)
    for n_lot, c in enumerate(codes):
        i = n_lot + 2
        o = get_column_letter(2 + 2 * n_lot)
        e = get_column_letter(3 + 2 * n_lot)
        rang = [
            c,
            f'=SUMIFS({montants},Lignes!$C$2:$C${nl},A{i})',
            f"=SUM(Debourse!{o}2:{o}{nd})*{P_HJOUR}",
            f"=SUM(Debourse!{e}2:{e}{nd})",
            f"=ROUND(B{i}*{P_MAT}+C{i}*{P_TAUX_H}+D{i}*{P_ENC},0)",
        ]
        for n in range(len(DATES)):
            dt = cellule_date(n)
            h, en, al, va, _vp, _cr = (get_column_letter(6 + 6 * n + k) for k in range(6))
            rang += [
                f'=SUMIFS(Moyens!$C$2:$C${nm},Moyens!$A$2:$A${nm},A{i},Moyens!$B$2:$B${nm},"<="&{dt})',
                f'=SUMIFS(Moyens!$D$2:$D${nm},Moyens!$A$2:$A${nm},A{i},Moyens!$B$2:$B${nm},"<="&{dt})',
                f'=SUMIFS(Aleas!$C$2:$C${na},Aleas!$A$2:$A${na},A{i},Aleas!$B$2:$B${na},"<="&{dt})',
                f"=SUMIFS({col_tache(n, 1)},Taches!$B$2:$B${nt},A{i})",
                f"=ROUND(SUMIFS({col_tache(n, 3)},Taches!$B$2:$B${nt},A{i}),0)",
                f"=ROUND({h}{i}*{P_TAUX_H}+{en}{i}*{P_ENC}+{va}{i}*{P_MAT}+{al}{i},0)",
            ]
        lot.append(rang)
    nlots = len(codes) + 1

    # --- Courbe planifiee journaliere ------------------------------------------
    # Necessaire a la lecture horizontale de l'ecart de delai (4.3).
    cvp = classeur.create_sheet("CourbeVP")
    entete(cvp, ["Jour"] + codes + ["Projet"])
    dernier_jour = max((jour(t) - jour(p["origine"])).days for t in DATES)
    lots_t = f"Taches!$B$2:$B${nt}"
    debut_t = f"Taches!$H$2:$H${nt}"
    duree_t = f"Taches!$E$2:$E${nt}"
    budget_t = f"Taches!$G$2:$G${nt}"
    for k in range(dernier_jour + 1):
        i = k + 2
        # Avancement prevu sans MIN ni IF, pour rester calculable en tableau :
        # (j >= debut) x [ (ecoules >= duree) + (ecoules < duree) x ecoules / duree ].
        ecoules = f"($A{i}-{debut_t}+1)"
        prevu = f"($A{i}>={debut_t})*(({ecoules}>={duree_t})+({ecoules}<{duree_t})*{ecoules}/{duree_t})"
        rang = [k]
        for c in codes:
            rang.append(f'=ROUND(SUMPRODUCT(({lots_t}="{c}")*{prevu}*{budget_t}),0)')
        rang.append(f"=SUM(B{i}:{get_column_letter(1 + len(codes))}{i})")
        cvp.append(rang)
    col_projet = get_column_letter(2 + len(codes))

    # --- Indicateurs --------------------------------------------------------------
    ind = classeur.create_sheet("Indicateurs", 1)
    entete(ind, ["Indicateur", "Clé"] + DATES)
    lignes_ind: list[tuple[str, str, list[str]]] = []

    def ajouter(libelle: str, cle: str, formule) -> None:
        lignes_ind.append((libelle, cle, [formule(n, get_column_letter(3 + n)) for n in range(len(DATES))]))

    def ref(cle: str, col: str) -> str:
        rang = 2 + [c for _, c, _ in lignes_ind].index(cle)
        return f"{col}{rang}"

    def somme_lots(n: int, decalage: int) -> str:
        c = get_column_letter(6 + 6 * n + decalage)
        return f"SUM(Lots!{c}2:{c}{nlots})"

    ajouter("Jour d'analyse", "jour", lambda n, c: f"={cellule_jour(n)}")
    ajouter("BAC, budget à l'achèvement", "bac", lambda n, c: f"=SUM(Taches!$G$2:$G${nt})")
    ajouter(
        "Budget au coût du projet",
        "budgetCout",
        lambda n, c: f"=SUM(Lots!$E$2:$E${nlots})+ROUND({P_DUREE}*{P_FRAIS},0)",
    )
    ajouter("k, coefficient de déboursé", "k", lambda n, c: f"={ref('budgetCout', c)}/{ref('bac', c)}")
    ajouter("VP, valeur planifiée", "vp", lambda n, c: f"={somme_lots(n, 4)}")
    ajouter("VA, valeur acquise", "va", lambda n, c: f"={somme_lots(n, 3)}")
    ajouter(
        "CR, coût réel",
        "cr",
        lambda n, c: f'={somme_lots(n, 5)}+({ref("jour", c)}+1)*{P_FRAIS}'
        f'+SUMIFS(Aleas!$C$2:$C${na},Aleas!$A$2:$A${na},"SANS-LOT",Aleas!$B$2:$B${na},"<="&{cellule_date(n)})',
    )
    ajouter("Avancement réel", "avancement", lambda n, c: f"={ref('va', c)}/{ref('bac', c)}")
    ajouter("EC, écart de coût", "ecartCout", lambda n, c: f"=ROUND({ref('k', c)}*{ref('va', c)}-{ref('cr', c)},0)")
    ajouter("ED, écart de délai en valeur", "ecartDelaiValeur", lambda n, c: f"={ref('va', c)}-{ref('vp', c)}")
    ajouter("CPI", "cpi", lambda n, c: f"={ref('k', c)}*{ref('va', c)}/{ref('cr', c)}")
    ajouter("SPI", "spi", lambda n, c: f"={ref('va', c)}/{ref('vp', c)}")
    ajouter("BAC au coût", "bacCout", lambda n, c: f"=ROUND({ref('k', c)}*{ref('bac', c)},0)")
    ajouter("EAC, coût estimé final", "eac", lambda n, c: f"=ROUND({ref('bacCout', c)}/{ref('cpi', c)},0)")
    ajouter("ETC, reste à dépenser", "etc", lambda n, c: f"={ref('eac', c)}-{ref('cr', c)}")
    ajouter("VAC, écart final", "vac", lambda n, c: f"={ref('bacCout', c)}-{ref('eac', c)}")
    ajouter("Durée projetée, jours", "dureeProjeteeJ", lambda n, c: f"=ROUND({P_DUREE}/{ref('spi', c)},0)")
    ajouter("Retard estimé, jours", "retardJ", lambda n, c: f"=MAX(0,{ref('dureeProjeteeJ', c)}-{P_DUREE})")
    ajouter(
        "Pénalité prévue, FCFA",
        "penaliteXof",
        lambda n, c: f"=ROUND({ref('retardJ', c)}*{P_PENALITE}*{P_MONTANT},0)",
    )
    # Lecture horizontale : dernier jour t' <= t ou VP(t') <= VA(t), puis
    # interpolation lineaire jusqu'au jour suivant.
    plage = lambda c: f"CourbeVP!${col_projet}$2:INDEX(CourbeVP!${col_projet}:${col_projet},{ref('jour', c)}+2)"
    ajouter("Rang t' sur la courbe planifiée", "rang", lambda n, c: f"=MATCH({ref('va', c)},{plage(c)},1)-1")
    ajouter(
        "Écart de délai en jours, lecture horizontale",
        "ecartDelaiJ",
        lambda n, c: f"={ref('jour', c)}-({ref('rang', c)}+IF(INDEX(CourbeVP!${col_projet}:${col_projet},{ref('rang', c)}+2)={ref('va', c)},0,"
        f"({ref('va', c)}-INDEX(CourbeVP!${col_projet}:${col_projet},{ref('rang', c)}+2))/"
        f"(INDEX(CourbeVP!${col_projet}:${col_projet},{ref('rang', c)}+3)-INDEX(CourbeVP!${col_projet}:${col_projet},{ref('rang', c)}+2))))",
    )
    for libelle, cle, formules in lignes_ind:
        ind.append([libelle, cle] + formules)
    ind.column_dimensions["A"].width = 44
    for n in range(len(DATES)):
        ind.column_dimensions[get_column_letter(3 + n)].width = 18

    classeur.save(chemin)


# --------------------------------------------------------------------------- #
# Recalcul et relecture                                                       #
# --------------------------------------------------------------------------- #


def recalculer(source: str, dossier: str) -> str:
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        sys.exit("LibreOffice (soffice) est introuvable.")
    subprocess.run(
        [soffice, "--headless", "--calc", "--convert-to", "xlsx:Calc MS Excel 2007 XML", "--outdir", dossier, source],
        check=True,
        capture_output=True,
    )
    return os.path.join(dossier, os.path.basename(source))


CLES = [
    "avancement",
    "vp",
    "va",
    "cr",
    "ecartCout",
    "ecartDelaiValeur",
    "cpi",
    "spi",
    "eac",
    "etc",
    "vac",
    "dureeProjeteeJ",
    "retardJ",
    "penaliteXof",
    "ecartDelaiJ",
]


def relire(chemin: str) -> dict:
    feuille = load_workbook(chemin, data_only=True)["Indicateurs"]
    resultats: dict = {t: {} for t in DATES}
    for rang in feuille.iter_rows(min_row=2, values_only=True):
        cle = rang[1]
        if cle not in CLES:
            continue
        for n, t in enumerate(DATES):
            valeur = rang[2 + n]
            if not isinstance(valeur, (int, float)):
                sys.exit(f"Valeur non numérique pour {cle} au {t} : {valeur!r}")
            resultats[t][cle] = valeur
    return resultats


def principal() -> None:
    donnees = extraire()
    os.makedirs(SORTIE, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        brut = os.path.join(tmp, "indicateurs-reference.xlsx")
        construire(donnees, brut)
        sortie = os.path.join(tmp, "calcule")
        os.makedirs(sortie)
        calcule = recalculer(brut, sortie)
        resultats = relire(calcule)
        shutil.copy(calcule, os.path.join(SORTIE, "indicateurs-reference.xlsx"))

    with open(os.path.join(SORTIE, "indicateurs.json"), "w", encoding="utf-8") as f:
        json.dump({"dates": DATES, "indicateurs": resultats}, f, ensure_ascii=False, indent=2)
        f.write("\n")
    for t in DATES:
        r = resultats[t]
        print(f"{t}  avancement {r['avancement']:.4f}  SPI {r['spi']:.4f}  CPI {r['cpi']:.4f}  "
              f"EAC {r['eac']:.0f}  écart {r['ecartDelaiJ']:.2f} j")


if __name__ == "__main__":
    principal()
