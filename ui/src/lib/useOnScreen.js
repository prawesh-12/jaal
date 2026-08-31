import { useEffect, useRef, useState } from "react";

// A scene that animates forever costs a frame loop forever, so it is told when
// it has scrolled out of the viewport and can stop.
export function useOnScreen() {
  const ref = useRef(null);
  const [on, setOn] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting));
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return [ref, on];
}
