import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import gsap from "gsap";
import type { BodyStyle } from "./bodyStyle";
import { loadCar, RealCar } from "./realCar";

/**
 * The studio stage: one car on a soft floor, lit like a configurator.
 *
 * Two jobs, chosen because both are about the car as a physical object:
 *   - "turntable": the leaderboard hero. The car turns slowly and can be
 *     dragged round; its silhouette follows the top pick's body style.
 *   - "inspect": the guide's walkaround. Numbered points sit on the body, and
 *     choosing one turns the car until that point faces you — inspection is
 *     spatial, and a flat list can't show where the rocker panels are.
 *
 * Rendering is frugal. Frames are only drawn while the stage is on screen and
 * the tab is visible, and with reduced motion the turntable doesn't turn at all
 * — it renders once, in a three-quarter view, and again only when dragged.
 *
 * Loaded lazily (three.js is most of a megabyte); see Stage.tsx for the
 * WebGL check and the flat fallback.
 */

export interface StageSpot {
  id: string;
  n: number;
  label: string;
}

export interface CarStageProps {
  style: BodyStyle;
  paint: string;
  mode: "turntable" | "inspect";
  reducedMotion: boolean;
  /** Plays the roll-on entrance the first time the stage renders. */
  intro?: boolean;
  spots?: StageSpot[];
  activeSpot?: string;
  onSpot?: (id: string) => void;
  onUnsupported?: () => void;
  className?: string;
  label: string;
}

/** Soft elliptical contact shadow, drawn once to a canvas. */
function shadowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.45, "rgba(0,0,0,0.28)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Angle in the ground plane, measured the way three.js measures yaw. */
const azimuth = (v: THREE.Vector3) => Math.atan2(v.x, v.z);

/** The equivalent of `target` nearest to `from`, so a turn never goes the long way. */
function nearestAngle(from: number, target: number): number {
  const twoPi = Math.PI * 2;
  let d = (target - from) % twoPi;
  if (d > Math.PI) d -= twoPi;
  if (d < -Math.PI) d += twoPi;
  return from + d;
}

export default function CarStage({
  style,
  paint,
  mode,
  reducedMotion,
  intro = false,
  spots = [],
  activeSpot,
  onSpot,
  onUnsupported,
  className = "",
  label,
}: CarStageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spotRefs = useRef(new Map<string, HTMLButtonElement>());
  /** Live handles into the scene, shared between the effects below. */
  const world = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    pivot: THREE.Group;
    car: RealCar | null;
    target: THREE.Vector3;
    invalidate: () => void;
    style: BodyStyle | null;
  } | null>(null);
  /** The body style whose model is on the stage; effects that need the car wait on it. */
  const [shown, setShown] = useState<BodyStyle | null>(null);
  /** The latest paint, readable from the async load without re-running it. */
  const paintRef = useRef(paint);
  paintRef.current = paint;

  // ---- scene lifetime ---------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      onUnsupported?.();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.32;

    const key = new THREE.DirectionalLight("#ffffff", 1.15);
    key.position.set(4, 7, 5);
    scene.add(key);
    scene.add(new THREE.HemisphereLight("#eaf2ff", "#3a4048", 0.12));

    const shadowTex = shadowTexture();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.scale.set(6.2, 3.4, 1);
    floor.position.y = 0.002;
    scene.add(floor);

    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
    const target = new THREE.Vector3(0, 0.62, 0);

    const pivot = new THREE.Group();
    // A three-quarter front view is the angle every car brochure uses for a reason.
    pivot.rotation.y = mode === "turntable" ? -0.55 : 0.35;
    scene.add(pivot);

    let raf = 0;
    let visible = true;
    let last = performance.now();
    let dirty = true;
    let dragging = false;
    let velocity = 0;
    const spin = mode === "turntable" && !reducedMotion ? 0.22 : 0; // rad/s

    const tmpV = new THREE.Vector3();
    const tmpN = new THREE.Vector3();
    const camDir = new THREE.Vector3();

    const placeSpots = () => {
      const w = world.current;
      if (!w || !w.car || spotRefs.current.size === 0) return;
      const hs = w.car.hotspots;
      const rect = wrap.getBoundingClientRect();
      pivot.updateMatrixWorld();
      for (const [id, el] of spotRefs.current) {
        const h = hs[id];
        if (!h) continue;
        tmpV.copy(h.position).applyMatrix4(pivot.matrixWorld);
        tmpN.copy(h.normal).transformDirection(pivot.matrixWorld);
        camDir.copy(camera.position).sub(tmpV).normalize();
        const facing = tmpN.dot(camDir);
        tmpV.project(camera);
        const x = (tmpV.x * 0.5 + 0.5) * rect.width;
        const y = (-tmpV.y * 0.5 + 0.5) * rect.height;
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
        // Points on the far side fade out rather than float over the body.
        const o = THREE.MathUtils.clamp((facing + 0.15) / 0.45, 0, 1);
        el.style.opacity = o.toFixed(2);
        el.style.pointerEvents = o > 0.4 ? "auto" : "none";
      }
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      let moving = false;
      if (!dragging) {
        if (Math.abs(velocity) > 0.0005) {
          pivot.rotation.y += velocity;
          velocity *= 0.93;
          moving = true;
        } else if (spin) {
          pivot.rotation.y += spin * dt;
          moving = true;
        }
      }

      camera.lookAt(target);
      renderer.render(scene, camera);
      placeSpots();

      const tweening =
        gsap.isTweening(pivot.rotation) ||
        gsap.isTweening(pivot.position) ||
        gsap.isTweening(camera.position) ||
        gsap.isTweening(target);
      if (visible && (moving || dragging || tweening || dirty)) {
        dirty = false;
        raf = requestAnimationFrame(frame);
      }
    };

    const invalidate = () => {
      dirty = true;
      if (!raf && visible) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    const fit = () => {
      const { width, height } = wrap.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Frame the car's length across the narrower of the two axes.
      const fov = THREE.MathUtils.degToRad(camera.fov);
      const fitW = 6.3 / (2 * Math.tan(fov / 2) * camera.aspect);
      const fitH = 2.9 / (2 * Math.tan(fov / 2));
      const dist = Math.max(fitW, fitH) * (mode === "inspect" ? 0.86 : 0.96);
      const elev = mode === "inspect" ? 0.3 : 0.24;
      camera.position.set(0, target.y + dist * Math.sin(elev), dist * Math.cos(elev));
      camera.updateProjectionMatrix();
      invalidate();
    };

    world.current = { renderer, scene, camera, pivot, car: null, target, invalidate, style: null };

    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    fit();

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting && document.visibilityState === "visible";
      if (visible) invalidate();
    });
    io.observe(wrap);
    const onVis = () => {
      visible = document.visibilityState === "visible";
      if (visible) invalidate();
    };
    document.addEventListener("visibilitychange", onVis);

    // Drag to turn. Horizontal only: tipping a car over is never useful.
    let lastX = 0;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      dragging = true;
      velocity = 0;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
      gsap.killTweensOf(pivot.rotation);
      invalidate();
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      const delta = dx * 0.008;
      pivot.rotation.y += delta;
      velocity = reducedMotion ? 0 : delta;
      invalidate();
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      invalidate();
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    const onLost = (e: Event) => {
      e.preventDefault();
      onUnsupported?.();
    };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("webglcontextlost", onLost);
      gsap.killTweensOf([pivot.rotation, pivot.position, camera.position, target]);
      world.current?.car?.dispose();
      shadowTex.dispose();
      env.dispose();
      pmrem.dispose();
      room.dispose?.();
      renderer.dispose();
      world.current = null;
    };
    // The scene is built once per mode; body and paint swap in place below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, reducedMotion]);

  // ---- body style: swap the car, with a small drop so the change registers --
  useEffect(() => {
    const w = world.current;
    if (!w || w.style === style) return;
    let cancelled = false;
    let tween: gsap.core.Tween | null = null;

    loadCar(style, paintRef.current)
      .then((car) => {
        // The scene may have been torn down, or the style changed again, while the file loaded.
        if (cancelled || world.current !== w) {
          car.dispose();
          return;
        }
        const first = w.car === null;
        if (w.car) {
          w.pivot.remove(w.car.group);
          w.car.dispose();
        }
        w.pivot.add(car.group);
        w.car = car;
        w.style = style;
        // Aim at the middle of the car, whatever its height.
        w.target.y = car.height * 0.45;
        setShown(style);

        if (reducedMotion) {
          w.invalidate();
          return;
        }
        if (first && intro) {
          // Rolls on from behind the headline and settles: the page's one entrance.
          const roll = { x: -7 };
          tween = gsap.fromTo(
            roll,
            { x: -7 },
            {
              x: 0,
              duration: 1.5,
              ease: "power3.out",
              delay: 0.25,
              onUpdate: () => {
                car.group.position.x = roll.x;
                car.roll(roll.x);
                w.invalidate();
              },
            },
          );
        } else if (!first) {
          tween = gsap.fromTo(
            car.group.position,
            { y: 0.35 },
            { y: 0, duration: 0.55, ease: "bounce.out", onUpdate: w.invalidate },
          );
        }
        w.invalidate();
      })
      .catch(() => {
        // A model that won't load is the same as no WebGL: show the flat car.
        if (!cancelled) onUnsupported?.();
      });

    // A tween must not outlive the scene it draws into.
    return () => {
      cancelled = true;
      tween?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, intro, reducedMotion, mode]);

  // ---- paint ---------------------------------------------------------------
  useEffect(() => {
    const w = world.current;
    if (!w?.car) return;
    w.car.setPaint(paint);
    w.invalidate();
  }, [paint, mode, shown]);

  // ---- inspect: turn the chosen point towards the viewer ---------------------
  useEffect(() => {
    const w = world.current;
    if (!w || !w.car || mode !== "inspect" || !activeSpot) return;
    const h = w.car.hotspots[activeSpot];
    if (!h) return;
    const k = w.car.height / 1.4; // the lift values below were tuned for a 1.4-tall car
    const camAz = azimuth(w.camera.position.clone().setY(0));
    // Aim a little past square-on, so the point sits on a curve of the body
    // rather than dead centre of a flat side.
    const want = camAz - azimuth(h.normal.clone().setY(0)) + 0.18;
    const to = nearestAngle(w.pivot.rotation.y, want);
    const lift = k * (activeSpot === "underneath" ? 0.28 : activeSpot === "engine" || activeSpot === "glass" ? 0.95 : 0.62);
    if (reducedMotion) {
      w.pivot.rotation.y = to;
      w.target.y = lift;
      w.invalidate();
      return;
    }
    gsap.to(w.pivot.rotation, { y: to, duration: 0.9, ease: "power2.inOut", onUpdate: w.invalidate });
    gsap.to(w.target, { y: lift, duration: 0.9, ease: "power2.inOut", onUpdate: w.invalidate });
  }, [activeSpot, mode, reducedMotion, shown]);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-pan-y"
        style={{ cursor: "grab" }}
        role="img"
        aria-label={label}
      />
      {mode === "inspect" &&
        spots.map((s) => {
          const active = s.id === activeSpot;
          return (
            <button
              key={s.id}
              ref={(el) => {
                if (el) spotRefs.current.set(s.id, el);
                else spotRefs.current.delete(s.id);
              }}
              type="button"
              onClick={() => onSpot?.(s.id)}
              // The numbered list beside the stage is the keyboard and screen
              // reader path; these follow the 3D body and can be hidden behind it.
              tabIndex={-1}
              aria-hidden

              className={`hotspot absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full text-sm font-bold transition-[background-color,color,box-shadow] duration-200 ${
                active ? "hotspot-active" : ""
              }`}
              style={{ opacity: 0 }}
            >
              {s.n}
            </button>
          );
        })}
    </div>
  );
}
