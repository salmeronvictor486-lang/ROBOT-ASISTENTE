import { useEffect, useId, useRef } from "react";
import { Spring, SPRINGS, type SpringConfig } from "../lib/spring";
import { useReducedMotion } from "../lib/useReducedMotion";
import { MAX_LOOK_PX, POSES, type Expression, type Pose } from "./expressions";
import { getGaze, lookOffset } from "./gaze";

export interface TicoProps {
  /** Tamaño en px de pantalla. */
  size: number;
  baseColor: string;
  accentColor: string;
  expression: Expression;
  /** Cada vez que cambia este número, los ojos dan un saltito (un token nuevo). */
  bounce?: number;
  /** Cada vez que cambia este número, Tico se sacude. */
  shake?: number;
}

const ERROR_COLOR = "#E5484D";
const VISOR = { x: 22, y: 32, width: 56, height: 42 };
const EYE_Y = 53;
const LEFT_X = 40;
const RIGHT_X = 60;
const BLINK_MS = 140;

/** Oscurece un color #RRGGBB mezclándolo con negro. */
function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  if (Number.isNaN(n)) return hex;
  const f = 1 - amount;
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r} ${g} ${b})`;
}

interface Anim {
  tilt: Spring;
  eyeWidth: Spring;
  eyeHeight: Spring;
  eyeRound: Spring;
  leftScale: Spring;
  rightScale: Spring;
  arcs: Spring;
  scan: Spring;
  zzz: Spring;
  lookX: Spring;
  lookY: Spring;
  bounce: Spring;
  shake: Spring;
  jump: Spring;
}

function createAnim(pose: Pose): Anim {
  const s = (v: number, c: SpringConfig = SPRINGS.gentle) => new Spring(v, c);
  return {
    tilt: s(pose.tilt),
    eyeWidth: s(pose.eyeWidth, SPRINGS.snappy),
    eyeHeight: s(pose.eyeHeight, SPRINGS.snappy),
    eyeRound: s(pose.eyeRound, SPRINGS.snappy),
    leftScale: s(pose.leftScale, SPRINGS.bouncy),
    rightScale: s(pose.rightScale, SPRINGS.bouncy),
    arcs: s(pose.arcs ? 1 : 0, SPRINGS.snappy),
    scan: s(pose.scan ? 1 : 0, SPRINGS.snappy),
    zzz: s(pose.zzz ? 1 : 0),
    lookX: s(0),
    lookY: s(0),
    bounce: s(0, SPRINGS.bouncy),
    shake: s(0, { stiffness: 300, damping: 7 }),
    jump: s(0, SPRINGS.bouncy),
  };
}

/**
 * Tico, el robot. Dibujado en SVG y animado con muelles a 60 fps.
 * El bucle escribe atributos directamente en el SVG: React solo renderiza una vez.
 */
export function Tico({ size, baseColor, accentColor, expression, bounce = 0, shake = 0 }: TicoProps) {
  const reducedMotion = useReducedMotion();
  // Id único para el clipPath: puede haber varios Ticos en la misma página.
  const clipId = `tico-visor-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const leftEyeRef = useRef<SVGRectElement>(null);
  const rightEyeRef = useRef<SVGRectElement>(null);
  const arcsRef = useRef<SVGGElement>(null);
  const scanRef = useRef<SVGRectElement>(null);
  const haloRef = useRef<SVGCircleElement>(null);
  const zzzRef = useRef<SVGTextElement>(null);

  const pose = POSES[expression];
  const poseRef = useRef(pose);
  const reducedRef = useRef(reducedMotion);
  const sizeRef = useRef(size);
  const animRef = useRef<Anim | null>(null);

  useEffect(() => {
    poseRef.current = pose;
    reducedRef.current = reducedMotion;
    sizeRef.current = size;
  }, [pose, reducedMotion, size]);

  // Impulsos: rebote al hablar, sacudida y saltito de alegría.
  useEffect(() => {
    if (bounce && !reducedRef.current) animRef.current?.bounce.impulse(-45);
  }, [bounce]);
  useEffect(() => {
    if (shake && !reducedRef.current) animRef.current?.shake.impulse(260);
  }, [shake]);
  useEffect(() => {
    if (expression === "happy" && !reducedRef.current) animRef.current?.jump.impulse(-110);
  }, [expression]);

  useEffect(() => {
    const anim = createAnim(poseRef.current);
    animRef.current = anim;
    const springs = Object.values(anim);
    let frame = 0;
    let last = performance.now();
    let nextBlink = last + 2000 + Math.random() * 3000;
    let blinkStart = -Infinity;
    let rectCache: DOMRect | null = null;
    let rectAge = 0;

    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const t = now / 1000;
      const p = poseRef.current;
      const reduced = reducedRef.current;
      const unitsPerPx = 100 / sizeRef.current;

      anim.tilt.target = p.tilt;
      anim.eyeWidth.target = p.eyeWidth;
      anim.eyeHeight.target = p.eyeHeight;
      anim.eyeRound.target = p.eyeRound;
      anim.leftScale.target = p.leftScale;
      anim.rightScale.target = p.rightScale;
      anim.arcs.target = p.arcs ? 1 : 0;
      anim.scan.target = p.scan ? 1 : 0;
      anim.zzz.target = p.zzz ? 1 : 0;

      // Mirada: sigue al cursor, barre de lado a lado (pensando) o al centro.
      const maxLook = MAX_LOOK_PX * unitsPerPx;
      let lookX = 0;
      let lookY = 0;
      if (p.look === "sweep" && !reduced) {
        lookX = Math.sin(t * 2.6) * maxLook;
      } else if (p.look === "cursor") {
        const gaze = getGaze();
        if (gaze && svgRef.current) {
          if (!rectCache || rectAge++ > 30) {
            rectCache = svgRef.current.getBoundingClientRect();
            rectAge = 0;
          }
          const center = {
            x: rectCache.left + rectCache.width / 2,
            y: rectCache.top + rectCache.height * (EYE_Y / 100),
          };
          const o = lookOffset(center, gaze, MAX_LOOK_PX);
          lookX = o.x * unitsPerPx;
          lookY = o.y * unitsPerPx;
        }
      }
      anim.lookX.target = lookX;
      anim.lookY.target = lookY;

      for (const s of springs) {
        if (reduced) s.snap();
        else s.step(dt);
      }

      // Parpadeo cada 3-6 s al azar.
      if (p.blink && now >= nextBlink) {
        blinkStart = now;
        nextBlink = now + 3000 + Math.random() * 3000;
      }
      const blinkT = (now - blinkStart) / BLINK_MS;
      const blink = blinkT >= 0 && blinkT < 1 ? 1 - 0.9 * Math.sin(Math.PI * blinkT) : 1;

      // Respiración: escala de 1 a 1,02.
      const breath = p.breathe && !reduced ? 1 + 0.01 * (1 + Math.sin((t * 2 * Math.PI) / 3.2)) : 1;

      bodyRef.current?.setAttribute(
        "transform",
        `translate(0 ${anim.jump.value}) rotate(${anim.tilt.value + anim.shake.value} 50 60) ` +
          `translate(50 60) scale(${breath}) translate(-50 -60)`,
      );

      const eyeOpacity = String(Math.max(0, 1 - anim.arcs.value));
      const drawEye = (el: SVGRectElement | null, cx: number, scale: number) => {
        if (!el) return;
        const w = Math.max(anim.eyeWidth.value * scale, 0.5);
        const h = Math.max(anim.eyeHeight.value * scale * blink, 1.2);
        const x = cx + anim.lookX.value - w / 2;
        const y = EYE_Y + anim.lookY.value + anim.bounce.value - h / 2;
        el.setAttribute("x", x.toFixed(2));
        el.setAttribute("y", y.toFixed(2));
        el.setAttribute("width", w.toFixed(2));
        el.setAttribute("height", h.toFixed(2));
        el.setAttribute("rx", ((Math.min(w, h) / 2) * anim.eyeRound.value).toFixed(2));
        el.setAttribute("opacity", eyeOpacity);
      };
      drawEye(leftEyeRef.current, LEFT_X, anim.leftScale.value);
      drawEye(rightEyeRef.current, RIGHT_X, anim.rightScale.value);

      arcsRef.current?.setAttribute("opacity", anim.arcs.value.toFixed(3));
      arcsRef.current?.setAttribute(
        "transform",
        `translate(${anim.lookX.value} ${anim.lookY.value + anim.bounce.value})`,
      );

      if (scanRef.current) {
        const sweep = reduced ? 0.5 : (t * 0.8) % 1;
        scanRef.current.setAttribute("y", (VISOR.y + sweep * (VISOR.height - 2)).toFixed(2));
        scanRef.current.setAttribute("opacity", (anim.scan.value * 0.8).toFixed(3));
      }

      if (haloRef.current) {
        const glow = p.antennaPulse && !reduced ? 0.45 + 0.4 * Math.sin(t * 7) : 0.25;
        haloRef.current.setAttribute("opacity", glow.toFixed(3));
      }

      if (zzzRef.current) {
        const z = reduced ? 0 : (t % 2.4) / 2.4;
        zzzRef.current.setAttribute("y", (24 - z * 12).toFixed(2));
        zzzRef.current.setAttribute("opacity", (anim.zzz.value * (1 - z)).toFixed(3));
      }

      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      animRef.current = null;
    };
  }, []);

  const antennaColor = pose.antennaError ? ERROR_COLOR : accentColor;
  const earColor = shade(baseColor, 0.12);

  return (
    <svg
      ref={svgRef}
      className="tico"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Tico (${expression})`}
      style={{ overflow: "visible" }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={VISOR.x} y={VISOR.y} width={VISOR.width} height={VISOR.height} rx="17" />
        </clipPath>
      </defs>
      <g ref={bodyRef}>
        <rect x="48.5" y="8" width="3" height="15" rx="1.5" fill={earColor} />
        <circle ref={haloRef} cx="50" cy="8" r="8.5" fill={antennaColor} opacity="0.25" />
        <circle cx="50" cy="8" r="5" fill={antennaColor} />
        <circle cx="12" cy="56" r="6.5" fill={earColor} />
        <circle cx="12" cy="56" r="3" fill={shade(baseColor, 0.25)} />
        <circle cx="88" cy="56" r="6.5" fill={earColor} />
        <circle cx="88" cy="56" r="3" fill={shade(baseColor, 0.25)} />
        <rect x="14" y="22" width="72" height="62" rx="23" fill={baseColor} />
        <rect
          x={VISOR.x}
          y={VISOR.y}
          width={VISOR.width}
          height={VISOR.height}
          rx="17"
          fill="#121417"
        />
        <g clipPath={`url(#${clipId})`}>
          <rect ref={leftEyeRef} fill={accentColor} />
          <rect ref={rightEyeRef} fill={accentColor} />
          <g
            ref={arcsRef}
            opacity="0"
            fill="none"
            stroke={accentColor}
            strokeWidth="3.6"
            strokeLinecap="round"
          >
            <path d={`M${LEFT_X - 6} ${EYE_Y + 3} Q${LEFT_X} ${EYE_Y - 7} ${LEFT_X + 6} ${EYE_Y + 3}`} />
            <path
              d={`M${RIGHT_X - 6} ${EYE_Y + 3} Q${RIGHT_X} ${EYE_Y - 7} ${RIGHT_X + 6} ${EYE_Y + 3}`}
            />
          </g>
          <rect ref={scanRef} x={VISOR.x} width={VISOR.width} height="2" fill={accentColor} opacity="0" />
        </g>
        <text
          ref={zzzRef}
          x="76"
          y="24"
          fontSize="13"
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
          fill={accentColor}
          opacity="0"
        >
          z
        </text>
      </g>
    </svg>
  );
}
