import { useEffect, useState } from "react";

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(q.matches);
    q.addEventListener("change", onChange);
    return () => q.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
