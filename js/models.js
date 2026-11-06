// Procedural miniature buildings — one recipe per district. Each building's geometry is merged
// per material (3–6 draw calls), built once, then cloned. The same models are rendered to
// images for card art, so a card and the building on the table always match.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HUE, DIST } from './data.js?v=efde9582';
import { pattern, warmEnvironment } from './materials.js?v=efde9582';

const MAT = {};
const std = o => new THREE.MeshStandardMaterial(o);
const P = (o, p) => pattern(std(o), p);
const BASE = {
  stone: () => P({ color: 0xd9ccb2, roughness: 0.86 }, { pattern: 'ashlar', bump: 0.035 }),
  plaster: () => P({ color: 0xf0e4cb, roughness: 0.84 }, { pattern: 'plaster', bump: 0.012 }),
  dark: () => P({ color: 0x5a524a, roughness: 0.9 }, { pattern: 'ashlar', bump: 0.04 }),
  wood: () => P({ color: 0x7d5434, roughness: 0.72 }, { pattern: 'timber', bump: 0.02 }),
  gold: () => P({ color: 0xe8be6c, metalness: 1, roughness: 0.24 }, { pattern: 'brushed', bump: 0.004, rough: 0.6 }),
  glow: () => std({ color: 0xffc27a, emissive: 0xffa040, emissiveIntensity: 2.6 }),
  magic: () => std({ color: 0xd2b0ff, emissive: 0xa45cff, emissiveIntensity: 3 }),
  toxic: () => std({ color: 0xa8ffd6, emissive: 0x2fe39a, emissiveIntensity: 2.4 }),
  water: () => new THREE.MeshPhysicalMaterial({ color: 0x1d5878, roughness: 0.06, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }),
  leaf: () => P({ color: 0x4a7442, roughness: 0.95 }, { pattern: 'rock', scale: 3, bump: 0.03 }),
  rock: () => P({ color: 0x9a8f80, roughness: 1, flatShading: true }, { pattern: 'rock', scale: 2, bump: 0.05 }),
  ivory: () => P({ color: 0xfbf3e2, roughness: 0.5 }, { pattern: 'plaster', bump: 0.006 }),
  cloth: () => P({ color: 0xece0c4, roughness: 0.95, side: THREE.DoubleSide }, { pattern: 'fabric', scale: 0.4, bump: 0.01 }),
  frame: () => std({ color: 0x3a2617, roughness: 0.7 }),
};
export function mat(key) {
  if (!MAT[key]) MAT[key] = key.startsWith('#')
    ? P({ color: key, roughness: 0.62, metalness: 0.04 }, { pattern: 'tiles', bump: 0.03 }) // roofs: glazed tiles in the district colour
    : BASE[key]();
  return MAT[key];
}

const PI = Math.PI;
class B {
  parts = {};
  add(g, m, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
    g = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    (this.parts[m] ||= []).push(g);
    return this;
  }
  // y is always the base of the shape
  box(w, h, d, x, y, z, m, ry = 0) {
    const r = Math.min(w, h, d);
    // bevelled edges catch the light; tiny parts and emissive panes stay sharp
    const g = r >= 0.12 && m !== 'glow' && m !== 'water' ? new RoundedBoxGeometry(w, h, d, 2, Math.min(0.035, r * 0.12)) : new THREE.BoxGeometry(w, h, d);
    return this.add(g, m, x, y + h / 2, z, ry);
  }
  cyl(rt, rb, h, x, y, z, m, seg = 22) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y + h / 2, z); }
  cone(r, h, x, y, z, m, seg = 22, ry = 0) { return this.add(new THREE.ConeGeometry(r, h, seg), m, x, y + h / 2, z, ry); }
  pyr(w, h, x, y, z, m) { return this.add(new THREE.ConeGeometry(w * 0.7071, h, 4), m, x, y + h / 2, z, PI / 4); }
  dome(r, x, y, z, m) { return this.add(new THREE.SphereGeometry(r, 28, 14, 0, PI * 2, 0, PI / 2), m, x, y, z); }
  ball(r, x, y, z, m) { return this.add(new THREE.SphereGeometry(r, 18, 12), m, x, y, z); }
  // triangular roof: span w (x), length d (z), height h; ry rotates the ridge
  gable(w, d, h, x, y, z, m, ry = 0) {
    const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
    g.translate(0, 0, -d / 2);
    return this.add(g, m, x, y, z, ry);
  }
  win(x, y, z, w = 0.12, h = 0.2, ry = 0) { // lit pane in a timber frame, with a stone sill
    return this.box(w + 0.05, h + 0.05, 0.035, x, y - 0.025, z, 'frame', ry).box(w, h, 0.05, x, y, z, 'glow', ry)
      .box(w + 0.08, 0.025, 0.07, x, y - 0.045, z, 'stone', ry);
  }
  done() {
    const grp = new THREE.Group();
    for (const [m, gs] of Object.entries(this.parts)) {
      const mesh = new THREE.Mesh(mergeGeometries(gs), mat(m));
      mesh.castShadow = mesh.receiveShadow = true;
      grp.add(mesh);
    }
    return grp;
  }
}

const each = (xs, f) => xs.forEach(f);
const LR = [-1, 1];

// Footprint ≈ 1.5 × 1.5, facade faces +z.
const RECIPES = {
  manor(b, r) {
    b.box(1.3, 0.8, 1, 0, 0, 0, 'plaster').gable(1.45, 1.12, 0.6, 0, 0.8, 0, r, PI / 2 + PI / 2)
      .box(0.18, 0.55, 0.18, 0.42, 0.9, -0.22, 'stone').box(0.24, 0.4, 0.05, 0, 0, 0.51, 'wood');
    each(LR, s => b.win(s * 0.36, 0.38, 0.51));
  },
  castle(b, r) {
    b.box(1.05, 1.1, 1.05, 0, 0, 0, 'stone').box(0.32, 0.42, 0.05, 0, 0, 0.53, 'wood').win(0, 0.7, 0.53);
    for (let i = -2; i <= 2; i++) b.box(0.12, 0.14, 0.12, i * 0.22, 1.1, 0.46, 'stone');
    each(LR, sx => each(LR, sz => b.cyl(0.21, 0.24, 1.55, sx * 0.55, 0, sz * 0.55, 'stone').cone(0.3, 0.55, sx * 0.55, 1.55, sz * 0.55, r)));
  },
  palace(b, r) {
    b.box(1.6, 0.7, 1.05, 0, 0, 0, 'plaster').box(0.72, 0.45, 0.72, 0, 0.7, 0, 'plaster')
      .dome(0.38, 0, 1.15, 0, r).cone(0.05, 0.32, 0, 1.5, 0, 'gold');
    each(LR, s => b.cyl(0.15, 0.16, 1.25, s * 0.72, 0, 0.42, 'plaster').cone(0.21, 0.4, s * 0.72, 1.25, 0.42, r));
    each([-0.45, -0.15, 0.15, 0.45], x => b.win(x, 0.3, 0.53, 0.1, 0.26));
  },
  temple(b, r) {
    b.box(1.5, 0.12, 1.3, 0, 0, 0, 'stone').box(1.32, 0.12, 1.12, 0, 0.12, 0, 'stone')
      .box(0.7, 0.6, 0.6, 0, 0.24, -0.1, 'glow')
      .box(1.28, 0.1, 1.08, 0, 0.94, 0, 'stone').pyr(1.32, 0.42, 0, 1.04, 0, r);
    each([-0.5, -0.17, 0.17, 0.5], x => each([-0.42, 0.42], z => b.cyl(0.07, 0.08, 0.7, x, 0.24, z, 'ivory', 10)));
  },
  church(b, r) {
    b.box(0.8, 0.85, 1.25, 0, 0, -0.15, 'plaster').gable(0.92, 1.35, 0.5, 0, 0.85, -0.15, r)
      .box(0.44, 1.5, 0.44, 0, 0, 0.55, 'plaster').pyr(0.5, 0.85, 0, 1.5, 0.55, r)
      .box(0.03, 0.26, 0.03, 0, 2.35, 0.55, 'gold').box(0.14, 0.03, 0.03, 0, 2.5, 0.55, 'gold')
      .win(0, 1.1, 0.78, 0.14, 0.22).box(0.2, 0.34, 0.05, 0, 0, 0.78, 'wood');
    each([-0.55, -0.15, 0.25], z => each(LR, s => b.win(s * 0.41, 0.4, z, 0.1, 0.24, PI / 2)));
  },
  monastery(b, r) {
    b.box(1.4, 0.6, 0.5, 0, 0, -0.45, 'stone').gable(0.6, 1.5, 0.34, 0, 0.6, -0.45, r, PI / 2)
      .box(0.5, 0.6, 0.95, -0.45, 0, 0.27, 'stone').gable(0.6, 1, 0.34, -0.45, 0.6, 0.27, r)
      .box(0.3, 1.25, 0.3, 0.45, 0, 0.38, 'stone').pyr(0.36, 0.42, 0.45, 1.25, 0.38, r)
      .cone(0.18, 0.55, 0.1, 0, 0.45, 'leaf', 8);
    each([-0.4, 0, 0.4], x => b.win(x, 0.25, -0.19, 0.1, 0.18));
  },
  cathedral(b, r) {
    b.box(0.92, 1.25, 1.4, 0, 0, -0.25, 'stone').gable(1.02, 1.5, 0.7, 0, 1.25, -0.25, r)
      .add(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 20), 'magic', 0, 1.0, 0.47, 0, PI / 2)
      .box(0.28, 0.5, 0.05, 0, 0, 0.47, 'wood');
    each(LR, s => b.box(0.38, 2.05, 0.38, s * 0.44, 0, 0.55, 'stone').pyr(0.42, 0.95, s * 0.44, 2.05, 0.55, r).win(s * 0.44, 1.4, 0.75, 0.1, 0.3));
  },
  tavern(b, r) {
    b.box(1.1, 0.75, 0.9, 0, 0, -0.1, 'plaster').gable(1.25, 1.02, 0.55, 0, 0.75, -0.1, r)
      .box(1.12, 0.06, 0.92, 0, 0.42, -0.1, 'wood').box(0.24, 0.38, 0.05, 0.2, 0, 0.36, 'wood')
      .box(0.04, 0.04, 0.35, -0.42, 0.62, 0.52, 'wood').box(0.26, 0.18, 0.03, -0.42, 0.42, 0.66, r)
      .cyl(0.13, 0.13, 0.3, 0.55, 0, 0.55, 'wood').cyl(0.13, 0.13, 0.3, 0.3, 0, 0.62, 'wood');
    b.win(-0.25, 0.2, 0.36, 0.2, 0.16).win(-0.25, 0.55, 0.36, 0.14, 0.14);
  },
  market(b, r) {
    b.box(1.55, 0.05, 1.45, 0, 0, 0, 'stone').cyl(0.22, 0.26, 0.2, 0, 0.05, -0.35, 'stone').cyl(0.17, 0.17, 0.02, 0, 0.24, -0.35, 'water');
    each([-0.5, 0, 0.5], (x, i) => {
      b.box(0.38, 0.28, 0.3, x, 0.05, 0.3, 'wood').add(new THREE.BoxGeometry(0.48, 0.03, 0.46), i % 2 ? 'cloth' : r, x, 0.66, 0.3, 0, 0.3);
      each(LR, s => b.box(0.03, 0.62, 0.03, x + s * 0.2, 0.05, 0.47, 'wood'));
    });
  },
  trading_post(b, r) {
    b.box(1.3, 0.8, 0.95, 0, 0, -0.2, 'wood').gable(1.42, 1.08, 0.5, 0, 0.8, -0.2, r).box(0.4, 0.5, 0.05, 0, 0, 0.29, 'glow')
      .box(0.26, 0.26, 0.26, -0.48, 0, 0.55, 'wood').box(0.22, 0.22, 0.22, -0.48, 0.26, 0.55, 'wood').box(0.24, 0.24, 0.24, 0.45, 0, 0.6, 'wood');
  },
  docks(b, r) {
    b.box(1.6, 0.04, 0.75, 0, 0, 0.4, 'water').box(0.42, 0.1, 1.45, -0.3, 0.04, 0.1, 'wood')
      .box(0.7, 0.55, 0.55, 0.4, 0, -0.42, 'wood').gable(0.8, 0.62, 0.32, 0.4, 0.55, -0.42, r, PI / 2)
      .box(0.08, 1.3, 0.08, -0.55, 0, -0.45, 'wood').box(0.75, 0.06, 0.06, -0.25, 1.24, -0.45, 'wood')
      .box(0.02, 0.4, 0.02, 0.08, 0.84, -0.45, 'dark').box(0.16, 0.12, 0.16, 0.08, 0.72, -0.45, 'wood');
    each([-0.4, 0.1, 0.6], z => b.cyl(0.04, 0.04, 0.3, -0.06, 0, z, 'wood', 6));
  },
  harbor(b, r) {
    b.box(1.6, 0.04, 0.8, 0, 0, 0.38, 'water').box(1.6, 0.12, 0.7, 0, 0, -0.38, 'stone')
      .cyl(0.2, 0.28, 1.65, 0.45, 0.12, -0.38, 'ivory').cyl(0.215, 0.235, 0.22, 0.45, 0.8, -0.38, r)
      .cyl(0.15, 0.15, 0.22, 0.45, 1.77, -0.38, 'glow').cone(0.22, 0.28, 0.45, 1.99, -0.38, r)
      .box(0.55, 0.13, 0.22, -0.3, 0.04, 0.45, 'wood').box(0.03, 0.55, 0.03, -0.3, 0.17, 0.45, 'wood')
      .add(new THREE.PlaneGeometry(0.32, 0.38), 'cloth', -0.3, 0.48, 0.45, PI / 2);
  },
  town_hall(b, r) {
    b.box(1.5, 0.8, 0.95, 0, 0, -0.15, 'plaster').gable(1.05, 1.62, 0.42, 0, 0.8, -0.15, r, PI / 2)
      .box(0.42, 1.75, 0.42, 0, 0, 0.3, 'plaster').pyr(0.48, 0.55, 0, 1.75, 0.3, r)
      .add(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 20), 'glow', 0, 1.42, 0.52, 0, PI / 2)
      .box(0.24, 0.36, 0.05, 0, 0, 0.52, 'wood');
    each([-0.55, -0.32, 0.32, 0.55], x => b.win(x, 0.35, 0.33, 0.1, 0.24));
  },
  watchtower(b, r) {
    b.cyl(0.27, 0.36, 1.85, 0, 0, 0, 'stone', 10).cyl(0.44, 0.44, 0.1, 0, 1.85, 0, 'wood', 10)
      .cone(0.5, 0.62, 0, 1.95, 0, r, 10).win(0, 1.4, 0.3, 0.1, 0.2).win(0, 0.7, 0.33, 0.08, 0.16);
  },
  prison(b, r) {
    b.box(1.3, 0.7, 1.05, 0, 0, 0, 'dark').box(0.62, 0.32, 0.04, 0, 0.18, 0.53, 'glow')
      .box(0.4, 1.15, 0.4, 0.48, 0, -0.38, 'dark').pyr(0.46, 0.38, 0.48, 1.15, -0.38, r)
      .box(1.34, 0.08, 1.09, 0, 0.7, 0, r);
    for (let i = -2; i <= 2; i++) b.box(0.035, 0.36, 0.035, i * 0.12, 0.16, 0.56, 'dark');
  },
  battlefield(b, r) {
    b.box(1.55, 0.04, 1.45, 0, 0, 0, 'rock').cone(0.38, 0.55, -0.4, 0.04, -0.28, 'cloth', 4, PI / 4)
      .cone(0.3, 0.45, 0.42, 0.04, 0.22, r, 4, PI / 4).cyl(0.025, 0.025, 1.3, 0.15, 0.04, -0.5, 'wood', 6)
      .box(0.36, 0.22, 0.02, 0.34, 1.05, -0.5, r).cyl(0.12, 0.12, 0.03, -0.45, 0.2, 0.5, 'gold', 12);
    each([-0.1, 0.05], x => b.add(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 5), 'wood', x - 0.3, 0.4, 0.35, 0, 0.3, x * 4));
  },
  fortress(b, r) {
    b.box(0.6, 1.25, 0.6, 0, 0, 0, 'stone').pyr(0.66, 0.45, 0, 1.25, 0, r).win(0, 0.85, 0.31, 0.1, 0.2);
    each(LR, s => b.box(1.5, 0.55, 0.16, 0, 0, s * 0.66, 'stone').box(0.16, 0.55, 1.5, s * 0.66, 0, 0, 'stone'));
    each(LR, sx => each(LR, sz => b.cyl(0.19, 0.22, 0.9, sx * 0.66, 0, sz * 0.66, 'stone').cone(0.25, 0.38, sx * 0.66, 0.9, sz * 0.66, r)));
  },
  haunted_city(b, r) {
    b.box(0.5, 0.85, 0.5, -0.4, 0, -0.25, 'dark', 0.15).gable(0.6, 0.6, 0.45, -0.4, 0.85, -0.25, r, 0.15)
      .box(0.45, 0.65, 0.45, 0.35, 0, 0.1, 'dark', -0.2).gable(0.55, 0.55, 0.4, 0.35, 0.65, 0.1, r, -0.2)
      .box(0.1, 0.14, 0.05, -0.4, 0.5, 0.01, 'magic').box(0.1, 0.14, 0.05, 0.32, 0.35, 0.34, 'magic')
      .cyl(0.04, 0.07, 0.8, 0.1, 0, 0.55, 'dark', 6).add(new THREE.CylinderGeometry(0.015, 0.03, 0.4, 5), 'dark', 0.2, 0.7, 0.55, 0, 0, -0.9);
  },
  factory(b, r) {
    b.box(1.35, 0.7, 1, 0, 0, 0, 'stone');
    each([-0.45, 0, 0.45], x => b.gable(0.45, 1.02, 0.3, x, 0.7, 0, r));
    each([[-0.42, 1.5], [0.42, 1.2]], ([x, h]) => b.cyl(0.09, 0.12, h, x, 0, -0.62, 'dark', 10).cyl(0.08, 0.08, 0.05, x, h, -0.62, 'glow', 10));
    each([-0.45, -0.15, 0.15, 0.45], x => b.win(x, 0.25, 0.51, 0.16, 0.2));
  },
  dragon_gate(b, r) {
    each(LR, s => b.box(0.45, 1.5, 0.55, s * 0.55, 0, 0, 'stone').pyr(0.5, 0.5, s * 0.55, 1.5, 0, r)
      .cone(0.06, 0.25, s * 0.55, 2.0, 0, 'gold', 6));
    b.add(new THREE.TorusGeometry(0.42, 0.12, 8, 20, PI), 'stone', 0, 0.85, 0)
      .box(0.62, 0.85, 0.08, 0, 0, 0, 'glow').box(0.2, 0.2, 0.06, 0, 1.15, 0.3, 'gold');
  },
  university(b, r) {
    b.box(1.5, 0.8, 0.95, 0, 0, -0.15, 'plaster').box(1.56, 0.08, 1.0, 0, 0.8, -0.15, 'stone')
      .cyl(0.36, 0.36, 0.25, 0, 0.88, -0.15, 'plaster', 18).dome(0.37, 0, 1.13, -0.15, r).cone(0.04, 0.25, 0, 1.48, -0.15, 'gold');
    each([-0.55, -0.2, 0.2, 0.55], x => b.cyl(0.06, 0.06, 0.8, x, 0, 0.42, 'ivory', 10).win(x, 0.3, 0.33, 0.12, 0.3));
    b.box(1.5, 0.08, 0.2, 0, 0.8, 0.42, 'stone');
  },
  thieves_den(b, r) {
    b.box(0.95, 0.5, 0.8, -0.15, 0, -0.2, 'dark').gable(1.05, 0.9, 0.42, -0.15, 0.5, -0.2, r)
      .box(0.2, 0.32, 0.05, -0.15, 0, 0.21, 'wood').cyl(0.06, 0.06, 0.12, 0.25, 0.4, 0.25, 'glow', 8)
      .box(0.02, 0.45, 0.02, 0.25, 0, 0.25, 'dark').box(0.26, 0.26, 0.26, 0.5, 0, -0.3, 'wood')
      .cyl(0.12, 0.12, 0.08, 0.5, 0, 0.45, 'gold', 12).cyl(0.1, 0.1, 0.08, 0.52, 0.08, 0.45, 'gold', 12);
  },
  keep(b, r) {
    b.cyl(0.55, 0.62, 1.4, 0, 0, 0, 'stone', 18).cyl(0.6, 0.6, 0.12, 0, 1.4, 0, 'stone', 18)
      .box(0.24, 0.4, 0.05, 0, 0, 0.6, 'wood').win(0, 0.95, 0.57, 0.08, 0.22)
      .cyl(0.02, 0.02, 0.7, 0, 1.52, 0, 'wood', 5).box(0.3, 0.18, 0.02, 0.15, 1.95, 0, r);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; b.box(0.13, 0.16, 0.13, Math.sin(a) * 0.54, 1.52, Math.cos(a) * 0.54, 'stone', a); }
  },
  graveyard(b, r) {
    b.box(1.55, 0.04, 1.45, 0, 0, 0, 'leaf').box(0.5, 0.55, 0.55, 0.42, 0.04, -0.42, 'dark')
      .gable(0.58, 0.6, 0.35, 0.42, 0.59, -0.42, r).box(0.12, 0.18, 0.05, 0.42, 0.25, -0.14, 'magic');
    each([[-0.5, -0.4], [-0.15, -0.45], [-0.5, 0.05], [-0.15, 0.0], [0.2, 0.3], [-0.5, 0.5], [-0.15, 0.48]], ([x, z], i) =>
      i % 3 ? b.box(0.16, 0.26, 0.06, x, 0.04, z, 'stone') : b.box(0.04, 0.3, 0.04, x, 0.04, z, 'stone').box(0.16, 0.04, 0.04, x, 0.24, z, 'stone'));
  },
  observatory(b, r) {
    b.cyl(0.55, 0.62, 0.9, 0, 0, 0, 'plaster', 20).dome(0.56, 0, 0.9, 0, r)
      .add(new THREE.CylinderGeometry(0.07, 0.1, 0.85, 10), 'gold', 0.18, 1.38, 0.18, 0.8, 0, -0.75)
      .box(0.2, 0.32, 0.05, 0, 0, 0.6, 'wood').win(0.3, 0.45, 0.5, 0.1, 0.18, 0.55);
  },
  smithy(b, r) {
    b.box(1.05, 0.7, 0.9, -0.15, 0, -0.2, 'stone').gable(1.15, 1.0, 0.45, -0.15, 0.7, -0.2, r)
      .box(0.22, 1.35, 0.22, 0.25, 0, -0.45, 'stone').box(0.18, 0.06, 0.18, 0.25, 1.35, -0.45, 'glow')
      .box(0.4, 0.22, 0.32, -0.45, 0, 0.5, 'stone').box(0.3, 0.06, 0.22, -0.45, 0.22, 0.5, 'glow')
      .box(0.22, 0.1, 0.1, 0.35, 0.18, 0.45, 'dark').box(0.1, 0.18, 0.08, 0.35, 0, 0.45, 'dark').win(-0.15, 0.3, 0.26, 0.24, 0.22);
  },
  library(b, r) {
    b.box(1.4, 1.0, 0.95, 0, 0, -0.1, 'plaster').gable(1.5, 1.05, 0.5, 0, 1.0, -0.1, r)
      .box(0.28, 0.42, 0.05, 0, 0, 0.38, 'wood');
    each([-0.5, -0.25, 0.25, 0.5], x => b.win(x, 0.3, 0.38, 0.12, 0.5));
    b.box(1.44, 0.06, 0.06, 0, 0.92, 0.38, 'gold');
  },
  school_of_magic(b, r) {
    b.box(1.0, 0.35, 1.0, 0, 0, 0, 'stone').cyl(0.3, 0.4, 1.8, 0, 0.35, 0, 'ivory', 12).cone(0.42, 0.95, 0, 2.15, 0, r, 12)
      .add(new THREE.OctahedronGeometry(0.17), 'magic', 0, 3.35, 0).win(0, 1.6, 0.33, 0.1, 0.22).win(0, 1.0, 0.37, 0.1, 0.2)
      .ball(0.06, 0.32, 2.9, 0.1, 'magic').ball(0.05, -0.28, 3.05, -0.12, 'magic');
  },
  wishing_well(b, r) {
    b.box(1.5, 0.04, 1.4, 0, 0, 0, 'leaf').cyl(0.4, 0.42, 0.38, 0, 0.04, 0, 'stone', 18).cyl(0.33, 0.33, 0.02, 0, 0.4, 0, 'magic', 18)
      .gable(0.95, 0.5, 0.32, 0, 1.0, 0, r, PI / 2).box(0.6, 0.03, 0.03, 0, 0.82, 0, 'wood')
      .cyl(0.07, 0.06, 0.1, 0, 0.6, 0, 'wood', 8);
    each(LR, s => b.box(0.06, 0.62, 0.06, s * 0.36, 0.4, 0, 'wood'));
  },
  map_room(b, r) {
    b.box(1.2, 0.75, 0.9, -0.1, 0, -0.25, 'plaster').gable(1.3, 1.0, 0.45, -0.1, 0.75, -0.25, r)
      .box(0.24, 0.36, 0.05, -0.3, 0, 0.21, 'wood').win(0.15, 0.3, 0.21, 0.16, 0.22)
      .cyl(0.05, 0.08, 0.35, 0.45, 0, 0.5, 'gold', 8).ball(0.22, 0.45, 0.58, 0.5, 'water')
      .add(new THREE.TorusGeometry(0.26, 0.02, 6, 24), 'gold', 0.45, 0.58, 0.5, 0.6);
  },
  secret_vault(b, r) {
    b.box(1.1, 0.55, 0.95, 0, 0, -0.1, 'dark').dome(0.42, 0, 0.55, -0.1, r).box(0.36, 0.44, 0.05, 0, 0, 0.39, 'gold')
      .cyl(0.06, 0.06, 0.03, 0, 0.24, 0.42, 'dark', 10);
    each([[0.45, 0.55], [0.6, 0.4], [0.52, 0.45]], ([x, z], i) => b.cyl(0.1, 0.1, 0.05, x, i * 0.05, z, 'gold', 12));
  },
  great_wall(b, r) {
    b.box(1.6, 0.7, 0.38, 0, 0, 0, 'stone').box(0.3, 0.42, 0.05, 0, 0, 0.2, 'wood');
    for (let i = -3; i <= 3; i++) b.box(0.12, 0.14, 0.38, i * 0.2, 0.7, 0, 'stone');
    each(LR, s => b.box(0.42, 1.08, 0.52, s * 0.66, 0, 0, 'stone').pyr(0.48, 0.38, s * 0.66, 1.08, 0, r).win(s * 0.66, 0.7, 0.27, 0.08, 0.16));
  },
  quarry(b, r) {
    b.box(1.55, 0.04, 1.45, 0, 0, 0, 'rock');
    each([[-0.4, 0.25, -0.3, 0.32], [0.05, 0.2, -0.45, 0.26], [-0.55, 0.15, 0.3, 0.18], [0.4, 0.12, 0.45, 0.14]], ([x, y, z, s]) =>
      b.add(new THREE.DodecahedronGeometry(s), 'rock', x, y, z, x * 3));
    b.box(0.08, 1.1, 0.08, 0.5, 0, -0.4, 'wood').box(0.6, 0.06, 0.06, 0.3, 1.05, -0.4, 'wood')
      .box(0.4, 0.18, 0.28, 0.25, 0.08, 0.3, 'wood').box(0.24, 0.12, 0.2, 0.25, 0.26, 0.3, 'stone');
    each(LR, s => b.cyl(0.08, 0.08, 0.04, 0.25 + s * 0.16, 0, 0.45, 'dark', 10));
  },
  basilica(b, r) {
    b.box(1.3, 0.8, 1.2, 0, 0, 0, 'ivory').cyl(0.42, 0.42, 0.2, 0, 0.8, 0, 'ivory', 18).dome(0.43, 0, 1.0, 0, r)
      .cone(0.04, 0.3, 0, 1.4, 0, 'gold').box(0.3, 0.45, 0.05, 0, 0, 0.61, 'wood').win(0, 0.6, 0.61, 0.16, 0.12);
    each(LR, sx => each(LR, sz => b.dome(0.18, sx * 0.5, 0.8, sz * 0.45, r)));
  },
  capitol(b, r) {
    b.box(1.55, 0.12, 1.3, 0, 0, 0, 'stone').box(1.35, 0.72, 0.85, 0, 0.12, -0.15, 'ivory')
      .box(1.4, 0.1, 1.15, 0, 0.84, 0, 'ivory').gable(1.35, 0.28, 0.25, 0, 0.94, 0.42, 'ivory')
      .cyl(0.4, 0.4, 0.35, 0, 0.94, -0.15, 'ivory', 18).dome(0.41, 0, 1.29, -0.15, 'gold').cone(0.04, 0.25, 0, 1.68, -0.15, r);
    each([-0.55, -0.33, -0.11, 0.11, 0.33, 0.55], x => b.cyl(0.05, 0.05, 0.72, x, 0.12, 0.45, 'ivory', 10));
    b.box(0.3, 0.38, 0.05, 0, 0.12, 0.29, 'glow');
  },
  ivory_tower(b, r) {
    b.cyl(0.32, 0.36, 0.2, 0, 0, 0, 'stone', 14).cyl(0.2, 0.3, 2.7, 0, 0.2, 0, 'ivory', 14)
      .cyl(0.215, 0.215, 0.12, 0, 2.2, 0, r, 14).cone(0.28, 0.65, 0, 2.9, 0, 'gold', 14).cyl(0.26, 0.21, 0.08, 0, 2.82, 0, 'ivory', 14);
    each([0.7, 1.3, 1.9], y => b.win(0, y, 0.25, 0.07, 0.2));
  },
  laboratory(b, r) {
    b.cyl(0.36, 0.42, 1.15, -0.25, 0, -0.2, 'stone', 12).cone(0.46, 0.55, -0.25, 1.15, -0.2, r, 12)
      .box(0.6, 0.5, 0.55, 0.38, 0, 0.25, 'stone').gable(0.66, 0.6, 0.28, 0.38, 0.5, 0.25, r)
      .win(-0.25, 0.7, 0.2, 0.1, 0.2).ball(0.1, 0.25, 0.62, 0.62, 'toxic').ball(0.07, 0.45, 0.6, 0.62, 'toxic')
      .ball(0.08, 0.62, 0.62, 0.58, 'magic').box(0.6, 0.04, 0.2, 0.42, 0.5, 0.62, 'wood');
  },
};

const proto = new Map();
export function makeBuilding(id) {
  if (!proto.has(id)) {
    const b = new B();
    (RECIPES[id] || RECIPES.manor)(b, HUE[DIST[id]?.[1] || 'purple']);
    proto.set(id, b.done());
  }
  return proto.get(id).clone();
}

// ── card art: render each district once into a transparent PNG ─────────────
export async function renderThumbs(ids, size = 320) {
  const canvas = document.createElement('canvas');
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setSize(size, size, false);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r);
  scene.environment = pm.fromScene(warmEnvironment(), 0.03).texture;
  scene.environmentIntensity = 0.75;
  scene.add(new THREE.HemisphereLight(0xbfd2ff, 0x2a1d12, 0.6));
  const key = new THREE.DirectionalLight(0xffe2b0, 2.6);
  key.position.set(3, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 4;
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2 });
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x7f9cff, 1.4);
  rim.position.set(-4, 3, -4);
  scene.add(rim);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.12, 0.12, 40), std({ color: 0x3a3229, roughness: 0.7 }));
  base.position.y = -0.06;
  base.receiveShadow = true;
  scene.add(base);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  const out = {};
  for (const id of ids) {
    const m = makeBuilding(id);
    scene.add(m);
    const box = new THREE.Box3().setFromObject(m);
    const h = Math.max(1.4, box.max.y);
    const target = new THREE.Vector3(0, h * 0.42, 0);
    cam.position.set(2.2, 1.7 + h * 0.45, 3.0).normalize().multiplyScalar(3.4 + h * 0.75).add(new THREE.Vector3(0, h * 0.1, 0));
    cam.lookAt(target);
    r.render(scene, cam);
    out[id] = canvas.toDataURL('image/png');
    scene.remove(m);
    await new Promise(r => (document.hidden ? setTimeout(r, 0) : requestAnimationFrame(r))); // rAF never fires in background tabs
  }
  pm.dispose();
  r.dispose();
  r.forceContextLoss();
  return out;
}
