import { useEffect, useRef, useState } from "react";

// Lets a permanently animating scene stop while it is off screen.
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
