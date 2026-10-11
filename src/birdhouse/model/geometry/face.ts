import { type Vec3, type Pt, type Hole, type Plank, type PlankScene, type FaceAxis } from '../types';
import { r2, uid } from '../util';
import { fitHole } from './holes';
import { recastAll } from './castellation';
import { outline } from './outline';
import { bounds, corners } from './transform';
import { fromEulerDeg, rotate, vadd, vaddScaled, vdot, vscale, vsub, type V3 } from '../math/rotation';

/** Axes locaux d'une plaque, en coordonnées monde. */
function axesOf(p: Plank): { x: V3; y: V3; z: V3 } {
  const q = fromEulerDeg(p.rot);
  return { x: rotate([1, 0, 0], q), y: rotate([0, 1, 0], q), z: rotate([0, 0, 1], q) };
}

/**
 * Tire (d > 0) ou pousse (d < 0) la face `axis` × `sign` de la plaque `id` de `d` mm le long de sa normale N.
 * Les plaques du même groupe connectées à cette face, de proche en proche (elles se touchent et affleurent le plan de la face),
 * suivent : celles dont la normale est N se déplacent, celles qui sont perpendiculaires s'allongent ou se raccourcissent
 * (leur bord opposé reste en place), minimum 1 mm ; leurs crénelages sont refaits. Renvoie la scène et le `d` réellement appliqué.
 */
export function pullFace(s: PlankScene, id: string, axis: FaceAxis, sign: 1 | -1, d: number): { scene: PlankScene; applied: number } {
  const p = s.planks.find((x) => x.id === id);
  if (!p || !d) return { scene: s, applied: 0 };
  const ax = axesOf(p);
  const N = vscale(ax[axis], sign);
  const half = axis === 'x' ? p.w / 2 : axis === 'y' ? p.h / 2 : s.t / 2;
  const facePos = vdot(p.pos, N) + half; // position du plan de la face le long de N
  const tol = s.t + 1;
  const proj = (x: Plank) => corners([x], s.t).map((c) => vdot(c, N));
  const touchesPlane = (x: Plank) => Math.abs(Math.max(...proj(x)) - facePos) < tol || Math.abs(Math.min(...proj(x)) - facePos) < tol;
  const bb = new Map<string, { min: Vec3; max: Vec3 }>();
  const boxOf = (x: Plank) => { let b = bb.get(x.id); if (!b) { b = bounds([x], s.t); bb.set(x.id, b); } return b; };
  const touch = (a: Plank, b: Plank) => { const A = boxOf(a), B = boxOf(b); return [0, 1, 2].every((i) => A.min[i] - tol <= B.max[i] && B.min[i] - tol <= A.max[i]); };
  // fermeture : tout ce qui touche l'ensemble et affleure le plan de la face
  const members = p.group ? s.planks.filter((x) => x.group === p.group && x.id !== id) : [];
  const set = new Map<string, Plank>([[p.id, p]]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const m of members) if (!set.has(m.id) && touchesPlane(m) && [...set.values()].some((q) => touch(m, q))) { set.set(m.id, m); grew = true; }
  }
  // quoi faire pour chacun : déplacer (normale ∥ N) ou allonger (un axe du plan ∥ N)
  const plan = new Map<string, { kind: 'move' } | { kind: 'resize'; axis: 'w' | 'h' }>();
  for (const x of set.values()) {
    if (x.id === p.id && axis !== 'z') { plan.set(x.id, { kind: 'resize', axis: axis === 'x' ? 'w' : 'h' }); continue; }
    const a = axesOf(x);
    if (Math.abs(vdot(a.z, N)) > 0.9) plan.set(x.id, { kind: 'move' });
    else if (Math.abs(vdot(a.x, N)) > 0.9) plan.set(x.id, { kind: 'resize', axis: 'w' });
    else if (Math.abs(vdot(a.y, N)) > 0.9) plan.set(x.id, { kind: 'resize', axis: 'h' });
    else plan.set(x.id, { kind: 'move' });
  }
  // minimum 1 mm sur tout ce qui se raccourcit
  let applied = d;
  for (const [pid, what] of plan) if (what.kind === 'resize') { const x = set.get(pid)!; const size = what.axis === 'w' ? x.w : x.h; if (size + applied < 1) applied = 1 - size; }
  if (Math.abs(applied) < 1e-6) return { scene: s, applied: 0 };
  const scene: PlankScene = {
    ...s,
    planks: s.planks.map((x) => {
      const what = plan.get(x.id);
      if (!what) return x;
      if (what.kind === 'move') { const np = vaddScaled(x.pos, N, applied); return { ...x, pos: [r2(np[0]), r2(np[1]), r2(np[2])] as Vec3 }; }
      const np = vaddScaled(x.pos, N, applied / 2); // le bord opposé ne bouge pas
      const nx: Plank = { ...x, pos: [r2(np[0]), r2(np[1]), r2(np[2])] as Vec3, [what.axis]: +((what.axis === 'w' ? x.w : x.h) + applied).toFixed(2) };
      return recastAll(nx, s.t, s.fit);
    }),
  };
  return { scene, applied };
}

/**
 * Bouton magique : perce, dans la plaque `id`, les fentes où d'autres plaques la traversent.
 * Pour chaque autre plaque A perpendiculaire (hors de son groupe), le plan médian de la plaque coupe A selon une droite ;
 * les morceaux de matière de A sur cette droite (les dents, pas les crans) donnent des fentes rectangulaires :
 * longueur de la dent × épaisseur du bois (+ jeu `fit`). Les fentes déjà présentes ne sont pas doublées.
 * Renvoie la scène et le nombre de fentes ajoutées (axes de la plaque seulement : les dents en diagonale sont ignorées).
 */
export function slotsForTeeth(s: PlankScene, id: string): { scene: PlankScene; added: number; planks: number } {
  const B = s.planks.find((p) => p.id === id);
  if (!B) return { scene: s, added: 0, planks: 0 };
  const bx = axesOf(B), nB = bx.z, posB = B.pos;
  const fresh: Hole[] = [];
  const sources = new Set<string>();
  for (const A of s.planks) {
    if (A.id === B.id || (A.group && A.group === B.group)) continue;
    const ax = axesOf(A);
    if (Math.abs(vdot(nB, ax.z)) > 0.1) continue; // A doit être perpendiculaire à B
    const a = vdot(nB, ax.x), b = vdot(nB, ax.y), c = vdot(nB, vsub(A.pos, posB));
    const n2 = a * a + b * b;
    if (n2 < 0.5) continue;
    const norm = Math.sqrt(n2), p0: Pt = [-c * a / n2, -c * b / n2], dir: Pt = [-b / norm, a / norm];
    // intersections du contour de A avec la droite (plan médian de B) p0 + s·dir
    const poly = outline(A), ss: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i], Q = poly[(i + 1) % poly.length];
      const dP = a * P[0] + b * P[1] + c, dQ = a * Q[0] + b * Q[1] + c;
      if ((dP > 0) === (dQ > 0)) continue;
      const k = dP / (dP - dQ);
      ss.push((P[0] + (Q[0] - P[0]) * k - p0[0]) * dir[0] + (P[1] + (Q[1] - P[1]) * k - p0[1]) * dir[1]);
    }
    ss.sort((u, v) => u - v);
    const posA = A.pos;
    const toB = (sv: number): [number, number] => {
      const w = vsub(vadd(vaddScaled(vaddScaled([0, 0, 0], ax.x, p0[0] + dir[0] * sv), ax.y, p0[1] + dir[1] * sv), posA), posB);
      return [vdot(w, bx.x), vdot(w, bx.y)];
    };
    const nLoc: [number, number] = [vdot(ax.z, bx.x), vdot(ax.z, bx.y)]; // épaisseur de A vue dans le plan de B
    for (let i = 0; i + 1 < ss.length; i += 2) {
      if (ss[i + 1] - ss[i] < 0.5) continue;
      const [x0, y0] = toB(ss[i]), [x1, y1] = toB(ss[i + 1]);
      const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
      if (dx > 0.05 && dy > 0.05) continue; // diagonale : non géré
      const cx = r2((x0 + x1) / 2), cy = r2((y0 + y1) / 2);
      if (Math.abs(cx) > B.w / 2 || Math.abs(cy) > B.h / 2) continue; // la dent n'arrive pas dans B
      const size = r2(dx + s.t * Math.abs(nLoc[0]) + s.fit), sh = r2(dy + s.t * Math.abs(nLoc[1]) + s.fit);
      if ([...B.holes, ...fresh].some((h) => h.shape === 'square' && Math.abs(h.x - cx) < 0.6 && Math.abs(h.y - cy) < 0.6 && Math.abs(h.size - size) < 0.6 && Math.abs((h.sh ?? h.size) - sh) < 0.6)) continue;
      fresh.push(fitHole(B, { id: uid(), shape: 'square', x: cx, y: cy, size, sh }));
      sources.add(A.id);
    }
  }
  if (!fresh.length) return { scene: s, added: 0, planks: 0 };
  return { scene: { ...s, planks: s.planks.map((p) => (p.id === B.id ? { ...p, holes: [...p.holes, ...fresh] } : p)) }, added: fresh.length, planks: sources.size };
}
