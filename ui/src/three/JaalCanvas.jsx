import { Canvas } from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import { useEffect, useState } from "react";

import { CanvasHost } from "@/three/CanvasHost";

const TOKENS = [
  "base",
  "surface",
  "line",
  "line-strong",
  "fg",
  "fg-2",
  "fg-muted",
  "fg-faint",
  "fg-dim",
  "accent",
  "ok",
  "warn",
  "bad",
  "info",
];

/* The scene takes its colours from the stylesheet, so one theme drives both.
   Falls back off-DOM, where the view check renders these components. */
export function useThemeColors() {
  const read = () => {
    if (typeof document === "undefined") {
      return Object.fromEntries(TOKENS.map((t) => [t, "#888"]));
    }
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      TOKENS.map((t) => [
        t,
        style.getPropertyValue(`--color-${t}`).trim() || "#888",
      ]),
    );
  };
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(read()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  return colors;
}

/* Rotation is off on purpose: a fixed tilt keeps a population of 12,000
   readable, and a scene that spins tells the reader nothing. */
export function JaalCanvas({
  children,
  look = [0, 92, 104],
  target = [0, 0, 0],
  minDistance = 14,
  maxDistance = 320,
  className,
}) {
  return (
    <CanvasHost className={className}>
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: look, fov: 38, near: 0.5, far: 900 }}
      >
        <ambientLight intensity={2.1} />
        <directionalLight position={[30, 60, 20]} intensity={0.7} />
        <directionalLight position={[-40, 25, -30]} intensity={0.25} />
        <MapControls
          makeDefault
          target={target}
          enableRotate={false}
          screenSpacePanning={false}
          minDistance={minDistance}
          maxDistance={maxDistance}
          dampingFactor={0.12}
        />
        {children}
      </Canvas>
    </CanvasHost>
  );
}
