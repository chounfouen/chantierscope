"""
Maquette IFC du jeu de demonstration : Residence Les Palmiers, 24 logements R+3.

Produit `src/db/seed/residence-palmiers.ifc`, maquette de test et de
demonstration de l'ecran Maquette 3D. Le batiment reprend l'emprise du plan
DXF de demonstration (36 m sur 18 m) et la decomposition du planning : chaque
famille d'ouvrages porte des noms tels qu'un bureau d'etudes les ecrirait, ce
qui permet de verifier les rattachements proposes automatiquement.

Lancement : python3 scripts/maquette-demo.py   (exige ifcopenshell)
"""

import sys

import ifcopenshell
import ifcopenshell.api
import ifcopenshell.api.aggregate
import ifcopenshell.api.context
import ifcopenshell.api.geometry
import ifcopenshell.api.project
import ifcopenshell.api.root
import ifcopenshell.api.spatial
import ifcopenshell.api.unit

SORTIE = sys.argv[1] if len(sys.argv) > 1 else "src/db/seed/residence-palmiers.ifc"

L, P = 36.0, 18.0  # emprise, en metres
H = 3.0  # hauteur d'etage
E_DALLE = 0.2
E_VOILE = 0.2

f = ifcopenshell.api.project.create_file(version="IFC4")
projet = ifcopenshell.api.root.create_entity(f, ifc_class="IfcProject", name="Résidence Les Palmiers")
ifcopenshell.api.unit.assign_unit(f)
modele = ifcopenshell.api.context.add_context(f, context_type="Model")
corps = ifcopenshell.api.context.add_context(
    f, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=modele
)

site = ifcopenshell.api.root.create_entity(f, ifc_class="IfcSite", name="Cocody Angré 7e Tranche")
batiment = ifcopenshell.api.root.create_entity(f, ifc_class="IfcBuilding", name="Bâtiment A")
ifcopenshell.api.aggregate.assign_object(f, relating_object=projet, products=[site])
ifcopenshell.api.aggregate.assign_object(f, relating_object=site, products=[batiment])

ETAGES = {}
for nom, altitude in [
    ("Fondations", -1.2),
    ("RDC", 0.0),
    ("R+1", H),
    ("R+2", 2 * H),
    ("R+3", 3 * H),
    ("Toiture-terrasse", 4 * H),
]:
    e = ifcopenshell.api.root.create_entity(f, ifc_class="IfcBuildingStorey", name=nom)
    e.Elevation = altitude
    ifcopenshell.api.aggregate.assign_object(f, relating_object=batiment, products=[e])
    ETAGES[nom] = e


def boite(classe, nom, etage, x, y, z, lx, ly, lz):
    """Pave droit de coin (x, y, z) et de dimensions (lx, ly, lz), en metres."""
    el = ifcopenshell.api.root.create_entity(f, ifc_class=classe, name=nom)
    s = [
        (x, y, z), (x + lx, y, z), (x + lx, y + ly, z), (x, y + ly, z),
        (x, y, z + lz), (x + lx, y, z + lz), (x + lx, y + ly, z + lz), (x, y + ly, z + lz),
    ]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    rep = ifcopenshell.api.geometry.add_mesh_representation(
        f, context=corps, vertices=[s], faces=[faces]
    )
    ifcopenshell.api.geometry.assign_representation(f, product=el, representation=rep)
    ifcopenshell.api.spatial.assign_container(f, relating_structure=ETAGES[etage], products=[el])
    return el


POTEAUX_X = [0.0, 9.0, 18.0, 27.0, L]
POTEAUX_Y = [0.0, 9.0, P]

# Fondations : semelles isolees sous chaque poteau, semelles filantes en
# peripherie, longrines entre files.
for i, x in enumerate(POTEAUX_X):
    for j, y in enumerate(POTEAUX_Y):
        boite("IfcFooting", f"Semelle isolée P{i + 1}{'ABC'[j]}", "Fondations",
              x - 0.6, y - 0.6, -1.2, 1.2, 1.2, 0.5)
for nom, x, y, lx, ly in [
    ("Semelle filante nord", 0, P - 0.3, L, 0.6), ("Semelle filante sud", 0, -0.3, L, 0.6),
    ("Semelle filante est", L - 0.3, 0, 0.6, P), ("Semelle filante ouest", -0.3, 0, 0.6, P),
]:
    boite("IfcFooting", nom, "Fondations", x, y, -1.2, lx, ly, 0.4)
for j, y in enumerate(POTEAUX_Y):
    boite("IfcBeam", f"Longrine file {'ABC'[j]}", "Fondations", 0, y - 0.15, -0.7, L, 0.3, 0.5)

boite("IfcSlab", "Dallage sur terre-plein", "RDC", 0, 0, -0.15, L, P, 0.15)

NOMS = ["RDC", "R+1", "R+2", "R+3"]
for n, etage in enumerate(NOMS):
    z = n * H
    libelle = "rez-de-chaussée" if n == 0 else etage
    for i, x in enumerate(POTEAUX_X):
        for j, y in enumerate(POTEAUX_Y):
            boite("IfcColumn", f"Poteau P{i + 1}{'ABC'[j]} {etage}", etage,
                  x - 0.15, y - 0.15, z, 0.3, 0.3, H - E_DALLE)
    # Voiles de facade et de la cage d'escalier.
    hv = H - E_DALLE
    boite("IfcWall", f"Voile de façade nord {etage}", etage, 0, P - E_VOILE, z, L, E_VOILE, hv)
    boite("IfcWall", f"Voile de façade sud {etage}", etage, 0, 0, z, L, E_VOILE, hv)
    boite("IfcWall", f"Voile pignon est {etage}", etage, L - E_VOILE, 0, z, E_VOILE, P, hv)
    boite("IfcWall", f"Voile pignon ouest {etage}", etage, 0, 0, z, E_VOILE, P, hv)
    for nom, x, y, lx, ly in [
        ("nord", 16, 10.3, 4, E_VOILE), ("sud", 16, 7.5, 4, E_VOILE),
        ("est", 19.8, 7.5, E_VOILE, 3), ("ouest", 16, 7.5, E_VOILE, 3),
    ]:
        boite("IfcWall", f"Voile cage d'escalier {nom} {etage}", etage, x, y, z, lx, ly, hv)
    # Maconnerie de remplissage entre logements, cloisons de distribution.
    for x in (9.0, 27.0):
        for y0 in (0.2, 10.5):
            boite("IfcWall", f"Mur en agglomérés x{int(x)} {etage}", etage, x - 0.1, y0, z, 0.2, 7.3, hv)
    for x in (4.5, 13.5, 22.5, 31.5):
        for y0 in (0.2, 10.5):
            boite("IfcWall", f"Cloison de distribution x{x} {etage}", etage, x - 0.04, y0, z, 0.08, 4.0, hv)
    boite("IfcStair", f"Escalier {etage}", etage, 16.2, 7.7, z, 3.6, 2.6, H)
    # Plancher haut de l'etage, porte par l'etage superieur.
    porteur = NOMS[n + 1] if n + 1 < len(NOMS) else "Toiture-terrasse"
    nom_plancher = (
        f"Plancher haut du {libelle}" if n < 3 else "Plancher haut du R+3 et terrasse"
    )
    boite("IfcSlab", nom_plancher, porteur, 0, 0, z + H - E_DALLE, L, P, E_DALLE)
    # Menuiseries : fenetres en facade, portes palieres sur la circulation.
    for k in range(8):
        x = 1.5 + k * 4.5
        boite("IfcWindow", f"Fenêtre aluminium sud {k + 1} {etage}", etage, x, -0.02, z + 0.9, 1.4, 0.24, 1.3)
        boite("IfcWindow", f"Fenêtre aluminium nord {k + 1} {etage}", etage, x, P - 0.22, z + 0.9, 1.4, 0.24, 1.3)
    for k, x in enumerate((2, 11, 20.5, 29)):
        boite("IfcDoor", f"Porte palière bois {k + 1}A {etage}", etage, x, 7.45, z, 0.9, 0.1, 2.1)
        boite("IfcDoor", f"Porte palière bois {k + 1}B {etage}", etage, x, 10.45, z, 0.9, 0.1, 2.1)
    if n > 0:
        for k in range(4):
            boite("IfcRailing", f"Garde-corps balcon {k + 1} {etage}", etage,
                  1 + k * 9, -1.2, z, 7, 0.05, 1.0)

# Toiture-terrasse : acroteres, local technique couvert en bacs acier.
zt = 4 * H
for nom, x, y, lx, ly in [
    ("nord", 0, P - 0.2, L, 0.2), ("sud", 0, 0, L, 0.2),
    ("est", L - 0.2, 0, 0.2, P), ("ouest", 0, 0, 0.2, P),
]:
    boite("IfcWall", f"Acrotère {nom}", "Toiture-terrasse", x, y, zt, lx, ly, 0.6)
for k in range(5):
    boite("IfcBeam", f"Panne de charpente métallique {k + 1}", "Toiture-terrasse",
          14, 6 + k * 1.5, zt + 2.6, 8, 0.12, 0.2)
boite("IfcRoof", "Couverture en bacs acier", "Toiture-terrasse", 13.8, 5.8, zt + 2.8, 8.4, 6.4, 0.08)

f.write(SORTIE)
print(f"{SORTIE} : {len(f.by_type('IfcProduct'))} produits")
