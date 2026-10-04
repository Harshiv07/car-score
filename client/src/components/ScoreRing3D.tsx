import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import gsap from "gsap";
import { ScoreCategory } from "../api/types";

/**
 * The score breakdown as an object you can turn.
 *
 * Each of the scoring categories is one arc of a ring, and its *height* is how
 * much of its available points the car earned — so a tall ring with a few short
 * stumps reads as "strong, with specific weak spots" at a glance, which a row of
 * bars makes you add up yourself. The 3D carries data; it is not a backdrop.
 *
 * Costs, because a canvas on a listings page has to earn its keep:
 *  - Render-on-demand. There is no idle animation loop: a frame is drawn only
 *    when a tween, a drag or inertia is actually moving something.
 *  - three.js is code-split (see ScoreRing) and never reaches the main bundle.
 *  - Everything allocated is disposed on unmount.
 *
 * Accessibility: the canvas is decorative to assistive tech; the same numbers
 * are announced through a live region and reachable from the keyboard with
 * the arrow keys, and the page keeps its plain-text breakdown beside it.
 */

const SEG_GAP = 0.05; // radians between arcs
const INNER = 1.0;
const OUTER = 1.62;
const MIN_H = 0.12;
const MAX_H = 1.25;

function cssColor(name: string, fallback: string): THREE.Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v || fallback);
}

/** Same thresholds as the bars on the detail page, so the two never disagree. */
function strengthColor(frac: number, palette: Record<"good" | "brand" | "bad", THREE.Color>) {
  return frac >= 0.75 ? palette.good : frac >= 0.5 ? palette.brand : palette.bad;
}

function arcShape(a0: number, a1: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(0, 0, OUTER, a0, a1, false);
  s.absarc(0, 0, INNER, a1, a0, true);
  s.closePath();
  return s;
}

export interface ScoreRing3DProps {
  breakdown: ScoreCategory[];
  /** Fired if WebGL can't start, so the caller can show its static fallback. */
  onUnsupported: () => void;
  className?: string;
  /** Skip the intro and inertia (prefers-reduced-motion). Interaction still works. */
  reducedMotion: boolean;
}

export default function ScoreRing3D({ breakdown, onUnsupported, className = "", reducedMotion }: ScoreRing3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const setActiveRef = useRef(setActive);
  setActiveRef.current = setActive;
  const focusRef = useRef<(i: number | null) => void>(() => {});

  const cats = useMemo(() => breakdown.filter((c) => c.max > 0), [breakdown]);

  useEffect(() => {
    const el = host.current;
    if (!el || cats.length === 0) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      onUnsupported();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "pan-y"; // vertical page scroll still works over the ring

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 3.7, 5.1);
    camera.lookAt(0, -0.2, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x1b3a2c, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(2.5, 5, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xe8b93f, 0.9);
    rim.position.set(-4, 2, -3);
    scene.add(rim);

    const palette = {
      good: cssColor("--good", "#56d9a0"),
      brand: cssColor("--brand", "#e8b93f"),
      bad: cssColor("--bad", "#ff7b6b"),
    };
    const trackColor = cssColor("--line", "#1e362a");

    const ring = new THREE.Group();
    scene.add(ring);

    // A flat dish under the arcs: the "full marks" footprint each arc grows from.
    const base = new THREE.Mesh(
      new THREE.RingGeometry(INNER - 0.06, OUTER + 0.06, 96),
      new THREE.MeshBasicMaterial({ color: trackColor, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.01;
    ring.add(base);

    const n = cats.length;
    const span = (Math.PI * 2) / n;
    const segs: { mesh: THREE.Mesh; target: number; mat: THREE.MeshStandardMaterial; base: THREE.Color }[] = [];
    const geoms: THREE.BufferGeometry[] = [];

    cats.forEach((c, i) => {
      const frac = c.points / c.max;
      const a0 = i * span + SEG_GAP / 2;
      const a1 = (i + 1) * span - SEG_GAP / 2;
      // Unit-depth extrusion, scaled in Y to the real height: tweening a scale is
      // far cheaper than rebuilding geometry every frame.
      const geo = new THREE.ExtrudeGeometry(arcShape(a0, a1), { depth: 1, bevelEnabled: false, curveSegments: 18 });
      geoms.push(geo);
      const color = strengthColor(frac, palette);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.15 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2; // extrude along +Y
      const target = MIN_H + frac * (MAX_H - MIN_H);
      mesh.scale.z = reducedMotion ? target : 0.0001;
      mesh.userData.index = i;
      ring.add(mesh);
      segs.push({ mesh, target, mat, base: color.clone() });
    });

    // ---- sizing ----------------------------------------------------------
    let w = 0;
    let h = 0;
    const resize = () => {
      const r = el.getBoundingClientRect();
      if (r.width === w && r.height === h) return;
      w = r.width;
      h = r.height;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      draw();
    };

    // ---- render-on-demand -------------------------------------------------
    let queued = false;
    function draw() {
      queued = false;
      renderer.render(scene, camera);
    }
    const request = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(draw);
    };

    // ---- interaction ------------------------------------------------------
    let yaw = 0.5;
    let velocity = 0;
    let dragging = false;
    let lastX = 0;
    let moved = 0;
    let hovered: number | null = null;
    let inertiaOn = false;
    let tiltX = 0;

    const applyRotation = () => {
      ring.rotation.y = yaw;
      ring.rotation.x = tiltX;
    };
    applyRotation();

    const setHover = (i: number | null) => {
      if (hovered === i) return;
      hovered = i;
      segs.forEach((s, idx) => {
        const on = idx === i;
        gsap.to(s.mat.color, {
          duration: reducedMotion ? 0 : 0.18,
          r: on ? Math.min(1, s.base.r + 0.22) : s.base.r,
          g: on ? Math.min(1, s.base.g + 0.22) : s.base.g,
          b: on ? Math.min(1, s.base.b + 0.22) : s.base.b,
          onUpdate: request,
        });
        gsap.to(s.mesh.scale, {
          z: s.target * (on ? 1.14 : 1),
          duration: reducedMotion ? 0 : 0.22,
          ease: "power2.out",
          onUpdate: request,
        });
      });
      setActiveRef.current(i);
      request();
    };
    focusRef.current = setHover;

    const ray = new THREE.Raycaster();
    const pt = new THREE.Vector2();
    const pick = (clientX: number, clientY: number): number | null => {
      const r = renderer.domElement.getBoundingClientRect();
      pt.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(pt, camera);
      const hit = ray.intersectObjects(segs.map((s) => s.mesh), false)[0];
      return hit ? (hit.object.userData.index as number) : null;
    };

    const stepInertia = () => {
      if (dragging || Math.abs(velocity) < 0.0004) {
        inertiaOn = false;
        return;
      }
      yaw += velocity;
      velocity *= 0.93;
      applyRotation();
      draw();
      requestAnimationFrame(stepInertia);
    };

    const onDown = (e: PointerEvent) => {
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      velocity = 0;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (dragging) {
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        moved += Math.abs(dx);
        yaw += dx * 0.011;
        velocity = dx * 0.011;
        applyRotation();
        request();
        return;
      }
      // Hovering (fine pointers only; touch has no hover) also leans the ring
      // toward the cursor, so it reads as a physical object under a light.
      if (e.pointerType === "mouse") {
        const r = renderer.domElement.getBoundingClientRect();
        const ny = (e.clientY - r.top) / r.height - 0.5;
        const target = ny * 0.22;
        if (Math.abs(target - tiltX) > 0.004) {
          tiltX = target;
          applyRotation();
          request();
        }
        setHover(pick(e.clientX, e.clientY));
      }
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
      if (moved < 4) setHover(pick(e.clientX, e.clientY)); // a tap selects on touch
      else if (!reducedMotion && !inertiaOn) {
        inertiaOn = true;
        requestAnimationFrame(stepInertia);
      }
    };
    const onLeave = () => {
      if (!dragging) setHover(null);
    };

    const dom = renderer.domElement;
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onUp);
    dom.addEventListener("pointerleave", onLeave);

    // ---- intro: the total assembles from its parts -------------------------
    let tl: gsap.core.Timeline | null = null;
    if (!reducedMotion) {
      tl = gsap.timeline({ onUpdate: request, defaults: { ease: "power3.out" } });
      tl.fromTo(ring.rotation, { y: yaw - 1.4 }, { y: yaw, duration: 1.3, onUpdate: () => (yaw = ring.rotation.y) }, 0);
      segs.forEach((s, i) => {
        tl!.to(s.mesh.scale, { z: s.target, duration: 0.7 }, 0.12 + i * 0.07);
      });
    }

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    draw();

    return () => {
      focusRef.current = () => {};
      tl?.kill();
      gsap.killTweensOf(ring.rotation);
      segs.forEach((s) => {
        gsap.killTweensOf(s.mat.color);
        gsap.killTweensOf(s.mesh.scale);
      });
      ro.disconnect();
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointercancel", onUp);
      dom.removeEventListener("pointerleave", onLeave);
      geoms.forEach((g) => g.dispose());
      segs.forEach((s) => s.mat.dispose());
      base.geometry.dispose();
      (base.material as THREE.Material).dispose();
      renderer.dispose();
      if (dom.parentNode === el) el.removeChild(dom);
    };
  }, [cats, onUnsupported, reducedMotion]);

  // Keyboard: arrows walk the categories, Escape clears. Mirrors hover exactly.
  const onKey = (e: React.KeyboardEvent) => {
    if (cats.length === 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      focusRef.current(active == null ? 0 : (active + 1) % cats.length);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      focusRef.current(active == null ? cats.length - 1 : (active - 1 + cats.length) % cats.length);
    } else if (e.key === "Escape") {
      focusRef.current(null);
    }
  };

  const current = active != null ? cats[active] : null;

  return (
    <div
      className={`relative select-none ${className}`}
      tabIndex={0}
      role="group"
      aria-label="Score breakdown ring. Use arrow keys to step through categories."
      onKeyDown={onKey}
    >
      <div ref={host} className="h-full w-full cursor-grab active:cursor-grabbing" />

      {/* Reads out the focused category; also the visible caption. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center px-2"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="nums max-w-full truncate rounded-full border border-line bg-bg/80 px-3 py-1 text-xs font-semibold text-text backdrop-blur-sm">
          {current ? (
            <>
              {current.label} <span className="text-brand">{current.points}</span>
              <span className="text-faint">/{current.max}</span>
            </>
          ) : (
            <span className="text-muted">Drag to turn · hover a block</span>
          )}
        </span>
      </div>
    </div>
  );
}
