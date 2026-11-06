// Procedural surface detail for standard/physical materials: GLSL patterns (ashlar stone, roof
// tiles, timber, plaster, cobbles, flagstones, fabric, rock) projected triplanar in object or world
// space, with colour variation, roughness variation and derivative bump mapping. No image files,
// crisp at any zoom, and the same look on the table and in the card art.

import * as THREE from 'three';

const NOISE = /* glsl */`
float pH21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float pNoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(pH21(i), pH21(i + vec2(1, 0)), u.x), mix(pH21(i + vec2(0, 1)), pH21(i + vec2(1, 1)), u.x), u.y); }
float pFbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * pNoise(p); p *= 2.03; a *= .5; } return s; }
vec2 pCell(vec2 p){ // worley: x = F1, y = F2 - F1
  vec2 i = floor(p), f = fract(p); float d1 = 8., d2 = 8.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y); vec2 o = vec2(pH21(i + g), pH21(i + g + 17.1));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return vec2(d1, d2 - d1);
}
float pEdge(vec2 f, vec2 size){ vec2 e = min(f, 1. - f) * size; return min(e.x, e.y); }
`;

// Each pattern: void pat(vec2 uv, out vec3 col, out float h) — col multiplies albedo, h is relief 0..1.
const PATTERNS = {
  ashlar: `
    vec2 bs = vec2(.36, .18); float row = floor(uv.y / bs.y);
    vec2 g = vec2(uv.x / bs.x + mod(row, 2.) * .5, uv.y / bs.y);
    vec2 cell = floor(g), f = fract(g);
    float m = smoothstep(.006, .03, pEdge(f, bs));
    float n = pFbm(uv * 14.);
    h = m * (.75 + .25 * n);
    col = vec3(mix(.62, .88 + .14 * pH21(cell), m) * (.94 + .1 * pFbm(uv * 4.)));
    col *= mix(vec3(1.), vec3(1.04, .98, .92), pH21(cell + 3.));`,
  plaster: `
    float n = pFbm(uv * 4.5), d = pFbm(uv * 22.);
    h = d * .5;
    col = vec3(.88 + .16 * n) * mix(vec3(1.), vec3(.96, .93, .86), smoothstep(.55, .8, pFbm(uv * 1.7 + 9.)));`,
  tiles: `
    vec2 ts = vec2(.13, .1); float row = floor(uv.y / ts.y);
    vec2 g = vec2(uv.x / ts.x + mod(row, 2.) * .5, uv.y / ts.y);
    vec2 cell = floor(g), f = fract(g);
    float arc = .22 * (1. - pow(abs(f.x * 2. - 1.), 2.));
    float lip = smoothstep(.0, .12, f.y - arc + .1) * smoothstep(.0, .06, min(f.x, 1. - f.x));
    h = lip * (.55 + .45 * f.y);
    col = vec3(mix(.55, .84 + .2 * pH21(cell), lip)) * (.94 + .1 * pFbm(uv * 6.));`,
  timber: `
    float pw = .12; float k = floor(uv.x / pw); float fx = fract(uv.x / pw);
    float grain = sin(uv.y * 42. + pFbm(vec2(k * 3.1, uv.y * 2.5)) * 9.) * .5 + .5;
    float m = smoothstep(.0, .08, min(fx, 1. - fx));
    h = m * (.7 + .3 * grain);
    col = vec3(mix(.45, .78 + .2 * pH21(vec2(k, 1.)) + .18 * grain, m));`,
  woodgrain: `
    float n = pFbm(vec2(uv.x * .35, uv.y * 6.));
    float rings = sin((uv.y * 3.2 + n * 6.) * 6.2831) * .5 + .5;
    h = rings * .25 + pNoise(uv * vec2(4., 160.)) * .15;
    col = vec3(.78 + .32 * rings * (.6 + .4 * n));`,
  cobble: `
    vec2 c = pCell(uv * 5.);
    float m = smoothstep(.03, .14, c.y);
    h = m * (1. - c.x * .5);
    col = vec3(mix(.55, .84 + .16 * pH21(floor(uv * 5.)), m)) * (.94 + .1 * pFbm(uv * 10.));`,
  flagstone: `
    vec2 c = pCell(uv * 0.9);
    float m = smoothstep(.015, .07, c.y);
    h = m * (.6 + .4 * pFbm(uv * 5.));
    col = vec3(mix(.62, .82 + .2 * pNoise(floor(uv * 3.6)), m)) * (.88 + .18 * pFbm(uv * 2.));`,
  fabric: `
    float w = sin(uv.x * 900.) * sin(uv.y * 900.) * .5 + .5;
    float n = pFbm(uv * 3.);
    h = w * .35 + pNoise(uv * 120.) * .3;
    col = vec3(.9 + .16 * n + .05 * w);`,
  rock: `
    float n = pFbm(uv * 3.5), d = pFbm(uv * 15.);
    h = n * .7 + d * .3;
    col = vec3(.75 + .35 * n);`,
  brushed: `
    h = pNoise(vec2(uv.x * 2., uv.y * 300.)) * .25;
    col = vec3(.96 + .08 * pNoise(uv * 3.));`,
};

const cache = new Map();

// Patch a material in place. opts: { pattern, scale, bump, world, rough }
export function pattern(material, { pattern: name, scale = 1, bump = 0.02, world = false, rough = 0.3 } = {}) {
  const body = PATTERNS[name];
  if (!body) return material;
  material.onBeforeCompile = sh => {
    sh.uniforms.uPScale = { value: scale };
    sh.uniforms.uPBump = { value: bump };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPPos; varying vec3 vPNrm;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${world ? 'vPPos = (modelMatrix * vec4(transformed, 1.)).xyz; vPNrm = normalize(mat3(modelMatrix) * objectNormal);'
        : 'vPPos = transformed; vPNrm = objectNormal;'}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPPos; varying vec3 vPNrm; uniform float uPScale; uniform float uPBump;
        ${NOISE}
        void pPat(vec2 uv, out vec3 col, out float h) { ${body} }
        void pTri(out vec3 c, out float h) {
          vec3 w = pow(abs(normalize(vPNrm)), vec3(6.)); w /= (w.x + w.y + w.z);
          vec3 p = vPPos * uPScale; vec3 c1, c2, c3; float h1, h2, h3;
          if (w.x > .01) pPat(p.zy, c1, h1); else { c1 = vec3(0.); h1 = 0.; }
          if (w.y > .01) pPat(p.xz, c2, h2); else { c2 = vec3(0.); h2 = 0.; }
          if (w.z > .01) pPat(p.xy, c3, h3); else { c3 = vec3(0.); h3 = 0.; }
          c = c1 * w.x + c2 * w.y + c3 * w.z; h = h1 * w.x + h2 * w.y + h3 * w.z;
          float fw = length(fwidth(p));
          float fade = smoothstep(.012, .05, fw);
          c = mix(c, vec3(.86), fade); h = mix(h, .5, fade);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 pC; float pHgt; pTri(pC, pHgt); diffuseColor.rgb *= pC;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (1. + ${rough.toFixed(3)} * (1. - pHgt) - ${(rough / 2).toFixed(3)}), .04, 1.);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          float hx = dFdx(pHgt), hy = dFdy(pHgt);
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1) * faceDirection;
          vec3 grad = sign(det) * (hx * r1 + hy * r2);
          normal = normalize(abs(det) * normal - grad * uPBump);
        }`);
  };
  material.customProgramCacheKey = () => `pat:${name}:${world ? 1 : 0}:${rough}`;
  return material;
}

// Shared, cached patterned materials.
export function surface(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// A warm, candle-lit hall for image-based lighting: gold and varnish reflect flames and a cool
// window instead of a neutral grey studio.
export function warmEnvironment() {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(30, 14, 30), new THREE.MeshBasicMaterial({ color: 0x120d09, side: THREE.BackSide }));
  room.position.y = 5;
  env.add(room);
  const panel = (w, h, color, k, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    env.add(m);
  };
  panel(10, 10, 0xffd8a8, 2.4, [0, 11.5, 0], [0, 0, 0]);       // warm chandelier glow overhead
  panel(5, 7, 0x9fb7ff, 3.2, [-14.5, 6, -4], [0, 4, 0]);        // cool moonlit window
  panel(3, 3, 0xff9a48, 5, [9, 3, 9], [0, 2, 0]);               // candle cluster
  panel(3, 3, 0xff9a48, 4, [-8, 3, 10], [0, 2, 0]);
  panel(30, 4, 0x3a2614, 1.2, [0, -1.8, 0], [0, 10, 0]);        // warm bounce from the floor
  return env;
}
