'use client'

/**
 * Visionneuse 3D de la maquette : chaque element prend la couleur de l'etat
 * de ses taches, les elements sans tache restent neutres et translucides.
 *
 * Moteur three.js, charge avec ce composant seulement. Le rendu se fait a la
 * demande, quand la vue ou les couleurs changent : une visionneuse ouverte
 * ne vide pas la batterie d'un telephone de chantier.
 *
 * Les couleurs viennent des variables de la feuille de style, lues dans le
 * navigateur : la palette d'etats validee, dans le theme courant.
 */

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Etat } from '@/lib/etats'
import { Icone } from '@/lib/icones'

/** Couleur CSS calculee (variable comprise) en composantes sRGB, via une toile. */
function couleurCss(expression: string): THREE.Color {
  const sonde = document.createElement('span')
  sonde.style.color = expression
  sonde.style.display = 'none'
  document.body.appendChild(sonde)
  const calculee = getComputedStyle(sonde).color
  sonde.remove()
  const toile = document.createElement('canvas')
  toile.width = toile.height = 1
  const ctx = toile.getContext('2d')
  if (!ctx) return new THREE.Color(0x888888)
  ctx.fillStyle = calculee
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return new THREE.Color().setRGB(
    (r ?? 0) / 255,
    (g ?? 0) / 255,
    (b ?? 0) / 255,
    THREE.SRGBColorSpace,
  )
}

const VARIABLE_ETAT: Record<Etat, string> = {
  NON_COMMENCE: 'var(--etat-neant)',
  EN_COURS: 'var(--etat-cours)',
  EN_RETARD: 'var(--etat-retard)',
  CRITIQUE: 'var(--etat-critique)',
  ACHEVE: 'var(--etat-acheve)',
  NON_TRAVAILLE: 'var(--etat-chome)',
}

export type VueMaquette = {
  /** Etat de chaque element rattache ; absent : element sans tache. */
  etats: ReadonlyMap<string, Etat>
  /** Elements montres ; les autres sont caches. */
  visibles: ReadonlySet<string> | null
  selection: string | null
}

type Moteur = {
  appliquer: (v: VueMaquette) => void
  recadrer: () => void
}

export function Visionneuse({
  url,
  vue,
  surSelection,
  surChargement,
  libelle,
}: {
  url: string
  vue: VueMaquette
  surSelection: (globalId: string | null) => void
  surChargement: (r: { ok: true } | { ok: false; message: string }) => void
  libelle: string
}) {
  const hote = useRef<HTMLDivElement>(null)
  const moteur = useRef<Moteur | null>(null)
  const derniereVue = useRef(vue)
  const rappels = useRef({ surSelection, surChargement })
  useEffect(() => {
    rappels.current = { surSelection, surChargement }
  })

  useEffect(() => {
    const el = hote.current
    if (!el) return
    let libere = false

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      // Navigateur sans WebGL : l'ecran reste utilisable par son panneau.
      rappels.current.surChargement({
        ok: false,
        message:
          'Ce navigateur ne peut pas afficher la 3D. L’avancement par tâche reste lisible dans le panneau voisin.',
      })
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.touchAction = 'none'

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 2.2))
    const soleil = new THREE.DirectionalLight(0xffffff, 1.6)
    soleil.position.set(1, 2, 1.5)
    scene.add(soleil)

    const controles = new OrbitControls(camera, renderer.domElement)
    controles.enableDamping = false
    controles.screenSpacePanning = true

    const meshes = new Map<string, THREE.Mesh>()
    const boite = new THREE.Box3()

    // Materiaux partages : un par etat, un neutre, un pour la selection.
    const materiaux = new Map<string, THREE.MeshStandardMaterial>()
    const materiau = (cle: string, couleur: () => THREE.Color, opacite = 1) => {
      let m = materiaux.get(cle)
      if (!m) {
        m = new THREE.MeshStandardMaterial({
          roughness: 0.85,
          metalness: 0,
          transparent: opacite < 1,
          opacity: opacite,
          depthWrite: opacite === 1,
        })
        materiaux.set(cle, m)
      }
      m.color.copy(couleur())
      return m
    }
    const recolorer = () => {
      for (const e of Object.keys(VARIABLE_ETAT) as Etat[]) {
        materiau(e, () => couleurCss(VARIABLE_ETAT[e]))
      }
      materiau('NEUTRE', () => couleurCss('var(--encre-discrete)'), 0.28)
      const sel = materiau('SELECTION', () => couleurCss('var(--marque)'))
      sel.emissive.copy(couleurCss('var(--marque)')).multiplyScalar(0.35)
    }
    recolorer()

    const rendre = () => {
      if (!libere) renderer.render(scene, camera)
    }

    const appliquer = (v: VueMaquette) => {
      derniereVue.current = v
      for (const [id, mesh] of meshes) {
        mesh.visible = v.visibles === null || v.visibles.has(id)
        const etat = v.etats.get(id)
        mesh.material =
          id === v.selection
            ? (materiaux.get('SELECTION') as THREE.Material)
            : (materiaux.get(etat ?? 'NEUTRE') as THREE.Material)
        // Les elements neutres, translucides, se dessinent apres les autres.
        mesh.renderOrder = etat || id === v.selection ? 0 : 1
      }
      rendre()
    }

    const recadrer = () => {
      if (boite.isEmpty()) return
      const centre = boite.getCenter(new THREE.Vector3())
      const taille = boite.getSize(new THREE.Vector3()).length()
      camera.near = taille / 1000
      camera.far = taille * 20
      camera.position.copy(centre).add(
        // Plus de recul sur un ecran etroit, en portrait.
        new THREE.Vector3(0.9, 0.55, 1.05).multiplyScalar(
          taille * 1.05 * Math.max(1, 1.25 / camera.aspect),
        ),
      )
      camera.updateProjectionMatrix()
      controles.target.copy(centre)
      controles.update()
      rendre()
    }

    const redimensionner = () => {
      const l = el.clientWidth
      const h = el.clientHeight
      renderer.setSize(l, h, false)
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = '100%'
      camera.aspect = l / Math.max(1, h)
      camera.updateProjectionMatrix()
      rendre()
    }
    const ro = new ResizeObserver(redimensionner)
    ro.observe(el)
    controles.addEventListener('change', rendre)

    // Theme change : on relit les couleurs.
    const mo = new MutationObserver(() => {
      recolorer()
      appliquer(derniereVue.current)
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    // Selection au clic, pas au glisser.
    const lanceur = new THREE.Raycaster()
    let depart: [number, number] | null = null
    const surAppui = (e: PointerEvent) => {
      depart = [e.clientX, e.clientY]
    }
    const surRelache = (e: PointerEvent) => {
      if (!depart || Math.hypot(e.clientX - depart[0], e.clientY - depart[1]) > 4) return
      const r = renderer.domElement.getBoundingClientRect()
      const p = new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      )
      lanceur.setFromCamera(p, camera)
      const touches = lanceur.intersectObjects(
        [...meshes.values()].filter((m) => m.visible),
        false,
      )
      // Un element neutre translucide ne masque pas un element rattache.
      const premier =
        touches.find((t) => derniereVue.current.etats.has(t.object.name)) ?? touches[0]
      rappels.current.surSelection(premier ? premier.object.name : null)
    }
    renderer.domElement.addEventListener('pointerdown', surAppui)
    renderer.domElement.addEventListener('pointerup', surRelache)

    new GLTFLoader().load(
      url,
      (gltf) => {
        if (libere) return
        gltf.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            const m = o as THREE.Mesh
            // Le noeud porte le GlobalId ; le maillage en herite pour la selection.
            const nom = m.name || m.parent?.name || ''
            m.name = nom
            meshes.set(nom, m)
          }
        })
        scene.add(gltf.scene)
        boite.setFromObject(gltf.scene)
        appliquer(derniereVue.current)
        recadrer()
        rappels.current.surChargement({ ok: true })
      },
      undefined,
      () =>
        rappels.current.surChargement({
          ok: false,
          message: 'La maquette n’a pas pu être chargée.',
        }),
    )

    moteur.current = { appliquer, recadrer }
    redimensionner()

    return () => {
      libere = true
      ro.disconnect()
      mo.disconnect()
      controles.dispose()
      renderer.domElement.removeEventListener('pointerdown', surAppui)
      renderer.domElement.removeEventListener('pointerup', surRelache)
      scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
      for (const m of materiaux.values()) m.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      moteur.current = null
    }
  }, [url])

  useEffect(() => {
    moteur.current?.appliquer(vue)
  }, [vue])

  return (
    <div className="relative h-full w-full">
      <div ref={hote} className="h-full w-full" role="img" aria-label={libelle} />
      <button
        type="button"
        onClick={() => moteur.current?.recadrer()}
        className="bg-card/95 border-border hover:bg-muted absolute right-3 bottom-3 grid size-9 place-items-center rounded-xl border text-xs font-bold shadow-sm"
        aria-label="Recadrer la vue"
        title="Recadrer la vue"
      >
        <Icone.recadrer className="size-4" aria-hidden />
      </button>
    </div>
  )
}
