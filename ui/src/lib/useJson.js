import { useEffect, useState } from "react";

// The UI computes nothing. Everything on screen is a file the pipeline wrote.
export function useJson(name) {
  const [state, setState] = useState({ data: null, loading: true });
  useEffect(() => {
    let live = true;
    fetch(`/data/${name}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setState({ data: d, loading: false }))
      .catch(() => live && setState({ data: null, loading: false }));
    return () => {
      live = false;
    };
  }, [name]);
  return state;
}
