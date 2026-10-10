// Murs (pierre, brique, enduit, palissade…) avec ouvertures (porte en bois, grille en métal, passage),
// plantes grimpantes (lierre, passiflore, glycine…) et escaliers de plusieurs types.
// Tout est généré en géométrie low poly (couleurs par face) fusionnée en un seul maillage.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const WALL_TYPES = {
  stone: { name: 'Pierre', color: '#b9b2a1', bl: [0.17, 0.3], var: 0.07 },
  ashlar: { name: 'Pierre de taille', color: '#d8d0bb', bl: [0.26, 0.4], var: 0.03 },
  dry: { name: 'Pierre sèche', color: '#8f8a7e', bl: [0.1, 0.24], var: 0.12 },
  brick: { name: 'Brique', color: '#b4533a', bl: [0.09, 0.1], var: 0.06, rowK: 0.5 },
  plaster: { name: 'Enduit', color: '#efe6d2', smooth: true },
  wood: { name: 'Palissade en bois', color: '#a9794c', planks: true },
};
export const OPENING_KINDS = { door: 'Porte en bois', doorarch: 'Porte cintrée', gate: 'Grille en métal', gatearch: 'Grille cintrée', arch: 'Passage ouvert' };
export const PLANTS = {
  none: { name: 'Aucune' },
  ivy: { name: 'Lierre', leaves: ['#2f6b34', '#3e8040', '#27592c'], size: 0.05, density: 1.0 },
  virginia: { name: 'Vigne vierge', leaves: ['#c23b22', '#d9631e', '#8a2a1e', '#6a8f2f'], size: 0.055, density: 0.9 },
  passion: { name: 'Passiflore', leaves: ['#4a9a45', '#5aaa50', '#3f8a3e'], size: 0.045, density: 0.7, flowers: ['#f3f0fa', '#7b5ec7', '#ffffff'], fp: 0.11 },
  rose: { name: 'Rosier grimpant', leaves: ['#2f7a36', '#3d8a3e'], size: 0.04, density: 0.7, flowers: ['#e6679a', '#f3a7c3', '#d93a4a', '#f7e8ea'], fp: 0.16 },
  clematis: { name: 'Clématite', leaves: ['#4a9a45', '#3a8a3c'], size: 0.04, density: 0.65, flowers: ['#7a52c8', '#9a72e0', '#5a3aa8'], fp: 0.17 },
  jasmine: { name: 'Jasmin', leaves: ['#3f8a3e', '#4f9a48'], size: 0.035, density: 0.7, flowers: ['#ffffff', '#fff7e0'], fp: 0.18 },
  wisteria: { name: 'Glycine', leaves: ['#5aa44a', '#4a9040'], size: 0.045, density: 0.6, hang: ['#a58be0', '#8e6fd0', '#b9a3ee'] },
};
export const BRIDGE_TYPES = { wood: 'Passerelle en bois', woodarch: 'Pont en bois arqué', arch: 'Pont de pierre en dos d\'âne', rope: 'Pont de corde' };
// hauteur du dessus du tablier (repère du pont : origine au milieu, y = 0 aux extrémités) à l'abscisse lz le long du pont
export function bridgeDeckY(d, lz) {
  const u = Math.max(-1, Math.min(1, (2 * lz) / d.len)), k = 1 - u * u;
  return d.type === 'arch' || d.type === 'woodarch' ? d.h * k : d.type === 'rope' ? -d.h * 0.6 * k : 0;
}
export const STAIR_TYPES = { stone: 'Pierre', wood: 'Bois avec rampe', round: 'Marches rondes', spiral: 'Colimaçon' };

const SRGB = THREE.SRGBColorSpace;
const UP = new THREE.Vector3(0, 1, 0);
const _hsl = {};

// ctx : { finish, hashPos, mulberry32, clamp, getHF, getGroundR, samples }
export function createWalls(ctx) {
  const { finish, hashPos, mulberry32, clamp } = ctx;

  const toneFn = (alba) => (hex, dl = 0) => {
    const c = new THREE.Color(hex);
    c.getHSL(_hsl, SRGB);
    let s = _hsl.s, l = clamp(_hsl.l + dl, 0, 1);
    if (alba) { s = Math.min(1, s * 0.95 + 0.06); l = l * 0.85 + 0.15; }
    return new THREE.Color().setHSL(_hsl.h, s, l, SRGB);
  };
  const collector = (alba) => {
    const parts = [], T = toneFn(alba);
    return {
      parts, T,
      add(geo, hex, dl = 0) { const col = T(hex, dl); parts.push(finish(geo, () => col)); },
      done() {
        if (!parts.length) return null;
        const g = parts.length > 1 ? mergeGeometries(parts) : parts[0];
        if (parts.length > 1) parts.forEach((q) => q.dispose());
        return g;
      },
    };
  };
  // boîte orientée (rotation autour de Y) posée à (x, y, z)
  const box = (w, h, d, x, y, z, rotY = 0) => {
    const b = new THREE.BoxGeometry(w, h, d);
    if (rotY) b.rotateY(rotY);
    b.translate(x, y, z);
    return b;
  };
  // poutre entre deux points (axe long = Z de la boîte)
  const beam = (a, b, wd, ht) => {
    const d = b.clone().sub(a), len = d.length();
    const g = new THREE.BoxGeometry(wd, ht, len);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return g;
  };
  const vnoise = (x, seed) => { // bruit 1D lisse dans [0,1]
    const i = Math.floor(x), f = x - i, a = hashPos(i, 0, 0, seed), b = hashPos(i + 1, 0, 0, seed), u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };

  // ============================== MURS ==============================
  function build(p) {
    const S = ctx.samples(p);
    if (!S.pts || S.pts.length < 2) return null;
    const hf = ctx.getHF(), lim = ctx.getGroundR() * 0.985;
    const gy = (x, z) => (hf ? hf(x, z) : 0);
    const type = WALL_TYPES[p.type] || WALL_TYPES.stone;
    const C = collector(p.alba);
    const rng = mulberry32(p.seed || 1);
    const H = p.h, thick = p.t;
    const color = p.color || type.color;

    // courbe en polyligne + abscisses cumulées
    const P2 = S.closed ? [...S.pts, S.pts[0]] : S.pts;
    const L = [0];
    for (let i = 1; i < P2.length; i++) L.push(L[i - 1] + Math.hypot(P2[i].x - P2[i - 1].x, P2[i].z - P2[i - 1].z));
    const total = L[L.length - 1];
    if (total < 0.05) return null;
    const frame = (s) => {
      s = clamp(s, 0, total);
      let lo = 1, hi = P2.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (L[m] < s) lo = m + 1; else hi = m; }
      const a = P2[lo - 1], b = P2[lo], seg = Math.max(1e-6, L[lo] - L[lo - 1]), f = (s - L[lo - 1]) / seg;
      const tx = (b.x - a.x) / seg, tz = (b.z - a.z) / seg;
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, tx, tz, nx: -tz, nz: tx };
    };
    const yaw = (fr) => Math.atan2(fr.tx, fr.tz);
    // niveau du dessus : terrain lissé le long du mur + hauteur
    const topAt = (s) => {
      let sum = 0, n = 0;
      for (let k = -2; k <= 2; k++) { const f = frame(s + k * 0.25); sum += gy(f.x, f.z); n++; }
      return sum / n + H;
    };
    const outside = (x, z, m = 0) => Math.hypot(x, z) > lim - m;

    // ouvertures : intervalles [a, b] le long du mur ; les piliers élargissent la zone pleine
    const pw = thick * 1.6 + 0.05;
    const ivs = (p.openings || []).map((o) => {
      const c = clamp(o.pos, 0, 1) * total, w = Math.min(o.w, total * 0.9);
      const a = clamp(c - w / 2, 0.02, total - 0.02), b = clamp(c + w / 2, 0.02, total - 0.02);
      const gate = o.kind === 'gate' || o.kind === 'gatearch';
      return { o, a, b, pil: gate || p.pillars, gate, lintel: !gate, oh: Math.max(0.12, Math.min(H - 0.06, o.h ?? 0.34)) };
    }).sort((x, y) => x.a - y.a);
    const solid = [];
    let cur = 0;
    for (const v of ivs) {
      const a2 = v.a - (v.pil ? pw : 0);
      if (a2 > cur + 0.01) solid.push([cur, a2]);
      cur = Math.max(cur, v.b + (v.pil ? pw : 0));
    }
    if (cur < total - 0.01) solid.push([cur, total]);
    const inOpening = (s, m = 0) => ivs.some((v) => s > v.a - m - (v.pil ? pw : 0) && s < v.b + m + (v.pil ? pw : 0));

    // ---- maçonnerie : assises en quinconce (la hauteur de chaque bloc suit le terrain) ----
    const rowH = clamp(H / 5, 0.045, 0.12) * (type.rowK || 1);
    const course = (a, b, bottomOf) => {
      // blocs sur [a, b] ; bottomOf(s0, s1) = pied de la zone
      let rMax = 1;
      for (let s = a; s <= b; s += 0.25) rMax = Math.max(rMax, Math.ceil((topAt(s) - bottomOf(s, s)) / rowH) + 1);
      for (let r = 0; r < rMax; r++) {
        let s = a, first = true;
        while (s < b - 1e-3) {
          let bl = type.bl[0] + (type.bl[1] - type.bl[0]) * rng();
          if (first && r % 2) bl *= 0.5;
          first = false;
          if (s + bl > b - 0.05) bl = b - s;
          const mid = s + bl / 2, fr = frame(mid);
          const bot = bottomOf(s, s + bl), top = topAt(mid), rows = Math.max(1, Math.round((top - bot) / rowH)), rh = (top - bot) / rows;
          if (r < rows && !outside(fr.x, fr.z, bl * 0.5)) {
            const tk = thick * (0.93 + rng() * 0.1);
            const bx = box(tk, rh * 0.95, bl * 0.97, fr.x, bot + rh * (r + 0.5), fr.z, yaw(fr) + (rng() - 0.5) * (p.type === 'dry' ? 0.18 : 0.04));
            C.add(bx, color, (rng() - 0.5) * 2 * type.var + (r === rows - 1 ? 0.03 : 0));
          }
          s += bl;
        }
      }
    };
    // dalles lisses (enduit) : prisme extrudé sur [a, b]
    const slab = (a, b, bottomOf) => {
      const n = Math.max(1, Math.ceil((b - a) / 0.14));
      for (let i = 0; i < n; i++) {
        const s0 = a + ((b - a) * i) / n, s1 = a + ((b - a) * (i + 1)) / n, f0 = frame(s0), f1 = frame(s1), fm = frame((s0 + s1) / 2);
        if (outside(fm.x, fm.z)) continue;
        const bot = bottomOf(s0, s1), top = topAt((s0 + s1) / 2), hw = thick / 2;
        const V = (f, side, y) => [f.x + f.nx * hw * side, y, f.z + f.nz * hw * side];
        const q = [V(f0, -1, bot), V(f0, 1, bot), V(f1, 1, bot), V(f1, -1, bot), V(f0, -1, top), V(f0, 1, top), V(f1, 1, top), V(f1, -1, top)];
        const quad = (i0, i1, i2, i3) => [...q[i0], ...q[i1], ...q[i2], ...q[i0], ...q[i2], ...q[i3]];
        const pos = [...quad(1, 0, 4, 5), ...quad(3, 2, 6, 7), ...quad(4, 7, 6, 5), ...quad(0, 3, 7, 4), ...quad(2, 1, 5, 6)];
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        C.add(g, color, (hashPos(i, a, 0, 3) - 0.5) * 0.03);
      }
    };
    // palissade : planches verticales + deux lisses
    const planks = (a, b) => {
      const pk = 0.1, pt = Math.min(thick, 0.05);
      for (let s = a + pk / 2; s < b; s += pk + 0.008) {
        const fr = frame(s);
        if (outside(fr.x, fr.z)) continue;
        const h = H * (0.9 + rng() * 0.1), base = gy(fr.x, fr.z) - 0.04;
        const g = new THREE.BoxGeometry(pk, h, pt);
        const pp = g.attributes.position;
        if (p.pointed !== false) for (let i = 0; i < pp.count; i++) if (pp.getY(i) > 0) pp.setX(i, pp.getX(i) * 0.05); // sommet en pointe
        g.rotateY(yaw(fr));
        g.translate(fr.x, base + h / 2, fr.z);
        C.add(g, color, (rng() - 0.5) * 0.12);
      }
      for (const k of [0.3, 0.72]) {
        for (let s = a; s < b - 0.01; s += 0.4) {
          const e = Math.min(b, s + 0.4), f0 = frame(s), f1 = frame(e), fm = frame((s + e) / 2);
          if (outside(fm.x, fm.z)) continue;
          const y = gy(fm.x, fm.z) - 0.04 + H * k;
          const off = pt / 2 + 0.01;
          C.add(beam(V3(f0.x + f0.nx * off, y, f0.z + f0.nz * off), V3(f1.x + f1.nx * off, y, f1.z + f1.nz * off), 0.012, 0.03), color, -0.08);
        }
      }
    };
    const terr = (s0, s1) => { const a = frame(s0), b = frame(s1); return Math.min(gy(a.x, a.z), gy(b.x, b.z)) - 0.04; };
    const masonry = !type.smooth && !type.planks;
    const bodyFn = (a, b, bottomOf) => (masonry ? course(a, b, bottomOf) : type.smooth ? slab(a, b, bottomOf) : planks(a, b));
    for (const [a, b] of solid) bodyFn(a, b, terr);
    for (const v of ivs) {
      if (!v.lintel || type.planks) continue;
      const fc = frame((v.a + v.b) / 2), y0 = gy(fc.x, fc.z) + v.oh; // linteau au-dessus de l'ouverture
      if (topAt((v.a + v.b) / 2) - y0 > 0.02) bodyFn(v.a, v.b, () => y0);
    }
    // chaperon (dessus du mur)
    if (p.cap && !type.planks) {
      const spans = [...solid, ...ivs.filter((v) => v.lintel).map((v) => [v.a, v.b])];
      for (const [a, b] of spans) {
        for (let s = a; s < b - 0.01; s += 0.36) {
          const e = Math.min(b, s + 0.36), mid = (s + e) / 2, fr = frame(mid);
          if (outside(fr.x, fr.z)) continue;
          C.add(box(thick * 1.3, 0.035, e - s + 0.005, fr.x, topAt(mid) + 0.0175, fr.z, yaw(fr)), color, 0.07);
        }
      }
    }
    // piliers : aux extrémités, à côté des grilles et tous les ~2,4 si demandé
    if (!type.planks) {
      const pillarAt = (s) => {
        const fr = frame(s);
        if (outside(fr.x, fr.z)) return;
        const base = gy(fr.x, fr.z) - 0.05, top = topAt(s) + 0.1, w = pw;
        C.add(box(w, top - base, w, fr.x, (top + base) / 2, fr.z, yaw(fr)), color, 0.02);
        C.add(box(w * 1.25, 0.04, w * 1.25, fr.x, top + 0.02, fr.z, yaw(fr)), color, 0.08);
        const cone = new THREE.ConeGeometry(w * 0.55, w * 0.7, 4);
        cone.rotateY(Math.PI / 4 + yaw(fr));
        cone.translate(fr.x, top + 0.04 + w * 0.35, fr.z);
        C.add(cone, color, 0.05);
      };
      if (p.pillars) {
        if (!S.closed) { pillarAt(pw / 2); pillarAt(total - pw / 2); }
        for (let s = 2.4; s < total - 1.2; s += 2.4) if (!inOpening(s, pw)) pillarAt(s);
      }
      for (const v of ivs) if (v.pil) { pillarAt(v.a - pw / 2); pillarAt(v.b + pw / 2); }
    }

    // ---- ouvertures : porte en bois ou grille en métal ----
    const leafMatrix = (hingeS, dirSign, ang, y) => {
      const fr = frame(hingeS);
      const ex = new THREE.Vector3(fr.tx * dirSign, 0, fr.tz * dirSign);
      const ez = new THREE.Vector3().crossVectors(ex, UP);
      const m = new THREE.Matrix4().makeBasis(ex, UP, ez);
      m.setPosition(fr.x, y, fr.z);
      return new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeRotationY(-ang));
    };
    for (const v of ivs) {
      const o = v.o, w = v.b - v.a, fc = frame((v.a + v.b) / 2), y0 = gy(fc.x, fc.z), open = clamp((o.open ?? 0) / 100, 0, 1) * 1.45;
      if (o.kind === 'door' || o.kind === 'doorarch') {
        const dh = v.oh * 0.97, n = Math.max(2, Math.round(w / 0.055)), lw = w, parts = [];
        const tint = o.color || '#7a5230';
        const arch = o.kind === 'doorarch', R = Math.min(lw / 2, dh * 0.6), hr = dh - R; // arche : demi-cercle de rayon R au sommet
        const topAtX = (x) => (arch ? hr + Math.sqrt(Math.max(0, R * R - (x - lw / 2) ** 2)) : dh);
        for (let i = 0; i < n; i++) {
          const xc = (i + 0.5) * (lw / n), ph = Math.max(0.05, topAtX(xc));
          parts.push([box((lw / n) * 0.94, ph, 0.03, xc, ph / 2, 0), tint, (i % 2 ? -0.03 : 0.03) + (rng() - 0.5) * 0.04]);
        }
        for (const k of arch ? [0.2, 0.5] : [0.25, 0.75]) parts.push([box(lw, 0.035, 0.014, lw / 2, dh * k, 0.022), tint, -0.1]);
        parts.push([box(0.02, 0.05, 0.02, lw * 0.88, dh * 0.5, 0.035), '#2c2f34', 0]);
        for (const k of arch ? [0.15, 0.55] : [0.2, 0.8]) parts.push([box(0.06, 0.02, 0.016, 0.03, dh * k, 0.03), '#2c2f34', 0]);
        if (arch) { // écoinçons : la maçonnerie comble les angles entre l'arche et le linteau
          for (let i = 0; i < n; i++) {
            const xc = (i + 0.5) * (lw / n), ph = topAtX(xc), gap = v.oh - ph;
            if (gap < 0.006) continue;
            const f = frame(v.a + xc);
            C.add(box(lw / n + 0.002, gap, thick * 0.95, f.x, y0 + ph + gap / 2, f.z, yaw(f)), color, -0.03);
          }
        }
        const M = leafMatrix(v.a, 1, open, y0);
        for (const [g, hex, dl] of parts) { g.applyMatrix4(M); C.add(g, hex, dl); }
        // seuil
        C.add(box(w + 0.02, 0.025, thick * 1.1, fc.x, y0 + 0.005, fc.z, yaw(fc)), color, -0.08);
      } else if (o.kind === 'gate' || o.kind === 'gatearch') {
        const gh = Math.min(H - 0.02, v.oh * 1.15) * (o.kind === 'gatearch' ? 1 : 0.95), tint = o.color || '#2e3238';
        const arch = o.kind === 'gatearch';
        const heightAt = (u) => gh * (arch ? 0.72 + 0.28 * Math.sin(Math.PI * clamp(u, 0, 1)) : 1);
        for (const [hinge, sign] of [[v.a, 1], [v.b, -1]]) {
          const lw = w / 2, nb = Math.max(2, Math.round(lw / 0.042)), parts = [];
          for (let i = 0; i <= nb; i++) {
            const x = (i / nb) * lw, u = hinge === v.a ? (x / w) : 1 - x / w, hh = heightAt(u), thk = i === 0 || i === nb ? 0.02 : 0.011;
            parts.push([box(thk, hh, thk, x, hh / 2 + 0.03, 0), tint]);
            const sp = new THREE.ConeGeometry(0.014, 0.045, 4);
            sp.translate(x, hh + 0.03 + 0.022, 0);
            parts.push([sp, tint]);
          }
          for (const k of [0.1, 0.5]) parts.push([box(lw, 0.014, 0.014, lw / 2, gh * k + 0.03, 0.006), tint]);
          if (arch) for (let i = 0; i < nb; i++) parts.push([box(lw / nb, 0.014, 0.014, ((i + 0.5) / nb) * lw, heightAt((hinge === v.a ? ((i + 0.5) / nb) * lw / w : 1 - ((i + 0.5) / nb) * lw / w)) - 0.01, 0.006), tint]);
          else parts.push([box(lw, 0.014, 0.014, lw / 2, gh - 0.02, 0.006), tint]);
          const M = leafMatrix(hinge, sign, open * sign, y0);
          for (const [g, hex] of parts) { g.applyMatrix4(M); C.add(g, hex, 0); }
        }
      }
    }

    plants(p, C, { total, frame, topAt, inOpening, gy, outside, thick, yaw });
    return C.done();
  }
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---- plantes grimpantes : feuilles et fleurs posées sur la face du mur ----
  function plants(p, C, w) {
    const def = PLANTS[p.plant];
    if (!def || p.plant === 'none' || !(p.plantAmt > 0)) return;
    const { total, frame, topAt, inOpening, gy, outside, thick } = w;
    const rng = mulberry32((p.seed || 1) + 777);
    const sides = p.plantSide === 'left' ? [-1] : p.plantSide === 'right' ? [1] : [-1, 1];
    let budget = 3200;
    const leaf = new THREE.OctahedronGeometry(1, 0);
    for (const side of sides) {
      for (let s = 0.03; s < total && budget > 0; s += def.size * (1.1 + rng() * 0.5)) {
        if (inOpening(s, 0.05)) continue;
        const fr = frame(s), base = gy(fr.x, fr.z), top = topAt(s);
        // couverture : bande plus ou moins haute selon un bruit lisse (le lierre monte par plaques)
        const cover = clamp(vnoise(s * 1.1 + side * 7, (p.seed || 1) % 997) * 1.4 - (1 - p.plantAmt) * 1.25 + 0.15, 0, 1);
        if (cover < 0.04) continue;
        const hh = (top - base) * cover + 0.02;
        const n = Math.max(1, Math.round((hh / def.size) * def.density * 0.8));
        const ex = V3(fr.tx * side, 0, fr.tz * side), ez = V3(fr.nx * side, 0, fr.nz * side);
        for (let k = 0; k < n && budget > 0; k++) {
          const y = base + 0.01 + (k / n) * hh * (0.85 + rng() * 0.3);
          const sz = def.size * (0.75 + rng() * 0.6);
          const g = leaf.clone();
          g.scale(sz, sz * 0.62, sz * 0.03); // feuille plate, collée au mur
          g.rotateZ(rng() * Math.PI * 2);
          const out = thick / 2 + 0.012 + rng() * 0.035, along = (rng() - 0.5) * def.size * 1.6;
          const m = new THREE.Matrix4().makeBasis(ex, UP, ez);
          m.setPosition(fr.x + fr.tx * along + ez.x * out, y, fr.z + fr.tz * along + ez.z * out);
          g.applyMatrix4(m);
          if (outside(fr.x, fr.z)) continue;
          C.add(g, def.leaves[Math.floor(rng() * def.leaves.length)], (rng() - 0.5) * 0.08);
          budget--;
          if (def.flowers && rng() < def.fp) {
            const f = new THREE.IcosahedronGeometry(def.size * 0.55, 0);
            f.translate(fr.tx * along + ez.x * (out + 0.02) + fr.x, y + (rng() - 0.5) * 0.02, fr.tz * along + ez.z * (out + 0.02) + fr.z);
            C.add(f, def.flowers[Math.floor(rng() * def.flowers.length)], (rng() - 0.5) * 0.06);
            budget--;
          }
        }
        // glycine : grappes qui pendent du haut
        if (def.hang && rng() < 0.5 * p.plantAmt) {
          const hh2 = 0.12 + rng() * 0.12, cone = new THREE.ConeGeometry(0.03 + rng() * 0.02, hh2, 5);
          cone.rotateX(Math.PI);
          const out = thick / 2 + 0.03;
          cone.translate(fr.x + ez.x * out, top - hh2 / 2 + 0.03, fr.z + ez.z * out);
          C.add(cone, def.hang[Math.floor(rng() * def.hang.length)], (rng() - 0.5) * 0.06);
          budget--;
        }
      }
    }
    leaf.dispose();
  }

  // ============================== ESCALIERS ==============================
  // origine au pied de la première marche (centre, devant), monte vers +Z ; d = { type, steps, w, sh, rail, color, seed, alba }
  function buildStairs(d) {
    const C = collector(d.alba), rng = mulberry32(d.seed || 1);
    const n = Math.max(2, Math.round(d.steps)), w = d.w, sh = d.sh, dp = Math.max(0.05, sh * 1.9), col = d.color;
    const total = n * sh;
    const rails = (zEnd, rx, hexRail) => { // rampe : poteaux + main courante inclinée, de chaque côté
      for (const sx of [-1, 1]) {
        const x = sx * rx;
        for (let i = 0; i <= n; i += Math.max(1, Math.round(n / 5))) {
          const z = i * dp, y = i * sh;
          C.add(box(0.025, 0.16, 0.025, x, y + 0.08, z), hexRail, 0);
        }
        C.add(beam(V3(x, 0.16, 0), V3(x, total + 0.16, n * dp), 0.025, 0.02), hexRail, 0.03);
      }
    };
    if (d.type === 'wood') {
      for (let i = 0; i < n; i++) C.add(box(w, 0.035, dp * 0.95, 0, (i + 1) * sh - 0.0175, i * dp + dp / 2), col, (rng() - 0.5) * 0.08);
      for (const sx of [-1, 1]) {
        C.add(beam(V3(sx * (w / 2 - 0.02), 0.0, 0), V3(sx * (w / 2 - 0.02), total - 0.05, n * dp), 0.04, 0.09), col, -0.1);
        for (let i = 2; i < n; i += 3) C.add(box(0.035, (i + 1) * sh, 0.035, sx * (w / 2 - 0.02), ((i + 1) * sh) / 2, i * dp + dp / 2), col, -0.14);
      }
      if (d.rail) rails(n * dp, w / 2, col);
    } else if (d.type === 'round') {
      const r0 = w / 2 + 0.1;
      for (let i = 0; i < n; i++) {
        const r = r0 * (1 - (i / n) * 0.72), h = (i + 1) * sh + 0.1;
        const c = new THREE.CylinderGeometry(r, r * 1.02, h, 14, 1);
        c.translate(0, h / 2 - 0.1, r0);
        C.add(c, col, (rng() - 0.5) * 0.05 + i * 0.004);
      }
    } else if (d.type === 'spiral') {
      const per = 9, dth = (Math.PI * 2) / per, R = w / 2 + 0.06;
      const pole = new THREE.CylinderGeometry(0.035, 0.035, total + 0.2, 8);
      pole.translate(0, (total + 0.2) / 2, 0);
      C.add(pole, '#6d737c', 0);
      for (let i = 0; i < n; i++) {
        const t = new THREE.CylinderGeometry(R, R, 0.04, 5, 1, false, 0, dth * 1.3);
        t.rotateY(-i * dth);
        t.translate(0, (i + 1) * sh - 0.02, 0);
        C.add(t, col, (rng() - 0.5) * 0.06);
      }
      if (d.rail) {
        let prev = null;
        for (let i = 0; i < n; i++) {
          const a = -(i * dth) + dth * 0.65, x = Math.sin(a) * (R - 0.01), z = Math.cos(a) * (R - 0.01), y = (i + 1) * sh;
          C.add(box(0.02, 0.18, 0.02, x, y + 0.09, z), '#4a4f58', 0);
          const top = V3(x, y + 0.18, z);
          if (prev) C.add(beam(prev, top, 0.018, 0.018), '#4a4f58', 0.04);
          prev = top;
        }
      }
    } else { // pierre
      for (let i = 0; i < n; i++) C.add(box(w, (i + 1) * sh + 0.1, dp, 0, ((i + 1) * sh - 0.1) / 2, i * dp + dp / 2), col, (rng() - 0.5) * 0.06 + (i % 2 ? 0.02 : 0));
      for (const sx of [-1, 1]) { // joues latérales
        const steps = n;
        for (let i = 0; i < steps; i++) C.add(box(0.05, (i + 1) * sh + 0.1 + 0.05, dp, sx * (w / 2 + 0.025), ((i + 1) * sh - 0.05) / 2 + 0.025, i * dp + dp / 2), col, -0.06);
      }
      if (d.rail) rails(n * dp, w / 2 + 0.025, '#3a3f46');
    }
    return C.done();
  }

  // ============================== PONTS ==============================
  // le pont s'étend le long de Z, centré à l'origine ; d = { type, len, w, h, rail, color, seed, alba } ; gy(z) = hauteur du terrain sous le pont (repère du pont)
  function buildBridge(d, gy) {
    const C = collector(d.alba), rng = mulberry32(d.seed || 1);
    const L = d.len, W = d.w, col = d.color, yP = (z) => bridgeDeckY(d, z), ground = (z) => (gy ? gy(z) : -0.6);
    const seg = (a, b, wd, ht, hex, dl) => C.add(beam(a, b, wd, ht), hex, dl);
    if (d.type === 'arch') {
      const n = Math.max(10, Math.round(L / 0.09)), a = 0.36 * L;
      for (let i = 0; i < n; i++) {
        const z0 = -L / 2 + (L * i) / n, z1 = -L / 2 + (L * (i + 1)) / n, y0 = yP(z0), y1 = yP(z1), zc = (z0 + z1) / 2;
        seg(V3(0, y0 - 0.035, z0), V3(0, y1 - 0.035, z1), W, 0.07, col, (rng() - 0.5) * 0.06);
        if (d.rail) for (const sx of [-1, 1]) {
          seg(V3(sx * (W / 2 - 0.02), y0 + 0.06, z0), V3(sx * (W / 2 - 0.02), y1 + 0.06, z1), 0.05, 0.14, col, 0.02 + (rng() - 0.5) * 0.05);
          seg(V3(sx * (W / 2 - 0.02), y0 + 0.14, z0), V3(sx * (W / 2 - 0.02), y1 + 0.14, z1), 0.075, 0.03, col, 0.07);
        }
        // maçonnerie sous le tablier : culées pleines, arche au milieu
        const deckBottom = yP(zc) - 0.07;
        const G0 = Math.min(ground(0), ground(-a), ground(a)) - 0.05, crown = Math.max(G0 + 0.12, yP(0) - 0.07 - 0.1);
        const bottom = Math.abs(zc) >= a ? ground(zc) - 0.06 : G0 + (crown - G0) * Math.sqrt(1 - (zc / a) ** 2);
        const hh = deckBottom - bottom;
        if (hh > 0.01) C.add(box(W + 0.02, hh, L / n + 0.004, 0, bottom + hh / 2, zc), col, -0.05 + (rng() - 0.5) * 0.05);
      }
    } else if (d.type === 'woodarch') { // pont en bois arqué : tablier en dos d'âne, longerons courbes, arc de soutien dessous, pieds jusqu'au sol
      const n = Math.max(10, Math.round(L / 0.075)), m = 14, sxs = [-1, 1];
      for (let i = 0; i < n; i++) {
        const z0 = -L / 2 + (L * i) / n, z1 = -L / 2 + (L * (i + 1)) / n, zc = (z0 + z1) / 2;
        const g = new THREE.BoxGeometry(W, 0.035, (z1 - z0) * 0.9);
        g.rotateX(-Math.atan2(yP(z1) - yP(z0), z1 - z0));
        g.translate(0, yP(zc) - 0.0175, zc);
        C.add(g, col, (rng() - 0.5) * 0.08);
      }
      const rib = (z) => yP(z) - 0.1 - 0.35 * d.h * (1 - ((2 * z) / L) ** 2) * 0.6; // arc de soutien : plus bombé que le tablier
      for (const sx of sxs) {
        for (let i = 0; i < m; i++) {
          const z0 = -L / 2 + (L * i) / m, z1 = -L / 2 + (L * (i + 1)) / m, x = sx * (W / 2 - 0.04);
          seg(V3(x, yP(z0) - 0.065, z0), V3(x, yP(z1) - 0.065, z1), 0.05, 0.06, col, -0.1);   // longeron
          seg(V3(x, rib(z0), z0), V3(x, rib(z1), z1), 0.05, 0.05, col, -0.14);                // arc
        }
        for (let i = 0; i <= m; i += 2) { const z = -L / 2 + (L * i) / m, x = sx * (W / 2 - 0.04); const top = yP(z) - 0.095, bot = rib(z), hh = top - bot; if (hh > 0.02) C.add(box(0.04, hh, 0.04, x, bot + hh / 2, z), col, -0.12); } // montants
        for (const ez of [-1, 1]) { // pieds sous les culées
          const z = ez * L / 2, x = sx * (W / 2 - 0.04), top = rib(z), depth = Math.min(2.5, top - ground(z) + 0.05);
          if (depth > 0.03) C.add(box(0.06, depth, 0.06, x, top - depth / 2, z), col, -0.14);
        }
        if (d.rail) {
          for (let i = 0; i <= m * 2; i++) { const z = -L / 2 + (L * i) / (m * 2); C.add(box(0.035, 0.22, 0.035, sx * (W / 2 + 0.01), yP(z) + 0.11, z), col, -0.06); }
          for (let i = 0; i < m; i++) {
            const z0 = -L / 2 + (L * i) / m, z1 = -L / 2 + (L * (i + 1)) / m, x = sx * (W / 2 + 0.01);
            seg(V3(x, yP(z0) + 0.22, z0), V3(x, yP(z1) + 0.22, z1), 0.03, 0.03, col, 0.02);
            seg(V3(x, yP(z0) + 0.11, z0), V3(x, yP(z1) + 0.11, z1), 0.02, 0.02, col, -0.04);
          }
        }
      }
    } else if (d.type === 'rope') {
      const n = Math.max(8, Math.round(L / 0.075));
      for (let i = 0; i < n; i++) {
        const z0 = -L / 2 + (L * i) / n, z1 = -L / 2 + (L * (i + 1)) / n, zc = (z0 + z1) / 2, y = yP(zc);
        const g = new THREE.BoxGeometry(W, 0.03, (z1 - z0) * 0.88);
        g.rotateX(-Math.atan2(yP(z1) - yP(z0), z1 - z0));
        g.translate(0, y - 0.015, zc);
        C.add(g, col, (rng() - 0.5) * 0.1);
      }
      const m = 12;
      for (const sx of [-1, 1]) {
        for (let i = 0; i < m; i++) {
          const z0 = -L / 2 + (L * i) / m, z1 = -L / 2 + (L * (i + 1)) / m;
          seg(V3(sx * (W / 2 - 0.01), yP(z0) - 0.04, z0), V3(sx * (W / 2 - 0.01), yP(z1) - 0.04, z1), 0.018, 0.018, '#7a6246', -0.05); // corde porteuse
          if (d.rail) seg(V3(sx * (W / 2 + 0.01), yP(z0) + 0.2, z0), V3(sx * (W / 2 + 0.01), yP(z1) + 0.2, z1), 0.018, 0.018, '#7a6246', 0); // main courante
        }
        if (d.rail) for (let i = 0; i <= m; i++) { const z = -L / 2 + (L * i) / m; C.add(box(0.012, 0.22, 0.012, sx * (W / 2 + 0.01), yP(z) + 0.1, z), '#7a6246', -0.08); }
        for (const ez of [-1, 1]) { // gros poteaux d'ancrage aux extrémités
          const z = ez * L / 2, top = 0.34, bot = Math.min(ground(z) - 0.05, -0.1);
          C.add(box(0.07, top - bot, 0.07, sx * (W / 2 + 0.035), (top + bot) / 2, z), col, -0.14);
        }
      }
    } else { // passerelle en bois : planches, longerons, pieds jusqu'au sol, garde-corps
      const n = Math.max(4, Math.round(L / 0.075)), sxs = [-1, 1];
      for (let i = 0; i < n; i++) {
        const z = -L / 2 + ((i + 0.5) * L) / n;
        C.add(box(W, 0.035, (L / n) * 0.9, 0, -0.0175, z), col, (rng() - 0.5) * 0.08);
      }
      for (const sx of sxs) C.add(box(0.05, 0.06, L, sx * (W / 2 - 0.04), -0.065, 0), col, -0.1);
      const step = Math.max(0.35, L / Math.ceil(L / 0.6));
      for (let z = -L / 2 + 0.04; z <= L / 2 + 1e-3; z += step) {
        const depth = Math.min(2.5, -ground(z) - 0.06);
        if (depth > 0.04) for (const sx of sxs) C.add(box(0.06, depth, 0.06, sx * (W / 2 - 0.04), -0.095 - depth / 2, z), col, -0.14);
      }
      if (d.rail) for (const sx of sxs) {
        for (let z = -L / 2 + 0.03; z <= L / 2 + 1e-3; z += Math.max(0.3, L / Math.ceil(L / 0.4))) C.add(box(0.035, 0.22, 0.035, sx * (W / 2 + 0.01), 0.11, z), col, -0.06);
        C.add(box(0.03, 0.03, L, sx * (W / 2 + 0.01), 0.22, 0), col, 0.02);
        C.add(box(0.02, 0.02, L, sx * (W / 2 + 0.01), 0.11, 0), col, -0.04);
      }
    }
    return C.done();
  }

  // ============================== CASCADE ==============================
  // origine au pied de la chute, l'eau tombe vers +Z ; d = { h, w, seed, alba }
  // retourne { rock, sheet, meta } : rochers + bassin (couleurs figées) et nappe d'eau dont les couleurs défilent (animateFall)
  function buildWaterfall(d) {
    const C = collector(d.alba), rng = mulberry32(d.seed || 1);
    const n = Math.max(2, Math.round(d.h / 0.16)), h = d.h / n, W = d.w, step = 0.1 + W * 0.12, back = -(n - 1) * step - 0.4;
    const rock = '#8d8b86';
    const zf = (i) => -i * step; // avant du palier i (0 = en bas)
    for (let i = 0; i < n; i++) {
      const wi = W * (1.15 + 0.14 * (n - 1 - i)) , dep = zf(i) - back;
      const b = new THREE.BoxGeometry(wi, h * (i === 0 ? 1.4 : 1), dep, 3, 1, 3);
      b.translate(0, i * h + h / 2 - (i === 0 ? 0.04 : 0), (zf(i) + back) / 2);
      const p = b.attributes.position;
      for (let k = 0; k < p.count; k++) { // roche irrégulière (la face de l'eau reste plane)
        const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
        if (Math.abs(x) < W * 0.5 && z > zf(i) - 0.01) continue;
        p.setXYZ(k, x + (hashPos(x, y, z, 5) - 0.5) * 0.06, y + (hashPos(x, y, z, 6) - 0.5) * 0.03, z + (hashPos(x, y, z, 7) - 0.5) * 0.05);
      }
      C.add(b, rock, (rng() - 0.5) * 0.08 + i * 0.012);
      for (const sx of [-1, 1]) { // blocs de chaque côté de la chute
        const bo = new THREE.IcosahedronGeometry(1, 0);
        const sc = 0.06 + rng() * 0.06;
        bo.scale(sc * 1.3, sc, sc * 1.2);
        bo.rotateY(rng() * 6);
        bo.translate(sx * (W * 0.62 + rng() * 0.08), i * h + h * 0.6, zf(i) - 0.1 - rng() * 0.15);
        C.add(bo, rock, (rng() - 0.5) * 0.12);
      }
    }
    // bassin au pied : disque d'eau + pierres de bordure
    const poolR = W * 0.85 + 0.1, pz = 0.12 + poolR * 0.5;
    const pool = new THREE.CylinderGeometry(poolR, poolR, 0.03, 12, 1);
    pool.translate(0, 0.012, pz);
    C.add(pool, '#7ec3ea', 0);
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * (0.1 + 0.8 * (k / 8)), r2 = poolR * (1.02 + rng() * 0.08);
      const st = new THREE.IcosahedronGeometry(1, 0), sc = 0.05 + rng() * 0.04;
      st.scale(sc * 1.2, sc * 0.8, sc);
      st.translate(Math.cos(a) * r2, 0.02, pz + Math.sin(a) * r2);
      C.add(st, rock, (rng() - 0.5) * 0.12);
    }
    const foam = new THREE.CylinderGeometry(W * 0.5, W * 0.5, 0.034, 8, 1); foam.translate(0, 0.014, 0.06);
    C.add(foam, '#f2fbff', 0);

    // nappe d'eau : bandes dans l'ordre de l'écoulement (haut -> bas) ; chaque bande a sa couleur animée
    const Wf = W * 0.9, cols = 3, pos = [], quads = [];
    const quad = (x0, x1, y0, z0, y1, z1, row, ledge) => {
      const A = [x0, y0, z0], B = [x1, y0, z0], Cc = [x1, y1, z1], D = [x0, y1, z1];
      pos.push(...A, ...Cc, ...B, ...A, ...D, ...Cc); // face vers +Z / le haut
      quads.push({ row, ledge });
    };
    let row = 0;
    for (let i = n - 1; i >= 0; i--) {
      const yTop = (i + 1) * h + 0.012, zFront = zf(i) + 0.012, zRear = i === n - 1 ? zf(i) - 0.35 : zf(i) - step;
      for (let c = 0; c < cols; c++) { // replat (horizontal)
        const x0 = -Wf / 2 + (Wf * c) / cols, x1 = -Wf / 2 + (Wf * (c + 1)) / cols;
        quad(x0, x1, yTop, zRear, yTop, zFront, row, true);
      }
      row++;
      for (let r = 0; r < 3; r++) { // chute verticale en 3 bandes
        const ya = yTop - (h * r) / 3 - (r === 0 ? 0 : 0), yb = (i + 1) * h - (h * (r + 1)) / 3 + (r === 2 ? -0.0 : 0);
        for (let c = 0; c < cols; c++) {
          const x0 = -Wf / 2 + (Wf * c) / cols, x1 = -Wf / 2 + (Wf * (c + 1)) / cols;
          quad(x0, x1, ya, zFront + 0.004, yb, zFront + 0.004, row, false);
        }
        row++;
      }
    }
    const sheet = new THREE.BufferGeometry();
    sheet.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sheet.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pos.length).fill(1), 3));
    sheet.computeVertexNormals();
    return { rock: C.done(), sheet, meta: { quads, rows: row, cols } };
  }
  const _wb = new THREE.Color('#4fa6e0'), _wl = new THREE.Color('#d6f1ff'), _wc = new THREE.Color();
  // fait défiler la lumière le long de la chute (t en secondes)
  function animateFall(sheet, meta, t) {
    const col = sheet.attributes.color, per = meta.cols;
    meta.quads.forEach((q, qi) => {
      const c = qi % per, ph = q.row / meta.rows;
      let v = (ph * 2.4 - t * 0.9 + c * 0.29) % 1; if (v < 0) v += 1;
      const bright = Math.max(0, 1 - Math.abs(v - 0.5) * 3.2) * (q.ledge ? 0.5 : 0.9);
      _wc.copy(_wb).lerp(_wl, bright);
      for (let k = 0; k < 6; k++) col.setXYZ(qi * 6 + k, _wc.r, _wc.g, _wc.b);
    });
    col.needsUpdate = true;
  }

  // ============================== MAISONS ==============================
  // d = { shape: rect | L | T | poly, sides, w, dp, floors, wall, wallColor, roof, roofColor, pitch, chimney, shutters, accent, seed, alba }
  // origine au centre de l'emprise, au niveau du sol ; la façade (porte) regarde vers +Z
  function buildHouse(d) {
    const C = collector(d.alba), rng = mulberry32(d.seed || 1);
    const W = d.w, D = d.dp, F = clamp(Math.round(d.floors), 1, 3), fh = 0.3, H = F * fh, th = 0.05;
    let poly, wings;
    if (d.shape === 'L') {
      const w2 = W * 0.45;
      poly = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, 0], [-W / 2 + w2, 0], [-W / 2 + w2, D / 2], [-W / 2, D / 2]];
      wings = [{ x0: -W / 2, x1: W / 2, z0: -D / 2, z1: 0 }, { x0: -W / 2, x1: -W / 2 + w2, z0: -D / 2, z1: D / 2 }];
    } else if (d.shape === 'T') {
      const w2 = W * 0.4, zb = -D / 2 + D * 0.45;
      poly = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, zb], [w2 / 2, zb], [w2 / 2, D / 2], [-w2 / 2, D / 2], [-w2 / 2, zb], [-W / 2, zb]];
      wings = [{ x0: -W / 2, x1: W / 2, z0: -D / 2, z1: zb }, { x0: -w2 / 2, x1: w2 / 2, z0: -D / 2, z1: D / 2 }];
    } else if (d.shape === 'poly') {
      const np = clamp(Math.round(d.sides), 3, 10), r = W / 2;
      poly = Array.from({ length: np }, (_, i) => { const a = (i / np) * Math.PI * 2 - Math.PI / 2; return [Math.cos(a) * r, Math.sin(a) * r]; });
      wings = null;
    } else {
      poly = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
      wings = [{ x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2 }];
    }
    const n = poly.length;
    let area = 0;
    for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const sgn = area > 0 ? 1 : -1;
    const edges = poly.map((a, i) => {
      const b = poly[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      return { a, b, len, t: [dx / len, dz / len], nrm: [(dz / len) * sgn, (-dx / len) * sgn], mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
    });
    let front = 0;
    edges.forEach((e, i) => { if (e.nrm[1] > edges[front].nrm[1] + 1e-6 && e.len > 0.15) front = i; });
    const wallC = d.wallColor, trim = '#e9e2d2', stone = '#9a948a', accent = d.accent || '#6b4a2f';
    const place = (g, e) => { // repère local de la façade : x = -tangente, y = haut, z = normale sortante
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(-e.t[0], 0, -e.t[1]), UP, new THREE.Vector3(e.nrm[0], 0, e.nrm[1]));
      m.setPosition(e.mid[0], 0, e.mid[1]);
      g.applyMatrix4(m);
      return g;
    };
    for (let ei = 0; ei < n; ei++) {
      const e = edges[ei], L = e.len + th;
      const add = (g, hex, dl = 0) => C.add(place(g, e), hex, dl);
      add(box(e.len + 0.02, 0.05, th + 0.02, 0, 0.025, -th / 2), stone, -0.02); // soubassement
      const style = d.wall;
      if (style === 'brick' || style === 'stone' || style === 'wood') {
        const rowH = style === 'stone' ? 0.07 : 0.045, rows = Math.max(2, Math.round(H / rowH)), rh = H / rows;
        for (let r = 0; r < rows; r++) {
          const y = rh * (r + 0.5);
          if (style === 'wood') { add(box(L, rh * 0.96, th, 0, y, -th / 2 + (r % 2 ? 0.004 : 0)), wallC, (r % 2 ? 0.03 : -0.02) + (rng() - 0.5) * 0.03); continue; }
          let s = -L / 2, first = true;
          while (s < L / 2 - 0.01) {
            let bl = style === 'stone' ? 0.1 + rng() * 0.15 : 0.12 + rng() * 0.1;
            if (first && r % 2) bl *= 0.5;
            first = false;
            if (s + bl > L / 2 - 0.03) bl = L / 2 - s;
            add(box(bl * 0.97, rh * 0.94, th, s + bl / 2, y, -th / 2), wallC, (rng() - 0.5) * (style === 'stone' ? 0.14 : 0.08));
            s += bl;
          }
        }
      } else {
        add(box(L, H, th, 0, H / 2, -th / 2), wallC, (rng() - 0.5) * 0.03);
        if (style === 'timber') { // colombage : poteaux et croix de saint-André
          const nb = Math.max(1, Math.round(e.len / 0.22)), bay = e.len / nb;
          for (let f = 0; f < F; f++) {
            for (let k = 0; k <= nb; k++) add(box(0.02, fh * 0.96, 0.014, -e.len / 2 + k * bay, f * fh + fh / 2 + 0.004, 0.005), accent, -0.02);
            for (let k = 0; k < nb; k++) {
              const x0 = -e.len / 2 + k * bay, y0 = f * fh + 0.03, y1 = (f + 1) * fh - 0.02;
              add(beam(new THREE.Vector3(x0 + 0.01, y0, 0.006), new THREE.Vector3(x0 + bay - 0.01, y1, 0.006), 0.014, 0.014), accent, 0);
            }
          }
        }
      }
      for (let f = 0; f <= F; f++) add(box(e.len + 0.015, 0.014, th + 0.014, 0, f * fh + (f === F ? -0.007 : 0.007), -th / 2), style === 'timber' ? accent : trim, -0.02); // bandeaux d'étage
      // fenêtres
      const usable = e.len - 0.22, cnt = e.len < 0.24 ? 0 : Math.max(1, Math.floor(usable / 0.27));
      for (let f = 0; f < F; f++) {
        for (let k = 0; k < cnt; k++) {
          const x = cnt === 1 ? 0 : -usable / 2 + (usable * k) / (cnt - 1);
          if (ei === front && f === 0 && Math.abs(x) < 0.12) continue; // place de la porte
          const y = f * fh + fh * 0.56, ww = 0.085, wh = 0.12;
          add(box(ww + 0.025, wh + 0.025, 0.014, x, y, 0.007), trim, 0);
          const lit = rng() < 0.22;
          add(box(ww, wh, 0.02, x, y, 0.008), lit ? '#f2d58a' : '#7fa6c9', lit ? 0 : -0.04 + rng() * 0.08);
          add(box(0.012, wh, 0.024, x, y, 0.009), trim, 0);
          add(box(ww, 0.01, 0.024, x, y + 0.01, 0.009), trim, 0);
          add(box(ww + 0.04, 0.012, 0.03, x, y - wh / 2 - 0.012, 0.014), stone, 0.05); // appui
          if (d.shutters) for (const sx of [-1, 1]) add(box(0.036, wh + 0.02, 0.01, x + sx * (ww / 2 + 0.032), y, 0.006), accent, 0.04);
        }
      }
      if (ei === front) { // porte et marche
        add(box(0.13, 0.225, 0.016, 0, 0.1625, 0.008), trim, 0);
        add(box(0.1, 0.2, 0.022, 0, 0.15, 0.01), accent, 0);
        add(box(0.008, 0.2, 0.026, 0, 0.15, 0.011), accent, -0.06);
        add(box(0.012, 0.012, 0.03, 0.03, 0.14, 0.014), '#c9a24a', 0);
        add(box(0.2, 0.022, 0.07, 0, 0.011, 0.04), stone, 0.04);
      }
    }
    // toit
    const rc = d.roofColor, o = 0.045;
    const face = (pts, out) => { // polygone (3 ou 4 points) orienté vers l'extérieur
      const g = new THREE.BufferGeometry(), v = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
      const nrm = new THREE.Vector3().crossVectors(v[1].clone().sub(v[0]), v[2].clone().sub(v[0]));
      const ordered = nrm.dot(new THREE.Vector3(out[0], out[1], out[2])) < 0 ? [...v].reverse() : v;
      const pos = [];
      for (let k = 1; k < ordered.length - 1; k++) pos.push(...ordered[0].toArray(), ...ordered[k].toArray(), ...ordered[k + 1].toArray());
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      return g;
    };
    let roofTopY = H, chimneyAt = null;
    const roofKind = d.shape === 'poly' ? (d.roof === 'flat' ? 'flat' : 'cone') : d.roof;
    if (roofKind === 'cone') {
      const r = d.w / 2, rh = Math.max(0.1, r * d.pitch * 1.5);
      const cone = new THREE.ConeGeometry(r / Math.cos(Math.PI / n) + o, rh, n, 1);
      cone.rotateY(Math.PI);
      cone.translate(0, H + rh / 2, 0);
      C.add(cone, rc, 0);
      C.add(new THREE.CylinderGeometry(r * 0.93, r * 0.93, 0.012, n, 1).translate(0, H + 0.006, 0), trim, -0.1);
      roofTopY = H + rh; chimneyAt = [r * 0.3, 0];
    } else if (roofKind === 'flat') {
      if (wings) for (const w of wings) C.add(box(w.x1 - w.x0 + 0.03, 0.03, w.z1 - w.z0 + 0.03, (w.x0 + w.x1) / 2, H + 0.015, (w.z0 + w.z1) / 2), '#8d8f94', 0);
      else C.add(new THREE.CylinderGeometry(W / 2 + 0.02, W / 2 + 0.02, 0.03, n, 1).rotateY(Math.PI).translate(0, H + 0.015, 0), '#8d8f94', 0);
      roofTopY = H + 0.03; chimneyAt = [0.1, 0.05];
    } else {
      wings.forEach((w, wi) => {
        const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2, sx = w.x1 - w.x0, sz = w.z1 - w.z0, alongX = sx >= sz;
        const Lr = alongX ? sx : sz, span = alongX ? sz : sx, half = span / 2, rh = Math.max(0.06, half * d.pitch * 1.3) * (wi ? 0.92 : 1);
        const sl = Math.hypot(half + o, rh), al = Math.atan2(rh, half + o);
        const place2 = (g) => { if (!alongX) g.rotateY(Math.PI / 2); g.translate(cx, 0, cz); return g; };
        if (roofKind === 'hip') {
          const rx = Math.max(0, Lr / 2 - half), L2 = Lr / 2 + o;
          const planes = [
            [[[-L2, H, half + o], [L2, H, half + o], [rx, H + rh, 0], [-rx, H + rh, 0]], [0, 1, 1]],
            [[[-L2, H, -half - o], [L2, H, -half - o], [rx, H + rh, 0], [-rx, H + rh, 0]], [0, 1, -1]],
            [[[L2, H, half + o], [L2, H, -half - o], [rx, H + rh, 0]], [1, 1, 0]],
            [[[-L2, H, half + o], [-L2, H, -half - o], [-rx, H + rh, 0]], [-1, 1, 0]],
          ];
          for (const [pts, out] of planes) C.add(place2(face(pts, out)), rc, 0);
        } else {
          for (const sg of [1, -1]) { // deux pans en bandes de tuiles décalées
            const strips = 5;
            for (let s2 = 0; s2 < strips; s2++) {
              const g = new THREE.BoxGeometry(Lr + o * 2, 0.022, (sl / strips) * 1.02);
              g.translate(0, 0.011 + (s2 % 2 ? 0.004 : 0), 0);
              g.rotateX(sg * al);
              const f0 = (s2 + 0.5) / strips;
              g.translate(0, H + rh * (1 - f0) + 0.0, sg * (half + o) * f0);
              C.add(place2(g), rc, (s2 % 2 ? 0.035 : -0.02) + (rng() - 0.5) * 0.03);
            }
          }
          for (const sx2 of [-1, 1]) C.add(place2(face([[sx2 * Lr / 2, H, -half], [sx2 * Lr / 2, H, half], [sx2 * Lr / 2, H + rh, 0]], [sx2, 0.2, 0])), wallC, 0); // pignons
          C.add(place2(box(Lr + o * 2 + 0.01, 0.02, 0.03, 0, H + rh + 0.01, 0)), rc, -0.08); // faîtage
        }
        C.add(place2(box(Lr + o * 2, 0.012, span + o * 2, 0, H + 0.006, 0)), trim, -0.1); // sous-face
        if (wi === 0) { roofTopY = H + rh; chimneyAt = alongX ? [cx + Lr * 0.28, cz + half * 0.15] : [cx + half * 0.15, cz + Lr * 0.28]; }
      });
    }
    if (d.chimney && chimneyAt) {
      const ch = Math.max(0.12, roofTopY - H * 0.9 + 0.1);
      C.add(box(0.07, ch, 0.07, chimneyAt[0], H * 0.9 + ch / 2, chimneyAt[1]), '#9a4a36', 0);
      C.add(box(0.09, 0.02, 0.09, chimneyAt[0], H * 0.9 + ch + 0.01, chimneyAt[1]), stone, 0.05);
    }
    return C.done();
  }

  return { build, buildBridge, buildStairs, buildWaterfall, animateFall, buildHouse };
}
