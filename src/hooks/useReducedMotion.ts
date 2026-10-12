import { useEffect, useState } from "react";
import type { MotionPreference } from "../persistence/settings";

const QUERY = "(prefers-reduced-motion: reduce)";

export function useReducedMotion(preference: MotionPreference): boolean {
  const [system, setSystem] = useState(() => typeof window !== "undefined" && window.matchMedia?.(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const onChange = () => setSystem(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  if (preference === "reduced") return true;
  if (preference === "full") return false;
  return system;
}
