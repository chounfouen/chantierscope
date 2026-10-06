/**
 * Reconnaissance d'un fichier de maquette, par son extension et ses premiers
 * octets. Seul l'IFC, format ouvert du BIM, est lu ; les formats natifs des
 * logiciels recoivent la marche a suivre pour l'exporter.
 */

/** Au-dela, une maquette n'est plus celle d'un batiment de logements. */
export const TAILLE_MAX_IFC = 300 * 1024 * 1024

export function refusMaquette(nom: string, entete: Uint8Array): string | null {
  const ext = nom.toLowerCase().split('.').pop() ?? ''
  const debut = new TextDecoder('latin1').decode(entete.subarray(0, 64))
  if (debut.startsWith('ISO-10303-21')) return null
  if (ext === 'ifczip' || (entete[0] === 0x50 && entete[1] === 0x4b)) {
    return 'Maquette compressée : extraire le fichier .ifc de l’archive, puis l’importer.'
  }
  if (ext === 'rvt' || ext === 'rfa') {
    return 'Fichier Revit : l’exporter au format IFC (Fichier, Exporter, IFC), puis importer le fichier .ifc.'
  }
  if (ext === 'pln' || ext === 'pla') {
    return 'Fichier ArchiCAD : l’enregistrer au format IFC, puis importer le fichier .ifc.'
  }
  if (ext === 'dwg' || ext === 'dxf') {
    return 'Un plan AutoCAD est un dessin 2D : l’importer dans le Plan interactif. La maquette attend un fichier IFC.'
  }
  return `« ${nom} » n’est pas un fichier IFC. Exporter la maquette au format IFC depuis le logiciel de conception.`
}
