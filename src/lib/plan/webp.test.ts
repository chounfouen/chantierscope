import { describe, expect, it } from 'vitest'
import { dimensionsWebp } from '@/lib/plan/webp'

function entete(morceau: string, octets: number[]): Uint8Array {
  const o = new Uint8Array(32)
  o.set(
    [...'RIFF'].map((c) => c.charCodeAt(0)),
    0,
  )
  o.set(
    [...'WEBP'].map((c) => c.charCodeAt(0)),
    8,
  )
  o.set(
    [...morceau].map((c) => c.charCodeAt(0)),
    12,
  )
  for (const [i, v] of octets.entries()) if (v >= 0) o[20 + i] = v
  return o
}

describe('dimensions d une image WebP', () => {
  it('lit un en-tete avec perte', () => {
    // 3000 = 0x0bb8, 2000 = 0x07d0.
    const o = entete('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0xb8, 0x0b, 0xd0, 0x07])
    expect(dimensionsWebp(o)).toEqual({ largeur: 3000, hauteur: 2000 })
  })

  it('lit un en-tete sans perte', () => {
    // largeur - 1 = 4095 sur 14 bits, hauteur - 1 = 99 a partir du bit 14.
    const b = 4095 | (99 << 14)
    const o = entete('VP8L', [0x2f, b & 0xff, (b >> 8) & 0xff, (b >> 16) & 0xff, (b >>> 24) & 0xff])
    expect(dimensionsWebp(o)).toEqual({ largeur: 4096, hauteur: 100 })
  })

  it('lit un en-tete etendu', () => {
    // largeur - 1 = 8191 = 0x001fff, hauteur - 1 = 1 sur 24 bits.
    const o = entete('VP8X', [0, 0, 0, 0, 0xff, 0x1f, 0, 1, 0, 0])
    expect(dimensionsWebp(o)).toEqual({ largeur: 8192, hauteur: 2 })
  })

  it('refuse ce qui n est pas du WebP', () => {
    expect(
      dimensionsWebp(
        new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'.padEnd(40)),
      ),
    ).toBeNull()
    expect(dimensionsWebp(new Uint8Array(10))).toBeNull()
  })
})
