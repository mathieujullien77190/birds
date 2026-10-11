import { type Plank, type PlankScene, type Vec3 } from '../types';
import { r2 } from '../util';

/**
 * Pièces d'hiver : la cassette du ventilateur (été) et le bloc isolant (hiver) s'échangent dans le siège ; la sous-boîte isolante entre ou sort du conduit de la prise d'air basse.
 * Les pièces rangées sont dessinées à côté du nichoir, sur le sol, à gauche. Tout est déduit des positions des pièces repères : aucun champ en plus dans la scène.
 * Les déplacements sont des translations au centième : l'aller-retour est exact.
 */

const CASSETTE = [/^Cassette ventilateur/, /^Poignée cassette/, /^Plot caoutchouc ventilateur/, /^Grille de protection ventilateur/, /^Ventilateur Noctua/, /^Plaque de connexion cassette/, /^Entretoise plaque de connexion/, /^Barrette 4 broches plaque de connexion/, /^Soudure plaque de connexion/, /^Fil cassette/];
const BLOCK = [/^Bloc isolant d'hiver/, /^Isolant bloc d'hiver/, /^Poignée bloc d'hiver/];
const PLUG = [/^Bouchon-boîte prise d'air/, /^Laine bouchon prise d'air/];
/** Dépassement de la lèvre de la sous-boîte sous le fond quand elle est insérée, et distance entre le nichoir et les pièces rangées. */
export const PLUG_DROP = 11, SPARE_GAP = 150;

const by = (s: PlankScene, re: RegExp) => s.planks.find((p) => re.test(p.name));
const isIn = (p: Plank, res: RegExp[]) => res.some((re) => re.test(p.name));

interface Layout { seat: [number, number]; floorTop: number; slotA: [number, number]; slotB: [number, number]; duct: [number, number]; lipBottom: number }

/** Repères de la scène (null si les pièces nécessaires manquent). */
function layout(s: PlankScene): Layout | null {
  const gl = by(s, /^Goulotte ventilateur gauche/), gr = by(s, /^Goulotte ventilateur droite/), gf = by(s, /^Goulotte ventilateur avant/), floor = by(s, /^Dessous toit/), outerL = by(s, /^Côté gauche ext/), lid = by(s, /^Conduit d'air 5/), bottom = by(s, /^Dessous ext/);
  if (!gl || !gr || !gf || !floor || !outerL || !lid || !bottom) return null;
  const co = Math.abs(gr.pos[0] - gl.pos[0]) - s.t, seat: [number, number] = [r2((gl.pos[0] + gr.pos[0]) / 2), r2(gf.pos[1] + s.t / 2 + co / 2)];
  const ex = r2(outerL.pos[0] - s.t / 2 - SPARE_GAP);
  return { seat, floorTop: r2(floor.pos[2] + s.t / 2), slotA: [ex, 0], slotB: [ex, -80], duct: [lid.pos[0], lid.pos[1]], lipBottom: r2(bottom.pos[2] - s.t / 2 - PLUG_DROP) };
}

/** Translate des pièces (leur position, et les points de leur chemin pour les fils) au centième. */
function shift(s: PlankScene, res: RegExp[], d: Vec3): PlankScene {
  const mv = (q: Vec3): Vec3 => [r2(q[0] + d[0]), r2(q[1] + d[1]), r2(q[2] + d[2])];
  return { ...s, planks: s.planks.map((p) => (!isIn(p, res) ? p : p.path ? { ...p, path: p.path.map(mv) } : { ...p, pos: mv(p.pos) })) }; // un fil ou une nappe a pos = 0 : seul son chemin bouge
}

/** État des pièces d'hiver (null : la scène n'a pas ces pièces). */
export interface WinterState { cassette: 'summer' | 'winter' | null; plug: 'open' | 'plugged' | null }

/** État : la cassette ventilateur est-elle dans le siège (« summer »), exposée (« winter ») ? null si la scène n'a pas ces pièces. */
export function winterState(s: PlankScene): WinterState {
  const l = layout(s), fan = by(s, /^Ventilateur Noctua/), block = by(s, /^Isolant bloc d'hiver/), lip = by(s, /^Bouchon-boîte prise d'air fond/);
  const near = (p: Plank, c: [number, number]) => Math.hypot(p.pos[0] - c[0], p.pos[1] - c[1]) < 1;
  return {
    cassette: l && fan && block ? (near(fan, l.seat) ? 'summer' : 'winter') : null,
    plug: l && lip ? (near(lip, l.duct) ? 'plugged' : 'open') : null,
  };
}

/** Met en place la cassette isolante (winter) ou la cassette ventilateur (été) dans le siège ; l'autre est rangée à côté du nichoir. Ne fait rien sans ces pièces. */
export function setWinterCassette(s: PlankScene, winter: boolean): PlankScene {
  const l = layout(s), fan = by(s, /^Ventilateur Noctua/), block = by(s, /^Isolant bloc d'hiver/);
  if (!l || !fan || !block) return s;
  const out: Vec3 = [l.slotA[0] - l.seat[0], l.slotA[1] - l.seat[1], -l.floorTop]; // du siège vers le sol à côté
  const inn: Vec3 = [-out[0], -out[1], -out[2]];
  const near = (p: Plank) => Math.hypot(p.pos[0] - l.seat[0], p.pos[1] - l.seat[1]) < 1;
  let r = s;
  if (winter) { if (near(fan)) r = shift(r, CASSETTE, out); if (!near(block)) r = shift(r, BLOCK, inn); } // la cassette sort, le bloc entre
  else { if (near(block)) r = shift(r, BLOCK, out); if (!near(fan)) r = shift(r, CASSETTE, inn); }
  return r;
}

/** Bouche la prise d'air (la sous-boîte entre dans le conduit) ou la rouvre (elle est rangée à côté du nichoir). */
export function setAirPlug(s: PlankScene, plugged: boolean): PlankScene {
  const l = layout(s), lip = by(s, /^Bouchon-boîte prise d'air fond/);
  if (!l || !lip) return s;
  const inside = Math.hypot(lip.pos[0] - l.duct[0], lip.pos[1] - l.duct[1]) < 1;
  if (inside === plugged) return s;
  const out: Vec3 = [l.slotB[0] - l.duct[0], l.slotB[1] - l.duct[1], -l.lipBottom]; // la lèvre passe de −11 mm à z = 0
  return plugged ? shift(s, PLUG, [-out[0], -out[1], -out[2]]) : shift(s, PLUG, out);
}

/** État par défaut du nichoir fraîchement généré : été (cassette ventilateur en place, bloc isolant rangé à côté), prise d'air ouverte (sous-boîte rangée à côté). */
export function summerLayout(s: PlankScene): PlankScene {
  return setAirPlug(setWinterCassette(s, false), false);
}
