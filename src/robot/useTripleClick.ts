import { useRef } from "react";

/** Llama a `onTriple` si se hacen 3 clics seguidos en menos de `windowMs`. */
export function useTripleClick(onTriple: () => void, windowMs = 650): () => void {
  const clicks = useRef<number[]>([]);
  return () => {
    const now = performance.now();
    clicks.current = [...clicks.current.filter((t) => now - t < windowMs), now];
    if (clicks.current.length >= 3) {
      clicks.current = [];
      onTriple();
    }
  };
}
