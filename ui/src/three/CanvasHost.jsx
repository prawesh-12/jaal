import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { cn } from "@/lib/utils";

/*
  Canvas colour has to match DOM painted with the same token. With colour
  management on, a colour buffer is left unconverted and comes out at its
  linear value, which is near-black against the dark theme.
*/
THREE.ColorManagement.enabled = false;

/*
  Two jobs. It holds the canvas back until the host is confirmed to be in the
  document, because a page switch can detach the panel while r3f is still one
  frame away from attaching its pointer handlers, and it fills its box by
  position rather than by percentage, which a flex parent does not resolve.
*/
export function CanvasHost({ children, className }) {
  const host = useRef(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (host.current?.isConnected) setLive(true);
    });
    return () => {
      cancelAnimationFrame(id);
      setLive(false);
    };
  }, []);

  return (
    <div className={cn("relative h-full w-full", className)}>
      <div ref={host} className="absolute inset-0">
        {live && children}
      </div>
    </div>
  );
}
