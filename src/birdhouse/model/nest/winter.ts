import { type Plank, type PlankScene, type Vec3 } from '../types';
import { r2 } from '../util';
import { SPARE_RE } from './spares';

/**
 * Pièces d'hiver : la cassette du ventilateur (été) et le bloc isolant (hiver) s'échangent dans le siège ; la sous-boîte isolante entre ou sort du conduit de la prise d'air basse.
 * Les pièces rangées sont dessinées à côté du nichoir, sur le sol, à gauche. Tout est déduit des positions des pièces repères : aucun champ en plus dans la scène.
 * Les déplacements sont des translations au centième : l'aller-retour est exact.
 */

const CASSETTE = [/^Cassette ventilateur/, /^Poignée cassette/, /^Plot caoutchouc ventilateur/, /^Grille de protection ventilateur/, /^Ventilateur Noctua/, /^Prise 4 broches du ventilateur/, /^Câble d'origine du ventilateur/, /^Conduit de sortie/]; // le conduit de sortie est fixé à la cassette (dents dans sa paroi arrière) : il sort et rentre avec elle
const BLOCK = [/^Bloc isolant d'hiver/, /^Isolant bloc d'hiver/, /^Poignée bloc d'hiver/];
const PLUG = [/^Bouchon-boîte prise d'air/, /^Laine bouchon prise d'air/, /^Poignée bouchon prise d'air/];
/** Distance entre le nichoir et les pièces rangées ; dépassement du U de la sous-boîte sous son fond. */
export const SPARE_GAP = 150, PLUG_HANDLE = 15;

const BLOCK_FRONT = /^Bloc isolant d'hiver 1$/; // paroi avant du bloc : alignée sur celle de la cassette
const by = (s: PlankScene, re: RegExp) => s.planks.find((p) => re.test(p.name));
const isIn = (p: Plank, res: RegExp[]) => !SPARE_RE.test(p.name) && res.some((re) => re.test(p.name)); // une rechange (« … (rechange 1) ») reste où elle est, même si son nom commence comme une pièce d'hiver

interface Layout { seat: [number, number]; co: number; floorTop: number; slotA: [number, number]; slotB: [number, number]; slotC: [number, number]; duct: [number, number]; lipBottom: number }

/** Repères de la scène (null si les pièces nécessaires manquent). */
function layout(s: PlankScene): Layout | null {
  const gl = by(s, /^Goulotte ventilateur gauche/), gr = by(s, /^Goulotte ventilateur droite/), gf = by(s, /^Goulotte ventilateur avant/), floor = by(s, /^Dessous toit/), outerL = by(s, /^Côté gauche ext/), lid = by(s, /^Conduit d'air 5/), bottom = by(s, /^Dessous ext/);
  if (!gl || !gr || !gf || !floor || !outerL || !lid || !bottom) return null;
  const co = Math.abs(gr.pos[0] - gl.pos[0]) - s.t, seat: [number, number] = [r2((gl.pos[0] + gr.pos[0]) / 2), r2(gf.pos[1] + s.t / 2 + co / 2)];
  const ex = r2(outerL.pos[0] - s.t / 2 - SPARE_GAP);
  return { seat, co, floorTop: r2(floor.pos[2] + s.t / 2), slotA: [ex, 0], slotB: [ex, -80], slotC: [ex, 85], duct: [lid.pos[0], lid.pos[1]], lipBottom: r2(bottom.pos[2] - s.t / 2 - PLUG_HANDLE) };
}

/** Translate des pièces (leur position, et les points de leur chemin pour les fils) au centième. */
function shift(s: PlankScene, res: RegExp[], d: Vec3): PlankScene {
  const mv = (q: Vec3): Vec3 => [r2(q[0] + d[0]), r2(q[1] + d[1]), r2(q[2] + d[2])];
  return { ...s, planks: s.planks.map((p) => (!isIn(p, res) ? p : p.path ? { ...p, path: p.path.map(mv) } : { ...p, pos: mv(p.pos) })) }; // un fil ou une nappe a pos = 0 : seul son chemin bouge
}

/** État des pièces d'hiver (null : la scène n'a pas ces pièces). */
export interface WinterState { cassette: 'summer' | 'winter' | 'none' | null; plug: 'open' | 'plugged' | null }

/** État : la cassette ventilateur est-elle dans le siège (« summer »), exposée (« winter ») ? null si la scène n'a pas ces pièces. */
export function winterState(s: PlankScene): WinterState {
  const l = layout(s), fan = by(s, /^Ventilateur Noctua/), lip = by(s, /^Bouchon-boîte prise d'air fond/);
  const near = (p: Plank, c: [number, number]) => Math.hypot(p.pos[0] - c[0], p.pos[1] - c[1]) < 1;
  const block = by(s, BLOCK_FRONT);
  return {
    cassette: l && fan && block ? (near(fan, l.seat) ? 'summer' : near(block, [l.seat[0], l.seat[1] - l.co / 2 + s.t / 2]) ? 'winter' : 'none') : null,
    plug: l && lip ? (near(lip, l.duct) ? 'plugged' : 'open') : null,
  };
}

/** Les trois états de la cassette : `summer` = ventilateur dans le siège (bloc isolant rangé en A), `winter` = bloc isolant dans le siège (cassette rangée en A), `none` = siège vide (cassette rangée en A, bloc rangé en C, à côté). */
export type CassetteMode = 'summer' | 'winter' | 'none';

/** État suivant du bouton « Cassette » : ventilateur → isolante → aucune → ventilateur. */
export const nextCassette = (m: CassetteMode): CassetteMode => (m === 'summer' ? 'winter' : m === 'winter' ? 'none' : 'summer');

/** Met la cassette dans l'un des trois états ; les pièces sorties sont rangées à côté du nichoir. Ne fait rien sans ces pièces. Chaque déplacement est une translation au centième : l'aller-retour est exact. */
export function setCassetteMode(s: PlankScene, mode: CassetteMode): PlankScene {
  const l = layout(s), fan = by(s, /^Ventilateur Noctua/), block = by(s, BLOCK_FRONT);
  if (!l || !fan || !block) return s;
  const vec = (c: [number, number]): Vec3 => [r2(c[0] - l.seat[0]), r2(c[1] - l.seat[1]), -l.floorTop]; // du siège vers un rangement
  const outA = vec(l.slotA), outC = vec(l.slotC);
  const seatFront: [number, number] = [l.seat[0], l.seat[1] - l.co / 2 + s.t / 2]; // paroi avant du bloc dans le siège (le bloc est plus long que la cassette : on compare sa paroi avant)
  const at = (p: Plank, c: [number, number]) => Math.hypot(p.pos[0] - c[0], p.pos[1] - c[1]) < 1;
  const cassIn = at(fan, l.seat);
  const blockPlace: 'seat' | 'A' | 'C' = at(block, seatFront) ? 'seat' : at(block, [seatFront[0] + outA[0], seatFront[1] + outA[1]]) ? 'A' : 'C';
  const want = { cass: mode === 'summer', block: mode === 'winter' ? 'seat' : mode === 'summer' ? 'A' : 'C' } as const;
  const off = { seat: [0, 0, 0] as Vec3, A: outA, C: outC };
  let r = s;
  if (cassIn && !want.cass) r = shift(r, CASSETTE, outA); // la cassette sort
  if (!cassIn && want.cass) r = shift(r, CASSETTE, [-outA[0], -outA[1], -outA[2]]); // la cassette rentre
  const cur = off[blockPlace], tgt = off[want.block];
  if (cur !== tgt) r = shift(r, BLOCK, [r2(tgt[0] - cur[0]), r2(tgt[1] - cur[1]), r2(tgt[2] - cur[2])]);
  return r;
}

/** Met en place la cassette isolante (winter) ou la cassette ventilateur (été) dans le siège ; l'autre est rangée à côté du nichoir. Ne fait rien sans ces pièces. */
export function setWinterCassette(s: PlankScene, winter: boolean): PlankScene {
  return setCassetteMode(s, winter ? 'winter' : 'summer');
}

/** Bouche la prise d'air (la sous-boîte entre dans le conduit) ou la rouvre (elle est rangée à côté du nichoir). */
export function setAirPlug(s: PlankScene, plugged: boolean): PlankScene {
  const l = layout(s), lip = by(s, /^Bouchon-boîte prise d'air fond/);
  if (!l || !lip) return s;
  const inside = Math.hypot(lip.pos[0] - l.duct[0], lip.pos[1] - l.duct[1]) < 1;
  if (inside === plugged) return s;
  const out: Vec3 = [l.slotB[0] - l.duct[0], l.slotB[1] - l.duct[1], -l.lipBottom]; // le bas du U de la sous-boîte passe à z = 0 sur le sol
  return plugged ? shift(s, PLUG, [-out[0], -out[1], -out[2]]) : shift(s, PLUG, out);
}

/** État par défaut du nichoir fraîchement généré : été (cassette ventilateur en place, bloc isolant rangé à côté), prise d'air ouverte (sous-boîte rangée à côté). */
export function summerLayout(s: PlankScene): PlankScene {
  return setAirPlug(setWinterCassette(s, false), false);
}
