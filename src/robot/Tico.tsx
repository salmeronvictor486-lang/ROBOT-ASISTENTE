import { useEffect, useId, useRef } from "react";
import { Spring, SPRINGS, type SpringConfig } from "../lib/spring";
import { useReducedMotion } from "../lib/useReducedMotion";
import { MAX_LOOK_PX, POSES, type Expression, type Pose } from "./expressions";
import { getGaze, lookOffset } from "./gaze";
import { armJoints, FOREARM, UPPER_ARM } from "./rig";

export interface TicoProps {
  /** Tamaño en px de pantalla. */
  size: number;
  baseColor: string;
  accentColor: string;
  expression: Expression;
  /** Cada vez que cambia este número, Tico reacciona a un token (ojos, brazos, pecho). */
  bounce?: number;
  /** Cada vez que cambia este número, Tico se sacude. */
  shake?: number;
  /** Cada vez que cambia este número, Tico saluda con la mano. */
  wave?: number;
}

const ERROR_COLOR = "#E5484D";
const VISOR = { x: 25, y: 27, width: 50, height: 30, rx: 12 };
const EYE_Y = 42;
const LEFT_X = 41;
const RIGHT_X = 59;
/** Punto sobre el que gira la cabeza (el cuello). */
const NECK = { x: 50, y: 64 };
/** Base de la antena. */
const ANTENNA = { x: 50, y: 20 };
/** Punto de apoyo para aplastar y estirar el cuerpo (los "pies"). */
const FEET = { x: 50, y: 92 };
const BLINK_MS = 130;
const WAVE_MS = 1500;

type Fidget = "look" | "stretch" | "wave" | "hop" | "antenna";

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

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const between = (min: number, max: number) => min + Math.random() * (max - min);

/** Muelles de un brazo: hombro y codo. */
interface ArmSprings {
  shoulder: Spring;
  elbow: Spring;
}

const ARM: SpringConfig = { stiffness: 150, damping: 13 };
const WOBBLY: SpringConfig = { stiffness: 90, damping: 5 };

function createAnim(pose: Pose) {
  const s = (v: number, c: SpringConfig = SPRINGS.gentle) => new Spring(v, c);
  const arm = (a: Pose["leftArm"]): ArmSprings => ({
    shoulder: s(a.shoulder, ARM),
    elbow: s(a.elbow, ARM),
  });
  return {
    tilt: s(pose.tilt),
    headX: s(0),
    headY: s(0, SPRINGS.bouncy),
    eyeWidth: s(pose.eyeWidth, SPRINGS.snappy),
    eyeHeight: s(pose.eyeHeight, SPRINGS.snappy),
    eyeRound: s(pose.eyeRound, SPRINGS.snappy),
    leftScale: s(pose.leftScale, SPRINGS.bouncy),
    rightScale: s(pose.rightScale, SPRINGS.bouncy),
    arcs: s(pose.arcs ? 1 : 0, SPRINGS.snappy),
    scan: s(pose.scan ? 1 : 0, SPRINGS.snappy),
    zzz: s(pose.zzz ? 1 : 0),
    lookX: s(0, { stiffness: 260, damping: 22 }),
    lookY: s(0, { stiffness: 260, damping: 22 }),
    bounce: s(0, SPRINGS.bouncy),
    shake: s(0, { stiffness: 300, damping: 7 }),
    jump: s(0, { stiffness: 220, damping: 11 }),
    antenna: s(0, WOBBLY),
    chest: s(0, { stiffness: 120, damping: 14 }),
    left: arm(pose.leftArm),
    right: arm(pose.rightArm),
  };
}

type Anim = ReturnType<typeof createAnim>;

function allSprings(a: Anim): Spring[] {
  const { left, right, ...rest } = a;
  return [...Object.values(rest), left.shoulder, left.elbow, right.shoulder, right.elbow];
}

/**
 * Tico, el robot. SVG propio animado a 60 fps.
 *
 * La animación va por capas, como en los dibujos animados:
 * 1. Pose de la expresión (ojos, cabeza, brazos) con muelles.
 * 2. Vida en reposo: respiración, parpadeos (a veces dobles), micro-movimientos de los ojos.
 * 3. Física secundaria: la antena se balancea con inercia y la cabeza llega un poco
 *    después que el cuerpo; el cuerpo se aplasta y se estira al saltar.
 * 4. Gestos: saluda, gesticula al hablar y, si se aburre, mira alrededor o se estira.
 *
 * El bucle escribe atributos directamente en el SVG: React solo renderiza una vez.
 */
export function Tico({
  size,
  baseColor,
  accentColor,
  expression,
  bounce = 0,
  shake = 0,
  wave = 0,
}: TicoProps) {
  const reducedMotion = useReducedMotion();
  // Id único para el clipPath: puede haber varios Ticos en la misma página.
  const clipId = `tico-visor-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const antennaRef = useRef<SVGGElement>(null);
  const leftArmRef = useRef<SVGPathElement>(null);
  const rightArmRef = useRef<SVGPathElement>(null);
  const leftHandRef = useRef<SVGCircleElement>(null);
  const rightHandRef = useRef<SVGCircleElement>(null);
  const leftEyeRef = useRef<SVGRectElement>(null);
  const rightEyeRef = useRef<SVGRectElement>(null);
  const arcsRef = useRef<SVGGElement>(null);
  const scanRef = useRef<SVGRectElement>(null);
  const haloRef = useRef<SVGCircleElement>(null);
  const chestRef = useRef<SVGCircleElement>(null);
  const chestGlowRef = useRef<SVGCircleElement>(null);
  const zzzRef = useRef<SVGTextElement>(null);

  const pose = POSES[expression];
  const poseRef = useRef(pose);
  const reducedRef = useRef(reducedMotion);
  const sizeRef = useRef(size);
  const animRef = useRef<Anim | null>(null);
  const waveUntil = useRef(0);
  const gestureSide = useRef(1);

  useEffect(() => {
    poseRef.current = pose;
    reducedRef.current = reducedMotion;
    sizeRef.current = size;
  }, [pose, reducedMotion, size]);

  // Cada token: los ojos rebotan, el pecho se ilumina y un brazo gesticula.
  useEffect(() => {
    const a = animRef.current;
    if (!bounce || !a || reducedRef.current) return;
    a.bounce.impulse(-40);
    a.chest.impulse(9);
    if (poseRef.current.gestures) {
      const arm = gestureSide.current > 0 ? a.right : a.left;
      arm.shoulder.impulse(between(60, 140));
      arm.elbow.impulse(between(40, 120));
      if (Math.random() < 0.35) gestureSide.current *= -1;
    }
  }, [bounce]);

  useEffect(() => {
    const a = animRef.current;
    if (!shake || !a || reducedRef.current) return;
    a.shake.impulse(260);
    a.antenna.impulse(-500);
    a.left.shoulder.impulse(200);
    a.right.shoulder.impulse(200);
  }, [shake]);

  useEffect(() => {
    if (wave && !reducedRef.current) waveUntil.current = performance.now() + WAVE_MS;
  }, [wave]);

  // Al ponerse contento da un saltito (la antena y la cabeza siguen el movimiento).
  useEffect(() => {
    const a = animRef.current;
    if (expression === "happy" && a && !reducedRef.current) {
      a.jump.impulse(-120);
      a.antenna.impulse(260);
    }
  }, [expression]);

  useEffect(() => {
    const anim = createAnim(poseRef.current);
    animRef.current = anim;
    const springs = allSprings(anim);
    let frame = 0;
    let last = performance.now();
    let nextBlink = last + between(1500, 4000);
    let blinkStart = -Infinity;
    let doubleBlink = false;
    let rectCache: DOMRect | null = null;
    let rectAge = 0;
    // Micro-movimientos de los ojos (sacadas) y gestos espontáneos.
    let saccade = { x: 0, y: 0 };
    let nextSaccade = last + between(600, 2000);
    let lastGaze: { x: number; y: number } | null = null;
    let gazeStillSince = last;
    let fidget: Fidget | null = null;
    let fidgetUntil = 0;
    let nextFidget = last + between(6000, 11000);

    // Usamos performance.now() (y no el argumento de rAF) para que el render del anuncio,
    // con tiempo virtual, use el mismo reloj que todo lo demás.
    const loop = () => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const t = now / 1000;
      const p = poseRef.current;
      const reduced = reducedRef.current;
      const unitsPerPx = 100 / sizeRef.current;
      const maxLook = MAX_LOOK_PX * unitsPerPx;

      // --- Gestos espontáneos (solo en reposo) ---
      if (fidget && now > fidgetUntil) fidget = null;
      if (!reduced && p.fidgets && !fidget && now > nextFidget) {
        const options: Fidget[] = ["look", "look", "stretch", "wave", "hop", "antenna"];
        fidget = options[Math.floor(Math.random() * options.length)] ?? "look";
        fidgetUntil = now + (fidget === "stretch" ? 1100 : fidget === "look" ? 1600 : 900);
        nextFidget = now + between(7000, 14000);
        if (fidget === "hop") {
          anim.jump.impulse(-80);
          anim.antenna.impulse(200);
        } else if (fidget === "antenna") {
          anim.antenna.impulse(between(-420, 420));
        } else if (fidget === "wave") {
          waveUntil.current = now + 1100;
        }
      }
      if (!p.fidgets) fidget = null;
      const waving = now < waveUntil.current;

      // --- Mirada ---
      let lookX = 0;
      let lookY = 0;
      if (p.look === "sweep" && !reduced) {
        lookX = Math.sin(t * 2.4) * maxLook;
        lookY = -0.4 * maxLook;
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
          if (!lastGaze || Math.hypot(gaze.x - lastGaze.x, gaze.y - lastGaze.y) > 2) {
            gazeStillSince = now;
            lastGaze = { ...gaze };
          }
        }
        // Sacadas: pequeños saltos de mirada; si el cursor lleva rato quieto, mira alrededor.
        if (!reduced && now > nextSaccade) {
          const bored = now - gazeStillSince > 3500 || fidget === "look";
          const amp = bored ? maxLook * 1.1 : maxLook * 0.25;
          saccade = { x: between(-amp, amp), y: between(-amp * 0.6, amp * 0.6) };
          nextSaccade = now + (bored ? between(500, 1300) : between(700, 2200));
        }
        lookX += saccade.x;
        lookY += saccade.y;
      }
      lookX = clamp(lookX, -maxLook * 1.4, maxLook * 1.4);
      lookY = clamp(lookY, -maxLook * 1.2, maxLook * 1.2);
      anim.lookX.target = lookX;
      anim.lookY.target = lookY;

      // --- Pose objetivo ---
      // La cabeza acompaña a la mirada: se gira un poco hacia donde mira.
      anim.tilt.target = p.tilt + (reduced ? 0 : (lookX / maxLook) * 3);
      anim.headX.target = reduced ? 0 : lookX * 0.35;
      anim.eyeWidth.target = p.eyeWidth;
      anim.eyeHeight.target = p.eyeHeight;
      anim.eyeRound.target = p.eyeRound;
      anim.leftScale.target = p.leftScale;
      anim.rightScale.target = p.rightScale;
      anim.arcs.target = p.arcs ? 1 : 0;
      anim.scan.target = p.scan ? 1 : 0;
      anim.zzz.target = p.zzz ? 1 : 0;

      const sway = reduced ? 0 : p.sway;
      let leftArm = {
        shoulder: p.leftArm.shoulder + Math.sin(t * 1.7) * sway,
        elbow: p.leftArm.elbow + Math.sin(t * 1.7 - 0.8) * sway,
      };
      let rightArm = {
        shoulder: p.rightArm.shoulder + Math.sin(t * 1.7 + 1.3) * sway,
        elbow: p.rightArm.elbow + Math.sin(t * 1.7 + 0.5) * sway,
      };
      if (fidget === "stretch") {
        leftArm = { shoulder: 168, elbow: 4 };
        rightArm = { shoulder: 168, elbow: 4 };
        anim.tilt.target -= 4;
      }
      if (waving) {
        // Saluda con la mano derecha: brazo arriba y antebrazo de lado a lado.
        rightArm = { shoulder: 150, elbow: 30 + Math.sin(t * 14) * 28 };
      }
      anim.left.shoulder.target = leftArm.shoulder;
      anim.left.elbow.target = leftArm.elbow;
      anim.right.shoulder.target = rightArm.shoulder;
      anim.right.elbow.target = rightArm.elbow;

      // --- Física secundaria ---
      // La cabeza llega tarde respecto al cuerpo (follow-through) y la antena se balancea
      // con la inercia de la cabeza.
      anim.headY.target = clamp(anim.jump.velocity * 0.012, -3, 3);
      anim.antenna.target = -anim.tilt.value * 0.6;
      if (!reduced) anim.antenna.velocity -= (anim.tilt.velocity * 2 + anim.headX.velocity * 6) * dt * 6;

      for (const s of springs) {
        if (reduced) s.snap();
        else s.step(dt);
      }

      // --- Parpadeo (a veces doble) ---
      if (p.blink && now >= nextBlink) {
        blinkStart = now;
        doubleBlink = Math.random() < 0.22;
        nextBlink = now + between(2800, 6000);
      }
      const blinkT = (now - blinkStart) / BLINK_MS;
      let blink = 1;
      if (blinkT >= 0 && blinkT < 1) blink = 1 - 0.92 * Math.sin(Math.PI * blinkT);
      else if (doubleBlink && blinkT >= 1.6 && blinkT < 2.6)
        blink = 1 - 0.92 * Math.sin(Math.PI * (blinkT - 1.6));

      // --- Respiración: el pecho sube y baja, la cabeza la sigue con un poco de retraso ---
      const breathPhase = (t * 2 * Math.PI * p.breathe) / 3.4;
      const breath = reduced ? 0 : Math.sin(breathPhase);
      const breathHead = reduced ? 0 : Math.sin(breathPhase - 0.7);

      // --- Squash & stretch con la velocidad del salto ---
      const stretch = reduced ? 0 : clamp(-anim.jump.velocity * 0.0016, -0.09, 0.12);
      const sy = 1 + stretch + breath * 0.012;
      const sx = 1 - stretch * 0.6;

      bodyRef.current?.setAttribute(
        "transform",
        `translate(0 ${anim.jump.value.toFixed(2)}) translate(${FEET.x} ${FEET.y}) ` +
          `scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(${-FEET.x} ${-FEET.y})`,
      );
      headRef.current?.setAttribute(
        "transform",
        `translate(${anim.headX.value.toFixed(2)} ${(anim.headY.value + breathHead * 0.7).toFixed(2)}) ` +
          `rotate(${(anim.tilt.value + anim.shake.value).toFixed(2)} ${NECK.x} ${NECK.y})`,
      );
      antennaRef.current?.setAttribute(
        "transform",
        `rotate(${clamp(anim.antenna.value, -35, 35).toFixed(2)} ${ANTENNA.x} ${ANTENNA.y})`,
      );

      // --- Brazos ---
      const drawArm = (
        side: "left" | "right",
        springsOf: ArmSprings,
        path: SVGPathElement | null,
        hand: SVGCircleElement | null,
      ) => {
        const j = armJoints(side, springsOf.shoulder.value, springsOf.elbow.value);
        path?.setAttribute(
          "d",
          `M${j.shoulder.x.toFixed(2)} ${j.shoulder.y.toFixed(2)} ` +
            `L${j.elbow.x.toFixed(2)} ${j.elbow.y.toFixed(2)} L${j.hand.x.toFixed(2)} ${j.hand.y.toFixed(2)}`,
        );
        hand?.setAttribute("cx", j.hand.x.toFixed(2));
        hand?.setAttribute("cy", j.hand.y.toFixed(2));
      };
      drawArm("left", anim.left, leftArmRef.current, leftHandRef.current);
      drawArm("right", anim.right, rightArmRef.current, rightHandRef.current);

      // --- Ojos ---
      const eyeOpacity = String(Math.max(0, 1 - anim.arcs.value));
      const drawEye = (el: SVGRectElement | null, cx: number, scale: number) => {
        if (!el) return;
        const w = Math.max(anim.eyeWidth.value * scale, 0.5);
        const h = Math.max(anim.eyeHeight.value * scale * blink, 1.1);
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
        `translate(${anim.lookX.value.toFixed(2)} ${(anim.lookY.value + anim.bounce.value).toFixed(2)})`,
      );

      if (scanRef.current) {
        const sweep = reduced ? 0.5 : (t * 0.8) % 1;
        scanRef.current.setAttribute("y", (VISOR.y + sweep * (VISOR.height - 2)).toFixed(2));
        scanRef.current.setAttribute("opacity", (anim.scan.value * 0.8).toFixed(3));
      }

      // --- Luces: halo de la antena y luz del pecho ---
      if (haloRef.current) {
        const glow = p.antennaPulse && !reduced ? 0.45 + 0.4 * Math.sin(t * 7) : 0.22 + breath * 0.06;
        haloRef.current.setAttribute("opacity", glow.toFixed(3));
      }
      const chestBase = p.antennaPulse && !reduced ? 0.55 + 0.35 * Math.sin(t * 7) : 0.55 + breath * 0.15;
      const chest = clamp(chestBase + anim.chest.value * 0.1, 0.25, 1);
      chestRef.current?.setAttribute("opacity", chest.toFixed(3));
      chestGlowRef.current?.setAttribute("opacity", (chest * 0.35).toFixed(3));

      if (zzzRef.current) {
        const z = reduced ? 0 : (t % 2.6) / 2.6;
        zzzRef.current.setAttribute("y", (22 - z * 12).toFixed(2));
        zzzRef.current.setAttribute("x", (74 + Math.sin(z * Math.PI * 2) * 2).toFixed(2));
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
  const limbColor = shade(baseColor, 0.14);
  const jointColor = shade(baseColor, 0.28);
  const armWidth = 5.4;

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
          <rect x={VISOR.x} y={VISOR.y} width={VISOR.width} height={VISOR.height} rx={VISOR.rx} />
        </clipPath>
      </defs>
      <g ref={bodyRef}>
        {/* Cuerpo */}
        <rect x="45" y="61" width="10" height="8" rx="2.5" fill={jointColor} />
        <rect x="34" y="67" width="32" height="23" rx="10" fill={baseColor} />
        <rect x="40" y="71" width="20" height="13" rx="6" fill={shade(baseColor, 0.07)} />
        <circle ref={chestGlowRef} cx="50" cy="77.5" r="6" fill={accentColor} opacity="0.2" />
        <circle ref={chestRef} cx="50" cy="77.5" r="2.8" fill={accentColor} opacity="0.6" />

        {/* Cabeza */}
        <g ref={headRef}>
          <g ref={antennaRef}>
            <rect x="48.6" y="9" width="2.8" height="12" rx="1.4" fill={limbColor} />
            <circle ref={haloRef} cx="50" cy="8.5" r="7.5" fill={antennaColor} opacity="0.22" />
            <circle cx="50" cy="8.5" r="4.4" fill={antennaColor} />
            <circle cx="48.6" cy="7.2" r="1.3" fill="#fff" opacity="0.7" />
          </g>
          <circle cx="16" cy="42" r="5.5" fill={limbColor} />
          <circle cx="16" cy="42" r="2.4" fill={jointColor} />
          <circle cx="84" cy="42" r="5.5" fill={limbColor} />
          <circle cx="84" cy="42" r="2.4" fill={jointColor} />
          <rect x="18" y="20" width="64" height="44" rx="18" fill={baseColor} />
          <rect
            x={VISOR.x}
            y={VISOR.y}
            width={VISOR.width}
            height={VISOR.height}
            rx={VISOR.rx}
            fill="#121417"
          />
          {/* Brillo del visor */}
          <path
            d={`M${VISOR.x + 6} ${VISOR.y + 4} q8 -2 16 -1`}
            stroke="#fff"
            strokeOpacity="0.12"
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          />
          <g clipPath={`url(#${clipId})`}>
            <rect ref={leftEyeRef} fill={accentColor} />
            <rect ref={rightEyeRef} fill={accentColor} />
            <g
              ref={arcsRef}
              opacity="0"
              fill="none"
              stroke={accentColor}
              strokeWidth="3.4"
              strokeLinecap="round"
            >
              <path d={`M${LEFT_X - 5.5} ${EYE_Y + 3} Q${LEFT_X} ${EYE_Y - 6} ${LEFT_X + 5.5} ${EYE_Y + 3}`} />
              <path d={`M${RIGHT_X - 5.5} ${EYE_Y + 3} Q${RIGHT_X} ${EYE_Y - 6} ${RIGHT_X + 5.5} ${EYE_Y + 3}`} />
            </g>
            <rect ref={scanRef} x={VISOR.x} width={VISOR.width} height="2" fill={accentColor} opacity="0" />
          </g>
          <text
            ref={zzzRef}
            x="74"
            y="22"
            fontSize="12"
            fontWeight="700"
            fontFamily="system-ui, sans-serif"
            fill={accentColor}
            opacity="0"
          >
            z
          </text>
        </g>

        {/* Brazos: delante de todo, para que las manos se vean al saludar o pensar */}
        <path
          ref={leftArmRef}
          fill="none"
          stroke={limbColor}
          strokeWidth={armWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          d={`M36 71 l0 ${UPPER_ARM} l0 ${FOREARM}`}
        />
        <path
          ref={rightArmRef}
          fill="none"
          stroke={limbColor}
          strokeWidth={armWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          d={`M64 71 l0 ${UPPER_ARM} l0 ${FOREARM}`}
        />
        <circle ref={leftHandRef} cx="36" cy="95" r="3.6" fill={baseColor} stroke={jointColor} strokeWidth="1" />
        <circle ref={rightHandRef} cx="64" cy="95" r="3.6" fill={baseColor} stroke={jointColor} strokeWidth="1" />

        <circle cx="36" cy="71" r="3" fill={jointColor} />
        <circle cx="64" cy="71" r="3" fill={jointColor} />
      </g>
    </svg>
  );
}
