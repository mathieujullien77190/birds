import { type Vec3, type Pt, type Edge, type Notch, type Hole, type Plank, type PlankScene, type NestParams } from '../types';
import { r2, uid } from '../util';
import { TEC_Y, TILT_DEG, TECW, COLD_W, SENSOR_X, LENS_HOLE, CAM_W, IR_W, CAM_X, PI_CSI2, PI_W, PI_CSI, PI_PIN_Y, PI_PIN_X0, TEC, TEC_T, CAM_Y, DRAIN_S, DRAIN_HOLE, TECD, TEC_CX, TEC_CY, COLD_D, COLD_Y, SENSOR_Y, CAM_H, IR_H, IR_X, CAM2_L, CAM2_D, CAM2_H, PI_H } from '../constants';
import { fitHole } from '../geometry/holes';
import { teethFor, recastAll } from '../geometry/castellation';
import { outline } from '../geometry/outline';
import { rotFromBasis, transformPlanks } from '../geometry/transform';
import { slotsForTeeth } from '../geometry/face';
import { makeBox } from './box';
import { CAMERA_NAMES } from './cameras';
import { fromAxisAngle, invert, multiply, rotate } from '../math/rotation';

/**
 * Nichoir à double paroi en deux modules :
 *  - le **corps** : une boîte extérieure et une boîte intérieure (l × L utiles), séparées par `ins` mm d'isolant ; les murs s'arrêtent sous le toit,
 *    le haut est ouvert ; trou rond dans les deux façades (avant, −y), à `floorToHole` du sol intérieur ; le plancher intérieur traverse l'isolant
 *    jusqu'aux murs extérieurs (dents dans des fentes percées dans ces murs) et les quatre murs intérieurs s'y enfoncent par les dents de leur bord bas ;
 *  - le **toit** : un module à part (boîte plate de 2 × t + ins de haut, même empreinte que le corps) qui se pose sur le haut du corps ; on le soulève
 *    pour retirer le nid. Il porte le compartiment caméra, la caméra et les LED infrarouges au-dessus d'un plancher percé (objectif et fenêtre), et une
 *    ouverture carrée dans son dessus.
 * Dimensions extérieures : utile + 2 × (t + ins + t) ; l'isolant n'est pas dessiné.
 */
/** Découpe un rectangle [x0, y0, x1, y1] en rectangles qui évitent des rectangles « trous » (bandes verticales). */
export function carveRects(r: [number, number, number, number], holes: [number, number, number, number][]): [number, number, number, number][] {
  const xs = [...new Set([r[0], r[2], ...holes.flatMap((h) => [h[0], h[2]]).filter((x) => x > r[0] && x < r[2])])].sort((p, q) => p - q), out: [number, number, number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const xa = xs[i], xb = xs[i + 1];
    const cut = holes.filter((h) => h[0] <= xa + 1e-6 && h[2] >= xb - 1e-6).map((h) => [Math.max(h[1], r[1]), Math.min(h[3], r[3])] as [number, number]).sort((p, q) => p[0] - q[0]);
    let y = r[1];
    for (const [c0, c1] of cut) { if (c0 > y + 0.01) out.push([xa, y, xb, c0]); y = Math.max(y, c1); }
    if (r[3] > y + 0.01) out.push([xa, y, xb, r[3]]);
  }
  return out;
}

export function makeNest(n0: NestParams, t: number, fit: number, start: number): { planks: Plank[]; group: string; name: string; groupNames: Record<string, string> } {
  const n: NestParams = { ...n0, l: Math.max(120, n0.l), L: Math.max(120, n0.l), hole: Math.min(n0.hole, Math.max(120, n0.l) - 26), cam: 38, ins: 39, pente: true, lambris: true }; // toit TOUJOURS en pente, habillage TOUJOURS présent (puces retirées : le régulateur sous le nichoir est protégé par l'habillage) ; // intérieur TOUJOURS CARRÉ (un seul curseur), 120 mm au minimum (le fond) ; trou plafonné pour que le bloc d'entrée (trou + 16) tienne dans la paroi intérieure ; compartiment caméra fixe à 38 (curseur retiré) ; // isolant TOUJOURS 39 (le curseur a été retiré à la demande de l'utilisateur) ; compartiment caméra plafonné à 38 // le compartiment caméra est limité à 38 : la batterie (et sa cale) est posée juste à côté, sur le dessus du toit
  const isoGroup = uid(); // cinquième groupe : l'isolant (pavés orange)
  const drainGroupId = uid(); // groupe « Évacuation »
  const solGroupId = uid(); // groupe « Solaire » : le panneau déporté, ses poteaux et son câble
  const docGroupId = uid(); // groupe « Schéma électronique » : le document, avec son œil
  const climGroupId = uid(); // sixième groupe : la climatisation (Peltier + alu + capteur)
  const lamGroup = uid(); // groupe « Lambris »
  const entryGroup = uid(); // quatrième groupe : le bloc d'entrée (empilement de carrés percés) qui traverse la double paroi
  const elecGroup = uid(); // troisième groupe : l'électronique (caméra, LED infrarouges, nappe, Raspberry Pi)
  const e = t + n.ins; // décalage de la boîte intérieure dans l'extérieure
  const W = n.l + 2 * (2 * t + n.ins), D = n.L + 2 * (2 * t + n.ins);
  const roofH = 2 * t + n.ins;
  const bodyH = n.floorToHole + n.hole + n.above + 2 * t + 2 * e - roofH; // les murs s'arrêtent là ; le toit se pose dessus
  const holeZ = e + t + n.floorToHole + n.hole / 2; // centre du trou d'envol, en z monde depuis le dessous du corps
  const outerBox = makeBox(W, D, bodyH, t, fit, start);
  const innerBox = makeBox(n.l + 2 * t, n.L + 2 * t, bodyH - e, t, fit, start);
  const roofBox = makeBox(W, D, roofH, t, fit, start);
  const group = outerBox.group, roofGroup = roofBox.group;
  const noTop = (p: Plank): Plank => { const cast = { ...(p.cast ?? {}) }; delete cast.top; return recastAll({ ...p, cast, notches: p.notches.filter((x) => x.edge !== 'top') }, t, fit); }; // mur sans crans en haut (le toit se pose dessus)
  const isWall = (p: Plank) => /^(Face|Côté)/.test(p.name);
  const OPEN = n.hole + 15; // ouverture carrée dans les deux murs avant : 1,5 cm de plus que le trou d'envol
  // l'ouverture des murs avant est une encoche ouverte vers le HAUT (largeur OPEN + 1 mm de jeu, du bas du carré jusqu'au haut du mur) : toit retiré, on pose le bloc d'entrée par le dessus
  const hole = (p: Plank): Plank => ({ ...p, notches: [...p.notches, { id: uid(), edge: 'top', pos: r2(p.w / 2), width: OPEN + 1, depth: r2(bodyH - (holeZ - OPEN / 2)) }] }); // 0,5 mm de jeu de chaque côté : le bloc coulisse à la verticale dans l'encoche, il s'arrête sur le fond
  const floorEdge = (len: number) => ({ n: teethFor(len), phase: 0 as const }); // phase 0 : coins creux, dents au milieu
  const floor: Plank = recastAll({ id: uid(), name: 'Plancher int', w: W, h: D, pos: [0, 0, e + t / 2], rot: [0, 0, 0], notches: [], holes: [], group, cast: { top: floorEdge(W), bottom: floorEdge(W), left: floorEdge(D), right: floorEdge(D) } }, t, fit);
  // barres de bois qui tiennent le toit : quatre barres courtes passent par les murs avant et arrière, de chaque côté, et s'enfoncent dans la planche du milieu du cadre
  const gapX = (n.l / 2 + t + (W / 2 - t)) / 2; // milieu de l'espace entre mur intérieur et mur extérieur
  const barZ = bodyH - 3 * t / 2; // niveau de la planche du milieu
  const BAR = 10; // largeur de la barre (sa hauteur = t)
  const barHoles = (q: Plank): Plank => ({ ...q, holes: [...q.holes, ...[-gapX, gapX].map((x) => fitHole(q, { id: uid(), shape: 'square' as const, x, y: r2(barZ - q.pos[2]), size: BAR, sh: t }))] });
  const drX = n.l / 2 - 10 - DRAIN_S / 2, drY = n.L / 2 - 10 - DRAIN_S / 2; // évacuation : coin arrière droit du nid, à 1 cm des parois intérieures, quelle que soit la taille
  const drainSquare = (q: Plank): Plank => ({ ...q, holes: [...q.holes, fitHole(q, { id: uid(), shape: 'square' as const, x: drX, y: drY, size: DRAIN_S, sh: DRAIN_S })] }); // passage de la pile d'évacuation dans un fond
  // FIXATION À L'ARBRE : deux nervures verticales en x = ± W/4, chacune = 3 PLAQUES COLLÉES (9 mm), 30 mm de profondeur, du bas du corps jusqu'au bas du toit ;
  // 3 POINTS D'ACCROCHE par nervure, deux fois plus longs qu'une dent classique (RIB_TOOTH = 32) : deux en bas dans le mur arrière du corps (fentes 9,5 × 32), un au niveau du toit
  // (encoche ouverte dans le bas de la plaque arrière du toit : le toit se pose par-dessus et se retire toujours)
  const RIB_N = 3, RIB_T = RIB_N * t, RIB_D = 15, RIB_TOOTH = 32, RIB_Z0 = 10, RIB_XS = [-W / 4, W / 4].map(r2);
  const RIB_TEETH_Z: [number, number][] = [[RIB_Z0 + 45, RIB_Z0 + 45 + RIB_TOOTH], [bodyH - 10 - RIB_TOOTH, bodyH - 10]]; // z des deux dents : une en bas (au-dessus du plancher intérieur), une en haut du corps ; plus de dent dans le toit (retirée à la demande de l'utilisateur)
  const RIB_OUT = 6, RIB_KEY = 3; // les dents ressortent de 6 mm dans l'isolant et sont percées d'un trou rectangulaire de 3 × 20 : une clavette (cale) les verrouille
  const RIB_Z1 = bodyH + 36; // haut de la nervure : elle monte le long du toit (jusqu'à 1 mm sous le tasseau arrière) pour mieux tenir, mais sans dent dans le toit : elle touche juste la face extérieure de sa plaque arrière = haut de la dent du toit (1 cm plus bas qu'avant, demande de l'utilisateur)
  const RGX = W / 2 - 45, RGY = -D / 2 + 75, RGZ = -16.5, CND_X = n.l / 2 + t, CND_D = 16, CND_Y = D / 2 - t - 10 - CND_D / 2; // régulateur sous le plancher, côté droit ; gaine à 1 cm du mur arrière
  const cam2X = -W / 2 + 33, cam2Y = -D / 2 - 23; // caméra 2 : toujours DEHORS, 23 mm devant la façade, à 33 mm du bord gauche, quelle que soit la taille du nichoir
  // quatre ÉTRIERS en U de contreplaqué qui tiennent le régulateur sous le plancher : plaque de 78 × 51 debout en travers, encoche de 62 × 42 ouverte vers le haut (le régulateur 61 × 33 + 1 de jeu),
  // bras de 8 dont les 3 mm du haut (= t) sont des tenons qui traversent le fond par des fentes 8 × 3 et AFFLEURENT son dessus : rien ne dépasse dans l'isolant
  const U_W = 78, U_ARM = 8, U_H = 46, U_TEN = t, U_YS = [-55, -22, 15, 52].map((d) => RGY + d); // gaine dans le coin arrière droit : à 1 cm du mur arrière, PILE sur le joint entre l'isolant du mur droit et celui du mur arrière (x = l/2 + t), à gauche de la barre du toit (x = 77,5…87,5) // régulateur de charge SOUS le nichoir (à plat, protégé par le lambris qui descend) ; les fils montent dans l'isolant du côté droit, dans une gaine (tuyau multicouche ou gaine électrique ICTA de diamètre minimal, 16)
  const outerParts = outerBox.planks.filter((p) => !/^Dessus/.test(p.name)).map((p) => { let q = isWall(p) ? noTop(p) : p; if (n.clim && /^Dessous/.test(p.name)) q = drainSquare(q); if (n.solar && /^Dessous/.test(p.name)) q = { ...q, holes: [...q.holes, ...U_YS.flatMap((y) => [RGX - U_W / 2 + U_ARM / 2, RGX + U_W / 2 - U_ARM / 2].map((x) => fitHole(q, { id: uid(), shape: 'square' as const, x: r2(x), y: r2(y), size: U_ARM, sh: t })))] };/* fentes des tenons des étriers du régulateur */ if (/^(Face avant|Face arrière)/.test(p.name)) q = barHoles(q); if (/^Face arrière/.test(p.name)) q = { ...q, holes: [...q.holes, ...RIB_XS.flatMap((x) => RIB_TEETH_Z.slice(0, 2).map(([za, zb]) => fitHole(q, { id: uid(), shape: 'square' as const, x, y: r2((za + zb) / 2 - q.pos[2]), size: RIB_T + 0.5, sh: zb - za })))] }; /* fentes 9,5 × 32 des deux dents basses des nervures de fixation */ return /^Face avant/.test(p.name) ? hole(q) : q; });
  const innerParts = innerBox.planks.filter(isWall).map((p) => { let q = noTop({ ...p, pos: [p.pos[0], p.pos[1], p.pos[2] + e] as Vec3, group }); return /^Face avant/.test(p.name) ? hole(q) : q; });
  // fentes (le temps du calcul, tout est « hors groupe ») : dents du plancher dans les murs extérieurs, dents du bas des murs intérieurs dans le plancher
  const free = (p: Plank): Plank => ({ ...p, group: undefined });
  const slotted = outerParts.map((p) => (isWall(p) ? slotsForTeeth({ t, fit, planks: [free(p), free(floor)] }, p.id).scene.planks[0] : p));
  const floorSlotted = slotsForTeeth({ t, fit, planks: [free(floor), ...innerParts.map(free)] }, floor.id).scene.planks[0];
  // le toit : posé sur le corps ; son dessus porte l'ouverture carrée, son dessous l'objectif et la fenêtre des LED
  // toit en pente : l'ARRIÈRE monte plus haut. Les plaques du toit sont agrandies : la plaque avant (Hf), la plaque arrière (Hb) et les deux côtés, dont le haut est une DIAGONALE
  // (de Hf à l'avant à Hb à l'arrière) SANS crénelage ; leurs arêtes verticales ont des dents de 16 mm comptées depuis le bas (elles s'emboîtent malgré les hauteurs différentes) ;
  // le dessus du toit est supprimé pour le moment
  const PENTE = 8;
  // le Raspberry Pi est en HAUT À GAUCHE du toit (coin arrière gauche), tourné de 90° (son boîtier de 105 est le long du mur de gauche)
  const piX = -(W / 2 - t) + PI_H / 2 + 1 + 10, piY = D / 2 - t - 46.5 - 1 - 10; // décollé de 1 cm du mur de gauche et du mur arrière // le Pi (89 de long avec ses prises) est dans le coin arrière gauche, sans boîtier (le toit en est déjà un)
  const pw = (lx: number, ly: number): [number, number] => [r2(piX - ly), r2(piY + lx)]; // repère de la carte (x vers sa droite, y vers son haut) → repère du nichoir
  const yFrontPi = piY - 42.5; // bord de la carte le plus proche de l'avant
  // le grenier peut être BAS : le boîtier n'est plus à l'avant, il est sous la partie haute du pan ; Hf est juste calculé pour que le pan passe 4 mm au-dessus de lui
  const Hf = Math.max(Math.ceil(roofH + 7 + 17 + 4 - (yFrontPi + D / 2) * Math.tan((PENTE * Math.PI) / 180)), Math.ceil(roofH + 3 + 32 + 4 - (-100 + D / 2) * Math.tan((PENTE * Math.PI) / 180))), Hb = Hf + Math.round(D * Math.tan((PENTE * Math.PI) / 180));
  const verticalTeeth = (edge: Edge, len: number, phase: 0 | 1): Notch[] => {
    const out: Notch[] = [];
    for (let i = 0; i * 16 < len; i++) { const a = i * 16, b = Math.min((i + 1) * 16, len); if (i % 2 === phase && b - a > 0.5) out.push({ id: uid(), edge, pos: r2((a + b) / 2), width: r2(b - a + fit), depth: t }); }
    return out;
  };
  const clipBelow = (poly: Pt[], line: (x: number) => number): Pt[] => { // garde ce qui est sous la droite y = line(x)
    const out: Pt[] = [];
    const inside = (p: Pt) => p[1] - line(p[0]) <= 1e-9;
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i], Q = poly[(i + 1) % poly.length], pi = inside(P), qi = inside(Q);
      if (pi) out.push(P);
      if (pi !== qi) { const dP = P[1] - line(P[0]), dQ = Q[1] - line(Q[0]), k = dP / (dP - dQ); out.push([P[0] + (Q[0] - P[0]) * k, P[1] + (Q[1] - P[1]) * k]); }
    }
    return out;
  };
  // UNE grande aération qui occupe presque toute la plaque arrière du toit au-dessus du dessus du toit, avec 2 cm de bois de marge sur les côtés et en haut (et 4 mm au-dessus du dessus du toit)
  // renfoncement des prises du Pi : les ports (USB, Ethernet, HDMI) regardent la plaque arrière, qui est percée en face d'eux ; un petit tunnel de contreplaqué (haut + deux côtés, le dessus du toit fait le fond)
  // relie les ports à cette fenêtre, pour brancher sans ouvrir le nichoir et sans ouvrir le grenier ; l'aération démarre juste à sa droite
  const PORT_X0 = piX - 30, PORT_X1 = piX + 30, PORT_Z0 = roofH + 3, PORT_Z1 = roofH + 27, VENT_L = PORT_X1 + 26, VENT_R = W / 2 - 20; // l'aération démarre 26 mm à droite de la fenêtre des prises du Pi (20 de bois entre les deux : la lame d'habillage y est plus large)
  const VENT_XS = [(VENT_L + VENT_R) / 2], VENT_W = VENT_R - VENT_L, VENT_Z0 = roofH + 4, VENT_H = Hb - 20 - VENT_Z0, VENT_Z = VENT_Z0 + VENT_H / 2;
  const GL_Y = 84; // le câble du panneau entre dans le toit par le côté droit, à cette ordonnée, 14 mm au-dessus du dessus du toit
  const tallRoof = (p: Plank): Plank => {
    if (!n.pente) return p;
    const base = p.notches.filter((x) => x.edge === 'bottom');
    if (/^Face avant/.test(p.name)) return { ...p, holes: n.cam2 ? [{ id: uid(), shape: 'square' as const, x: cam2X - 10, y: r2(roofH + 28 - Hf / 2), size: 28, sh: 4 }] : p.holes, h: Hf, pos: [p.pos[0], p.pos[1], bodyH + Hf / 2] as Vec3, cast: undefined, notches: [...base, ...verticalTeeth('left', Hf, 0), ...verticalTeeth('right', Hf, 0)] };
    if (/^Face arrière/.test(p.name)) { // deux ouvertures d'aération au-dessus du dessus du toit (grilles anti-insectes dessus)
      const q: Plank = { ...p, h: Hb, pos: [p.pos[0], p.pos[1], bodyH + Hb / 2] as Vec3, cast: undefined, notches: [...base, ...verticalTeeth('left', Hb, 0), ...verticalTeeth('right', Hb, 0)] };
      const portWin = n.cam > 0 ? [fitHole(q, { id: uid(), shape: 'square' as const, x: r2(piX), y: r2((PORT_Z0 + PORT_Z1) / 2 - Hb / 2), size: PORT_X1 - PORT_X0, sh: PORT_Z1 - PORT_Z0 })] : []; // fenêtre des prises du Pi
      return { ...q, holes: [...q.holes, ...portWin, ...VENT_XS.map((x) => fitHole(q, { id: uid(), shape: 'square' as const, x, y: r2(VENT_Z - Hb / 2), size: VENT_W, sh: VENT_H }))] };
    }
    if (/^Côté/.test(p.name)) {
      const gland = false && n.solar && /^Côté droit/.test(p.name) ? [{ id: uid(), shape: 'round' as const, x: GL_Y, y: r2(roofH + 14 - Hb / 2), size: 10 }] : []; // passe-câble du panneau solaire
      const rect: Plank = { ...p, h: Hb, pos: [p.pos[0], p.pos[1], bodyH + Hb / 2] as Vec3, cast: undefined, notches: [...base, ...verticalTeeth('left', Hb, 1), ...verticalTeeth('right', Hb, 1)] };
      const line = (x: number) => -Hb / 2 + Hf + ((x + p.w / 2) * (Hb - Hf)) / p.w; // diagonale : Hf (avant) → Hb (arrière), sans dents
      return { ...rect, holes: gland, poly: clipBelow(outline(rect), line).map(([x, y]) => [r2(x), r2(y)] as [number, number]) };
    }
    return p;
  };
  // UN SEUL compartiment dans le toit pour la caméra, le Peltier (dissipateur) et les fils du capteur (demande de l'utilisateur : « un grand espace unique ») :
  // l'union des deux anciens compartiments, de la caméra (à l'avant) au fond du Peltier (à l'arrière), ouvert au-dessus
  const BIGC = n.clim && n.cam > 0;
  const bx0 = Math.min(-n.cam / 2, TEC_CX - TECW / 2), bx1 = Math.max(n.cam / 2, TEC_CX + TECW / 2), by0 = CAM_Y - n.cam / 2, by1 = TEC_CY + TECD / 2;
  const bcx = r2((bx0 + bx1) / 2), bcy = r2((by0 + by1) / 2), bw = r2(bx1 - bx0), bd = r2(by1 - by0);
  const roofParts0 = roofBox.planks.map((p) => {
    const q: Plank = { ...p, name: p.name.replace(/ (\d+)$/, ' toit $1'), pos: [p.pos[0], p.pos[1], p.pos[2] + bodyH] as Vec3, group: roofGroup };
    if (n.clim && !BIGC && /^Dessus/.test(p.name)) q.holes = [...q.holes, fitHole(q, { id: uid(), shape: 'square' as const, x: SENSOR_X + 0.25, y: SENSOR_Y + 8, size: 12, sh: 6 })]; // les fils du capteur montent vers le Pi (compartiment unique : ils montent dedans)
    if (n.clim && /^Dessous/.test(p.name)) q.holes = [...q.holes, fitHole(q, { id: uid(), shape: 'square' as const, x: SENSOR_X, y: SENSOR_Y, size: 19.5, sh: 18.5 })]; // logement du capteur, incrusté à fleur du plafond (ses broches sortent dans le compartiment, plus de fente à part)
    if (n.clim && /^Dessous/.test(p.name)) q.holes = [...q.holes, fitHole(q, { id: uid(), shape: 'square' as const, x: 0, y: TEC_Y, size: TEC, sh: TEC })]; // le Peltier est dans le plancher du toit, collé à la plaque alu
    if (n.clim && !BIGC && /^Dessus/.test(p.name)) q.holes = [...q.holes, fitHole(q, { id: uid(), shape: 'square' as const, x: TEC_CX, y: TEC_CY, size: TECW, sh: TECD })]; // le compartiment du dissipateur reste OUVERT au-dessus // passage du bloc alu (dessous) et du Peltier (dessus)
    if (n.cam <= 0) return q;
    if (/^Dessus/.test(p.name)) return { ...q, holes: [...q.holes, BIGC ? fitHole(q, { id: uid(), shape: 'square' as const, x: bcx, y: bcy, size: bw, sh: bd }) : fitHole(q, { id: uid(), shape: 'square' as const, x: 0, y: CAM_Y, size: n.cam, sh: n.cam })] }; // on accède au compartiment par le haut
    if (/^Dessous/.test(p.name)) return { ...q, holes: [...q.holes, fitHole(q, { id: uid(), shape: 'round' as const, x: CAM_X, y: CAM_Y, size: LENS_HOLE }), fitHole(q, { id: uid(), shape: 'square' as const, x: IR_X, y: CAM_Y, size: 10, sh: 20 })] };
    return q;
  });
  const roofParts = (() => {
    if (!n.pente) return roofParts0;
    // les plaques du toit montent (avant, arrière, côtés en trapèze) ; le DESSUS du toit, celui qui porte les composants, n'est plus crénelé : c'est une plaque simple posée sur
    // des TASSEAUX (3 mm de large × 5 de haut) collés sur la face intérieure des quatre côtés, juste sous elle
    const top = roofParts0.find((p) => /^Dessus/.test(p.name));
    const walls = roofParts0.filter((p) => !/^Dessus|^Dessous/.test(p.name)).map((p) => ({ ...tallRoof(p), group: roofGroup }));
    const xr = W / 2 - t, yr = D / 2 - t; // intérieur des plaques du toit
    const plain: Plank[] = top ? [{ ...top, w: r2(2 * xr - 0.5), h: r2(2 * yr - 0.5), notches: [], cast: undefined }] : [];
    const zt = bodyH + roofH - t; // dessous de la plaque du dessus
    const TAS_W = 3, TAS_H = 5;
    const tas = (name: string, x0: number, x1: number, y0: number, y1: number): Plank[] => (x1 - x0 > 0.01 && y1 - y0 > 0.01
      ? [{ id: uid(), name, w: r2(x1 - x0), h: r2(y1 - y0), depth: TAS_H, pos: [r2((x0 + x1) / 2), r2((y0 + y1) / 2), r2(zt - TAS_H / 2)] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: roofGroup, special: 'block' as const, color: '#a16207' }]
      : []);
    const tasseaux: Plank[] = [
      ...tas('Tasseau gauche', -xr, -xr + TAS_W, -yr, yr), ...tas('Tasseau droite', xr - TAS_W, xr, -yr, yr), // sur toute la profondeur
      ...tas('Tasseau avant', -xr + TAS_W, xr - TAS_W, -yr, -yr + TAS_W), // entre les deux
      ...carveRects([-xr + TAS_W, yr - TAS_W, xr - TAS_W, yr], n.clim ? [[(BIGC ? bx0 : TEC_CX - TECW / 2) - t, 0, (BIGC ? bx1 : TEC_CX + TECW / 2) + t, yr]] : []).flatMap(([x0, y0, x1, y1], k) => tas(`Tasseau arrière ${k + 1}`, x0, x1, y0, y1)), // l'arrière contourne le compartiment du Peltier, dont le mur le remplace
    ];
    const grilles: Plank[] = VENT_XS.map((x, k): Plank => ({ id: uid(), name: `Grille anti-insectes ${k + 1}`, w: VENT_W + 4, h: 0.8, depth: VENT_H + 4, pos: [x, D / 2 + 0.4, bodyH + VENT_Z] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: roofGroup, special: 'block' as const, color: '#475569', transparent: true })); // maille fine collée sur la face extérieure, un peu plus grande que l'ouverture
    return [...walls, ...plain, ...(roofParts0.filter((p) => /^Dessous/.test(p.name))), ...tasseaux, ...grilles];
  })();
  const floorTop = bodyH + t; // dessus du plancher du toit
  const camParts: Plank[] = n.cam > 0
    ? makeBox(BIGC ? bw + 2 * t : n.cam + 2 * t, BIGC ? bd + 2 * t : n.cam + 2 * t, n.ins, t, fit, start).planks.filter(isWall).map((p) => {
      const cast = { ...(p.cast ?? {}) }; delete cast.top; cast.bottom = { n: teethFor(p.w), phase: 0 }; // le dessus du toit fait office de couvercle ; EN BAS, des dents qui s'enfoncent dans le plancher du toit (le plafond du nid) par des fentes
      return recastAll({ ...p, name: p.name.replace(/ (\d+)$/, BIGC ? ' compartiment $1' : ' caméra $1'), h: p.h + t, pos: [p.pos[0] + (BIGC ? bcx : 0), p.pos[1] + (BIGC ? bcy : CAM_Y), p.pos[2] + floorTop - t / 2] as Vec3, group: roofGroup, cast, notches: p.notches.filter((x) => x.edge !== 'top' && x.edge !== 'bottom') }, t, fit);
    })
    : [];
  // compartiment du Peltier : quatre petits murs dans l'isolant du toit autour du dissipateur (pas d'isolant dedans), ouvert au-dessus
  const tecParts: Plank[] = n.clim && !BIGC
    ? makeBox(TECW + 2 * t, TECD + 2 * t, n.ins, t, fit, start).planks.filter(isWall).map((p) => {
      const cast = { ...(p.cast ?? {}) }; delete cast.top; delete cast.bottom;
      return recastAll({ ...p, name: p.name.replace(/ (\d+)$/, ' Peltier $1'), pos: [p.pos[0] + TEC_CX, p.pos[1] + TEC_CY, p.pos[2] + floorTop] as Vec3, group: roofGroup, cast, notches: p.notches.filter((x) => x.edge !== 'top' && x.edge !== 'bottom') }, t, fit);
    })
    : [];
  // deuxième caméra, DEHORS : mini boîte en contreplaqué (37 × 30 × 36, ouverte au-dessus) accrochée sous le débord du toit en chêne, à l'avant gauche ; elle est inclinée vers le bas et tournée
  // pour que son objectif regarde le trou d'entrée (trou de 12 dans sa face avant) ; la caméra est debout dedans, connecteur en haut
  const cam2Cz = (n.pente ? bodyH + Hf + ((cam2Y + D / 2) * (Hb - Hf)) / D : bodyH + roofH) - CAM2_H / 2 - 4; // juste sous le dessous du pan
  const cam2Target: Vec3 = [0, -D / 2 - (n.lambris ? 10 : 0), holeZ];
  const cdx = cam2Target[0] - cam2X, cdy = cam2Target[1] - cam2Y, chor = Math.hypot(cdx, cdy);
  const cam2Yaw = Math.atan2(cdx, -cdy), cam2Pitch = Math.atan2(cam2Cz - cam2Target[2], chor); // la face avant (−y) est tournée vers le trou puis baissée
  const cam2Q = multiply(fromAxisAngle([0, 0, 1], cam2Yaw), fromAxisAngle([1, 0, 0], cam2Pitch));
  const irOff = rotate([-20, -3, 0], invert(cam2Q)); // décalage (monde) des LED extérieures par rapport à la caméra 2 : 20 mm à sa gauche, exprimé dans le repère de la caméra
  const cam2Pt = (lx: number, ly: number, lz: number): Vec3 => { const v = rotate([lx, ly, lz], cam2Q); return [r2(cam2X + v[0]), r2(cam2Y + v[1]), r2(cam2Cz + v[2])]; }; // repère de la boîte, centré
  const camBox: Plank[] = n.cam2 ? (() => {
    const bx = makeBox(CAM2_L, CAM2_D, CAM2_H, t, fit, start);
    const planksBox: Plank[] = []; void bx; (bx.planks as Plank[]).filter(() => false).map((p) => {
      const q: Plank = { ...p, name: p.name.replace(/ (\d+)$/, ' mini-boîte caméra 2'), pos: [p.pos[0], p.pos[1], p.pos[2] - CAM2_H / 2] as Vec3, group: roofGroup };
      return /^Face avant/.test(p.name) ? { ...q, holes: [...q.holes, fitHole(q, { id: uid(), shape: 'round' as const, x: 0, y: 0, size: 12 })] } : q;
    });
    const cam2: Plank = { id: uid(), name: CAMERA_NAMES[1], w: CAM_W, h: CAM_H, pos: [0, -CAM2_D / 2 + t + 10, 0] as Vec3, rot: [-90, 0, 180] as Vec3, notches: [], holes: [], group: elecGroup, special: 'camera' };
    const ir2: Plank = { id: uid(), name: 'LED infrarouges extérieures', w: IR_W, h: IR_H, pos: [r2(irOff[0]), r2(-CAM2_D / 2 + t + 10 + irOff[1]), r2(irOff[2])] as Vec3, rot: [-90, 0, 180] as Vec3, notches: [], holes: [], group: elecGroup, special: 'ir' }; // à côté de la caméra 2, tournée comme elle
    const all = [...planksBox, cam2, ir2], ids = new Set(all.map((p) => p.id));
    return transformPlanks({ t, fit, planks: all }, ids, [cam2X, cam2Y, cam2Cz], cam2Q, [0, 0, 0]).planks;
  })() : [];
  const brackets: Plank[] = n.solar ? U_YS.map((y, k): Plank => ({ id: uid(), name: `Étrier régulateur ${k + 1}`, w: U_W, h: U_H, pos: [RGX, r2(y), r2(U_TEN - U_H / 2)] as Vec3, rot: rotFromBasis([1, 0, 0], [0, 0, 1]), notches: [{ id: uid(), edge: 'top' as const, pos: U_W / 2, width: U_W - 2 * U_ARM, depth: U_H - 9 }], holes: [], group })) : []; // les tenons (3 mm du haut des bras) affleurent le dessus du fond (z = +3), le fond de l'encoche est 1 mm sous le régulateur
  const LAM_T = 10, LAM_W = 46, LAM_DOWN = n.solar ? 45 : 10; // habillage : lames de ~46 (largeur exacte (W + LAM_T) / k), toutes de la même largeur
  // les nervures : RIB_N plaques de t collées côte à côte, chacune avec le même contour ; bord côté nichoir crénelé aux trois dents seulement
  const RIB_Y0 = D / 2 - t - RIB_OUT, RIB_Y1 = D / 2 + (n.lambris ? LAM_T : 0) + RIB_D; // du bout des dents (6 mm dans l'isolant) au bout de la nervure
  const mounts: Plank[] = RIB_XS.flatMap((x, k) => Array.from({ length: RIB_N }, (_, j): Plank => {
    const w = r2(RIB_Y1 - RIB_Y0), h = r2(RIB_Z1 - RIB_Z0), xj = r2(x + (j - (RIB_N - 1) / 2) * t);
    const teeth = RIB_TEETH_Z.map(([za, zb]) => [za - RIB_Z0, zb - RIB_Z0]); // en local, depuis le bas
    const gaps: [number, number][] = []; let z = 0;
    for (const [ta, tb] of teeth) { if (ta > z + 0.01) gaps.push([z, ta]); z = tb; }
    if (h > z + 0.01) gaps.push([z, h]);
    return { id: uid(), name: `Fixation arbre ${k + 1}.${j + 1}`, w, h, pos: [xj, r2((RIB_Y0 + RIB_Y1) / 2), r2((RIB_Z0 + RIB_Z1) / 2)] as Vec3, rot: rotFromBasis([0, 1, 0], [0, 0, 1]),
      notches: gaps.map(([ga, gb]) => ({ id: uid(), edge: 'left' as const, pos: r2((ga + gb) / 2), width: r2(gb - ga), depth: t + RIB_OUT })), // entre les dents, le bord est en retrait de t + 6 : seules les dents traversent le mur et ressortent
      holes: [
        ...[[-RIB_D / 2, -h / 2 + 20], [-RIB_D / 2, h / 2 - 20]].map(([hx, hy]) => ({ id: uid(), shape: 'round' as const, x: r2(w / 2 + hx), y: r2(hy), size: 5 })), // perçages Ø 5 centrés dans la partie qui dépasse (15 mm)
        ...teeth.slice(0, 2).map(([ta, tb]) => ({ id: uid(), shape: 'square' as const, x: r2(-w / 2 + RIB_OUT - RIB_KEY / 2), y: r2((ta + tb) / 2 - h / 2), size: RIB_KEY, sh: r2(tb - ta - 12) })), // trou de la clavette dans la partie qui ressort, COLLÉ à la face intérieure du mur (pas d'espace : la clavette serre la nervure contre le dos)
      ], group };
  }));
  const keys: Plank[] = RIB_XS.flatMap((x, k) => RIB_TEETH_Z.slice(0, 2).map(([za, zb], j): Plank => ({ id: uid(), name: `Clavette fixation ${k + 1}.${j + 1}`, w: r2(RIB_T + 6), h: r2(zb - za - 12 - 0.5), pos: [x, r2(D / 2 - t - RIB_KEY / 2), r2((za + zb) / 2)] as Vec3, rot: rotFromBasis([1, 0, 0], [0, 0, 1]), notches: [], holes: [], group }))); // clavette de 3, contre la face intérieure du mur : traverse les trois plaques par leur trou, dépasse de 3 de chaque côté seulement, contre la face intérieure du mur
  const camera: Plank[] = n.cam > 0 ? [
    { id: uid(), name: CAMERA_NAMES[0], w: CAM_W, h: CAM_H, pos: [CAM_X, CAM_Y, floorTop + 6.6] as Vec3, rot: [0, 0, 180] as Vec3, notches: [], holes: [], group: elecGroup, special: 'camera' },
    { id: uid(), name: 'LED infrarouges', w: IR_W, h: IR_H, pos: [IR_X, CAM_Y, floorTop + 0.8] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'ir' },
  ] : [];
  // cadre sous le toit, en trois planches collées : une planche haute et une basse, et entre elles une planche percée de fentes rectangulaires
  // (de chaque côté, d'avant en arrière) où passent les barres de bois qui traversent aussi les murs avant et arrière : le toit tient ;
  // en descendant dans l'isolant entre murs extérieur et intérieur, le cadre cale en plus le toit sur le corps
  const ring = (name: string, k: number, holes: Hole[]): Plank => ({ id: uid(), name, w: W - 2 * t, h: D - 2 * t, pos: [0, 0, bodyH - (2 * k + 1) * t / 2], rot: [0, 0, 0], notches: [], holes, group: roofGroup });
  const BAR_LEN = 50; // quatre barres courtes (5 cm) : deux à l'avant, deux à l'arrière, chacune entre par un trou du mur et s'enfonce dans une encoche de la planche du milieu
  const inside = BAR_LEN - t; // partie de la barre qui est dans l'encoche
  const notch = (edge: Edge, x: number): Notch => ({ id: uid(), edge, pos: r2(x + (W - 2 * t) / 2), width: BAR, depth: inside });
  // le cadre est en U : son ouverture centrale (l'extérieur de la boîte intérieure) est ouverte vers l'avant par une encoche qui va jusqu'au bord avant, de sorte
  // que le bloc d'entrée (plaques de 55 dans l'isolant) peut monter à fleur du haut du mur, toit retiré ou posé
  const uNotch = (): Notch => ({ id: uid(), edge: 'bottom', pos: r2((W - 2 * t) / 2), width: n.l + 2 * t, depth: r2((D / 2 - t) + (n.L / 2 + t)) });
  const bars: Plank[] = ([[-1, -1, 'avant gauche'], [1, -1, 'avant droite'], [-1, 1, 'arrière gauche'], [1, 1, 'arrière droite']] as const).map(([sx, sy, nm]): Plank => (
    { id: uid(), name: `Barre ${nm}`, w: BAR_LEN, h: BAR, pos: [sx * gapX, sy * (D / 2 - BAR_LEN / 2), barZ] as Vec3, rot: [0, 0, 90] as Vec3, notches: [], holes: [], group: roofGroup, special: 'bar' as const }));
  const frames: Plank[] = [
    { ...ring('Cadre toit haut', 0, []), notches: [uNotch()] },
    { ...ring('Cadre toit milieu', 1, []), notches: [-gapX, gapX].flatMap((x) => [notch('bottom', x), notch('top', x)]).concat(uNotch()) }, // encoches des barres sur les bords avant et arrière
    { ...ring('Cadre toit bas', 2, []), notches: [uNotch()] },
  ];
  // le Raspberry Pi sur le toit, à l'arrière (pas au-dessus de l'ouverture), calé par six petits bouts de bois collés sur le toit
  const roofTop = bodyH + roofH;
  const OAK = n.chene ? 18 : 0, topZ = roofTop + OAK; // dessus de la planche de chêne : tout ce qui est « sur le toit » (Pi, boîtier, toit en pente) se pose dessus
  const piZ = topZ + 7; // centre de la carte : sur des entretoises de 6 mm au-dessus du dessus du toit (les composants du dessous dépassent de 2,9)
  const pi: Plank[] = n.cam > 0 ? [
    { id: uid(), name: 'Raspberry Pi', w: PI_W, h: PI_H, pos: [piX, piY, piZ] as Vec3, rot: [0, 0, 90] as Vec3, notches: [], holes: [], group: elecGroup, special: 'pi' as const },
    // six cales de bois collées sur le toit, serrées contre le boîtier : deux sur chaque grand côté, une à chaque bout
    ...([[-25, -(PI_H / 2 + 2), 16, 4], [25, -(PI_H / 2 + 2), 16, 4], [-25, PI_H / 2 + 2, 16, 4], [25, PI_H / 2 + 2, 16, 4], [-(PI_W / 2 + 2), 0, 4, 16], [PI_W / 2 + 6.5, 0, 4, 16]] as const).map(([x, y, w, h], k): Plank => (
      { id: uid(), name: `Cale Pi ${k + 1}`, w: h, h: w, pos: [...pw(x, y), topZ + t / 2] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'bar' as const })),
  ] : [];
  // la nappe de la caméra (câble plat) : du connecteur de la caméra, elle monte par l'ouverture du toit puis court sur le toit jusqu'au connecteur du Pi
  // la nappe sort à l'HORIZONTALE du connecteur de la caméra (côté arrière), monte par l'ouverture, puis arrive à l'horizontale dans le connecteur du Pi par le côté gauche
  // (le jack audio bouche le côté droit) ; sa largeur (16) est dans l'axe de chaque connecteur
  const camZc = floorTop + 6.6 + 2.1; // hauteur du connecteur de la caméra
  const piZc = piZ + PI_CSI[2] - 2.6; // hauteur moyenne du connecteur du Pi (0,8 à 6,1 au-dessus du centre de la carte)
  // la nappe de la caméra 2 : LONGUE (la caméra est dehors) ; elle part du 2ᵉ port du Pi, court sur le dessus du toit, SORT par le trou de la plaque avant du toit et redescend jusqu'au connecteur de la caméra
  const MX = -50, MY = -16, MZ = topZ + 3; // module 2 × MOSFET des LED (20 × 14 × 6), posé sur le dessus du toit devant le Pi
  const ledSwitch: Plank[] = n.cam > 0 ? [
    { id: uid(), name: 'Module 2 MOSFET (LED infrarouges on / off)', w: 20, h: 14, depth: 6, pos: [MX, MY, MZ + 3] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'driver' as const, color: '#1f2937' },
    // masse du module → masse du Pi (broche 6) ; commandes : IN1 = GPIO23 (broche 16) pour les LED du nid, IN2 = GPIO24 (broche 18) pour les LED extérieures
    ...([['Fil masse module LED (noir)', '#111827', 2, 0, -4], ['Fil IN1 LED du nid (gris, GPIO23 broche 16)', '#6b7280', 7, 0, 0], ['Fil IN2 LED extérieures (blanc, GPIO24 broche 18)', '#e5e7eb', 8, 0, 4]] as const).map(([nm, color, pinIdx, _r, dx]): Plank => {
      const [xt, yt] = pw(PI_PIN_X0 + pinIdx * 2.54, PI_PIN_Y);
      return { id: uid(), name: nm, w: 1.2, h: 1.2, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'wire' as const, color,
        path: [[MX + dx, MY + 7, MZ + 4], [MX + dx, MY + 12, MZ + 10], [xt + 6, yt - 8, topZ + 18], [xt, yt, piZ + 8], [xt, yt, piZ + 3.5]] as Vec3[] };
    }),
  ] : [];
  const wires2: Plank[] = n.cam2 ? ([['Fil 5 V LED extérieures (rouge)', '#dc2626', 0, 0, -10.5], ['Fil masse LED extérieures (noir)', '#111827', 9, 0, -13]] as const).map(([nm, color, pinIdx, _r, dx]): Plank => {
    const [xt, yt] = pw(PI_PIN_X0 + pinIdx * 2.54, PI_PIN_Y), sx = cam2X - 10 + dx, yw = -D / 2, zs = topZ + 28; // tous les deux à GAUCHE de la nappe (à 10,5 et 13 mm de son axe ; elle fait 16 de large, la fente 28) : jamais dessus, jamais croisée
    const end = cam2Pt(irOff[0] + dx / 4, -2 + irOff[1], IR_H / 2 + 2 + irOff[2]);
    return { id: uid(), name: nm, w: 1.2, h: 1.2, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'wire' as const, color,
      path: [...(pinIdx === 9 ? [[MX + 4, MY - 7, MZ + 4], [MX + 4, MY - 12, MZ + 10], [sx + 10, -34, topZ + 24]] as Vec3[] : [[xt, yt, piZ + 3.5], [xt, yt, piZ + 10], [xt + dx, yt - 10, topZ + 27]] as Vec3[]), [sx, -46, zs + 1], [sx, yw + 12, zs], [sx, yw, zs], [sx, yw - 5, zs], [sx - 2, (yw + cam2Y) / 2, (zs + end[2]) / 2 + 2], [end[0], end[1], end[2] + 6], end] as Vec3[] };
  }) : [];
  const cable2: Plank[] = n.cam2 ? [{
    id: uid(), name: 'Nappe caméra 2 (longue, vers l\'extérieur)', w: 16, h: 0.3, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'cable' as const,
    path: (() => {
      const [xt, yt] = pw(PI_CSI2[0], PI_CSI2[1]);
      const con = cam2Pt(0, -2, CAM_H / 2), up = cam2Pt(0, -2, CAM_H / 2 + 14); // connecteur en haut de la caméra, qui pend dehors sous le débord
      const yw = -D / 2, zs = topZ + 28; // la fente de la plaque avant : la nappe la traverse bien à plat, perpendiculaire à la plaque
      const yo = Math.max(yw - 8, (yw + cam2Y) / 2); // deuxième point dehors : elle s'écarte du mur avant de plonger
      const sx = cam2X - 10; // la fente est dans la première lame de l'habillage, loin du joint ; la nappe monte tout de suite et passe AU-DESSUS de tout (convertisseur compris) jusqu'à la fente, haute, de la plaque avant
      return [[xt, yt, piZ + 1], [xt, yt - 6, piZ + 3], [xt, yt - 14, piZ + 10], [xt - 4, -8, topZ + 26], [sx, -46, zs + 1], [sx, yw + 12, zs], [sx, yw, zs], [sx, yw - 5, zs], [sx, yo, (zs + up[2]) / 2 + 2], [up[0], up[1], up[2]], con] as Vec3[];
    })(),
  }] : [];
  const cable: Plank[] = n.cam > 0 ? [{
    id: uid(), name: 'Nappe caméra', w: 16, h: 0.3, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'cable' as const,
    // sort à l'horizontale du connecteur de la caméra (vers l'avant), monte par l'ouverture, passe en arche au-dessus de la carte (composants jusqu'à 24 au-dessus du toit), puis redescend en douceur
    // sur le connecteur du Pi, où elle entre à l'horizontale ; points peu nombreux, courbe centripète
    path: (() => { const [xt, yt] = pw(PI_CSI[0], PI_CSI[1]); return [[CAM_X, CAM_Y - 6, camZc], [CAM_X, CAM_Y + 2, camZc + 10], [CAM_X, CAM_Y + 10, camZc + 23], [CAM_X - 2, CAM_Y + 16, roofTop + 2], [CAM_X - 14, CAM_Y + 30, topZ + 16], [xt + 12, yt - 14, topZ + 24], [xt, yt - 12, piZc + 12], [xt, yt - 5, piZc + 2], [xt, yt + 2, piZc]] as Vec3[]; })(), // part DIRECTEMENT en diagonale du connecteur de la caméra, monte vers le fond du nichoir (l'arrière) par l'ouverture, puis rejoint le Pi
  }] : [];
  // l'alimentation des LED infrarouges : deux fils de la carte IR au GPIO du Pi, 5 V (broche 4, rouge) et masse (broche 6, noir)
  const wires: Plank[] = n.cam > 0 ? ([['Fil 5 V (rouge)', '#dc2626', -2, 1], ['Fil masse (noir)', '#111827', 2, 2]] as const).map(([nm, color, dx, pinIdx]): Plank => {
    const sx = IR_X + dx, px = PI_PIN_X0 + pinIdx * 2.54, top = topZ + 16 + dx * 0.4;
    return { id: uid(), name: nm, w: 1.2, h: 1.2, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'wire' as const, color,
      path: [[sx, CAM_Y + 6, floorTop + 2], [sx, CAM_Y + 6, floorTop + 14], [sx, CAM_Y + 9, roofTop - 8], [sx, CAM_Y + 14, top], ...(pinIdx === 2 ? [[MX + 16, MY - 2, top], [MX + 10, MY - 2, MZ + 4]] as Vec3[] : [[...pw(px, 20), top], [...pw(px, PI_PIN_Y), piZ + 8], [...pw(px, PI_PIN_Y), piZ + 3.5]] as Vec3[])] as Vec3[] }; // la masse des LED passe par le module (OUT1) : le Pi peut les éteindre
  }) : [];
  // bloc d'entrée : carrés de OPEN × OPEN percés du trou d'envol, empilés sur toute l'épaisseur de la double paroi (de la face extérieure à la face intérieure),
  // avec un surplus (+12) : une collerette derrière le trou, à l'extérieur du mur extérieur, et tous les carrés qui sont dans l'isolant, entre les deux murs ; seuls les carrés qui traversent les murs restent à OPEN ;
  // rien ne dépasse dans l'espace des oiseaux : le dernier carré affleure la face intérieure ; l'encoche des murs monte jusqu'au bord, toit retiré on le descend par le haut
  const frontRot = rotFromBasis([1, 0, 0], [0, 0, 1]);
  const outFace = -D / 2, inFace = -n.L / 2; // faces extérieure du mur extérieur et intérieure du mur intérieur
  const K = Math.ceil((inFace - outFace) / t); // plaques dans l'épaisseur des murs (16 : le dernier carré affleure la face intérieure)
  // les plaques sont des RECTANGLES : elles montent toutes jusqu'en haut du mur (à fleur, elles comblent l'encoche), dans l'isolant aussi (le cadre du toit est en U, ouvert vers l'avant)
  const wallTop = bodyH;
  const plate = (name: string, w: number, bottom: number, top: number, y: number): Plank => {
    const h = r2(top - bottom), zc = r2((top + bottom) / 2);
    return { id: uid(), name, w, h, pos: [0, y, zc] as Vec3, rot: frontRot, notches: [], holes: [fitHole({ w, h } as Plank, { id: uid(), shape: 'round', x: 0, y: r2(holeZ - zc), size: n.hole })], group: entryGroup };
  };
  const narrowBottom = holeZ - OPEN / 2, wideBottom = holeZ - OPEN / 2 - 6;
  const entry: Plank[] = [
    ...Array.from({ length: K }, (_, i) => {
      const y = Math.min(outFace + t / 2 + i * t, inFace - t / 2);
      const inWall = y < outFace + t || y > inFace - t; // dans l'épaisseur d'un des deux murs (les 2 ouvertures) : 43 de large, jusqu'en haut du mur ; dans l'isolant : plus large, un peu plus bas
      return inWall ? plate(`Entrée ${i + 1}`, OPEN, narrowBottom, wallTop, y) : plate(`Entrée ${i + 1}`, OPEN + 12, wideBottom, wallTop, y);
    }),
  ];
  // l'isolant : uniquement des pavés (boîtes pleines), en orange, dans un groupe à part ; pas de découpe, pas de bois
  const xo = W / 2 - t, yo = D / 2 - t, xi = n.l / 2 + t, yi = n.L / 2 + t; // faces intérieures du mur extérieur, faces extérieures du mur intérieur
  const wide = (OPEN + 12) / 2; // demi-largeur des plaques du bloc d'entrée dans l'isolant
  const z0 = e + t, z1 = bodyH - 3 * t; // au-dessus du plancher intérieur, jusque sous le cadre du toit
  const block = (name: string, x0: number, x1: number, y0: number, y1: number, za: number, zb: number): Plank[] => (x1 - x0 > 0.01 && y1 - y0 > 0.01 && zb - za > 0.01
    ? [{ id: uid(), name, w: r2(x1 - x0), h: r2(y1 - y0), depth: r2(zb - za), pos: [r2((x0 + x1) / 2), r2((y0 + y1) / 2), r2((za + zb) / 2)] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: isoGroup, special: 'block' as const, color: '#f59e0b', transparent: true }]
    : []);
  const cc = n.cam > 0 ? (n.cam + 2 * t) / 2 : 0; // demi-côté extérieur du compartiment caméra
  const insulation: Plank[] = [
    ...carveRects([-xo, -yo, xo, yo], n.clim ? [[drX - DRAIN_S / 2, drY - DRAIN_S / 2, drX + DRAIN_S / 2, drY + DRAIN_S / 2]] : []).flatMap(([x0, y0, x1, y1], k) => block(`Isolant sous le plancher ${k + 1}`, x0, x1, y0, y1, t, e)),
    ...block('Isolant gauche', -xo, -xi, -yo, yo, z0, z1),
    ...block('Isolant droite', xi, xo, -yo, yo, z0, z1), // pavé plein : la gaine se pousse dans la laine (plus de découpe, demande de l'utilisateur)
    ...block('Isolant arrière', -xi, xi, yi, yo, z0, z1),
    ...block('Isolant avant gauche', -xi, -wide, -yo, -yi, z0, z1),
    ...block('Isolant avant droite', wide, xi, -yo, -yi, z0, z1),
    ...block("Isolant sous le bloc d'entrée", -wide, wide, -yo, -yi, z0, holeZ - OPEN / 2 - 6),
    // le toit : des pavés autour du compartiment caméra et du bloc alu du Peltier
    ...carveRects([-xo, -yo, xo, yo], [...([] as [number, number, number, number][]), ...(BIGC ? [[bx0 - t, by0 - t, bx1 + t, by1 + t] as [number, number, number, number]] : [...(n.cam > 0 ? [[-cc, CAM_Y - cc, cc, CAM_Y + cc] as [number, number, number, number]] : []), ...(n.clim ? [[TEC_CX - (TECW + 2 * t) / 2, TEC_CY - (TECD + 2 * t) / 2, TEC_CX + (TECW + 2 * t) / 2, TEC_CY + (TECD + 2 * t) / 2] as [number, number, number, number]] : [])])])
      .flatMap(([x0, y0, x1, y1], k) => block(`Isolant toit ${k + 1}`, x0, x1, y0, y1, bodyH + t, bodyH + roofH - t)),
  ];
  // climatisation : un système Peltier réaliste dans le toit, derrière le compartiment caméra ; groupe « Climatisation »
  //   côté froid (dans le nid) : ventilateur 40 + radiateur 40 à ailettes vers le bas, bloc alu qui traverse le toit et l'isolant ;
  //   Peltier TEC1-12706 dans l'ouverture du dessus ; côté chaud (dehors) : radiateur 48 à ailettes + ventilateur ; module MOSFET + prise 12 V sur le toit,
  //   fils du Peltier au module, fil de commande (PWM, broche 12) et masse (broche 14) du module au GPIO du Pi ; capteur température / humidité dans le nid
  const climGroup = n.clim ? climGroupId : undefined;
  const part = (name: string, w: number, h: number, depth: number, x: number, y: number, z: number, special: 'block' | 'heatsink' | 'fan' | 'peltier' | 'driver', color = '#cbd5e1', rot: Vec3 = [0, 0, 0]): Plank =>
    ({ id: uid(), name, w, h, depth, pos: [x, y, z] as Vec3, rot, notches: [], holes: [], group: climGroup, special, color });
  const wire = (name: string, color: string, path: Vec3[], d = 1.2): Plank => ({ id: uid(), name, w: d, h: d, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: climGroup, special: 'wire' as const, color, path });
  const DRV: [number, number] = [W / 2 - 33, 26];
  const FLX = W / 2 - t - 2 - 14, FLY = CND_Y - 1; // filtre LC du Peltier (28 × 18) : derrière le fusible, contre le mur droit, à droite de la gaine
  const CVX = -(W / 2 - t) + 10 + 18, CVY = -(D / 2 - t) + 10 + 30; // convertisseur : coin avant gauche, 1 cm des murs
  const BX = W / 2 - t - 10 - 64, BY = -(D / 2 - t) + 10 + 35; // batterie : coin avant droit, 1 cm des murs
  const WGX = W / 2 - t - 2 - 10; // les deux Wago du rail 12 V : à droite du fusible, contre le mur droit
  const FX = CND_X + 3, FY = CND_Y - 24; // fusible, près de la sortie de la gaine // centre du convertisseur : milieu de la place libre entre le tasseau gauche, la cale gauche de la batterie, le tasseau avant et la cale avant du Pi
  // plaque froide + Peltier + dissipateur forment un bloc incliné de TILT_DEG vers l'arrière (rotation autour de x) : le bord arrière est plus bas
  const TILT = (TILT_DEG * Math.PI) / 180, plateZ = r2(bodyH - t / 2 - 0.5 - (COLD_D / 2) * Math.sin(TILT));
  const stackAt = (d: number): [number, number, number] => { const dy = (TEC_Y - COLD_Y) / Math.cos(TILT); return [0, r2(COLD_Y + Math.cos(TILT) * dy + Math.sin(TILT) * d), r2(plateZ - Math.sin(TILT) * dy + Math.cos(TILT) * d)]; };
  // alimentation : toujours présente (le Pi en a besoin) — batterie 4 × 32700, fusible, deux Wago du rail 12 V, convertisseur 12 → 5 V, leurs cales et leurs fils
  const power: Plank[] = [
    part('Convertisseur 12 V → 5 V 5 A USB-C (taille à confirmer, ≈ 60 × 36 × 16)', 36, 60, 16, CVX, CVY, topZ + 3 + 8, 'block', '#0e7490'), // centré dans la place libre de l'avant gauche, calé
    part('Cale convertisseur gauche', 3, 66, t, CVX - 18 - 1.5, CVY, topZ + t / 2, 'block', '#a16207'),
    part('Cale convertisseur droite', 3, 66, t, CVX + 18 + 1.5, CVY, topZ + t / 2, 'block', '#a16207'),
    part('Cale convertisseur avant', 36, 3, t, CVX, CVY - 30 - 1.5, topZ + t / 2, 'block', '#a16207'),
    part('Cale convertisseur arrière', 36, 3, t, CVX, CVY + 30 + 1.5, topZ + t / 2, 'block', '#a16207'),
    part('Fusible lame 15 A (19 × 18 × 5, posé à plat)', 19, 18.5, 5, FX, FY, topZ + 2.5, 'block', '#dc2626'), // près de la sortie de la gaine
    ...(n.clim ? [part('Wago 221 (3 entrées) rail 12 V +', 20, 13, 11, WGX, FY, topZ + 3 + 5.5, 'block', '#f97316')] : []), // bornier du rail 12 V : un fil de la batterie, deux départs (pont en H, convertisseur) — absent sans Peltier : un seul départ, pas besoin de borne
    ...(n.clim ? [part('Wago 221 (3 entrées) rail 12 V −', 20, 13, 11, WGX, FY - 14, topZ + 3 + 5.5, 'block', '#9ca3af')] : []),
    // cales de bois autour de la batterie (tous les côtés ; à gauche c'est le mur du compartiment du Peltier qui la bloque)
    part('Cale batterie droite', 3, 76, t, BX + 64 + 1.5, BY, topZ + t / 2, 'block', '#a16207'), // cale tout autour (3 mm de large, 3 de haut) ; la batterie est à 1 cm du mur de droite et du mur avant
    part('Cale batterie gauche', 3, 76, t, BX - 64 - 1.5, BY, topZ + t / 2, 'block', '#a16207'),
    part('Cale batterie avant', 128, 3, t, BX, BY - 35 - 1.5, topZ + t / 2, 'block', '#a16207'),
    ...((): Plank[] => { // la cale arrière saute l'ouverture du compartiment si elle passe au-dessus (elle ne doit pas être dans le vide)
      const y = BY + 35 + 1.5, cut = BIGC && y > by0 - t && y < by1 + t;
      const segs: [number, number][] = cut ? ([[BX - 64, bx0 - t], [bx1 + t, BX + 64]] as [number, number][]).filter(([a, b]) => b - a > 2) : [[BX - 64, BX + 64]];
      return segs.map(([a, b], k) => part(`Cale batterie arrière${segs.length > 1 ? ' ' + (k + 1) : ''}`, r2(b - a), 3, t, r2((a + b) / 2), y, topZ + t / 2, 'block', '#a16207'));
    })(),
    part('Batterie LiFePO4 12,8 V 6 Ah (4 × 32700, 128 × 70 × 32)', 128, 70, 32, BX, BY, topZ + 3 + 16, 'block', '#047857'), // dans le grenier, coin avant droit, à 1 cm du mur de droite et du mur avant
    wire('Fil fusible → batterie + (rouge)', '#dc2626', [[FX - 7.5, FY, topZ + 5], [FX - 8, FY - 7, topZ + 14], [(FX + BX) / 2, (FY + BY) / 2, topZ + 34], [BX - 8, BY + 46, topZ + 22], [BX - 8, BY + 38, topZ + 19], [BX - 8, BY + 31, topZ + 19]] as Vec3[], 3.6),
    ...(n.clim ? [
      wire('Fil fusible → Wago + (rouge)', '#dc2626', [[FX + 7.5, FY, topZ + 5], [FX + 9, FY, topZ + 10], [WGX - 14, FY, topZ + 12], [WGX - 7, FY, topZ + 14]] as Vec3[], 3.6), // le + sort du fusible et entre dans le Wago +
      wire('Fil batterie − → Wago − (noir)', '#111827', [[BX + 12, BY + 31, topZ + 19], [BX + 12, BY + 38, topZ + 19], [BX + 12, BY + 46, topZ + 22], [BX + 34, -6, topZ + 36], [WGX - 22, 22, topZ + 24], [WGX - 14, FY - 14, topZ + 16], [WGX - 7, FY - 14, topZ + 14]] as Vec3[], 3.6), // le − de la batterie entre dans le Wago −
      wire('Fil rail → convertisseur + (rouge)', '#dc2626', [[WGX + 7, FY, topZ + 14], [99, 30, topZ + 22], [58, 2, topZ + 22], [MX + 10, MY, topZ + 20], [MX - 10, MY - 4, topZ + 20], [CVX + 7, CVY + 36, topZ + 14], [CVX + 7, CVY + 30, topZ + 11]] as Vec3[], 3.6), // départ 2 du Wago +
      wire('Fil rail → convertisseur − (noir)', '#111827', [[WGX + 7, FY - 14, topZ + 14], [88, 34, topZ + 28], [58, -4, topZ + 28], [MX + 8, MY + 6, topZ + 24], [MX - 20, MY - 4, topZ + 22], [CVX - 7, CVY + 40, topZ + 13], [CVX - 7, CVY + 30, topZ + 11]] as Vec3[], 3.6), // départ 2 du Wago −
    ] : [
      wire('Fil fusible → convertisseur + (rouge)', '#dc2626', [[FX + 7.5, FY, topZ + 5], [FX + 9, FY, topZ + 10], [WGX + 7, FY, topZ + 14], [99, 30, topZ + 22], [58, 2, topZ + 22], [MX + 10, MY, topZ + 20], [MX - 10, MY - 4, topZ + 20], [CVX + 7, CVY + 36, topZ + 14], [CVX + 7, CVY + 30, topZ + 11]] as Vec3[], 3.6), // sans Peltier : pas de Wago, le fusible va droit au convertisseur
      wire('Fil batterie − → convertisseur − (noir)', '#111827', [[BX + 12, BY + 31, topZ + 19], [BX + 12, BY + 38, topZ + 19], [BX + 12, BY + 46, topZ + 22], [BX + 34, -6, topZ + 36], [58, -4, topZ + 28], [MX + 8, MY + 6, topZ + 24], [MX - 20, MY - 4, topZ + 22], [CVX - 7, CVY + 40, topZ + 13], [CVX - 7, CVY + 30, topZ + 11]] as Vec3[], 3.6),
    ]),
  ];
  // avec le panneau solaire : le régulateur sous le nichoir, ses deux fils vers la batterie et la gaine qui les porte
  const solarElec: Plank[] = n.solar ? [
    part('Régulateur de charge Genasun GV-10-Li (137 × 61 × 33, sous le nichoir)', 61, 137, 33, RGX, RGY, RGZ, 'block', '#1d4ed8'), // à plat sous le plancher, le lambris descend autour pour le protéger
    wire('Fil régulateur → batterie + (rouge, 2,5 mm²)', '#dc2626', [[RGX - 30.5, RGY - 8, RGZ + 6], [RGX - 37, RGY - 11, RGZ + 6], [RGX - 45, RGY - 14, RGZ + 5], [RGX - 45, RGY + 50, RGZ + 5], [RGX - 41, CND_Y - 26, RGZ + 5], [RGX - 26, CND_Y - 9, RGZ + 6], [CND_X - 13, CND_Y - 4, RGZ + 8], [CND_X - 2.5, CND_Y - 2.5, -4], [CND_X - 2.5, CND_Y - 2.5, topZ + 10], [FX - 7.5, FY + 9, topZ + 13], [FX - 7.5, FY, topZ + 5]] as Vec3[], 3.6),
    wire('Fil régulateur → batterie − (noir, 2,5 mm²)', '#111827', [[RGX - 30.5, RGY + 8, RGZ + 6], [RGX - 37, RGY + 6, RGZ + 4], [RGX - 49, RGY, RGZ + 2], [RGX - 49, RGY + 90, RGZ + 2], [RGX - 40, CND_Y + 2, RGZ + 3], [CND_X - 21, CND_Y + 7, RGZ + 5], [CND_X + 2.5, CND_Y + 2.5, -4], [CND_X + 2.5, CND_Y + 2.5, topZ + 14], [(CND_X + BX) / 2 - 6, (CND_Y + BY) / 2 + 20, topZ + 36], [BX + 12, BY + 57, topZ + 24], [BX + 12, BY + 46, topZ + 19], [BX + 12, BY + 38, topZ + 19], [BX + 12, BY + 31, topZ + 19]] as Vec3[], 3.6),
    { id: uid(), name: 'Gaine des fils (ICTA Ø 16 ou multicouche Ø 16, dans l’isolant)', w: CND_D, h: CND_D, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'conduit' as const, color: '#1c1917', path: [[CND_X, CND_Y, -8], [CND_X, CND_Y, topZ + 6]] as Vec3[] }, // gaine annelée noire (ICTA)
  ] : [];
  const climate: Plank[] = n.clim ? [
    // une GRANDE plaque d'aluminium (100 × 100 × t) sous le plafond, collée au Peltier, découpée autour de l'objectif, de la fenêtre des LED et du capteur
    { id: uid(), name: 'Plaque froide alu', w: COLD_W, h: COLD_D, pos: [0, COLD_Y, plateZ] as Vec3, rot: [-TILT_DEG, 0, 0] as Vec3, notches: [], holes: [], group: climGroup, special: 'alu' as const, color: '#cbd5e1' }, // rectangle plein, derrière la caméra, légèrement incliné vers l'arrière (le bord arrière est plus bas) : l'eau coule vers la gouttière
    part('Peltier TEC1-12706', TEC, TEC, TEC_T, ...stackAt(t / 2 + TEC_T / 2), 'peltier', '#f8fafc', [-TILT_DEG, 0, 0]), // collé sur la plaque, incliné comme elle (face froide sur la plaque)
    part('Dissipateur alu', TEC, TEC, 30, ...stackAt(t / 2 + TEC_T + 15), 'heatsink', '#cbd5e1', [-TILT_DEG, 0, 0]), // posé sur la face chaude, dans le compartiment du toit : le haut est ouvert
    part('Pont en H Pololu VNH5019 (froid le jour, chaud la nuit)', 38, 28, 10, DRV[0], DRV[1], topZ + 3 + 5, 'driver', '#b91c1c'),
    part('Cale pont en H gauche', 4, 24, t, DRV[0] - 22, DRV[1], topZ + t / 2, 'block', '#a16207'),
    part('Cale pont en H droite', 4, 24, t, DRV[0] + 22, DRV[1], topZ + t / 2, 'block', '#a16207'),
    part('Cale pont en H avant', 24, 4, t, DRV[0], DRV[1] - 17, topZ + t / 2, 'block', '#a16207'),
    part('Cale pont en H arrière', 24, 4, t, DRV[0], DRV[1] + 17, topZ + t / 2, 'block', '#a16207'),
    // filtre LC (self 100 µH 10 A + condensateur 1000 µF 25 V) entre le pont en H et le Peltier : le PWM devient un courant presque continu, le Peltier rend mieux
    part('Filtre LC Peltier (self 100 µH + condensateur 1000 µF)', 28, 18, 20, FLX, FLY, topZ + 3 + 10, 'block', '#374151'),
    part('Cale filtre avant', 28, 3, t, FLX, FLY - 9 - 1.5, topZ + t / 2, 'block', '#a16207'), // à droite c'est le mur du toit qui le bloque, à gauche la gaine
    part('Cale filtre arrière', 28, 3, t, FLX, FLY + 9 + 1.5, topZ + t / 2, 'block', '#a16207'),
    wire('Fil Peltier + (rouge)', '#dc2626', [[TEC / 2 + 0.5, TEC_Y + 5, bodyH + 2], [TEC / 2 + 0.6, TEC_Y + 5, bodyH + 36], [TEC / 2 + 0.6, TEC_Y + 5, topZ + 8], [40, 30, topZ + 10], [50, 60, topZ + 12], [66, 78, topZ + 14], [FLX - 14, FLY + 4, topZ + 11]] as Vec3[], 2.4), // Peltier → filtre (face gauche), en passant à gauche du pont en H et du fusible
    wire('Fil Peltier − (noir)', '#111827', [[TEC / 2 + 0.5, TEC_Y - 5, bodyH + 2], [TEC / 2 + 0.6, TEC_Y - 5, bodyH + 36], [TEC / 2 + 0.6, TEC_Y - 5, topZ + 8], [44, 26, topZ + 8], [54, 56, topZ + 10], [68, 72, topZ + 12], [FLX - 14, FLY - 4, topZ + 11]] as Vec3[], 2.4),
    wire('Fil filtre → pont en H + (rouge)', '#dc2626', [[FLX - 4, FLY - 9, topZ + 11], [FLX - 6, FLY - 30, topZ + 28], [DRV[0] - 12, DRV[1] + 12, topZ + 22], [DRV[0] - 15.5, DRV[1] + 5, topZ + 11]] as Vec3[], 2.4), // filtre (face avant) → sorties OUTA / OUTB du pont en H, en passant au-dessus du fusible et des fils du rail
    wire('Fil filtre → pont en H − (noir)', '#111827', [[FLX + 4, FLY - 9, topZ + 11], [FLX + 2, FLY - 30, topZ + 30], [DRV[0] - 10, DRV[1] + 2, topZ + 24], [DRV[0] - 15.5, DRV[1] - 5, topZ + 11]] as Vec3[], 2.4),
    wire('Fil rail → pont en H + (rouge)', '#dc2626', [[WGX, FY, topZ + 14], [WGX - 4, 50, topZ + 16], [DRV[0] + 3, DRV[1] + 22, topZ + 12], [DRV[0] + 3, DRV[1] + 14, topZ + 11]] as Vec3[], 3.6), // départ 1 du Wago +
    wire('Fil rail → pont en H − (noir)', '#111827', [[WGX, FY - 14, topZ + 14], [WGX - 8, 44, topZ + 14], [DRV[0] + 13, DRV[1] + 18, topZ + 12], [DRV[0] + 13, DRV[1] + 14, topZ + 11]] as Vec3[], 3.6), // départ 1 du Wago −
    wire('Fil INA du pont en H (bleu, broche 33)', '#2563eb', [[DRV[0] + 2, DRV[1] - 9, topZ + 8], [DRV[0] - 14, DRV[1] - 16, topZ + 21], [20, 6, topZ + 24], [-40, 5, topZ + 24], [...pw(PI_PIN_X0 + 16 * 2.54, PI_PIN_Y - 2.54 + 8), topZ + 24], [...pw(PI_PIN_X0 + 16 * 2.54, PI_PIN_Y - 2.54), piZ + 8], [...pw(PI_PIN_X0 + 16 * 2.54, PI_PIN_Y - 2.54), piZ + 3.5]] as Vec3[]),
    wire('Fil INB du pont en H (vert, broche 35)', '#16a34a', [[DRV[0] + 9, DRV[1] - 9, topZ + 8], [DRV[0] - 10, DRV[1] - 20, topZ + 21], [20, 6, topZ + 26], [-40, 5, topZ + 26], [...pw(PI_PIN_X0 + 17 * 2.54, PI_PIN_Y - 2.54 + 8), topZ + 24], [...pw(PI_PIN_X0 + 17 * 2.54, PI_PIN_Y - 2.54), piZ + 8], [...pw(PI_PIN_X0 + 17 * 2.54, PI_PIN_Y - 2.54), piZ + 3.5]] as Vec3[]),
    wire('Fil PWM du pont en H (violet, broche 12)', '#7c3aed', [[DRV[0], DRV[1] - 9, topZ + 8], [DRV[0] - 10, DRV[1] - 16, topZ + 18], [20, 6, topZ + 20], [-40, 5, topZ + 20], [...pw(PI_PIN_X0 + 5 * 2.54, PI_PIN_Y + 8), topZ + 20], [...pw(PI_PIN_X0 + 5 * 2.54, PI_PIN_Y), piZ + 8], [...pw(PI_PIN_X0 + 5 * 2.54, PI_PIN_Y), piZ + 3.5]] as Vec3[]),
    wire('Fil masse commande (noir)', '#111827', [[DRV[0] + 3, DRV[1] - 9, topZ + 8], [DRV[0] - 6, DRV[1] - 16, topZ + 15], [20, 6, topZ + 17], [-40, 5, topZ + 17], [...pw(PI_PIN_X0 + 6 * 2.54, PI_PIN_Y + 6), topZ + 17], [...pw(PI_PIN_X0 + 6 * 2.54, PI_PIN_Y), piZ + 8], [...pw(PI_PIN_X0 + 6 * 2.54, PI_PIN_Y), piZ + 3.5]] as Vec3[]),
    wire('Fil VDD logique du pont en H (orange, 3,3 V broche 17)', '#f97316', [[DRV[0] - 4, DRV[1] - 9, topZ + 8], [DRV[0] - 8, DRV[1] - 14, topZ + 16], [DRV[0] - 14, DRV[1] - 22, topZ + 22], [20, -2, topZ + 24], [-40, -3, topZ + 24], [...pw(PI_PIN_X0 + 8 * 2.54, PI_PIN_Y - 2.54 + 6), topZ + 14], [...pw(PI_PIN_X0 + 8 * 2.54, PI_PIN_Y - 2.54), piZ + 8], [...pw(PI_PIN_X0 + 8 * 2.54, PI_PIN_Y - 2.54), piZ + 3.5]] as Vec3[]), // alimentation logique du VNH5019 (VDD 2,5–5,5 V) : il manquait
    { id: uid(), name: 'Sonde température dissipateur (DS18B20, face chaude)', w: 5, h: 5, depth: 6, pos: [0, r2(TEC_Y + 8), r2(stackAt(t / 2 + TEC_T + 30)[2] + 3)] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: climGroup, special: 'block' as const, color: '#111827' }, // petit boîtier noir glissé entre deux ailettes, SUR le dissipateur (demande de l'utilisateur)
    ...([['Fil sonde 3,3 V (rouge)', '#dc2626', 0, 0], ['Fil sonde données (bleu, GPIO4 broche 7)', '#2563eb', 3, 1], ['Fil sonde masse (noir, broche 25)', '#111827', 12, 2]] as const).map(([nm, color, pinIdx, k]): Plank => {
      const sx = -2 + k * 2, px = PI_PIN_X0 + pinIdx * 2.54, py = pinIdx % 2 === 0 && pinIdx !== 0 ? PI_PIN_Y : PI_PIN_Y - 2.54, hh = topZ + 30 + k * 2; // broches 1 et 7 : rangée impaire ; broche 25 : rangée paire
      const z0 = stackAt(t / 2 + TEC_T + 30)[2] + 6;
      return wire(nm, color, [[sx, TEC_Y + 11, z0], [sx, TEC_Y + 16, z0 + 6], [sx - 20, TEC_Y + 10, hh], [-20, 30, hh], [...pw(px, py + 6), hh], [...pw(px, py), piZ + 8], [...pw(px, py), piZ + 3.5]] as Vec3[]);
    }),
    { id: uid(), name: 'Capteur température / humidité (BME280, 19 × 18)', w: 19, h: 18, pos: [SENSOR_X, SENSOR_Y, bodyH + 2.2] as Vec3, rot: [180, 0, 0] as Vec3, notches: [], holes: [], group: climGroup, special: 'sensor' as const },
    ...([['Fil 3,3 V (rouge)', '#dc2626', 0, 0], ['Fil SDA (jaune)', '#eab308', 1, 1], ['Fil SCL (vert)', '#16a34a', 2, 2], ['Fil masse (noir)', '#111827', 4, 3]] as const).map(([nm, color, pinIdx, k]): Plank => {
      const sx = SENSOR_X - 3.75 + k * 2.5, px = PI_PIN_X0 + pinIdx * 2.54, hh = topZ + 24 + k * 2;
      return wire(nm, color, [[sx, SENSOR_Y - 7.5, bodyH + 6], [sx, SENSOR_Y - 4, bodyH + 12], [sx, SENSOR_Y - 4, bodyH + roofH - 6], [sx, SENSOR_Y - 4, hh], [...pw(px, PI_PIN_Y - 2.54), hh], [...pw(px, PI_PIN_Y - 2.54), piZ + 3.5]] as Vec3[]);
    }),
  ] : [];
  // système solaire (groupe « Solaire ») : un panneau de 100 W DÉPORTÉ à côté du nichoir, sans piquet en bois (support métallique non dessiné), incliné de 35° et tourné vers l'avant (« le sud »),
  // et un câble qui rejoint le régulateur dans le toit (la batterie, le régulateur et le pont en H sont dans le toit)
  const solGroup = n.solar ? solGroupId : undefined;
  const SX = 700, TILT_P = 35;
  const sp = (name: string, w: number, h: number, depth: number, x: number, y: number, z: number, color: string, rot: Vec3 = [0, 0, 0]): Plank =>
    ({ id: uid(), name, w, h, depth, pos: [x, y, z] as Vec3, rot, notches: [], holes: [], group: solGroup, special: 'block' as const, color });
  // point du panneau incliné : (lx, ly, lz) dans son repère (lz < 0 = derrière) → monde ; la boîte de jonction (120 × 70 × 26) est au dos, en ly = 212,5, lz = −28 (voir `cameraGeometry`)
  const jb = (lx: number, ly: number, lz: number): Vec3 => { const a = (TILT_P * Math.PI) / 180; return [SX + lx, r2(ly * Math.cos(a) - lz * Math.sin(a)), r2(195 + ly * Math.sin(a) + lz * Math.cos(a))]; };
  const solar: Plank[] = n.solar ? [
    { ...sp('Panneau solaire 100 W (97 × 58,5)', 970, 585, 30, SX, 0, 195, '#1e3a8a', [TILT_P, 0, 0]), special: 'solar' as const }, // posé sur un support métallique (pas dessiné : aucun piquet en bois), bord bas près du sol
    { id: uid(), name: 'Câble 12 V vers le toit', w: 7, h: 7, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: solGroup, special: 'wire' as const, color: '#111827',
      path: [jb(30, 177.5, -28), [SX + 38, 170, 235], [SX + 55, 120, 140], [SX + 60, 70, 60], [SX + 60, 40, 15], [300, 40, 6], [W / 2 + 95, RGY + 10, 4], [W / 2 + 55, RGY - 10, -14], [W / 2 + 30, RGY, -40], [W / 2 + 7, RGY, -52], [W / 2 - 8, RGY, -40], [RGX + 30.5, RGY, RGZ]] as Vec3[] },
  ] : [];
  // habillage (groupe spécial « Habillage ») : un pourtour en lambris de 10 mm d'épaisseur qui descend de 10 mm sous le nichoir, et un toit en chêne qui déborde

  // un lambris = un prisme : contour en plan (rectangle ou trapèze à 45° aux coins), du bas jusqu'à un plan incliné (haut en diagonale sur les côtés)
  const prism = (name: string, plan: [number, number][], zBottom: number, A: number, Bx: number, By: number): Plank => {
    const cx = plan.reduce((s, p) => s + p[0], 0) / plan.length, cy = plan.reduce((s, p) => s + p[1], 0) / plan.length;
    const zMax = Math.max(...plan.map(([x, y]) => A + Bx * x + By * y)), zc = (zBottom + zMax) / 2;
    const xs = plan.map((p) => p[0]), ys = plan.map((p) => p[1]);
    return { id: uid(), name, w: r2(Math.max(...xs) - Math.min(...xs)), h: r2(Math.max(...ys) - Math.min(...ys)), depth: r2(zMax - zBottom), pos: [r2(cx), r2(cy), r2(zc)] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: lamGroup, special: 'block' as const, color: '#f5f5f4',
      poly: plan.map(([x, y]) => [r2(x - cx), r2(y - cy)] as [number, number]), top: { z0: r2(A + Bx * cx + By * cy - zc), bx: Bx, by: By } };
  };
  const lambris: Plank[] = n.lambris ? (() => {
    const xe = W / 2, ye = D / 2, k = Math.max(1, Math.round((W + 2 * LAM_T) / LAM_W)), kd = Math.max(1, Math.round(D / LAM_W)), sx = (2 * xe + 2 * LAM_T) / k, sy = (2 * ye) / kd; // façade et arrière : W + 2·LAM_T (elles recouvrent les bouts des côtés) ; côtés : D ; une largeur fixe par face
    const fx0 = -(xe + LAM_T), bx0l = -(xe + LAM_T), ry0 = -ye, ly0 = -ye; // début des lames : façade et arrière de −(xe + LAM_T) à xe + LAM_T, côtés de −ye à ye
    const out: Plank[] = [];
    // les lames MONTENT JUSQU'AU TOIT : à plat sur la façade (hauteur Hf du toit) et l'arrière (Hb), en DIAGONALE sur les côtés (elles suivent le haut des côtés du toit) ;
    // les COINS sont à JOINT PLAT : la façade et l'arrière recouvrent les bouts des lames des côtés (demande de l'utilisateur) ; même largeur sur la façade et l'arrière, une autre largeur sur les côtés
    const frontTop = n.pente ? bodyH + Hf : roofTop, backTop = n.pente ? bodyH + Hb : roofTop;
    const slope = n.pente ? (Hb - Hf) / (2 * ye) : 0, sideA = n.pente ? bodyH + Hf + ye * slope : roofTop; // z = sideA + slope · y sur les côtés
    for (let i = 0; i < kd; i++) { // côtés gauche et droit : lames le long de y
      const ry0i = ry0 + i * sy, ry1i = ry0 + (i + 1) * sy, ly0i = ly0 + i * sy, ly1i = ly0 + (i + 1) * sy; // côtés : de −ye à ye, entre la façade et l'arrière
      const y0 = ry0i, y1 = ry1i, y0o = ry0i, y1o = ry1i;
      if (false && n.solar && n.pente && y0 < GL_Y && GL_Y < y1) { // la lame du côté droit que traverse le câble du panneau est percée d'une fenêtre (14 de large, 16 de haut)
        const wa = GL_Y - 7, wb = GL_Y + 7, za = topZ + 6, zb2 = topZ + 22;
        const piece = (nm: string, ya: number, yb: number, zBot: number, A: number, By: number, oa = ya, ob = yb) => out.push(prism(nm, [[xe, ya], [xe + LAM_T, oa], [xe + LAM_T, ob], [xe, yb]], zBot, A, 0, By));
        piece(`Lambris droite ${i + 1}.a`, y0, wa, -LAM_DOWN, sideA, slope, y0o, wa);
        piece(`Lambris droite ${i + 1}.b`, wb, y1, -LAM_DOWN, sideA, slope, wb, y1o);
        piece(`Lambris droite ${i + 1}.c`, wa, wb, -LAM_DOWN, za, 0);
        piece(`Lambris droite ${i + 1}.d`, wa, wb, zb2, sideA, slope);
      } else out.push(prism(`Lambris droite ${i + 1}`, [[xe, y0], [xe + LAM_T, y0o], [xe + LAM_T, y1o], [xe, y1]], -LAM_DOWN, sideA, 0, slope));
      out.push(prism(`Lambris gauche ${i + 1}`, [[-xe - LAM_T, ly0i], [-xe, ly0i], [-xe, ly1i], [-xe - LAM_T, ly1i]], -LAM_DOWN, sideA, 0, slope));
    }
    const windows: [number, number, number, number][] = n.pente ? [...VENT_XS.map((vx): [number, number, number, number] => [vx - (VENT_W + 8) / 2, bodyH + VENT_Z - (VENT_H + 8) / 2, vx + (VENT_W + 8) / 2, bodyH + VENT_Z + (VENT_H + 8) / 2]), ...(n.cam > 0 ? [[PORT_X0 - 4, bodyH + PORT_Z0 - 4, PORT_X1 + 4, bodyH + PORT_Z1 + 4] as [number, number, number, number]] : [])] : []; // fenêtres des grilles d'aération (à l'arrière)
    const frontWindows: [number, number, number, number][] = n.cam2 && n.pente ? [[cam2X - 10 - 16, bodyH + roofH + 28 - 6, cam2X - 10 + 16, bodyH + roofH + 28 + 6]] : []; // fenêtre 24 × 12 dans l'habillage avant, en face de la fente de la nappe de la caméra 2 (20 × 4)
    // les fenêtres sont AIMANTÉES aux joints entre lames et entre elles (à moins de 6 mm) : sinon il restait des lamelles de 2 ou 3 mm entre une fenêtre et un joint, ou entre deux fenêtres
    const jointsF = Array.from({ length: k - 1 }, (_, i) => fx0 + (i + 1) * sx), jointsB = Array.from({ length: k - 1 }, (_, i) => bx0l + (i + 1) * sx);
    const snapWins = (ws: [number, number, number, number][], joints: number[]) => {
      for (const w of ws) for (const j of joints) { if (Math.abs(w[0] - j) < 10) w[0] = j; if (Math.abs(w[2] - j) < 10) w[2] = j; }
      for (const a of ws) for (const b of ws) { if (a !== b && Math.abs(a[2] - b[0]) < 10) b[0] = a[2]; }
    };
    snapWins(windows, jointsB); snapWins(frontWindows, jointsF);
    for (const x of RIB_XS) windows.push([x - RIB_T / 2 - 0.25, RIB_Z0 - 1, x + RIB_T / 2 + 0.25, RIB_Z1 + 1]); // les nervures de fixation traversent les lames arrière par une fente de 3,5 (ajoutées APRÈS l'aimantation : une fente de 3,5 ne doit pas être élargie jusqu'au joint)
    // façade et arrière : CHAQUE LAME EST UNE SEULE PLANCHE de largeur fixe (sx), percée de ses fenêtres (trous rectangulaires) ; une fenêtre qui mord sur le bord d'une lame
    // devient une encoche de ce bord ; seule une fenêtre qui traverse TOUTE la largeur d'une lame (la grande aération) la coupe en deux planches (dessous / dessus)
    type R = [number, number, number, number];
    const lame = (name: string, xa: number, xb: number, yFace: number, zBot: number, zTop: number, wins: R[], round: { x: number; z: number; d: number } | null) => {
      const E = 0.01;
      const clipped: R[] = wins.map(([wa, za, wb, zb]): R => [Math.max(wa, xa), Math.max(za, zBot), Math.min(wb, xb), Math.min(zb, zTop)]).filter(([wa, za, wb, zb]) => wb - wa > E && zb - za > E);
      const full = clipped.filter(([wa, , wb]) => wa <= xa + E && wb >= xb - E).sort((p, q) => p[1] - q[1]); // traversent toute la lame : la coupent en morceaux selon z
      const zs: [number, number][] = []; let z = zBot;
      for (const [, za, , zb] of full) { if (za - z > 1) zs.push([z, za]); z = Math.max(z, zb); }
      if (zTop - z > 1) zs.push([z, zTop]);
      zs.forEach(([z0, z1], kk) => {
        const here = clipped.filter(([wa, za, wb, zb]) => !(wa <= xa + E && wb >= xb - E) && zb > z0 + E && za < z1 - E).map(([wa, za, wb, zb]): R => [wa, Math.max(za, z0 + 1), wb, Math.min(zb, z1 - 1)]);
        const left = here.filter(([wa]) => wa <= xa + E).sort((p, q) => p[1] - q[1]), right = here.filter(([, , wb]) => wb >= xb - E).sort((p, q) => p[1] - q[1]);
        const inner = here.filter(([wa, , wb]) => wa > xa + E && wb < xb - E);
        const cx = (xa + xb) / 2, cz = (z0 + z1) / 2;
        const poly: [number, number][] = [[xa, z0], [xb, z0]];
        for (const [wa, za, , zb] of right) poly.push([xb, za], [wa, za], [wa, zb], [xb, zb]);
        poly.push([xb, z1], [xa, z1]);
        for (const [, za, wb, zb] of [...left].reverse()) poly.push([xa, zb], [wb, zb], [wb, za], [xa, za]);
        const holes: Hole[] = inner.map(([wa, za, wb, zb]) => ({ id: uid(), shape: 'square' as const, x: r2((wa + wb) / 2 - cx), y: r2((za + zb) / 2 - cz), size: r2(wb - wa), sh: r2(zb - za) }));
        if (round && round.z > z0 && round.z < z1) holes.push({ id: uid(), shape: 'round' as const, x: r2(round.x - cx), y: r2(round.z - cz), size: round.d });
        out.push({ id: uid(), name: `${name}${zs.length > 1 ? '.' + (kk + 1) : ''}`, w: r2(xb - xa), h: r2(z1 - z0), depth: LAM_T, pos: [r2(cx), yFace, r2(cz)] as Vec3, rot: rotFromBasis([1, 0, 0], [0, 0, 1]), notches: [], holes, group: lamGroup, special: 'block' as const, color: '#f5f5f4',
          poly: poly.map(([x, y]) => [r2(x - cx), r2(y - cz)] as [number, number]) });
      });
    };
    for (let i = 0; i < k; i++) {
      const x0 = fx0 + i * sx, x1 = fx0 + (i + 1) * sx, centre = x0 < 0 && x1 > 0; // façade : la lame qui porte le centre de l'entrée est percée du trou d'envol
      const bx0i = bx0l + i * sx, bx1i = bx0l + (i + 1) * sx; // arrière : décalé d'une épaisseur (recouvre le coin droit)
      lame(`Lambris avant ${i + 1}${centre ? ' (percé)' : ''}`, x0, x1, -ye - LAM_T / 2, -LAM_DOWN, frontTop, frontWindows, centre ? { x: 0, z: holeZ, d: n.hole } : null);
      lame(`Lambris arrière ${i + 1}`, bx0i, bx1i, ye + LAM_T / 2, -LAM_DOWN, backTop, windows, null);
    }
    // toit en chêne : un pan de 18 mm posé sur la diagonale des côtés du toit ; il déborde de 60 mm devant (abri de l'entrée) et de 30 mm seulement sur les côtés et derrière
    if (n.pente) {
      const OVF = 60, OVS = 30, OVB = 30, thick = 18, ang = Math.atan2(Hb - Hf, D);
      const yMid = (OVB - OVF) / 2; // centre du pan en plan : décalé vers l'avant
      const zl = (y: number) => bodyH + Hf + ((y + D / 2) * (Hb - Hf)) / D; // dessous du pan à l'ordonnée y
      out.push({ id: uid(), name: 'Toit en chêne', w: r2(W + 2 * OVS), h: r2((D + OVF + OVB) / Math.cos(ang)), depth: thick, pos: [0, r2(yMid - Math.sin(ang) * thick / 2), r2(zl(yMid) + Math.cos(ang) * thick / 2)] as Vec3, rot: [r2((ang * 180) / Math.PI), 0, 0] as Vec3, notches: [], holes: [], group: lamGroup, special: 'block' as const, color: '#c4a574' });
    }
    return out;
  })() : [];
  const pitched: Plank[] = []; // (les joues séparées sont supprimées : ce sont les plaques du toit elles-mêmes qui montent)
  // planche de chêne de 18 mm sur le toit, qui déborde de 15 mm : découpée en pavés autour de l'ouverture du compartiment et de la fente des fils du capteur
  const OV_OAK = 15;
  const carve = (r: [number, number, number, number], holes: [number, number, number, number][]): [number, number, number, number][] => {
    const xs = [...new Set([r[0], r[2], ...holes.flatMap((h) => [h[0], h[2]]).filter((x) => x > r[0] && x < r[2])])].sort((p, q) => p - q), out: [number, number, number, number][] = [];
    for (let i = 0; i + 1 < xs.length; i++) {
      const xa = xs[i], xb = xs[i + 1];
      const cut = holes.filter((h) => h[0] <= xa + 1e-6 && h[2] >= xb - 1e-6).map((h) => [Math.max(h[1], r[1]), Math.min(h[3], r[3])] as [number, number]).sort((p, q) => p[0] - q[0]);
      let y = r[1];
      for (const [c0, c1] of cut) { if (c0 > y + 0.01) out.push([xa, y, xb, c0]); y = Math.max(y, c1); }
      if (r[3] > y + 0.01) out.push([xa, y, xb, r[3]]);
    }
    return out;
  };
  const oakHoles: [number, number, number, number][] = [];
  if (BIGC) oakHoles.push([bx0, by0, bx1, by1]); else if (n.cam > 0) oakHoles.push([-n.cam / 2, -n.cam / 2, n.cam / 2, n.cam / 2]);
  if (n.clim && !BIGC) oakHoles.push([SENSOR_X + 0.25 - 6, SENSOR_Y + 8 - 3, SENSOR_X + 0.25 + 6, SENSOR_Y + 8 + 3]);
  const oak: Plank[] = n.chene
    ? carve([-(W / 2 + OV_OAK), -(D / 2 + OV_OAK), W / 2 + OV_OAK, D / 2 + OV_OAK], oakHoles).map(([x0, y0, x1, y1], k): Plank => (
      { id: uid(), name: `Planche chêne ${k + 1}`, w: r2(x1 - x0), h: r2(y1 - y0), depth: OAK, pos: [r2((x0 + x1) / 2), r2((y0 + y1) / 2), r2(roofTop + OAK / 2)] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: roofGroup, special: 'block' as const, color: '#c4a574' }))
    : [];
  // évacuation : la gouttière est une lamelle de contreplaqué de 3 mm × 5 de large, collée contre le mur, en diagonale (10°), qui reste EN HAUT contre le mur arrière sous la plaque froide :
  // les gouttes y glissent vers le coin arrière droit puis ruissellent dans le coin jusqu'au trou, tout en bas, percé vers le bas à travers le fond (pile de carrés percés d'un trou de paille)
  const drainGroup = n.clim ? drainGroupId : undefined;
  const SLOPE = 10, gx0 = -55, gx1 = 55, gAng = (SLOPE * Math.PI) / 180, gLen = (gx1 - gx0) / Math.cos(gAng);
  const gTop = bodyH - 9 - (gx1 - gx0) * Math.tan(gAng) / 2 - 3; // centre de la barre
  const drain: Plank[] = n.clim ? [
    { id: uid(), name: 'Gouttière (contreplaqué 3 mm)', w: r2(gLen), h: 5, pos: [0, n.L / 2 - t / 2, r2(gTop)] as Vec3, rot: rotFromBasis([Math.cos(gAng), 0, -Math.sin(gAng)], [Math.sin(gAng), 0, Math.cos(gAng)]), notches: [], holes: [], group }, // une lamelle de contreplaqué de 3 mm, large de 5, collée à plat contre la face intérieure du mur arrière, en diagonale
    ...(n.solar ? Array.from({ length: 12 }, (_, i): Plank => ({ id: uid(), name: `Évacuation bas ${i + 1}`, w: DRAIN_S, h: DRAIN_S, pos: [drX, drY, r2(-t / 2 - i * t)] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [{ id: uid(), shape: 'round' as const, x: 0, y: 0, size: DRAIN_HOLE }], group: drainGroup })) : []), // le tuyau descend sous le nichoir, plus bas que le régulateur (36 mm)
    ...Array.from({ length: Math.ceil(e + t) / t | 0 }, (_, i): Plank => ({ id: uid(), name: `Évacuation ${i + 1}`, w: DRAIN_S, h: DRAIN_S, pos: [drX, drY, r2(t / 2 + i * t)] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [{ id: uid(), shape: 'round' as const, x: 0, y: 0, size: DRAIN_HOLE }], group: drainGroup })),
  ] : [];
  const planks = [
    ...drain,
    ...oak,
    ...lambris, ...pitched,
    ...solar, ...brackets, ...mounts, ...keys,
    ...camBox, ...cable2, ...wires2, ...ledSwitch,
    ...power, ...solarElec,
    ...climate,
    ...insulation,
    ...entry,
    ...slotted.map((p) => ({ ...p, group, name: p.name.replace(/ (\d+)$/, ' ext $1') })),
    { ...(n.clim ? drainSquare(floorSlotted) : floorSlotted), group },
    ...innerParts.map((p) => ({ ...p, name: p.name.replace(/ (\d+)$/, ' int $1') })),
    ...roofParts, ...frames, ...bars, ...camParts, ...tecParts, ...camera, ...pi, ...cable, ...wires,
    { id: uid(), name: 'Schéma électronique', w: 1, h: 1, pos: [0, 0, -30] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: docGroupId, special: 'doc' as const }, // document (pas une pièce physique) : un clic dans « Pièces » l'ouvre
  ];
  if (n.solar) { // la gaine traverse le fond, le plancher intérieur, le cadre du toit et le plancher / dessus du toit, dans l'isolant du côté droit
    for (const p of planks) if (/^(Dessous ext|Plancher int|Cadre toit (bas|milieu|haut)|Dessous toit|Dessus toit)/.test(p.name)) p.holes = [...p.holes, fitHole(p, { id: uid(), shape: 'round' as const, x: r2(CND_X - p.pos[0]), y: r2(CND_Y - p.pos[1]), size: CND_D })]; // pile le diamètre de la gaine, serrée (plus de jeu : elle nageait)
  }
  if (n.cam > 0) { // fentes du plancher du toit pour les dents du bas des murs du compartiment
    const tmp: PlankScene = { t, fit, planks: planks.map((p) => (/ (compartiment|caméra) \d+$/.test(p.name) && !p.special ? { ...p, group: '__compartiment' } : p)) };
    const floor = tmp.planks.find((p) => /^Dessous toit/.test(p.name));
    if (floor) { const r = slotsForTeeth(tmp, floor.id); const q = r.scene.planks.find((p) => p.id === floor.id); const f = planks.find((p) => p.id === floor.id); if (q && f) f.holes = q.holes; }
  }
  // UN SEUL groupe « Toit » : le toit, l'électronique (Pi, caméra, nappe, fils) et la climatisation (Peltier, dissipateur, module, capteur) bougent ensemble
  const merged = new Set([climGroupId, solGroupId]);
  const LINKS: [RegExp, string][] = [ // fiches de référence (constructeur ou revendeur)
    [/^Raspberry Pi/, 'https://www.raspberrypi.com/products/raspberry-pi-5/'],
    [/^Caméra( 2)?$/, 'https://www.raspberrypi.com/products/camera-module-3/'],
    [/^Peltier/, 'https://www.radiolocman.com/datasheet/pdf.html?di=173597'],
    [/^Pont en H/, 'https://www.pololu.com/product/1451'],
    [/^Wago/, 'https://www.wago.com/fr/bornes-de-connexion-pour-conducteurs/221-413'],
    [/^Batterie/, 'https://robu.in/?p=2024523'],
    [/^Régulateur/, 'https://azcus.digikey.com/en/products/detail/genasun/GV-10-Li-14-2V-OEM/24614948'],
    [/^Capteur/, 'https://cdn.sparkfun.com/assets/5/3/0/f/7/BME280_Datasheet.pdf'],
    [/^Panneau solaire/, 'https://www.wattuneed.com/fr/panneaux-solaires/8120-panneau-solaire-12v-100wc-monocristallin-0712971138629.html'],
  ];
  const underRoof = (pt: Vec3): Vec3 => (n.pente && Math.abs(pt[0]) < W / 2 - t && Math.abs(pt[1]) < D / 2 - t ? [pt[0], pt[1], r2(Math.min(pt[2], bodyH + Hf + ((pt[1] + D / 2) * (Hb - Hf)) / D - 2))] : pt); // fils et nappes restent sous la pente du toit
  const unnumber = (nm: string) => (start === 1 ? nm.replace(/^((?:Face avant|Face arrière|Côté droit|Côté gauche|Dessus|Dessous)(?: (?:ext|int|toit|compartiment))?|Grille anti-insectes) 1$/, "$1") : nm); // un seul nichoir : plus de « 1 » derrière les plaques des boîtes (les numéros des séries — lambris, cales, isolant… — restent)
  const finalPlanks = planks.map((p) => { let q = p.group && merged.has(p.group) ? { ...p, group: elecGroup, name: unnumber(p.name) } : { ...p, name: unnumber(p.name) }; if (q.path && q.special !== 'solar' && q.name !== 'Câble 12 V vers le toit') q = { ...q, path: q.path.map(underRoof) }; const l = LINKS.find(([re]) => re.test(q.name)); return l ? { ...q, url: l[1] } : q; });
  return { planks: finalPlanks, group, name: 'Corps', groupNames: { [group]: 'Corps', [roofGroup]: 'Toit', [elecGroup]: 'Électronique', [docGroupId]: 'Schéma électronique', [entryGroup]: 'Entrée', [isoGroup]: 'Isolant', ...(n.clim ? { [drainGroupId]: 'Évacuation' } : {}), ...(n.lambris ? { [lamGroup]: 'Habillage' } : {}) } }; // un seul nichoir : groupes sans numéro, le corps s'appelle « Corps »
}
