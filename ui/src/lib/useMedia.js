import { useEffect, useState } from "react";

export function useMedia(query) {
  const [on, setOn] = useState(
    () => typeof window !== "undefined"
      && Boolean(window.matchMedia?.(query).matches));

  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const read = () => setOn(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, [query]);

  return on;
}

// Matches Tailwind's lg, the width the wide diagram layouts are drawn for.
export const useNarrow = () => useMedia("(max-width: 1023px)");
