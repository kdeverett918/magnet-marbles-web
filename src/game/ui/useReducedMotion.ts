import { useEffect, useState } from "react";
import { resolveReducedMotion } from "../data/accessibility";
import { useGame } from "../store";

export function useReducedMotion(): boolean {
  const motion = useGame((s) => s.settings.motion);
  const [osPrefersReduced, setOsPrefersReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setOsPrefersReduced(query.matches);
    update();

    if (query.addEventListener) {
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }

    query.addListener(update);
    return () => query.removeListener(update);
  }, []);

  return resolveReducedMotion(motion, osPrefersReduced);
}
