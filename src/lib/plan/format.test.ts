import { describe, expect, it } from 'vitest'
import { aideFormat, reconnaitreFormat } from '@/lib/plan/format'

const octets = (s: string) => new TextEncoder().encode(s)

describe('reconnaissance du format d un plan', () => {
  it('reconnait chaque format par sa signature', () => {
    expect(reconnaitreFormat('plan.dwg', octets('AC1032\0\0'))).toBe('DWG')
    expect(reconnaitreFormat('plan.pdf', octets('%PDF-1.7\n'))).toBe('PDF')
    expect(reconnaitreFormat('plan.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe(
      'IMAGE',
    )
    expect(reconnaitreFormat('plan.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('IMAGE')
    expect(reconnaitreFormat('plan.svg', octets('<?xml version="1.0"?>\n<svg xmlns="x">'))).toBe(
      'SVG',
    )
    expect(reconnaitreFormat('r1.dxf', octets('  0\nSECTION\n  2\nHEADER\n'))).toBe('DXF')
    expect(reconnaitreFormat('r1.DXF', octets('999\nexport\n0\r\nSECTION\r\n'))).toBe('DXF')
  })

  it('ne se fie pas a l extension seule', () => {
    expect(reconnaitreFormat('plan.pdf', octets('<html>'))).toBeNull()
    expect(reconnaitreFormat('plan.dxf', octets('AC1027'))).toBe('DWG')
    expect(reconnaitreFormat('plan.svg', octets('<html><svg>'))).toBeNull()
  })

  it('explique le DXF binaire', () => {
    expect(aideFormat('a.dxf', octets('AutoCAD Binary DXF\r\n'))).toMatch(/DXF ASCII/)
  })
})
