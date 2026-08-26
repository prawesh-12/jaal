import { useEffect, useState } from "react";

/*
  Motion is done in CSS, not JavaScript. Two reasons, and the second is the
  one that matters:

    - the style engine guarantees the finished state through
      animation-fill-mode, so a stalled frame loop or a slow device leaves a
      diagram fully drawn rather than blank
    - nothing that carries information is ever gated behind a script running

  The durations and easings live as --motion-* and --ease-* tokens in
  index.css. This hook is only for the handful of places that need to know
  the preference in JavaScript, such as skipping an auto-advance timer.
*/
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
