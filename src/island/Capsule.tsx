import { useEffect, useRef, type ReactNode } from "react";
import { Spring, SPRINGS } from "../lib/spring";
import { useReducedMotion } from "../lib/useReducedMotion";
import type { CapsuleGeometry } from "./sizes";

interface Props {
  geometry: CapsuleGeometry;
  x: number;
  top: number;
  visible: boolean;
  capturing: boolean;
  onClick: () => void;
  children: ReactNode;
}

/**
 * La cápsula negra. Su tamaño se anima con muelles escribiendo directamente en
 * el estilo (sin re-render de React en cada fotograma).
 */
export function Capsule({ geometry, x, top, visible, capturing, onClick, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const springs = useRef({
    width: new Spring(geometry.width, SPRINGS.snappy),
    height: new Spring(geometry.height, SPRINGS.snappy),
    radius: new Spring(geometry.radius, SPRINGS.snappy),
    x: new Spring(x, SPRINGS.snappy),
  });

  useEffect(() => {
    const s = springs.current;
    s.width.target = geometry.width;
    s.height.target = geometry.height;
    s.radius.target = geometry.radius;
    s.x.target = x;
    const all = [s.width, s.height, s.radius, s.x];

    const apply = () => {
      const el = ref.current;
      if (!el) return;
      el.style.width = `${s.width.value}px`;
      el.style.height = `${Math.max(s.height.value, 0)}px`;
      el.style.borderRadius = `${Math.max(s.radius.value, 0)}px`;
      el.style.transform = `translateX(${s.x.value}px)`;
    };

    if (reducedMotion) {
      all.forEach((sp) => sp.snap());
      apply();
      return;
    }

    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const settled = all.map((sp) => sp.step(dt)).every(Boolean);
      apply();
      if (!settled) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [geometry.width, geometry.height, geometry.radius, x, reducedMotion]);

  return (
    <div
      ref={ref}
      className={`capsule${visible ? " is-visible" : ""}${capturing ? " is-capturing" : ""}`}
      style={{ top }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
