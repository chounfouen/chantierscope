import { describe, expect, it } from 'vitest'
import { refusMaquette } from '@/lib/maquette/format'

const o = (s: string) => new TextEncoder().encode(s)

describe('reconnaissance d une maquette', () => {
  it('accepte un IFC, quelle que soit son extension', () => {
    expect(refusMaquette('maquette.ifc', o('ISO-10303-21;\nHEADER;'))).toBeNull()
    expect(refusMaquette('export.txt', o('ISO-10303-21;'))).toBeNull()
  })

  it('dit comment exporter les formats natifs', () => {
    expect(refusMaquette('projet.rvt', o('ÐÏ'))).toMatch(/Exporter, IFC/)
    expect(refusMaquette('projet.ifczip', o('PK\u0003\u0004'))).toMatch(/archive/)
    expect(refusMaquette('plan.dwg', o('AC1032'))).toMatch(/Plan interactif/)
    expect(refusMaquette('photo.jpg', o('ÿØ'))).toMatch(/n’est pas un fichier IFC/)
  })
})
