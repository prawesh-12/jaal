import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

export const SURFACE = { roughness: 0.6, metalness: 0.05 };

export function slab({ w, h, d, r = 1.1, bevel = 0.85 }) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  const c = Math.min(r, w / 2 - 0.01, h / 2 - 0.01);
  s.moveTo(x + c, y);
  s.lineTo(x + w - c, y);
  s.quadraticCurveTo(x + w, y, x + w, y + c);
  s.lineTo(x + w, y + h - c);
  s.quadraticCurveTo(x + w, y + h, x + w - c, y + h);
  s.lineTo(x + c, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - c);
  s.lineTo(x, y + c);
  s.quadraticCurveTo(x, y, x + c, y);

  const cap = Math.min(bevel, c * 0.8, d / 2.5);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(d - cap * 2, 0.1),
    bevelEnabled: cap > 0.05,
    bevelThickness: cap,
    bevelSize: cap,
    bevelSegments: 3,
    curveSegments: 10,
  });
  geo.center();
  return geo;
}

export function useSlab(size) {
  const key = `${size.w}|${size.h}|${size.d}|${size.r}|${size.bevel}`;
  const geo = useMemo(() => slab(size), [key]);   // eslint-disable-line
  useEffect(() => () => geo.dispose(), [geo]);
  return geo;
}

export function shadowTexture() {
  if (typeof document === "undefined") return null;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0,
                                     size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(0,0,0,0.42)");
  g.addColorStop(0.5, "rgba(0,0,0,0.18)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

let sharedShadow;

export function useShadow() {
  return useMemo(() => {
    if (sharedShadow === undefined) sharedShadow = shadowTexture();
    return sharedShadow;
  }, []);
}

export function Shadow({ w, h, z, offset = [1.4, -2] }) {
  const tex = useShadow();
  if (!tex) return null;
  return (
    <mesh position={[offset[0], offset[1], z]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

export class Spring {
  constructor(stiffness = 260, damping = 31) {
    this.k = stiffness;
    this.c = damping;
    this.x = 0;
    this.v = 0;
    this.target = 0;
  }

  step(dt) {
    const h = Math.min(dt, 0.033);
    this.v += (-this.k * (this.x - this.target) - this.c * this.v) * h;
    this.x += this.v * h;
    return this.x;
  }

  get settled() {
    return Math.abs(this.v) < 0.002 && Math.abs(this.x - this.target) < 0.002;
  }
}

export function useSpring(target, stiffness, damping) {
  const spring = useRef(new Spring(stiffness, damping));
  spring.current.target = target;
  return spring.current;
}

// The key grazes rather than faces the subject, so front faces keep their own
// colour and the shading lands on the bevels.
export function SceneLights({ ground = "#ffffff", key: keyLight = 0.9 }) {
  return (
    <>
      <ambientLight intensity={0.66} />
      <hemisphereLight args={["#ffffff", ground, 0.34]} />
      <directionalLight position={[-60, 42, 14]} intensity={keyLight} />
      <directionalLight position={[52, -22, 30]} intensity={0.3} />
      <directionalLight position={[0, 12, -60]} intensity={0.32} />
    </>
  );
}

const FLOW_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FLOW_FRAG = `
  uniform vec3 uRest;
  uniform vec3 uLive;
  uniform float uHead;
  varying vec2 vUv;
  void main() {
    float lead = smoothstep(uHead + 0.05, uHead - 0.02, vUv.x);
    float tail = smoothstep(uHead - 0.5, uHead - 0.06, vUv.x);
    gl_FragColor = vec4(mix(uRest, uLive, lead * tail), 1.0);
  }
`;

// `head` is read every frame: the band's position in 0..1 along the rail.
// Anything outside that range leaves the rail at rest.
export function Rail({ ax, ay, bx, by, z = 0, weight = 0.7, rest, live, head,
                       arrow = false }) {
  const material = useRef();
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);

  const uniforms = useMemo(() => ({
    uRest: { value: new THREE.Color() },
    uLive: { value: new THREE.Color() },
    uHead: { value: -1 },
  }), []);

  useEffect(() => {
    uniforms.uRest.value.set(rest);
    uniforms.uLive.value.set(live ?? rest);
  }, [rest, live, uniforms]);

  useFrame(() => {
    if (material.current && head) material.current.uniforms.uHead.value = head();
  });

  const body = len - (arrow ? 3 : 0);

  return (
    <group position={[(ax + bx) / 2, (ay + by) / 2, z]}
           rotation={[0, 0, Math.atan2(dy, dx)]}>
      <mesh position={[arrow ? -1.5 : 0, 0, 0]}>
        <planeGeometry args={[Math.max(body, 0.1), weight]} />
        <shaderMaterial ref={material} uniforms={uniforms}
                        vertexShader={FLOW_VERT} fragmentShader={FLOW_FRAG} />
      </mesh>
      {arrow && (
        <mesh position={[len / 2 - 1.5, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[weight * 2.4, 3, 12]} />
          <meshStandardMaterial color={rest} {...SURFACE} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

const BEAD_VERT = `
  attribute vec3 aTint;
  varying vec3 vTint;
  varying vec2 vUv;
  void main() {
    vTint = aTint;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix
                * vec4(position, 1.0);
  }
`;

/*
  A quad shaded as a sphere from its own uv. The shading is scaled by how far
  the mark has travelled from the page colour, so a mark faded out to the
  background leaves no lit rim. That is why this is a shader and not a sphere.
*/
const BEAD_FRAG = `
  uniform vec3 uPage;
  varying vec3 vTint;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;

    vec3 n = vec3(p.x, p.y, sqrt(max(0.0, 1.0 - r2)));
    float lam = clamp(dot(n, normalize(vec3(-0.42, 0.55, 0.9))), 0.0, 1.0);
    float rim = pow(1.0 - n.z, 2.5);

    float present = clamp(distance(vTint, uPage) * 4.0, 0.0, 1.0);
    vec3 lit = vTint * (0.95 + 0.1 * lam) - rim * 0.035;
    gl_FragColor = vec4(mix(vTint, lit, present), 1.0);
  }
`;

export function beadMaterial(page) {
  return new THREE.ShaderMaterial({
    uniforms: { uPage: { value: new THREE.Color(page) } },
    vertexShader: BEAD_VERT,
    fragmentShader: BEAD_FRAG,
  });
}

export function useBeadMaterial(page) {
  const material = useMemo(() => beadMaterial(page), []);   // eslint-disable-line
  useEffect(() => {
    material.uniforms.uPage.value.set(page);
  }, [page, material]);
  useEffect(() => () => material.dispose(), [material]);
  return material;
}
