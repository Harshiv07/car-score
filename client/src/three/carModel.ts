import * as THREE from "three";

/**
 * A procedural studio car, in two body styles.
 *
 * The leaderboard's inventory is sedans and compact SUVs, so those are the two
 * silhouettes. It is built from a side profile rather than loaded as a model
 * file: no asset to license or download, a few kilobytes of code, and the
 * profile is the same one the guide's inspection points are measured against.
 *
 * Construction, bottom up:
 *   - the lower body: the profile up to the beltline, extruded across the
 *     car's width with a generous bevel, wheel arches cut into its sill;
 *   - the cabin: the greenhouse above the beltline, narrower, and pinched in
 *     towards the roof (tumblehome) by deforming its vertices;
 *   - glass: a slightly larger copy of the greenhouse in tinted black, so the
 *     side windows, windscreen and backlight read without modelling each one;
 *   - wheels, lights, grille and mirrors as simple primitives.
 *
 * Units are metres, +x is the front of the car, +y is up.
 */

import type { BodyStyle } from "./bodyStyle";
export type { BodyStyle };

type Pt = [number, number];

interface BodyDef {
  length: number;
  width: number;
  beltY: number;
  roofY: number;
  wheelR: number;
  wheelY: number;
  archR: number;
  wheelsX: [number, number];
  /** Lower body: nose → hood → cowl → beltline → deck → tail, drawn on a Shape. */
  lower: (s: THREE.Shape) => void;
  /** Greenhouse polygon above the beltline (body colour). */
  cabin: Pt[];
  /** Glass polygon: the greenhouse, nudged outward on the screens, inward under the roof. */
  glass: Pt[];
  bPillarX: number;
  headlight: { x: number; y: number };
  taillight: { x: number; y: number; h: number };
  mirrorX: number;
}

const PI = Math.PI;

const SEDAN: BodyDef = {
  length: 4.6,
  width: 1.8,
  beltY: 0.92,
  roofY: 1.39,
  wheelR: 0.33,
  wheelY: 0.33,
  archR: 0.42,
  wheelsX: [-1.38, 1.4],
  lower(s) {
    s.moveTo(-2.24, 0.36);
    s.quadraticCurveTo(-2.24, 0.29, -2.12, 0.29);
    s.lineTo(-1.8, 0.29);
    s.absarc(-1.38, 0.33, 0.42, PI, 0, true);
    s.lineTo(-0.96, 0.29);
    s.lineTo(0.98, 0.29);
    s.absarc(1.4, 0.33, 0.42, PI, 0, true);
    s.lineTo(1.82, 0.29);
    s.lineTo(2.14, 0.3);
    s.quadraticCurveTo(2.31, 0.32, 2.32, 0.48);
    s.lineTo(2.3, 0.62);
    s.quadraticCurveTo(2.26, 0.75, 2.04, 0.78);
    s.lineTo(1.05, 0.9);
    s.lineTo(-1.62, 0.97);
    s.lineTo(-2.16, 0.95);
    s.quadraticCurveTo(-2.26, 0.93, -2.26, 0.8);
    s.lineTo(-2.24, 0.36);
  },
  cabin: [
    [1.05, 0.9],
    [0.3, 1.3],
    [0.12, 1.375],
    [-0.12, 1.39],
    [-0.7, 1.375],
    [-0.95, 1.33],
    [-1.1, 1.22],
    [-1.62, 0.97],
  ],
  glass: [
    [1.0, 0.95],
    [0.31, 1.318],
    [-0.97, 1.318],
    [-1.105, 1.236],
    [-1.57, 1.005],
  ],
  bPillarX: -0.28,
  headlight: { x: 2.24, y: 0.69 },
  taillight: { x: -2.25, y: 0.86, h: 0.07 },
  mirrorX: 0.92,
};

const SUV: BodyDef = {
  length: 4.6,
  width: 1.86,
  beltY: 1.12,
  roofY: 1.67,
  wheelR: 0.37,
  wheelY: 0.37,
  archR: 0.46,
  wheelsX: [-1.35, 1.4],
  lower(s) {
    s.moveTo(-2.2, 0.46);
    s.quadraticCurveTo(-2.22, 0.37, -2.1, 0.37);
    s.lineTo(-1.81, 0.37);
    s.absarc(-1.35, 0.37, 0.46, PI, 0, true);
    s.lineTo(-0.89, 0.37);
    s.lineTo(0.94, 0.37);
    s.absarc(1.4, 0.37, 0.46, PI, 0, true);
    s.lineTo(1.86, 0.37);
    s.lineTo(2.12, 0.39);
    s.quadraticCurveTo(2.28, 0.41, 2.3, 0.6);
    s.lineTo(2.28, 0.82);
    s.quadraticCurveTo(2.24, 0.97, 2.02, 1.0);
    s.lineTo(1.25, 1.1);
    s.lineTo(-2.12, 1.14);
    s.quadraticCurveTo(-2.2, 1.12, -2.21, 1.02);
    s.lineTo(-2.2, 0.46);
  },
  cabin: [
    [1.25, 1.1],
    [0.55, 1.58],
    [0.38, 1.655],
    [0.15, 1.67],
    [-1.7, 1.645],
    [-1.92, 1.6],
    [-2.04, 1.48],
    [-2.12, 1.14],
  ],
  glass: [
    [1.2, 1.15],
    [0.565, 1.59],
    [-1.94, 1.59],
    [-2.055, 1.48],
    [-2.13, 1.17],
  ],
  bPillarX: -0.32,
  headlight: { x: 2.22, y: 0.86 },
  taillight: { x: -2.2, y: 1.06, h: 0.16 },
  mirrorX: 1.12,
};

export const BODIES: Record<BodyStyle, BodyDef> = { sedan: SEDAN, suv: SUV };

function polygonShape(pts: Pt[]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
  s.closePath();
  return s;
}

/** Extrude a profile across the car's width, centred on z = 0. */
function extrude(shape: THREE.Shape, depth: number, bevel: number): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: 28,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.85,
    bevelSegments: 5,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Pinch the cabin in towards the roof — the car's tumblehome. */
function taperCabin(g: THREE.BufferGeometry, def: BodyDef, top = 0.8) {
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp((y - def.beltY) / (def.roofY - def.beltY), 0, 1);
    pos.setZ(i, pos.getZ(i) * THREE.MathUtils.lerp(1, top, t));
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
}

export interface CarMaterials {
  paint: THREE.MeshPhysicalMaterial;
  glass: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  head: THREE.MeshStandardMaterial;
  tail: THREE.MeshStandardMaterial;
}

export function makeMaterials(paint: string): CarMaterials {
  return {
    paint: new THREE.MeshPhysicalMaterial({
      color: paint,
      metalness: 0.15,
      roughness: 0.38,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    }),
    // Tinted and fairly matte: a mirror-glossy greenhouse picks up the studio
    // lights as a white smear that reads as an empty window.
    glass: new THREE.MeshStandardMaterial({ color: "#06090c", metalness: 0, roughness: 0.62, envMapIntensity: 0.18 }),
    trim: new THREE.MeshStandardMaterial({ color: "#151b21", roughness: 0.65 }),
    rubber: new THREE.MeshStandardMaterial({ color: "#181c20", roughness: 0.92 }),
    metal: new THREE.MeshStandardMaterial({ color: "#b9c2ca", metalness: 0.9, roughness: 0.28 }),
    head: new THREE.MeshStandardMaterial({
      color: "#f4f7fa",
      emissive: "#e8f1ff",
      emissiveIntensity: 0.6,
      roughness: 0.2,
    }),
    tail: new THREE.MeshStandardMaterial({
      color: "#b3261e",
      emissive: "#d1271b",
      emissiveIntensity: 0.55,
      roughness: 0.3,
    }),
  };
}

/** Build the car as a group sitting on y = 0, centred on the origin. */
export function buildCar(style: BodyStyle, mats: CarMaterials): THREE.Group {
  const def = BODIES[style];
  const car = new THREE.Group();
  car.name = `car-${style}`;
  const W = def.width;

  // Lower body.
  const lowerShape = new THREE.Shape();
  def.lower(lowerShape);
  const lowerGeo = extrude(lowerShape, W - 0.16, 0.09);
  const lower = new THREE.Mesh(lowerGeo, mats.paint);
  lower.castShadow = true;
  car.add(lower);

  // Cabin, narrower than the shoulders and pinched towards the roof.
  const cabinW = W * 0.86;
  const cabinGeo = extrude(polygonShape(def.cabin), cabinW - 0.08, 0.05);
  taperCabin(cabinGeo, def);
  car.add(new THREE.Mesh(cabinGeo, mats.paint));

  // Glass: a touch wider than the cabin so the side windows sit proud of it.
  const glassGeo = extrude(polygonShape(def.glass), cabinW - 0.08 + 0.03, 0.05);
  taperCabin(glassGeo, def);
  car.add(new THREE.Mesh(glassGeo, mats.glass));

  // B-pillars, leaning in with the tumblehome. Measured off the glass surface
  // (half its extrusion plus the bevel) so they sit on it, not inside it.
  const glassHalf = (cabinW - 0.05) / 2 + 0.05 + 0.006;
  const pillarH = def.roofY - def.beltY - 0.07;
  const tTop = (pillarH + 0.03) / (def.roofY - def.beltY);
  const halfBelt = glassHalf * THREE.MathUtils.lerp(1, 0.8, 0.06);
  const halfRoof = glassHalf * THREE.MathUtils.lerp(1, 0.8, tTop);
  const lean = Math.atan((halfBelt - halfRoof) / pillarH);
  for (const side of [1, -1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, pillarH, 0.012), mats.paint);
    p.position.set(def.bPillarX, def.beltY + 0.03 + pillarH / 2, (side * (halfBelt + halfRoof)) / 2);
    p.rotation.x = -side * lean;
    car.add(p);
  }

  // Door shut-lines and handles: a few millimetres of shadow that turn a slab
  // of paint into a car door.
  const skin = (W - 0.16) / 2 + 0.09 + 0.002;
  const doorTop = def.beltY - 0.02;
  const sill = def.wheelY + 0.02;
  const seams = [def.wheelsX[1] - def.archR - 0.02, def.bPillarX + 0.02, def.wheelsX[0] + def.archR + 0.04];
  for (const side of [1, -1]) {
    for (const x of seams) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, doorTop - sill, 0.004), mats.trim);
      seam.position.set(x, (doorTop + sill) / 2, side * skin);
      car.add(seam);
    }
    for (const x of [def.bPillarX + 0.55, def.bPillarX - 0.38]) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.012), mats.trim);
      handle.position.set(x, doorTop - 0.1, side * (skin + 0.004));
      car.add(handle);
    }
  }

  // Wheels.
  for (const x of def.wheelsX) {
    for (const side of [1, -1]) {
      const wheel = new THREE.Group();
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(def.wheelR, def.wheelR, 0.24, 40), mats.rubber);
      tyre.rotation.x = PI / 2;
      wheel.add(tyre);
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(def.wheelR * 0.66, def.wheelR * 0.66, 0.245, 32),
        mats.metal,
      );
      rim.rotation.x = PI / 2;
      wheel.add(rim);
      // Five spokes' worth of shadow, so the rim reads as a wheel and not a disc.
      for (let k = 0; k < 5; k++) {
        const slot = new THREE.Mesh(new THREE.BoxGeometry(def.wheelR * 0.32, def.wheelR * 0.09, 0.25), mats.trim);
        const a = (k / 5) * PI * 2;
        slot.position.set(Math.cos(a) * def.wheelR * 0.42, Math.sin(a) * def.wheelR * 0.42, 0);
        slot.rotation.z = a;
        wheel.add(slot);
      }
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(def.wheelR * 0.16, def.wheelR * 0.16, 0.255, 20),
        mats.metal,
      );
      hub.rotation.x = PI / 2;
      wheel.add(hub);
      wheel.position.set(x, def.wheelY, side * (W / 2 - 0.16));
      wheel.name = "wheel";
      car.add(wheel);
    }
  }

  // Lights, grille, mirrors.
  for (const side of [1, -1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.36), mats.head);
    head.position.set(def.headlight.x, def.headlight.y, side * 0.56);
    head.rotation.y = side * -0.22;
    car.add(head);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, def.taillight.h, 0.42), mats.tail);
    tail.position.set(def.taillight.x, def.taillight.y, side * 0.55);
    tail.rotation.y = side * 0.2;
    car.add(tail);

    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.11, 0.16), mats.paint);
    mirror.position.set(def.mirrorX, def.beltY + 0.07, side * (cabinW / 2 + 0.1));
    car.add(mirror);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.06, style === "suv" ? 0.22 : 0.15, 1.0), mats.trim);
  grille.position.set(style === "suv" ? 2.29 : 2.31, style === "suv" ? 0.6 : 0.46, 0);
  car.add(grille);

  return car;
}

/**
 * Inspection points for the guide's walkaround, in car space. Each has a
 * position on the surface and the direction it faces, so the stage can turn
 * the car to show it and fade the ones on the far side.
 */
export interface Hotspot {
  id: string;
  position: THREE.Vector3;
  normal: THREE.Vector3;
}

export function hotspotsFor(style: BodyStyle): Record<string, Hotspot> {
  const d = BODIES[style];
  const W = d.width;
  const side = W / 2 + 0.02;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const spot = (id: string, p: THREE.Vector3, n: THREE.Vector3): Hotspot => ({
    id,
    position: p,
    normal: n.normalize(),
  });
  return {
    panels: spot("panels", v(0.3, d.beltY - 0.28, side), v(0, 0, 1)),
    "rust-arch": spot(
      "rust-arch",
      v(d.wheelsX[0] + d.archR * 0.65, d.wheelY + d.archR * 0.72, side - 0.02),
      v(0, 0.2, 1),
    ),
    tyres: spot("tyres", v(d.wheelsX[1], d.wheelY, W / 2 - 0.02), v(0.15, 0, 1)),
    engine: spot("engine", v(d.length / 2 - 0.75, d.beltY - 0.04, 0.25), v(0.35, 1, 0.2)),
    glass: spot(
      "glass",
      v((d.glass[0][0] + d.glass[1][0]) / 2 + 0.05, (d.glass[0][1] + d.glass[1][1]) / 2, 0.1),
      v(0.6, 0.8, 0.1),
    ),
    interior: spot("interior", v(d.bPillarX + 0.45, (d.beltY + d.roofY) / 2, (W * 0.86) / 2 + 0.03), v(0, 0.1, 1)),
    underneath: spot("underneath", v(-0.2, 0.2, side - 0.05), v(0, -0.6, 1)),
  };
}
