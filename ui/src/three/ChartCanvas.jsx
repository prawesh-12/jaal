import { Canvas, useThree } from "@react-three/fiber";
import { createContext, useContext, useLayoutEffect, useMemo } from "react";

import { CanvasHost } from "@/three/CanvasHost";

const Scale = createContext(1);

/* Screen-space <Html> is sized in pixels, so anything meant to sit inside a
   mesh has to be told how many pixels one world unit is worth. */
export const usePxPerUnit = () => useContext(Scale);

function Fit({ width, height, children }) {
  const { camera, size, invalidate } = useThree();
  const zoom = Math.min(size.width / width, size.height / height) || 1;

  useLayoutEffect(() => {
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, zoom, invalidate]);

  const value = useMemo(() => zoom, [zoom]);
  return <Scale.Provider value={value}>{children}</Scale.Provider>;
}

/* Orthographic, so a bar twice as long is twice the value on screen. A
   perspective camera would quietly lie about every length in the scene. */
export function ChartCanvas({ children, width, height, lights, className }) {
  return (
    <CanvasHost className={className}>
      <Canvas
        orthographic
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [0, 0, 100], near: 0.1, far: 400 }}
      >
        <Fit width={width} height={height}>
          {lights ?? (
            <>
              <ambientLight intensity={2.3} />
              <directionalLight position={[-30, 40, 60]} intensity={0.55} />
            </>
          )}
          {children}
        </Fit>
      </Canvas>
    </CanvasHost>
  );
}
