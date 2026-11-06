// The 3D table. Owns WebGL, camera, seats, buildings, coins, cards, tokens and effects.
// The scene is a projection of game state: sync(view) reconciles it (animating differences),
// fx(event) adds one-shot flourishes. It never mutates game state.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { pattern, warmEnvironment } from './materials.js?v=b3bf14c2';
import { makeBuilding, mat } from './models.js?v=b3bf14c2';
import { CHAR, HUE, SEAT_HUES } from './data.js?v=b3bf14c2';
import { emblemURL, ROMAN } from './icons.js?v=b3bf14c2';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ease = {
  out: t => 1 - (1 - t) ** 3,
  inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  back: t => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2,
  lin: t => t,
};
const PLOT_W = 7.6, PLOT_D = 4.2, TRAY_Z = 2.95;
const MOBILE = matchMedia('(pointer: coarse)').matches;

// ── procedural textures ─────────────────────────────────────────────────────
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// A round hall rug: deep madder field, ornamented borders, a gilded rosette.
const rugTex = () => canvasTex(1024, 1024, (g, w) => {
  const c = w / 2;
  const grd = g.createRadialGradient(c, c, 60, c, c, c);
  grd.addColorStop(0, '#3d1518'); grd.addColorStop(0.7, '#2a0d11'); grd.addColorStop(1, '#16070a');
  g.fillStyle = grd; g.fillRect(0, 0, w, w);
  g.translate(c, c);
  const ring = (r, lw, col) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
  ring(500, 18, '#1a2a3a'); ring(486, 4, '#c99a52'); ring(440, 3, '#c99a52'); ring(420, 30, '#14233a'); ring(400, 3, '#c99a52');
  for (let i = 0; i < 48; i++) { // border motifs
    g.save(); g.rotate((i / 48) * Math.PI * 2); g.translate(0, -462);
    g.fillStyle = i % 2 ? '#c99a52' : '#8f3a2c';
    g.beginPath(); g.moveTo(0, -14); g.lineTo(10, 0); g.lineTo(0, 14); g.lineTo(-10, 0); g.closePath(); g.fill();
    g.restore();
  }
  for (let i = 0; i < 24; i++) { // inner band petals
    g.save(); g.rotate((i / 24) * Math.PI * 2); g.translate(0, -420);
    g.fillStyle = '#b48a4c'; g.beginPath(); g.ellipse(0, 0, 9, 18, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  g.globalAlpha = 0.18; // faint field lattice
  for (let i = 0; i < 16; i++) { g.save(); g.rotate((i / 16) * Math.PI * 2); g.strokeStyle = '#d9a95e'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -380); g.stroke(); g.restore(); }
  g.globalAlpha = 1;
  ring(120, 6, '#c99a52'); ring(90, 2, '#c99a52');
});

// Final "lens": tilt-shift miniature blur, filmic grade, vignette and grain (runs after tone mapping).
const LensShader = {
  uniforms: {
    tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
    uFocus: { value: 0.5 }, uTilt: { value: 1 }, uGrain: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uFocus, uTilt, uGrain; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float b = (smoothstep(.18, .62, vUv.y - uFocus) + .35 * smoothstep(.42, .7, uFocus - vUv.y)) * uTilt; // soften the far side, keep your own city crisp
      if (b > .002) {
        vec3 acc = c.rgb;
        for (int i = 0; i < 12; i++) {
          float a = float(i) * 2.39996, r = sqrt(float(i) + .5) / 3.5;
          acc += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * r * b * 8. / uRes).rgb;
        }
        c.rgb = acc / 13.;
      }
      float l = dot(c.rgb, vec3(.2126, .7152, .0722));
      c.rgb = mix(c.rgb * vec3(.93, 1., 1.08), c.rgb * vec3(1.06, 1., .92), smoothstep(.12, .75, l));
      c.rgb = mix(vec3(l), c.rgb, 1.08);
      c.rgb = (c.rgb - .5) * 1.05 + .5;
      vec2 q = vUv - .5; q.x *= uRes.x / uRes.y;
      c.rgb *= 1. - smoothstep(.42, 1.2, length(q)) * .6;
      c.rgb += (rnd(vUv * uRes + fract(uTime) * 97.) - .5) * .028 * uGrain;
      gl_FragColor = vec4(clamp(c.rgb, 0., 1.), c.a);
    }`,
};
const medallionTex = () => canvasTex(1024, 1024, (g, w) => {
  const c = w / 2;
  g.translate(c, c);
  g.strokeStyle = 'rgba(232,190,110,0.9)';
  g.fillStyle = 'rgba(232,190,110,0.9)';
  const ring = (r, lw) => { g.lineWidth = lw; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
  ring(500, 6); ring(482, 2); ring(300, 3); ring(180, 2);
  for (let i = 0; i < 72; i++) {
    g.save(); g.rotate((i / 72) * Math.PI * 2);
    g.lineWidth = i % 6 ? 1.5 : 4;
    g.beginPath(); g.moveTo(0, i % 6 ? -470 : -455); g.lineTo(0, -485); g.stroke();
    g.restore();
  }
  for (let i = 0; i < 8; i++) {
    g.save(); g.rotate((i / 8) * Math.PI * 2);
    const L = i % 2 ? 300 : 440, W = i % 2 ? 34 : 52;
    g.globalAlpha = i % 2 ? 0.45 : 0.75;
    g.beginPath(); g.moveTo(0, -L); g.lineTo(W, -60); g.lineTo(0, 0); g.lineTo(-W, -60); g.closePath(); g.fill();
    g.restore();
  }
  g.globalAlpha = 1;
  g.fillStyle = '#0c1a18';
  g.beginPath(); g.arc(0, 0, 120, 0, Math.PI * 2); g.fill();
  ring(120, 4);
});
const cardBackTex = () => canvasTex(256, 360, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, '#1b2740'); grd.addColorStop(1, '#0d1424');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#d9b267'; g.lineWidth = 6; g.strokeRect(12, 12, w - 24, h - 24);
  g.lineWidth = 1.5; g.strokeRect(24, 24, w - 48, h - 48);
  g.translate(w / 2, h / 2);
  for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, 0); g.lineTo(18, 70); g.lineTo(0, 110); g.lineTo(-18, 70); g.closePath(); g.stroke(); }
  g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.stroke();
});
const glowSprite = () => canvasTex(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,220,160,0.7)'); r.addColorStop(1, 'rgba(255,180,90,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});

// Character token faces (async: the emblem is an SVG image).
const emblemImg = {};
function loadEmblem(c) {
  return (emblemImg[c.id] ||= new Promise(res => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = emblemURL(c.key, c.color, 2.6);
  }));
}
function drawToken(g, s, charId, killed) {
  const c = s / 2;
  g.clearRect(0, 0, s, s);
  const grd = g.createRadialGradient(c, c * 0.8, 10, c, c, c);
  grd.addColorStop(0, charId ? '#1d2433' : '#1a2238');
  grd.addColorStop(1, '#090c14');
  g.fillStyle = grd;
  g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.fill();
  const col = charId ? CHAR[charId].color : '#d9b267';
  g.strokeStyle = col; g.lineWidth = s * 0.03;
  g.beginPath(); g.arc(c, c, c - s * 0.05, 0, Math.PI * 2); g.stroke();
  g.lineWidth = s * 0.008;
  g.beginPath(); g.arc(c, c, c - s * 0.1, 0, Math.PI * 2); g.stroke();
  if (!charId) {
    g.fillStyle = '#d9b267';
    g.font = `600 ${s * 0.32}px Cinzel, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('?', c, c + s * 0.02);
    return;
  }
  g.fillStyle = col;
  g.font = `700 ${s * 0.11}px Cinzel, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ROMAN[CHAR[charId].rank], c, s * 0.2);
  if (killed) { g.fillStyle = 'rgba(160,20,20,0.55)'; g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI * 2); g.fill(); }
}
function tokenTexture(charId, killed) {
  const t = canvasTex(256, 256, (g, s) => drawToken(g, s, charId, killed));
  if (charId) loadEmblem(CHAR[charId]).then(img => {
    if (!img) return;
    const g = t.image.getContext('2d');
    g.drawImage(img, 256 * 0.22, 256 * 0.26, 256 * 0.56, 256 * 0.56);
    if (killed) { g.strokeStyle = '#ff5a4a'; g.lineWidth = 10; g.beginPath(); g.moveTo(60, 60); g.lineTo(196, 196); g.moveTo(196, 60); g.lineTo(60, 196); g.stroke(); }
    t.needsUpdate = true;
  });
  return t;
}

// ── scene ──────────────────────────────────────────────────────────────────
export function createScene(canvas, hooks = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.6 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07080b);
  scene.fog = new THREE.FogExp2(0x07080b, 0.011);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(warmEnvironment(), 0.03).texture;
  scene.environmentIntensity = 0.55;
  const noAO = new Set(); // glows, sprites and other see-through things the AO pass must ignore

  const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 300);
  camera.position.set(0, 30, 34);

  // Film pipeline: MSAA render → ambient occlusion → bloom → tone map → lens (tilt-shift, grade, vignette, grain)
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: MOBILE ? 2 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, 4, 4);
  ao.updateGtaoMaterial({ radius: 0.85, distanceExponent: 1.5, thickness: 1.2, scale: 1.15, samples: 16 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  ao.blendIntensity = 0.9;
  const aoRender = ao.render.bind(ao);
  ao.render = (...args) => {
    noAO.forEach(o => { o.userData.wasVisible = o.visible; o.visible = false; });
    aoRender(...args);
    noAO.forEach(o => { o.visible = o.userData.wasVisible; });
  };
  ao.enabled = !MOBILE;
  composer.addPass(ao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.5, 0.8);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const lens = new ShaderPass(LensShader);
  composer.addPass(lens);

  // lights: warm key with soft shadows, candle-warm fill, cool moonlit rim
  scene.add(new THREE.HemisphereLight(0x8a9cc4, 0x2a1a10, 0.32));
  const key = new THREE.DirectionalLight(0xffd6a0, 2.7);
  key.position.set(10, 26, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.025;
  Object.assign(key.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 5, far: 70 });
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xff9f5a, 0.45);
  fill.position.set(-12, 6, 14);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x7f9cff, 1.0);
  rim.position.set(-14, 12, -18);
  scene.add(rim);
  const spot = new THREE.SpotLight(0xffe7b8, 0, 40, 0.32, 0.55, 1.2);
  spot.position.set(0, 22, 0);
  scene.add(spot, spot.target);

  // the hall: flagstones, a round rug, shafts of moonlight, distant candlelight
  const floor = new THREE.Mesh(new THREE.CircleGeometry(130, 72),
    pattern(new THREE.MeshStandardMaterial({ color: 0x241f1b, roughness: 0.9 }), { pattern: 'flagstone', scale: 0.3, world: true, bump: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -4.2;
  floor.receiveShadow = true;
  scene.add(floor);
  const shaftMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x9fb4ff) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        float edge = pow(sin(vUv.x * 3.14159), 2.);
        float fall = smoothstep(0., .35, vUv.y) * smoothstep(1., .55, vUv.y);
        float dust = .75 + .25 * sin(vUv.y * 40. + uTime * .6 + vUv.x * 20.);
        gl_FragColor = vec4(uColor, edge * edge * fall * dust * .03);
      }`,
  });
  const shafts = [[-16, 26, -18], [-6, 28, -22]].map(([x, y, z], i) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.4 + i * 0.4, 5.5 + i, 46, 32, 1, true), shaftMat);
    const target = V(x * 0.15, -3, z * 0.1);
    m.position.set(x, y, z).lerp(target, 0.5);
    m.lookAt(target);
    m.rotateX(Math.PI / 2);
    noAO.add(m);
    scene.add(m);
    return m;
  });
  const bokehGeo = new THREE.BufferGeometry();
  const BOKEH = 54, bp = new Float32Array(BOKEH * 3), bc = new Float32Array(BOKEH * 3);
  for (let i = 0; i < BOKEH; i++) {
    const a = Math.random() * Math.PI * 2, r = 48 + Math.random() * 40;
    bp.set([Math.sin(a) * r, 1 + Math.random() * 16, Math.cos(a) * r], i * 3);
    const c = new THREE.Color(Math.random() < 0.8 ? 0xffb066 : 0x9fb4ff).multiplyScalar(0.6 + Math.random() * 0.6);
    bc.set([c.r, c.g, c.b], i * 3);
  }
  bokehGeo.setAttribute('position', new THREE.BufferAttribute(bp, 3));
  bokehGeo.setAttribute('color', new THREE.BufferAttribute(bc, 3));

  const table = new THREE.Group();
  scene.add(table);
  const varnish = pattern(new THREE.MeshPhysicalMaterial({ color: 0x6b4127, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.18 }),
    { pattern: 'woodgrain', scale: 0.55, world: true, bump: 0.012 });
  const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.9, 160), varnish);
  tableTop.position.y = -0.45; tableTop.receiveShadow = true;
  const apron = new THREE.Mesh(new THREE.CylinderGeometry(0.985, 0.94, 0.5, 160), varnish);
  apron.position.y = -1.1;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, 3.4, 48), varnish);
  leg.position.y = -2.5;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.3, 48), varnish);
  foot.position.y = -4.05;
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.04, 160),
    pattern(new THREE.MeshStandardMaterial({ color: 0x14403a, roughness: 1 }), { pattern: 'fabric', scale: 1, world: true, bump: 0.006 }));
  felt.position.y = 0.01; felt.receiveShadow = true;
  const trim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.006, 8, 200), mat('gold'));
  trim.rotation.x = Math.PI / 2; trim.position.y = 0.03;
  const medallion = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64),
    new THREE.MeshStandardMaterial({ map: medallionTex(), transparent: true, metalness: 0.8, roughness: 0.3, depthWrite: false }));
  medallion.rotation.x = -Math.PI / 2; medallion.position.y = 0.035; medallion.receiveShadow = true;
  noAO.add(medallion);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1, 120),
    pattern(new THREE.MeshStandardMaterial({ map: rugTex(), color: 0xb0a8a0, roughness: 1 }), { pattern: 'fabric', scale: 0.7, world: true, bump: 0.01 }));
  rug.rotation.x = -Math.PI / 2; rug.position.y = -4.17; rug.scale.set(1.22, 1.22, 1); rug.receiveShadow = true;
  table.add(tableTop, apron, leg, foot, felt, trim, medallion, rug);
  const bokeh = new THREE.Points(bokehGeo, new THREE.PointsMaterial({ size: 3.2, map: glowSprite(), vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  noAO.add(bokeh);
  scene.add(bokeh);

  // candles on the rim
  const candles = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.7, 20), mat('ivory'));
    wax.position.y = 0.35; wax.castShadow = true;
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.08, 28), mat('gold'));
    const dish = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 10, 32), mat('gold'));
    dish.rotation.x = Math.PI / 2; dish.position.y = 0.08;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 12), new THREE.MeshBasicMaterial({ color: 0xffd08a }));
    flame.position.y = 0.82;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0xffa050, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.y = 0.85; halo.scale.setScalar(0.9);
    noAO.add(halo);
    const light = new THREE.PointLight(0xff9a40, 5, 14, 1.6);
    light.position.y = 1.0;
    g.add(wax, holder, dish, flame, halo, light);
    table.add(g);
    candles.push({ g, flame, halo, light, seed: Math.random() * 100 });
  }

  // deck in the centre
  const backTex = cardBackTex();
  const cardMat = [mat('ivory'), mat('ivory'), new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.55 }), mat('ivory'), mat('ivory'), mat('ivory')];
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1, 1.6), cardMat);
  deck.castShadow = deck.receiveShadow = true;
  deck.rotation.y = 0.18;
  scene.add(deck);
  const setDeck = n => { const h = Math.max(0.02, n * 0.016); deck.scale.y = h; deck.position.y = 0.04 + h / 2; deck.visible = n > 0; };

  // crown
  const crown = new THREE.Group();
  {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.32, 0.22, 32, 1, true), mat('gold'));
    band.material.side = THREE.DoubleSide;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 10, 40), mat('gold'));
    lip.rotation.x = Math.PI / 2; lip.position.y = -0.1;
    crown.add(band, lip);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 8), mat('gold'));
      spike.position.set(Math.sin(a) * 0.35, 0.22, Math.cos(a) * 0.35);
      const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), mat('ivory'));
      pearl.position.set(Math.sin(a) * 0.35, 0.36, Math.cos(a) * 0.35);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), i % 2 ? mat('magic') : new THREE.MeshStandardMaterial({ color: 0xff5050, emissive: 0xc01818, emissiveIntensity: 2 }));
      gem.position.set(Math.sin(a) * 0.37, 0.02, Math.cos(a) * 0.37);
      crown.add(spike, pearl, gem);
    }
    crown.traverse(o => { o.castShadow = true; });
    crown.scale.setScalar(1.3);
  }
  scene.add(crown);
  const crownState = { pid: null, pos: V(0, 2, 0) };

  // ambient embers
  const EMBERS = MOBILE ? 140 : 260;
  const emberGeo = new THREE.BufferGeometry();
  const ep = new Float32Array(EMBERS * 3);
  for (let i = 0; i < EMBERS; i++) { ep[i * 3] = (Math.random() - 0.5) * 44; ep[i * 3 + 1] = Math.random() * 14; ep[i * 3 + 2] = (Math.random() - 0.5) * 44; }
  emberGeo.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  const sprite = glowSprite();
  const embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({
    size: 0.16, map: sprite, color: 0xffb46a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  noAO.add(embers);
  scene.add(embers);

  // ── animation system ──
  const anims = [];
  let calm = false; // 'reduce motion': quicker tweens, no particle bursts, the camera settles instead of drifting
  const tween = (dur, fn, e = ease.out) => new Promise(res => anims.push({ t: 0, dur: calm ? dur * 0.3 : dur, fn, e, res }));
  const wait = ms => tween(ms / 1000, () => {});
  const bursts = [];
  function burst(pos, { count = 24, color = 0xffd08a, speed = 2.2, life = 0.9, size = 0.22, up = 1.2, spread = 1 } = {}) {
    if (calm) return;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3), v = [];
    for (let i = 0; i < count; i++) {
      p.set([pos.x, pos.y, pos.z], i * 3);
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      v.push(V(Math.cos(a) * s * spread, up * (0.5 + Math.random()), Math.sin(a) * s * spread));
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ size, map: sprite, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(g, m);
    scene.add(pts);
    noAO.add(pts);
    bursts.push({ pts, v, t: 0, life });
  }

  // ── seats ──
  let layout = { n: 0, me: 0, key: '' };
  const seats = new Map();
  const coinGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.065, 22);
  const tokenGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.08, 56);
  const tokenRimGeo = new THREE.TorusGeometry(0.6, 0.045, 12, 56);
  const slabShape = (() => {
    const w = PLOT_W / 2, d = PLOT_D / 2, r = 0.5, s = new THREE.Shape();
    s.moveTo(-w + r, -d); s.lineTo(w - r, -d); s.quadraticCurveTo(w, -d, w, -d + r); s.lineTo(w, d - r);
    s.quadraticCurveTo(w, d, w - r, d); s.lineTo(-w + r, d); s.quadraticCurveTo(-w, d, -w, d - r); s.lineTo(-w, -d + r);
    s.quadraticCurveTo(-w, -d, -w + r, -d);
    return s;
  })();
  const slabGeo = new THREE.ExtrudeGeometry(slabShape, { depth: 0.22, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.06, bevelSegments: 3 });
  slabGeo.rotateX(-Math.PI / 2);
  const slabMat = pattern(new THREE.MeshStandardMaterial({ color: 0x4a4036, roughness: 0.82 }), { pattern: 'ashlar', scale: 1, bump: 0.03 });
  const tileGeo = new THREE.BoxGeometry(1, 0.05, 1);
  const tileMat = pattern(new THREE.MeshStandardMaterial({ color: 0x40372e, roughness: 0.92 }), { pattern: 'cobble', scale: 1.6, bump: 0.025 });
  const glowGeo = new THREE.ShapeGeometry(slabShape, 24).rotateX(-Math.PI / 2);
  const rimGeo = new THREE.BufferGeometry().setFromPoints(slabShape.getSpacedPoints(80).map(p => V(p.x * 0.97, 0, -p.y * 0.95)));
  const poleGeo = new THREE.CylinderGeometry(0.035, 0.045, 2.5, 8);

  function makeSeat(pid) {
    const group = new THREE.Group();
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.receiveShadow = true; slab.castShadow = true;
    slab.userData.pid = pid;
    const halo = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: 0xffc06a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(1.08, 1, 1.12); halo.position.y = 0.02;
    noAO.add(halo);
    const tiles = new THREE.Group();
    const city = new THREE.Group();
    city.position.y = 0.36;
    tiles.position.y = 0.33;
    const coins = new THREE.InstancedMesh(coinGeo, mat('gold'), 48);
    coins.castShadow = true; coins.count = 0;
    coins.position.set(2.6, 0.06, TRAY_Z);
    const cards = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1, 1.32), cardMat);
    cards.castShadow = true;
    cards.position.set(-2.6, 0, TRAY_Z); cards.rotation.y = -0.12;
    const tokens = new THREE.Group();
    tokens.position.set(0, 0.06, TRAY_Z);
    // brass rim + a heraldic banner in the seat's colour
    const rim = new THREE.LineLoop(rimGeo, new THREE.LineBasicMaterial({ color: 0xd9b267, transparent: true, opacity: 0.55 }));
    rim.position.y = 0.3;
    const hue = new THREE.Color(SEAT_HUES[pid % SEAT_HUES.length]);
    const pole = new THREE.Mesh(poleGeo, mat('gold'));
    pole.position.set(-PLOT_W / 2 + 0.25, 1.25, -PLOT_D / 2 + 0.25);
    pole.castShadow = true;
    const flagGeo = new THREE.PlaneGeometry(1.0, 0.62, 12, 4).translate(0.5, 0, 0);
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: hue, roughness: 0.75, side: THREE.DoubleSide, emissive: hue, emissiveIntensity: 0.12 }));
    flag.position.set(pole.position.x + 0.03, 2.05, pole.position.z);
    flag.castShadow = true;
    flag.userData.base = flagGeo.attributes.position.array.slice();
    group.add(halo, slab, rim, tiles, city, coins, cards, tokens, pole, flag);
    scene.add(group);
    return { pid, group, slab, halo, tiles, city, coins, cards, tokens, flag, buildings: new Map(), tokenKeys: [], gold: 0, nCards: 0, cap: 0, active: 0 };
  }
  function disposeSeat(s) {
    scene.remove(s.group);
    s.flag.geometry.dispose(); s.flag.material.dispose();
    s.halo.material.dispose();
    noAO.delete(s.halo);
    s.group.children.forEach(o => { if (o.isLineLoop) o.material.dispose(); });
    s.city.traverse(o => { if (o.userData.hl) { o.material.dispose(); o.material = o.userData.hl; } });
  }
  function waveFlag(flag, t, k) {
    const pos = flag.geometry.attributes.position, base = flag.userData.base;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      pos.setZ(i, Math.sin(x * 4.2 - t * 3.2 + k) * 0.09 * x);
      pos.setY(i, base[i * 3 + 1] - x * 0.05);
    }
    pos.needsUpdate = true;
    flag.geometry.computeVertexNormals();
  }

  function slotPos(seat, i, cap) {
    const cols = Math.max(4, Math.ceil(cap / 2));
    const sp = Math.min(1.82, 7.0 / cols);
    const row = i < cols ? 0 : 1, col = i % cols;
    return { x: (col - (cols - 1) / 2) * sp, z: row ? -0.95 : 0.95, s: (sp / 1.82) * 1.16 };
  }
  function layoutTiles(seat, cap) {
    if (seat.cap === cap) return;
    seat.cap = cap;
    seat.tiles.clear();
    for (let i = 0; i < cap; i++) {
      const p = slotPos(seat, i, cap);
      const t = new THREE.Mesh(tileGeo, tileMat);
      t.scale.set(1.4 * p.s, 1, 1.4 * p.s); t.position.set(p.x, 0, p.z); t.receiveShadow = true;
      seat.tiles.add(t);
    }
  }

  function setCoins(seat, n) {
    seat.gold = n;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    const stacks = [[0, 0], [0.45, 0.05], [0.2, -0.42], [-0.25, -0.38], [0.66, -0.4], [-0.45, 0.08]];
    const shown = Math.min(n, 48);
    for (let i = 0; i < shown; i++) {
      const [sx, sz] = stacks[Math.floor(i / 8) % stacks.length], j = i % 8;
      const jx = Math.sin(i * 12.9898) * 0.025, jz = Math.cos(i * 78.233) * 0.025;
      q.setFromEuler(new THREE.Euler(0, i, 0));
      m.compose(V(sx + jx, j * 0.058, sz + jz), q, V(1, 1, 1));
      seat.coins.setMatrixAt(i, m);
    }
    seat.coins.count = shown;
    seat.coins.instanceMatrix.needsUpdate = true;
  }
  function setCards(seat, n) {
    seat.nCards = n;
    const h = Math.max(0.02, n * 0.035);
    seat.cards.scale.y = h; seat.cards.position.y = 0.04 + h / 2; seat.cards.visible = n > 0;
  }

  // One material per character state, shared by every token (no per-round texture churn).
  const tokenMats = new Map();
  const tokenMat = key => {
    if (!tokenMats.has(key)) {
      const [c, k] = key.split('|').map(Number);
      tokenMats.set(key, new THREE.MeshStandardMaterial({ map: tokenTexture(c || null, !!k), roughness: 0.45, metalness: 0.2 }));
    }
    return tokenMats.get(key);
  };
  function tokenMesh(charId, killed) {
    const disc = new THREE.Mesh(tokenGeo, [mat('gold'), tokenMat(`${charId || 0}|${killed ? 1 : 0}`), tokenMat('0|0')]);
    const rimRing = new THREE.Mesh(tokenRimGeo, mat('gold'));
    rimRing.rotation.x = Math.PI / 2;
    disc.castShadow = rimRing.castShadow = true;
    const m = new THREE.Group();
    m.add(disc, rimRing);
    m.castShadow = true;
    return m;
  }
  function setTokens(seat, list, animate) {
    const keys = list.map(t => `${t.charId || 0}|${t.killed ? 1 : 0}`);
    if (keys.join() === seat.tokenKeys.join()) return;
    const prev = seat.tokenKeys;
    seat.tokenKeys = keys;
    seat.tokens.clear();
    list.forEach((t, i) => {
      const m = tokenMesh(t.charId, t.killed);
      m.position.x = (i - (list.length - 1) / 2) * 1.35;
      seat.tokens.add(m);
      const was = prev[i];
      if (!animate) return;
      if (!was) { // dropped in
        m.position.y = 2.5;
        tween(0.55, k => { m.position.y = 2.5 * (1 - k); }, ease.out);
      } else if (was.startsWith('0|') && t.charId) { // flip reveal
        tween(0.6, k => { m.rotation.z = Math.PI * (1 - k); m.position.y = Math.sin(k * Math.PI) * 0.8; }, ease.inOut);
      }
    });
  }

  function addBuilding(seat, card, i, cap, animate) {
    const p = slotPos(seat, i, cap);
    const b = makeBuilding(card.id);
    b.userData = { card, pid: seat.pid };
    b.traverse(o => { o.userData.card = card; o.userData.pid = seat.pid; });
    b.position.set(p.x, 0, p.z);
    b.scale.setScalar(p.s);
    seat.city.add(b);
    seat.buildings.set(card.uid, b);
    if (animate) {
      b.scale.set(p.s, 0.001, p.s);
      const world = seat.city.localToWorld(V(p.x, 0.2, p.z));
      burst(world, { count: 26, color: 0xe8d2a8, speed: 1.6, up: 0.6, life: 1.0, size: 0.3 });
      tween(0.9, k => { b.scale.set(p.s, Math.max(0.001, p.s * k), p.s); }, ease.back);
    }
  }
  function removeBuilding(seat, uid, animate) {
    const b = seat.buildings.get(uid);
    if (!b) return;
    seat.buildings.delete(uid);
    if (!animate) { seat.city.remove(b); return; }
    const world = b.getWorldPosition(V());
    burst(world.clone().add(V(0, 0.4, 0)), { count: 40, color: 0xb59a7a, speed: 2.6, up: 1.4, life: 1.2, size: 0.34 });
    burst(world.clone().add(V(0, 0.4, 0)), { count: 16, color: 0xff7a3a, speed: 1.5, up: 2.0, life: 0.8, size: 0.2 });
    const s0 = b.scale.x;
    tween(0.8, k => {
      b.position.y = -k * 1.2;
      b.rotation.z = Math.sin(k * 30) * 0.06 * (1 - k) + k * 0.25;
      b.scale.set(s0, s0 * (1 - k * 0.7), s0);
    }, ease.lin).then(() => seat.city.remove(b));
  }

  // ellipse layout fitted to the screen's aspect ratio
  function seatTransforms(n, aspect) {
    const [ax, az] = aspect >= 1.25 ? [1.28, 0.8] : aspect < 0.8 ? [0.62, 1.12] : [1, 1];
    const maxR = aspect < 0.8 ? 9.6 : 11;
    let R, Rx, Rz, out, dmin;
    // smallest table that keeps neighbouring cities apart → the camera can sit closer
    for (R = 6; R <= maxR; R += 0.2) {
      Rx = R * ax; Rz = R * az; out = []; dmin = Infinity;
      for (let k = 0; k < n; k++) {
        const th = (k / n) * Math.PI * 2;
        const x = Math.sin(th) * Rx, z = Math.cos(th) * Rz;
        out.push({ x, z, rot: Math.atan2(x / (Rx * Rx), z / (Rz * Rz)) });
      }
      for (let k = 0; k < n; k++) { const a = out[k], b = out[(k + 1) % n]; dmin = Math.min(dmin, Math.hypot(a.x - b.x, a.z - b.z)); }
      if (dmin >= 8.6 && Math.min(Rx, Rz) >= 5.4) break;
    }
    const scale = Math.min(1, Math.max(0.55, (dmin - 0.6) / 7.8));
    return { seats: out, Rx, Rz, scale };
  }

  let insets = { top: 60, bottom: 200 };
  let W = 1, H = 1;
  function applyLayout(n, me) {
    const L = seatTransforms(n, W / H);
    table.scale.set(L.Rx + 3.9 * L.scale + 0.8, 1, L.Rz + 3.9 * L.scale + 0.8);
    const ms = Math.min(1, (Math.min(L.Rx, L.Rz) - 2.6 * L.scale) / 3.4);
    medallion.scale.set(ms / table.scale.x, ms / table.scale.z, 1); // circle lies in local xy (rotated flat)
    candles.forEach((c, i) => {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      c.g.position.set(Math.sin(a) * 0.93, 0.03, Math.cos(a) * 0.93);
      c.g.scale.set(1 / table.scale.x, 1, 1 / table.scale.z);
    });
    for (let pid = 0; pid < n; pid++) {
      const t = L.seats[(pid - me + n) % n];
      const s = seats.get(pid);
      s.group.position.set(t.x, 0, t.z);
      s.group.rotation.y = t.rot;
      s.group.scale.setScalar(L.scale);
    }
    fitCamera();
  }

  // ── camera ──
  let focusPid = null, follow = null, orbitSpeed = 0, orbitAngle = 0;
  const camGoal = { pos: V(0, 30, 34), target: V() };
  const camNow = { pos: V(0, 30, 34), target: V() };
  function seatCorners(pid) {
    const s = seats.get(pid);
    if (!s) return [];
    s.group.updateMatrixWorld(true);
    const pts = [];
    for (const x of [-PLOT_W / 2, PLOT_W / 2]) for (const z of [-PLOT_D / 2, TRAY_Z + 0.7]) for (const y of [0, 1.6])
      pts.push(s.group.localToWorld(V(x, y, z)));
    return pts;
  }
  function fitTo(points, pitch) {
    if (!points.length) return;
    const box = new THREE.Box3().setFromPoints(points);
    const target = box.getCenter(V()); target.y = 0;
    const dir = V(0, Math.sin(pitch), Math.cos(pitch));
    const cam = camera.clone();
    const top = insets.top + 12, bottom = H - insets.bottom - 12;
    let lo = 4, hi = 220;
    const fits = d => {
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld(true);
      for (const p of points) {
        const v = p.clone().project(cam);
        const px = (v.x + 1) / 2 * W, py = (1 - v.y) / 2 * H;
        if (v.z > 1 || px < 10 || px > W - 10 || py < top || py > bottom) return false;
      }
      return true;
    };
    for (let i = 0; i < 26; i++) { const m = (lo + hi) / 2; fits(m) ? (hi = m) : (lo = m); }
    camGoal.target.copy(target);
    camGoal.pos.copy(target).addScaledVector(dir, hi);
  }
  function fitCamera() {
    const portrait = W / H < 0.8;
    if (focusPid !== null && seats.has(focusPid)) return fitTo(seatCorners(focusPid), portrait ? 1.1 : 0.95);
    const all = [...seats.keys()].flatMap(seatCorners);
    if (follow !== null && seats.has(follow) && portrait) {
      // lean toward the active seat without losing the table
      fitTo(all, 1.08);
      const sc = seats.get(follow).group.position;
      camGoal.target.lerp(V(sc.x, 0, sc.z), 0.22);
      camGoal.pos.add(V(sc.x * 0.22, 0, sc.z * 0.22));
      return;
    }
    fitTo(all, portrait ? 1.02 : 0.8);
  }

  function resize() {
    W = canvas.clientWidth || innerWidth; H = canvas.clientHeight || innerHeight;
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
    bloom.resolution.set(W / 2, H / 2);
    lens.uniforms.uRes.value.set(W * renderer.getPixelRatio(), H * renderer.getPixelRatio());
    camera.aspect = W / H;
    camera.fov = W / H < 0.8 ? 44 : 34;
    const yc = (insets.top + (H - insets.bottom)) / 2;
    camera.setViewOffset(W, H, 0, H / 2 - yc, W, H);
    camera.updateProjectionMatrix();
    if (layout.n) applyLayout(layout.n, layout.me);
  }
  addEventListener('resize', resize);

  // ── sync with game state ──
  function ensureSeats(view) {
    const n = view.players.length, me = Math.max(0, view.me ?? 0);
    const key = n + ':' + me;
    if (layout.key === key) return;
    for (const s of seats.values()) disposeSeat(s);
    seats.clear();
    for (let pid = 0; pid < n; pid++) seats.set(pid, makeSeat(pid));
    layout = { n, me, key };
    applyLayout(n, me);
    camNow.pos.copy(camGoal.pos); camNow.target.copy(camGoal.target);
  }

  function sync(view, animate = true) {
    ensureSeats(view);
    const goal = view.cfg.goal;
    for (const p of view.players) {
      const seat = seats.get(p.id);
      const cap = Math.max(goal, p.city.length);
      const recap = seat.cap !== cap;
      layoutTiles(seat, cap);
      const want = new Set(p.city.map(c => c.uid));
      for (const uid of [...seat.buildings.keys()]) if (!want.has(uid)) removeBuilding(seat, uid, animate);
      p.city.forEach((card, i) => {
        const b = seat.buildings.get(card.uid);
        if (!b) return addBuilding(seat, card, i, cap, animate);
        const q = slotPos(seat, i, cap);
        if (recap || b.position.x !== q.x || b.position.z !== q.z) {
          const from = b.position.clone(), s0 = b.scale.x;
          if (!animate) { b.position.set(q.x, 0, q.z); b.scale.setScalar(q.s); }
          else tween(0.5, k => { b.position.lerpVectors(from, V(q.x, 0, q.z), k); b.scale.setScalar(s0 + (q.s - s0) * k); });
        }
      });
      setCoins(seat, p.gold);
      setCards(seat, p.handCount ?? p.hand.length);
      const known = p.chars.map(c => ({ charId: c, killed: view.killed === CHAR[c].rank && view.revealed.includes(c) }))
        .sort((a, b) => CHAR[a.charId].rank - CHAR[b.charId].rank);
      const hidden = Math.max(0, (p.charCount ?? p.chars.length) - known.length);
      setTokens(seat, [...known, ...Array.from({ length: hidden }, () => ({ charId: null }))], animate);
    }
    setDeck(view.deckCount ?? view.deck.length);
    const active = view.phase === 'turns' ? view.turn?.pid ?? null : view.phase === 'draft' ? view.draft.order[view.draft.idx] : null;
    for (const s of seats.values()) s.active = s.pid === active ? 1 : 0;
    if (follow !== active) { follow = active; fitCamera(); }
    moveCrown(view.crown, animate);
  }

  function crownSpot(pid) {
    const s = seats.get(pid);
    return s ? s.group.localToWorld(V(0, 1.4, TRAY_Z)) : V(0, 2, 0);
  }
  function moveCrown(pid, animate) {
    if (crownState.pid === pid) return;
    const from = crownState.pid === null ? crownSpot(pid) : crownState.pos.clone();
    crownState.pid = pid;
    if (!animate) { crownState.pos.copy(crownSpot(pid)); return; }
    tween(1.2, k => {
      const to = crownSpot(pid);
      crownState.pos.lerpVectors(from, to, k);
      crownState.pos.y += Math.sin(k * Math.PI) * 4;
    }, ease.inOut);
  }

  // ── effects ──
  const anchor = {
    bank: () => V(0, 0.3, 0),
    deck: () => deck.position.clone().add(V(0, deck.scale.y / 2, 0)),
    coins: pid => seats.get(pid)?.coins.localToWorld(V(0, 0.3, 0)) ?? V(),
    cards: pid => seats.get(pid)?.cards.getWorldPosition(V()).add(V(0, 0.3, 0)) ?? V(),
    slot: (pid, uid) => seats.get(pid)?.buildings.get(uid)?.getWorldPosition(V()).add(V(0, 0.5, 0)) ?? V(),
  };
  function fly(geo, material, from, to, n, { dur = 0.6, stagger = 0.07, arc = 2.2, scale = 1, spin = true } = {}) {
    const all = [];
    for (let i = 0; i < Math.min(n, 12); i++) {
      const m = new THREE.Mesh(geo, material);
      m.scale.setScalar(scale);
      m.castShadow = true;
      m.visible = false;
      scene.add(m);
      const p = wait(i * stagger * 1000).then(() => {
        m.visible = true;
        const mid = from.clone().lerp(to, 0.5).add(V(0, arc, 0));
        return tween(dur, k => {
          const a = from.clone().lerp(mid, k), b = mid.clone().lerp(to, k);
          m.position.copy(a.lerp(b, k));
          if (spin) m.rotation.set(k * 6, 0, k * 3);
        }, ease.inOut);
      }).then(() => scene.remove(m));
      all.push(p);
    }
    return Promise.all(all);
  }
  const flyCoins = (from, to, n) => fly(coinGeo, mat('gold'), from, to, n, { arc: 1.8 });
  const flyCardGeo = new THREE.BoxGeometry(0.95, 0.02, 1.32);
  const flyCards = (from, to, n) => fly(flyCardGeo, cardMat, from, to, n, { arc: 2.6, spin: false, stagger: 0.1 });

  function pulseSpot(pid) {
    const s = seats.get(pid);
    if (!s) { spot.intensity = 0; return; }
    const p = s.group.position;
    spot.target.position.set(p.x, 0, p.z);
    spot.position.set(p.x * 0.4, 20, p.z * 0.4 + 4);
    const from = spot.intensity;
    tween(0.6, k => { spot.intensity = from + (150 - from) * k; });
  }

  function fx(ev) {
    switch (ev.k) {
      case 'call': if (ev.pid !== null && !ev.killed) pulseSpot(ev.pid); return;
      case 'round': spot.intensity = 0; return;
      case 'gold': return flyCoins(anchor.bank(), anchor.coins(ev.pid), ev.n);
      case 'robbed': return flyCoins(anchor.coins(ev.from), anchor.coins(ev.to), ev.n);
      case 'tithe': return flyCoins(anchor.coins(ev.from), anchor.coins(ev.to), 1);
      case 'cards': case 'draw': return flyCards(anchor.deck(), anchor.cards(ev.pid), ev.n);
      case 'swap': return Promise.all([flyCards(anchor.cards(ev.pid), anchor.cards(ev.target), 3), flyCards(anchor.cards(ev.target), anchor.cards(ev.pid), 3)]);
      case 'wizTake': return flyCards(anchor.cards(ev.target), anchor.cards(ev.pid), 1);
      case 'graveyard': return flyCards(anchor.bank(), anchor.cards(ev.pid), 1);
      case 'destroy': return flyCoins(anchor.coins(ev.pid), anchor.bank(), ev.cost);
      case 'build': {
        const at = anchor.slot(ev.pid, ev.card.uid);
        burst(at, { count: 30, color: 0xffd78a, speed: 1.2, up: 2.2, life: 1.1, size: 0.18 });
        return flyCards(anchor.cards(ev.pid), at, 1);
      }
      case 'kill': case 'rob': return;
      case 'complete': {
        const s = seats.get(ev.pid);
        if (!s) return;
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, 18, 32, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        beam.position.copy(s.group.position).add(V(0, 9, 0));
        noAO.add(beam);
        scene.add(beam);
        for (let i = 0; i < 4; i++) setTimeout(() => burst(s.group.position.clone().add(V((Math.random() - 0.5) * 5, 1, (Math.random() - 0.5) * 3)), { count: 40, speed: 2.5, up: 4, life: 1.6, size: 0.24 }), i * 220);
        return tween(2.2, k => { beam.material.opacity = Math.sin(k * Math.PI) * 0.22; }, ease.lin).then(() => { scene.remove(beam); noAO.delete(beam); });
      }
      case 'over': {
        const s = seats.get(ev.winner);
        if (!s) return;
        for (let i = 0; i < 14; i++) setTimeout(() => {
          const p = s.group.position.clone().add(V((Math.random() - 0.5) * 8, 3 + Math.random() * 3, (Math.random() - 0.5) * 5));
          const col = [0xffd27a, 0xff8a6a, 0x9ad0ff, 0xc6a0ff, 0x8affc1][i % 5];
          burst(p, { count: 60, color: col, speed: 3.5, up: 1.5, life: 1.8, size: 0.22 });
        }, i * 260);
        return;
      }
    }
  }

  // ── interaction: tap to pick, drag to orbit, wheel / pinch to zoom ──
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hit(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = [];
    for (const s of seats.values()) targets.push(s.slab, s.city);
    const h = ray.intersectObjects(targets, true)[0];
    if (!h) return null;
    return { pid: h.object.userData.pid ?? null, card: h.object.userData.card ?? null };
  }
  const user = { yaw: 0, pitch: 0, zoom: 1 }, userGoal = { yaw: 0, pitch: 0, zoom: 1 };
  const pointers = new Map();
  let downAt = null, dragged = false, pinch0 = 0, zoom0 = 1, hoverT = 0;
  canvas.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    canvas.setPointerCapture?.(e.pointerId);
    downAt = [e.clientX, e.clientY]; dragged = false;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom0 = userGoal.zoom; }
  });
  canvas.addEventListener('pointermove', e => {
    const prev = pointers.get(e.pointerId);
    if (prev) {
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        userGoal.zoom = Math.min(1.7, Math.max(0.55, zoom0 * pinch0 / Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1]))));
        dragged = true;
        return;
      }
      if (!dragged && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8) dragged = true;
      if (dragged) {
        userGoal.yaw -= (e.clientX - prev[0]) * 0.006;
        userGoal.pitch = Math.max(-0.55, Math.min(0.5, userGoal.pitch + (e.clientY - prev[1]) * 0.004));
        hooks.onUserCamera?.();
      }
      return;
    }
    if (e.pointerType !== 'mouse' || performance.now() - hoverT < 60) return;
    hoverT = performance.now();
    const h = hit(e.clientX, e.clientY);
    canvas.style.cursor = h ? 'pointer' : 'grab';
    setHover(h?.card?.uid ?? null);
    hooks.onHover?.(h?.card ? h : null, e.clientX, e.clientY);
  });
  const release = e => {
    pointers.delete(e.pointerId);
    if (e.type === 'pointerup' && !dragged && downAt && pointers.size === 0) hooks.onPick?.(hit(e.clientX, e.clientY));
    if (!pointers.size) downAt = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { setHover(null); hooks.onHover?.(null); });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    userGoal.zoom = Math.min(1.7, Math.max(0.55, userGoal.zoom * (1 + Math.sign(e.deltaY) * 0.08)));
    hooks.onUserCamera?.();
  }, { passive: false });

  // building glow: red = Warlord targets, gold = hover
  let targetUids = [], hoverUid = null, targetColor = 0xff5a4a;
  function setHover(uid) { if (uid !== hoverUid) { hoverUid = uid; applyGlow(); } }
  function applyGlow() {
    for (const s of seats.values()) for (const [uid, b] of s.buildings) {
      const col = targetUids.includes(uid) ? targetColor : uid === hoverUid ? 0xffcf7a : null;
      b.traverse(o => {
        if (!o.isMesh) return;
        if (col !== null) {
          if (!o.userData.hl) { o.userData.hl = o.material; o.material = o.material.clone(); }
          o.material.emissive = new THREE.Color(col);
          o.material.emissiveIntensity = col === targetColor ? 0.38 : 0.22;
        } else if (o.userData.hl) { o.material.dispose(); o.material = o.userData.hl; delete o.userData.hl; }
      });
    }
  }

  // ── quality: drops bloom / shadows / pixel ratio if the device struggles ──
  let quality = 'high', fpsAcc = 0, fpsN = 0, fpsChecked = false, qualityLocked = false;
  function setQuality(q, byUser = true) {
    quality = q;
    if (byUser) qualityLocked = true;
    const low = q === 'low';
    renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio, MOBILE ? 1.6 : 2));
    bloom.enabled = !low;
    ao.enabled = !low && (!MOBILE || byUser);
    lens.uniforms.uTilt.value = low ? 0 : 1;
    key.castShadow = !low;
    embers.visible = !low;
    resize();
  }
  canvas.addEventListener('webglcontextlost', e => e.preventDefault());
  canvas.addEventListener('webglcontextrestored', () => hooks.onContextRestored?.());

  // ── frame loop ──
  const clock = new THREE.Clock();
  const sph = new THREE.Spherical();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    if (!fpsChecked && !qualityLocked && t > 4) {
      fpsAcc += dt; fpsN++;
      if (fpsN >= 180) {
        fpsChecked = true;
        if (fpsN / fpsAcc < 32 && quality === 'high') { setQuality('low', false); hooks.onQuality?.('low'); }
      }
    }
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.fn(a.e(k));
      if (k >= 1) { anims.splice(i, 1); a.res(); }
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.t += dt;
      const pos = b.pts.geometry.attributes.position;
      b.v.forEach((v, j) => {
        v.y -= dt * 2.2; v.multiplyScalar(1 - dt * 1.4);
        pos.setXYZ(j, pos.getX(j) + v.x * dt, pos.getY(j) + v.y * dt, pos.getZ(j) + v.z * dt);
      });
      pos.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, 1 - b.t / b.life);
      if (b.t >= b.life) { scene.remove(b.pts); noAO.delete(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose(); bursts.splice(i, 1); }
    }
    if (embers.visible) {
      const e = emberGeo.attributes.position;
      for (let i = 0; i < EMBERS; i++) {
        let y = e.getY(i) + dt * (0.25 + (i % 7) * 0.05);
        if (y > 14) y = 0;
        e.setY(i, y);
        e.setX(i, e.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.08);
      }
      e.needsUpdate = true;
    }
    candles.forEach(c => {
      const f = 0.85 + Math.sin(t * 9 + c.seed) * 0.08 + Math.sin(t * 23 + c.seed * 2) * 0.06;
      c.light.intensity = 5 * f;
      c.flame.scale.set(1, f, 1);
      c.halo.material.opacity = 0.42 + (f - 0.85) * 1.6;
    });
    for (const s of seats.values()) {
      const target = s.active ? 0.35 + Math.sin(t * 3) * 0.12 : 0;
      s.halo.material.opacity += (target - s.halo.material.opacity) * Math.min(1, dt * 6);
      waveFlag(s.flag, t, s.pid * 1.7);
    }
    if (crownState.pid !== null && !anims.length) crownState.pos.lerp(crownSpot(crownState.pid), Math.min(1, dt * 4));
    crown.position.copy(crownState.pos).add(V(0, Math.sin(t * 1.6) * 0.12, 0));
    crown.rotation.y = t * 0.6;
    if (follow === null && spot.intensity > 0) spot.intensity = Math.max(0, spot.intensity - dt * 240);
    // camera: fitted goal + the player's own orbit/zoom + a gentle breath
    const k = 1 - Math.exp(-dt * (calm ? 12 : 2.6)), ku = 1 - Math.exp(-dt * 8);
    camNow.pos.lerp(camGoal.pos, k);
    camNow.target.lerp(camGoal.target, k);
    for (const p of ['yaw', 'pitch', 'zoom']) user[p] += (userGoal[p] - user[p]) * ku;
    orbitAngle = orbitSpeed ? orbitAngle + dt * orbitSpeed : orbitAngle * (1 - k);
    sph.setFromVector3(camNow.pos.clone().sub(camNow.target));
    sph.radius *= user.zoom;
    sph.phi = Math.max(0.12, Math.min(1.3, sph.phi + user.pitch));
    sph.theta += user.yaw + orbitAngle + Math.sin(t * 0.21) * 0.008;
    camera.position.setFromSpherical(sph).add(camNow.target);
    camera.position.y += Math.sin(t * 0.17) * 0.12;
    camera.lookAt(camNow.target);
    lens.uniforms.uTime.value = t;
    lens.uniforms.uFocus.value = (camNow.target.clone().project(camera).y + 1) / 2;
    shaftMat.uniforms.uTime.value = t;
    composer.render(dt);
    hooks.onFrame?.();
  }

  resize();
  requestAnimationFrame(frame);

  const toScreen = w => { const v = w.project(camera); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, behind: v.z > 1 }; };
  return {
    sync, fx, wait,
    setInsets(i) { if (i.top === insets.top && i.bottom === insets.bottom) return; insets = i; resize(); },
    focus(pid) { focusPid = pid; fitCamera(); },
    resetView() { focusPid = null; userGoal.yaw = 0; userGoal.pitch = 0; userGoal.zoom = 1; fitCamera(); },
    get focused() { return focusPid; },
    // Screen position for a seat's floating label (just outside its tray).
    labelPos(pid) {
      const s = seats.get(pid);
      return s ? toScreen(s.group.localToWorld(V(0, 0.2, TRAY_Z + (pid === layout.me ? 1.25 : 2.1)))) : null;
    },
    // Screen position of a seat's coins / cards / plot, for floating numbers.
    screenOf(pid, what = 'coins') {
      const s = seats.get(pid);
      if (!s) return null;
      const w = what === 'coins' ? s.coins.localToWorld(V(0, 0.9, 0))
        : what === 'cards' ? s.cards.getWorldPosition(V()).add(V(0, 0.9, 0)) : s.group.localToWorld(V(0, 1.6, 0));
      return toScreen(w);
    },
    orbit(on) { orbitSpeed = on ? 0.05 : 0; if (!on) orbitAngle %= Math.PI * 2; if (orbitAngle > Math.PI) orbitAngle -= Math.PI * 2; },
    reset() {
      for (const s of seats.values()) disposeSeat(s);
      seats.clear();
      layout = { n: 0, me: 0, key: '' };
      crownState.pid = null; follow = undefined; focusPid = null; spot.intensity = 0;
      userGoal.yaw = userGoal.pitch = 0; userGoal.zoom = 1;
    },
    highlight(uids, color = 0xff5a4a) { targetUids = uids; targetColor = color; applyGlow(); },
    setQuality, get quality() { return quality; }, setCalm: v => { calm = v; },
  };
}
