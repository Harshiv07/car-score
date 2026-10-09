import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { BodyStyle } from "./bodyStyle";

/**
 * The studio's cars are Kenney's Car Kit (CC0, https://kenney.nl/assets/car-kit):
 * authored models with separate wheel nodes, not boxes assembled in code.
 *
 * Each model paints itself from one shared palette texture, so there is no
 * "paint" material to recolour. Instead the swatch the body panels sample is
 * repainted onto a copy of the palette, which leaves the glass, tyres and trim
 * as the artist made them and lets the paint follow the theme.
 *
 * The group this returns sits on y = 0, is centred on the origin, and has its
 * length along x with the nose at +x, the same frame the stage was built around.
 */

const BASE = import.meta.env.BASE_URL;

interface ModelDef {
  url: string;
  /** Palette cell (column of 8, row of 4) that the body panels sample. */
  paintCell: [number, number];
}

const MODELS: Record<BodyStyle, ModelDef> = {
  sedan: { url: `${BASE}models/sedan.glb`, paintCell: [6, 1] },
  suv: { url: `${BASE}models/suv-luxury.glb`, paintCell: [4, 1] },
};

/** The kit's cars are chunky; scale so the length matches the framing the camera expects. */
const TARGET_LENGTH = 4.5;

const PALETTE_PX = 512;
const CELL_W = PALETTE_PX / 8;
const CELL_H = PALETTE_PX / 4;

export interface Hotspot {
  id: string;
  position: THREE.Vector3;
  normal: THREE.Vector3;
}

export interface RealCar {
  group: THREE.Group;
  /** Height of the roof, for framing. */
  height: number;
  hotspots: Record<string, Hotspot>;
  setPaint(color: string): void;
  /** Turn every wheel as if the car had rolled `distance` units along +x. */
  roll(distance: number): void;
  dispose(): void;
}

const loader = new GLTFLoader();
const cache = new Map<BodyStyle, Promise<THREE.Group>>();

function source(style: BodyStyle): Promise<THREE.Group> {
  let p = cache.get(style);
  if (!p) {
    p = loader.loadAsync(MODELS[style].url).then((g) => g.scene);
    // A failed load must not be remembered, or one blip breaks the stage until reload.
    p.catch(() => cache.delete(style));
    cache.set(style, p);
  }
  return p;
}

/** Start fetching a model before the stage needs it. */
export function preloadCar(style: BodyStyle): void {
  void source(style).catch(() => undefined);
}

export async function loadCar(style: BodyStyle, paint: string): Promise<RealCar> {
  const def = MODELS[style];
  const template = await source(style);
  const inner = template.clone(true);

  // The shared palette, copied once per car so repainting never touches the cache.
  let baseImage: CanvasImageSource | null = null;
  template.traverse((o) => {
    const m = o instanceof THREE.Mesh ? (o.material as THREE.MeshStandardMaterial) : null;
    if (m?.map && !baseImage) baseImage = m.map.image as CanvasImageSource;
  });

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PALETTE_PX;
  const ctx = canvas.getContext("2d")!;
  if (baseImage) ctx.drawImage(baseImage, 0, 0, PALETTE_PX, PALETTE_PX);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false; // glTF UVs start at the top-left, like the canvas
  texture.anisotropy = 4;

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.5,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });

  const wheels: THREE.Object3D[] = [];
  inner.traverse((o) => {
    if (o instanceof THREE.Mesh) o.material = material;
    if (o.name.startsWith("wheel")) wheels.push(o);
  });

  const setPaint = (color: string) => {
    const [col, row] = def.paintCell;
    const base = new THREE.Color(color);
    const top = base.clone().lerp(new THREE.Color("#ffffff"), 0.1);
    const bottom = base.clone().lerp(new THREE.Color("#000000"), 0.16);
    const x = col * CELL_W;
    const y = row * CELL_H;
    const g = ctx.createLinearGradient(0, y, 0, y + CELL_H);
    g.addColorStop(0, `#${top.getHexString()}`);
    g.addColorStop(1, `#${bottom.getHexString()}`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, CELL_W, CELL_H);
    texture.needsUpdate = true;
  };
  setPaint(paint);

  // The kit's cars face +z; the stage wants the nose on +x. Then size and ground it.
  inner.rotation.y = Math.PI / 2;
  inner.updateMatrixWorld(true);
  const raw = new THREE.Box3().setFromObject(inner);
  const scale = TARGET_LENGTH / (raw.max.x - raw.min.x);
  inner.scale.setScalar(scale);
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const centre = box.getCenter(new THREE.Vector3());
  inner.position.set(-centre.x, -box.min.y, -centre.z);

  const group = new THREE.Group();
  group.name = `car-${style}`;
  group.add(inner);
  group.updateMatrixWorld(true);

  const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
  const L = size.x;
  const W = size.z;
  const H = size.y;
  const side = W / 2 + 0.02;

  // Wheel positions in the group's frame, to hang the walkaround points on.
  const wheelX = wheels.map((w) => new THREE.Box3().setFromObject(w).getCenter(new THREE.Vector3()).x);
  const frontX = Math.max(...wheelX);
  const rearX = Math.min(...wheelX);
  const wheelR = 0.3 * scale;

  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const spot = (id: string, p: THREE.Vector3, n: THREE.Vector3): Hotspot => ({ id, position: p, normal: n.normalize() });
  const hotspots: Record<string, Hotspot> = {
    panels: spot("panels", v(L * 0.04, H * 0.36, side), v(0, 0, 1)),
    "rust-arch": spot("rust-arch", v(rearX + wheelR * 0.5, wheelR * 1.9, side), v(0, 0.2, 1)),
    tyres: spot("tyres", v(frontX, wheelR, side), v(0.15, 0, 1)),
    engine: spot("engine", v(L * 0.32, H * 0.52, 0.2), v(0.35, 1, 0.2)),
    glass: spot("glass", v(L * 0.11, H * 0.7, 0.1), v(0.6, 0.8, 0.1)),
    interior: spot("interior", v(-L * 0.04, H * 0.62, W * 0.4), v(0, 0.1, 1)),
    underneath: spot("underneath", v(-0.2, 0.2, side - 0.05), v(0, -0.6, 1)),
  };

  const roll = (distance: number) => {
    // Wheels turn about their local x (the axle); the model is yawed a quarter
    // turn, which is why +distance is +angle here.
    wheels.forEach((w) => (w.rotation.x = distance / (0.3 * scale)));
  };

  return {
    group,
    height: H,
    hotspots,
    setPaint,
    roll,
    dispose() {
      texture.dispose();
      material.dispose();
    },
  };
}
