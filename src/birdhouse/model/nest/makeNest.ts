import { type Vec3, type Pt, type Edge, type Notch, type Hole, type Plank, type PlankScene, type NestParams } from '../types';
import { r2, uid } from '../util';
import { SENSOR_CHIP_DX, SENSOR_X, LENS_HOLE, CAM_W, IR_W, CAM_X, PI_CSI2, PI_W, PI_CSI, PI_PIN_Y, PI_PIN_X0, CAM_Y, SENSOR_Y, CAM_H, IR_H, IR_X, OKOUME_T, OKOUME_COLOR, OKOUME_NATURAL, PI_H, FAN, FAN_T, FAN_OPEN, FAN_PLOT, STRIP } from '../constants';
import { fitHole, rectUnion } from '../geometry/holes';
import { teethFor, recastAll } from '../geometry/castellation';
import { outline } from '../geometry/outline';
import { rotFromBasis, transformPlanks } from '../geometry/transform';
import { slotsForTeeth } from '../geometry/face';
import { makeBox } from './box';
import { CAMERA_NAMES } from './cameras';
import { summerLayout, PLUG_HANDLE, SPARE_GAP } from './winter';
import { thinSpares } from './spares';
import { fromAxisAngle, multiply, invert, rotate } from '../math/rotation';

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

/** Pièces de la ventilation (noms avant `unnumber`) : regroupées dans le groupe « Ventilation ». */
/** Baguettes qui portent le dessus du toit : largeur du corps (appui) en mm ; la plaque a en plus les dents de t. */
const BAG_BODY = 5;

const VENT_PIECES = /^(Goulotte ventilateur|Conduit de sortie|Cassette ventilateur|Poignée cassette|Plot caoutchouc ventilateur|Ventilateur Noctua|Grille de protection ventilateur|Prise 4 broches du ventilateur|Rallonge ventilateur 4 broches|Module interrupteur 12 V ventilateur|Fil (PWM|tachymètre|commande interrupteur|masse commune|interrupteur →|Wago \+ → interrupteur|masse interrupteur|ventilateur)|Conduit d'air)/;

export function makeNest(n0: NestParams, t: number, fit: number, start: number): { planks: Plank[]; group: string; name: string; groupNames: Record<string, string> } {
  const n: NestParams = { ...n0, l: Math.max(120, n0.l), L: Math.max(120, n0.l), hole: Math.min(n0.hole, Math.max(120, n0.l) - 26), cam: 38, ins: 39, pente: true, lambris: true, solar: true }; // toit TOUJOURS en pente, habillage TOUJOURS présent, système solaire TOUJOURS présent (puce retirée : réglage ancien ignoré en silence) (puces retirées : le régulateur sous le nichoir est protégé par l'habillage) ; // intérieur TOUJOURS CARRÉ (un seul curseur), 120 mm au minimum (le fond) ; trou plafonné pour que le bloc d'entrée (trou + 16) tienne dans la paroi intérieure ; compartiment caméra fixe à 38 (curseur retiré) ; // isolant TOUJOURS 39 (le curseur a été retiré à la demande de l'utilisateur) ; compartiment caméra plafonné à 38 // le compartiment caméra est limité à 38 : la batterie (et sa cale) est posée juste à côté, sur le dessus du toit
  const isoGroup = uid(); // cinquième groupe : l'isolant (pavés orange)
  const solGroupId = uid(); // groupe « Solaire » : le panneau déporté, ses poteaux et son câble
  const docGroupId = uid(); // groupe « Schéma électronique » : le document, avec son œil
  const lamGroup = uid(); // groupe « Lambris »
  const coverGroup = uid(); // groupe « Couvercle » : le pan en okoumé 5 mm et les quatre baguettes crénelées de contreplaqué 3 mm collées dessous
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
  const outerParts = outerBox.planks.filter((p) => !/^Dessus/.test(p.name)).map((p) => { let q = isWall(p) ? noTop(p) : p; if (n.solar && /^Dessous/.test(p.name)) q = { ...q, holes: [...q.holes, ...U_YS.flatMap((y) => [RGX - U_W / 2 + U_ARM / 2, RGX + U_W / 2 - U_ARM / 2].map((x) => fitHole(q, { id: uid(), shape: 'square' as const, x: r2(x), y: r2(y), size: U_ARM, sh: t })))] };/* fentes des tenons des étriers du régulateur */ if (/^Face arrière/.test(p.name)) q = { ...q, holes: [...q.holes, ...RIB_XS.flatMap((x) => RIB_TEETH_Z.slice(0, 2).map(([za, zb]) => fitHole(q, { id: uid(), shape: 'square' as const, x, y: r2((za + zb) / 2 - q.pos[2]), size: RIB_T + 0.5, sh: zb - za })))] }; /* fentes 9,5 × 32 des deux dents basses des nervures de fixation */ return /^Face avant/.test(p.name) ? hole(q) : q; });
  const AIR_CY = r2(-n.L / 2 + 25), AIR_ZS = Math.round((e + t + bodyH) / 2), AIR_SH = 30, AIR_SW = 34; // centre en y, hauteur de la fente (mi-hauteur du nid), taille de la fente
  const DRAIN_Z = e + t, DRAIN_H = 6; // évacuation de l'eau : ouverture rectangulaire (AIR_SW de large, DRAIN_H de haut), dont le bas est au dessus du plancher intérieur, dans « Côté gauche int » et « Conduit d'air 2 » : l'eau coule du plancher dans le conduit, ouvert en bas
  // évacuation de l'eau dans le mur intérieur gauche : une ENCOCHE dans son bord bas, centrée près du conduit d'air, jusqu'à DRAIN_H au-dessus du plancher (bas à fleur du plancher : pas de seuil) ;
  // elle va de DRAIN_LO à DRAIN_HI (depuis la position du conduit sur le bord) et couvre le trou de « Conduit d'air 2 » (DRAIN_HOLE) ; elle absorbe les crans du bord bas qu'elle recouvre (ces dents ne sont plus percées dans le plancher),
  // mais JAMAIS un cran qui touche un coin de la plaque ; les deux moignons de dent de 3 mm (« 3 mm d'espace ») qui restaient de chaque côté sont supprimés à la demande de l'utilisateur (« les deux mini encoches… vire-les, et les trous équivalents de la plaque ») : les crans voisins [0 ; 17] et [53 ; 70] touchent l'encoche, le bois reste plein et le plancher n'a plus leurs fentes
  const DRAIN_LO = -14, DRAIN_HI = 14, DRAIN_HOLE: [number, number] = [-13, 13], DRAIN_KEEP = 3; // encoche et trou du conduit centrés sur le même axe que la fente d'aération (AIR_CY) : encoche de 28 mm, trou de 26 mm
  const drain = (q: Plank): Plank => {
    const c = r2(AIR_CY - q.pos[1] + q.w / 2); let s0 = c + DRAIN_LO, s1 = c + DRAIN_HI, rest = q.notches.filter((x) => x.edge === 'bottom');
    for (let again = true; again;) {
      again = false;
      for (const x of rest) {
        const x0 = x.pos - x.width / 2, x1 = x.pos + x.width / 2;
        if (x0 < s1 && x1 > s0) { // recouvre l'encoche
          if (x0 <= 0.01) { s0 = Math.max(s0, x1 + DRAIN_KEEP); again = true; break; } // cran de coin : on le garde, on recule l'encoche
          if (x1 >= q.w - 0.01) { s1 = Math.min(s1, x0 - DRAIN_KEEP); again = true; break; }
          s0 = Math.min(s0, x0); s1 = Math.max(s1, x1); rest = rest.filter((y) => y !== x); again = true; break;
        }
        if (x1 <= s0 && s0 - x1 > 0.01 && s0 - x1 < DRAIN_KEEP - 1e-6) { s0 = x1 + DRAIN_KEEP; again = true; break; } // moignon de dent trop étroit
        if (x0 >= s1 && x0 - s1 > 0.01 && x0 - s1 < DRAIN_KEEP - 1e-6) { s1 = x0 - DRAIN_KEEP; again = true; break; }
      }
    }
    // plus de moignon de dent : un cran voisin qui s'arrête à DRAIN_KEEP au plus de l'encoche est prolongé jusqu'à elle (le bois reste plein entre le coin ou le cran suivant et l'encoche ; ces dents n'existent plus, le plancher n'a pas leurs fentes)
    rest = rest.map((x) => { const x0 = x.pos - x.width / 2, x1 = x.pos + x.width / 2; if (x1 <= s0 + 0.01 && s0 - x1 <= DRAIN_KEEP + 0.01) return { ...x, pos: r2((x0 + s0) / 2), width: r2(s0 - x0) }; if (x0 >= s1 - 0.01 && x0 - s1 <= DRAIN_KEEP + 0.01) return { ...x, pos: r2((s1 + x1) / 2), width: r2(x1 - s1) }; return x; });
    return { ...q, notches: [...q.notches.filter((x) => x.edge !== 'bottom'), ...rest, { id: uid(), edge: 'bottom' as const, pos: r2((s0 + s1) / 2), width: r2(s1 - s0), depth: r2(t + DRAIN_H) }] };
  };
  const innerParts = innerBox.planks.filter(isWall).map((p) => { let q = noTop({ ...p, pos: [p.pos[0], p.pos[1], p.pos[2] + e] as Vec3, group }); return /^Face avant/.test(p.name) ? hole(q) : /^Côté gauche/.test(p.name) ? drain(q) : q; });
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
  // deuxième caméra, DEHORS : NUE (caméra + carte de 4 LED infrarouges, sans boîte), accrochée sous le débord du toit en okoumé, à l'avant gauche ; inclinée vers le bas et tournée
  // pour que son objectif regarde le trou d'entrée ; la caméra est debout, connecteur en haut
  const lamT = n.lambris ? OKOUME_T : 0;
  const CAM2_HALF = 18; // demi-hauteur de l'ensemble (caméra + nappe) sous le pan
  const cam2Cz = (n.pente ? bodyH + Hf + ((cam2Y + D / 2) * (Hb - Hf)) / D : bodyH + roofH) - CAM2_HALF - 4; // juste sous le dessous du pan
  const cam2Target: Vec3 = [0, -D / 2 - lamT, holeZ];
  const cdx = cam2Target[0] - cam2X, cdy = cam2Target[1] - cam2Y, chor = Math.hypot(cdx, cdy);
  const cam2Yaw = Math.atan2(cdx, -cdy), cam2Pitch = Math.atan2(cam2Cz - cam2Target[2], chor); // la face avant (−y) est tournée vers le trou puis baissée
  const cam2Q = multiply(fromAxisAngle([0, 0, 1], cam2Yaw), fromAxisAngle([1, 0, 0], cam2Pitch));
  const irOff = rotate([-20, -3, 0], invert(cam2Q)); // décalage (monde) des LED extérieures par rapport à la caméra 2 : 20 mm à sa gauche, exprimé dans le repère de la caméra
  const cam2Pt = (lx: number, ly: number, lz: number): Vec3 => { const v = rotate([lx, ly, lz], cam2Q); return [r2(cam2X + v[0]), r2(cam2Y + v[1]), r2(cam2Cz + v[2])]; }; // repère de la caméra, centré
  const cam2SX = r2(cam2X - 10); // abscisse de la nappe et des deux fils des LED extérieures de la caméra 2, au milieu de leur fente (28 mm) dans le pan du toit, au-dessus de la caméra
  // PAN DU TOIT (« Toit en okoumé ») : géométrie partagée par le pan, ses baguettes, ses fentes et le trajet de la nappe / des fils de la caméra 2. `s` = abscisse le long de la pente depuis le milieu du pan (sens +s = vers l'arrière), `h` = hauteur au-dessus de son dessous (le pan occupe 0 à OKOUME_T).
  const PAN_OVF = 60, PAN_OVS = 30, PAN_OVB = 30, PAN_ANG = Math.atan2(Hb - Hf, D), PAN_SIN = Math.sin(PAN_ANG), PAN_COS = Math.cos(PAN_ANG), PAN_YMID = (PAN_OVB - PAN_OVF) / 2; // débord devant 60 mm, 30 mm sur les côtés et derrière
  const panZl = (y: number): number => bodyH + Hf + ((y + D / 2) * (Hb - Hf)) / D; // dessous du pan à l'ordonnée y
  const panPt = (x: number, s: number, h: number): Vec3 => [r2(x), r2(PAN_YMID + s * PAN_COS - h * PAN_SIN), r2(panZl(PAN_YMID) + s * PAN_SIN + h * PAN_COS)];
  const PAN_S0 = (-D / 2 + t - PAN_YMID) / PAN_COS; // face intérieure de la plaque avant du toit, mesurée le long de la pente
  // UN CANAL oblong dans la plaque crénelée du pan (la plaque pleine collée dessus le ferme : conduit étanche DANS le toit) pour la nappe de la caméra 2 et les deux fils des LED extérieures : il part de l'à-plomb de la caméra (A, dans le débord avant gauche) et finit dans l'ouverture du caisson, juste derrière la plaque avant (B) ; ouvert vers le bas aux deux bouts
  const camCon = cam2Pt(0, -2, CAM_H / 2), PAN_SA = r2((camCon[1] - PAN_YMID) / PAN_COS), PAN_SB = r2(PAN_S0 + t + 6), CHAN_W = 28, CHAN_END = 5;
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
  const PORT_X0 = piX - 30, PORT_X1 = piX + 30, PORT_Z0 = roofH + 3, PORT_Z1 = roofH + 27, VENT_L = r2(CND_X - CND_D / 2 - 4), VENT_R = W / 2 - 20; // l'aération démarre 26 mm à droite de la fenêtre des prises du Pi (20 de bois entre les deux : la lame d'habillage y est plus large)
  const VENT_GAP = t + 4.5; // 7,5 : entre le haut de la fenêtre et le haut de la paroi de la cassette (le conduit a des dents sur ses quatre plaques : fente de t au-dessus de la fenêtre + 4,5 mm de bois avant les crans du couvercle (t))
  const VENT_XS: number[] = [], VENT_W = VENT_R - VENT_L, VENT_Z0 = roofH + 4, VENT_H = Hb - 22 - VENT_Z0 - VENT_GAP, VENT_Z = VENT_Z0 + VENT_H / 2; // la fenêtre de sortie s'arrête VENT_GAP sous le haut de la cassette (les dents du couvercle ne doivent pas être coupées)
  const GL_Y = 84; // le câble du panneau entre dans le toit par le côté droit, à cette ordonnée, 14 mm au-dessus du dessus du toit
  const tallRoof = (p: Plank): Plank => {
    if (!n.pente) return p;
    const base = p.notches.filter((x) => x.edge === 'bottom');
    if (/^Face avant/.test(p.name)) return { ...p, holes: p.holes, h: Hf, pos: [p.pos[0], p.pos[1], bodyH + Hf / 2] as Vec3, cast: undefined, notches: [...base, ...verticalTeeth('left', Hf, 0), ...verticalTeeth('right', Hf, 0)] };
    if (/^Face arrière/.test(p.name)) { // deux ouvertures d'aération au-dessus du dessus du toit (grilles dessus)
      const q: Plank = { ...p, h: Hb, pos: [p.pos[0], p.pos[1], bodyH + Hb / 2] as Vec3, cast: undefined, notches: [...base, ...verticalTeeth('left', Hb, 0), ...verticalTeeth('right', Hb, 0)] };
      const portWin = n.cam > 0 ? [fitHole(q, { id: uid(), shape: 'square' as const, x: r2(piX), y: r2((PORT_Z0 + PORT_Z1) / 2 - Hb / 2), size: PORT_X1 - PORT_X0, sh: PORT_Z1 - PORT_Z0 })] : []; // fenêtre des prises du Pi
      const exitSlots = Array.from({ length: GR_N }, (_, k) => fitHole(q, { id: uid(), shape: 'square' as const, x: r2(FANX - GR_SPAN / 2 + GR_SLOT / 2 + k * (GR_SLOT + GR_BAR)), y: r2(VENT_Z - Hb / 2), size: GR_SLOT, sh: VENT_H })); // la grille de sortie est percée dans la plaque : fentes verticales de 4 mm, barreaux de 2 mm
      return { ...q, holes: [...q.holes, ...portWin, ...exitSlots, ...VENT_XS.map((x) => fitHole(q, { id: uid(), shape: 'square' as const, x, y: r2(VENT_Z - Hb / 2), size: VENT_W, sh: VENT_H }))] };
    }
    if (/^Côté/.test(p.name)) {
      const gland = false && n.solar && /^Côté droit/.test(p.name) ? [{ id: uid(), shape: 'round' as const, x: GL_Y, y: r2(roofH + 14 - Hb / 2), size: 10 }] : []; // passe-câble du panneau solaire
      const rect: Plank = { ...p, h: Hb, pos: [p.pos[0], p.pos[1], bodyH + Hb / 2] as Vec3, cast: undefined, notches: [...base, ...verticalTeeth('left', Hb, 1), ...verticalTeeth('right', Hb, 1)] };
      const line = (x: number) => -Hb / 2 + Hf + ((x + p.w / 2) * (Hb - Hf)) / p.w; // diagonale : Hf (avant) → Hb (arrière), sans dents
      return { ...rect, holes: gland, poly: clipBelow(outline(rect), line).map(([x, y]) => [r2(x), r2(y)] as [number, number]) };
    }
    return p;
  };
  // VENTILATEUR d'extraction (Noctua NF-A6x25 PWM, 60 × 60 × 25, 12 V) : une CASSETTE amovible à la main (le ventilateur dans un cadre de contreplaqué, sans outil ni vis) posée dans un SIÈGE fixe (la goulotte,
  // collée sur le plancher du toit) ; il aspire l'air chaud du nid par une ouverture du plafond (grille côté nid) et le pousse, par une fenêtre de la cassette, vers la fenêtre de la plaque arrière (grillage + clapet à gravité).
  // En hiver on remplace la cassette par un bloc isolant de même empreinte. Le siège est à l'ARRIÈRE du toit, contre la gaine, derrière la nappe de la caméra.
  const FI = FAN + 0.4, CO = FI + 2 * t, SI = CO, FO = SI + 2 * t; const EXW = r2(CO - 4 * t - 9); // fenêtre de sortie : la largeur de la cassette moins, de chaque côté, les crans verticaux (t), la fente des dents du conduit (t) et 4,5 mm de bois // cassette : intérieur (0,2 mm de jeu autour du ventilateur), extérieur ; siège : intérieur = extérieur de la cassette (ajustée pile, jeu 0), extérieur
  const GR_SLOT = 4, GR_BAR = 2, GR_N = Math.floor((EXW + GR_BAR) / (GR_SLOT + GR_BAR)), GR_SPAN = GR_N * GR_SLOT + (GR_N - 1) * GR_BAR; // grilles percées dans la plaque (sortie du ventilateur, paroi intérieure du corps) : fentes de 4 mm (aucune > 5 mm), barreaux de 2 mm
  const YREAR = D / 2 - t; // face intérieure de la plaque arrière du toit
  const FANX = r2(CND_X - CND_D / 2 - 8 - FO / 2); // contre la gaine (8 mm) ; les cales du Pi restent à ≈ 5 mm à gauche
  const CAMY1 = r2(CAM_Y + n.cam / 2 + t); // face extérieure (côté arrière) du mur arrière du compartiment de la caméra
  const FAN_GAP = 10; // le siège du ventilateur est à 1 cm du bloc caméra (demande de l'utilisateur : plus près du centre, l'ouverture du plafond est plus grande)
  const FY0 = r2(CAMY1 + FAN_GAP), CASS_Y0 = r2(FY0 + t), CASS_Y1 = r2(CASS_Y0 + CO), FANY = r2((CASS_Y0 + CASS_Y1) / 2); // devant du siège, cassette (pas de joint) ; derrière la cassette, un petit conduit de sortie la relie à la plaque arrière
  const DUCT_LEN = r2(YREAR - CASS_Y1); // longueur du conduit de sortie (cassette → face intérieure de la plaque arrière)
  const ZB = bodyH + t; // dessous du cadre de la cassette : posé directement sur le plancher du toit (pas de joint)
  const GUARD_T = 3, FAN_Z = r2(ZB + t + GUARD_T + FAN_PLOT + FAN_T / 2); // centre du ventilateur : sur ses plots, sur la grille de fil (3 mm), sur le cadre de la cassette
  const FOP_Y0 = r2(FY0 + t + 3), FOP_Y1 = r2(Math.min(FANY + FAN_OPEN / 2, n.L / 2 - 2)); // l'ouverture du plafond commence 3 mm après la paroi avant du siège (ligament) et reste au-dessus du nid (le mur intérieur est à L/2) : 56 de large
  const FOP_YC = r2((FOP_Y0 + FOP_Y1) / 2), FOP_H = r2(FOP_Y1 - FOP_Y0);
  const DUCT_Z1 = bodyH + VENT_Z0 + VENT_H + VENT_GAP; // haut de la fenêtre de sortie = haut des parois de la cassette et du siège
  const CONX = r2(FANX + FO / 2 + 4), SWX = r2(W / 2 - t - 13.5), SWY = r2(D / 2 - t - 18); // connecteur de la cassette, module interrupteur
  // PRISE D'AIR BASSE : un conduit de contreplaqué (4 parois + couvercle) dans l'isolant du mur GAUCHE, à l'AVANT, du dessous de la boîte à mi-hauteur du nid, puis une fente dans la paroi intérieure
  const AIR_X0 = r2(-(W / 2 - t) + 4.7), AIR_X1 = r2(-(n.l / 2 + t)), AIR_CX = r2((AIR_X0 + AIR_X1) / 2), AIR_LX = r2(AIR_X1 - AIR_X0), AIR_LY = 52; // ≥ 4,5 mm de bois entre le conduit et les fentes de dents voisines (mur extérieur à l'ouest, mur intérieur à l'est) ; plus long vers l'AVANT // empreinte extérieure du conduit
  const AIR_ZT = AIR_ZS + AIR_SH / 2, AIR_ZTOP = AIR_ZT + 8; // haut de la fente ; haut du conduit (≥ 4,5 mm de bois entre la fente et les crans du haut)
  // compartiment de la caméra (intérieur) : agrandi vers l'est pour contenir le capteur BME280 (logement 19,5 × 19,5), avec 4,5 mm de bois autour de son logement
  const CAMX0 = -n.cam / 2, CAMX1 = r2(SENSOR_X + 19.5 / 2 + 4.5), CAMW = r2(CAMX1 - CAMX0), CAMCX = r2((CAMX0 + CAMX1) / 2);
  const roofParts0 = roofBox.planks.map((p) => {
    const q: Plank = { ...p, name: p.name.replace(/ (\d+)$/, ' toit $1'), pos: [p.pos[0], p.pos[1], p.pos[2] + bodyH] as Vec3, group: roofGroup };
    if (/^Dessous/.test(p.name)) q.holes = [...q.holes, fitHole(q, { id: uid(), shape: 'square' as const, x: r2(SENSOR_X + SENSOR_CHIP_DX), y: SENSOR_Y, size: 9, sh: 9 }), // logement de la PUCE seule (6 × 6, jeu 1,5) : la carte (19 × 19) s'appuie sur le plafond, la puce traverse et affleure le dessous
      fitHole(q, { id: uid(), shape: 'square' as const, x: FANX, y: FOP_YC, size: FAN_OPEN, sh: FOP_H })]; // ouverture du ventilateur dans le plafond du nid (56 de large)
    if (n.cam <= 0) return q;
    if (/^Dessus/.test(p.name)) return { ...q, holes: [...q.holes, fitHole(q, { id: uid(), shape: 'square' as const, x: CAMCX, y: CAM_Y, size: CAMW, sh: n.cam })] }; // on accède au compartiment par le haut
    if (/^Dessous/.test(p.name)) return { ...q, holes: [...q.holes, fitHole(q, { id: uid(), shape: 'round' as const, x: CAM_X, y: CAM_Y, size: LENS_HOLE }), fitHole(q, { id: uid(), shape: 'square' as const, x: IR_X, y: CAM_Y, size: 10, sh: 20 })] };
    return q;
  });
  const roofParts = (() => {
    if (!n.pente) return roofParts0;
    // les plaques du toit montent (avant, arrière, côtés en trapèze) ; le DESSUS du toit, celui qui porte les composants, n'est plus crénelé : c'est une plaque simple posée sur
    // des BAGUETTES de contreplaqué (3 mm, découpées au laser, à plat sous lui) : chacune s'insère par des dents de t dans des fentes de la plaque du toit qui la porte
    const top = roofParts0.find((p) => /^Dessus/.test(p.name));
    const walls = roofParts0.filter((p) => !/^Dessus|^Dessous/.test(p.name)).map((p) => ({ ...tallRoof(p), group: roofGroup }));
    const xr = W / 2 - t, yr = D / 2 - t; // intérieur des plaques du toit
    const plain: Plank[] = top ? [{ ...top, w: r2(2 * xr - 0.5), h: r2(2 * yr - 0.5), notches: [{ id: uid(), edge: 'top' as const, pos: r2(FANX + (2 * xr - 0.5) / 2), width: r2(FO + 0.8), depth: r2((2 * yr - 0.5) / 2 - (FY0 - 0.4)) }], cast: undefined }] : []; // encoche à l'arrière : le siège du ventilateur traverse le dessus du toit
    const zt = bodyH + roofH - t; // dessous de la plaque du dessus : le dessus des baguettes y affleure (z de repos inchangé)
    // baguette = plaque plate de t d'épaisseur : corps de BAG_BODY de large (appui du dessus du toit) + dents de t qui traversent la plaque porteuse ; dents impaires (≈ 16 mm), bouts = corps (phase 0) : aucune fente près des coins
    const bag = (name: string, side: 'left' | 'right' | 'front' | 'back', a0: number, a1: number): Plank[] => {
      const len = r2(a1 - a0), mid = r2((a0 + a1) / 2), off = r2((BAG_BODY - t) / 2);
      if (len < 2 * BAG_BODY) return [];
      const spec = { left: { pos: [-xr + off, mid], rot: 90 }, right: { pos: [xr - off, mid], rot: -90 }, front: { pos: [mid, -yr + off], rot: 180 }, back: { pos: [mid, yr - off], rot: 0 } }[side]; // le bord « haut » de la plaque regarde la plaque du toit qui la porte
      return [recastAll({ id: uid(), name, w: len, h: BAG_BODY + t, pos: [r2(spec.pos[0]), r2(spec.pos[1]), r2(zt - t / 2)] as Vec3, rot: [0, 0, spec.rot] as Vec3, notches: [], holes: [], group: roofGroup, cast: { top: { n: teethFor(len), phase: 0 } } }, t, fit)];
    };
    const tasseaux: Plank[] = [
      ...bag('Baguette dessus toit gauche', 'left', -yr, yr), ...bag('Baguette dessus toit droite', 'right', -yr, yr), // sur toute la profondeur
      ...bag('Baguette dessus toit avant', 'front', -xr + BAG_BODY, xr - BAG_BODY), // entre les deux
      ...carveRects([-xr + BAG_BODY, yr - BAG_BODY, xr - BAG_BODY, yr], [[FANX - FO / 2 - 0.5, 0, FANX + FO / 2 + 0.5, yr]]).flatMap(([x0, , x1], k) => bag(`Baguette dessus toit arrière ${k + 1}`, 'back', x0, x1)), // l'arrière contourne le siège du ventilateur, dont les parois le remplacent
    ];
    const carriers: [RegExp, string][] = [[/^Côté gauche toit/, 'gauche'], [/^Côté droit toit/, 'droite'], [/^Face avant toit/, 'avant'], [/^Face arrière toit/, 'arrière']];
    for (const [re, side] of carriers) { // fentes des dents dans la plaque du toit qui porte chaque baguette (scène réduite : seulement la plaque et ses baguettes)
      const w = walls.find((p) => re.test(p.name)); if (!w) continue;
      const mine = tasseaux.filter((q) => q.name.startsWith(`Baguette dessus toit ${side}`));
      const tmp: PlankScene = { t, fit, planks: [{ ...w, group: undefined }, ...mine.map((q) => ({ ...q, group: '__baguettes' }))] };
      const slotted = slotsForTeeth(tmp, w.id).scene.planks[0];
      w.holes = [...w.holes, ...slotted.holes.filter((h) => !w.holes.some((o) => o.id === h.id))];
    }
    const grilles: Plank[] = VENT_XS.map((x, k): Plank => ({ id: uid(), name: `Grille anti-insectes ${k + 1}`, w: VENT_W + 4, h: 0.8, depth: VENT_H + 4, pos: [x, D / 2 + 0.4, bodyH + VENT_Z] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: roofGroup, special: 'block' as const, color: '#475569', transparent: true })); // maille fine collée sur la face extérieure, un peu plus grande que l'ouverture
    return [...walls, ...plain, ...(roofParts0.filter((p) => /^Dessous/.test(p.name))), ...tasseaux, ...grilles];
  })();
  const floorTop = bodyH + t; // dessus du plancher du toit
  const camParts: Plank[] = n.cam > 0
    ? makeBox(CAMW + 2 * t, n.cam + 2 * t, n.ins, t, fit, start).planks.filter(isWall).map((p) => {
      const cast = { ...(p.cast ?? {}) }; delete cast.top; cast.bottom = { n: teethFor(p.w), phase: 0 }; // le dessus du toit fait office de couvercle ; EN BAS, des dents qui s'enfoncent dans le plancher du toit (le plafond du nid) par des fentes
      return recastAll({ ...p, name: p.name.replace(/ (\d+)$/, ' caméra $1'), h: p.h + t, pos: [p.pos[0] + CAMCX, p.pos[1] + CAM_Y, p.pos[2] + floorTop - t / 2] as Vec3, group: roofGroup, cast, notches: p.notches.filter((x) => x.edge !== 'top' && x.edge !== 'bottom') }, t, fit);
    })
    : [];
  const camBox: Plank[] = n.cam2 ? (() => { // caméra 2 et carte de LED extérieures, nues : cartes debout, objectif vers l'avant de leur repère, tournées vers le trou d'envol
    const cam2: Plank = { id: uid(), name: CAMERA_NAMES[1], w: CAM_W, h: CAM_H, pos: [0, -2, 0] as Vec3, rot: [-90, 0, 180] as Vec3, notches: [], holes: [], group: elecGroup, special: 'camera' };
    const ir2: Plank = { id: uid(), name: 'LED infrarouges extérieures', w: IR_W, h: IR_H, pos: [r2(irOff[0]), r2(-2 + irOff[1]), r2(irOff[2])] as Vec3, rot: [-90, 0, 180] as Vec3, notches: [], holes: [], group: elecGroup, special: 'ir' }; // à côté de la caméra 2, tournée comme elle
    const all = [cam2, ir2], ids = new Set(all.map((q) => q.id));
    return transformPlanks({ t, fit, planks: all }, ids, [cam2X, cam2Y, cam2Cz], cam2Q, [0, 0, 0]).planks;
  })() : [];
  const brackets: Plank[] = n.solar ? U_YS.map((y, k): Plank => ({ id: uid(), name: `Étrier régulateur ${k + 1}`, w: U_W, h: U_H, pos: [RGX, r2(y), r2(U_TEN - U_H / 2)] as Vec3, rot: rotFromBasis([1, 0, 0], [0, 0, 1]), notches: [{ id: uid(), edge: 'top' as const, pos: U_W / 2, width: U_W - 2 * U_ARM, depth: U_H - 9 }], holes: [], group })) : []; // les tenons (3 mm du haut des bras) affleurent le dessus du fond (z = +3), le fond de l'encoche est 1 mm sous le régulateur
  const LAM_T = OKOUME_T, LAM_W = 46, LAM_DOWN = n.solar ? 45 : 10, LAM_FRONT_GAP = 1.5; // habillage en contreplaqué okoumé extérieur de 5 mm, peint en blanc, découpé au laser : lames de ~46 (largeur exacte (W + 2·LAM_T) / k), toutes de la même largeur ; LAM_FRONT_GAP = jeu (mm) sous le pan en okoumé devant
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
    { id: uid(), name: CAMERA_NAMES[0], w: CAM_W, h: CAM_H, pos: [CAM_X, CAM_Y, floorTop + 0.8] as Vec3, rot: [0, 0, 180] as Vec3, notches: [], holes: [], group: elecGroup, special: 'camera', wood: t }, // carte posée sur le plafond, l'objectif traverse le trou et affleure le dessous
    { id: uid(), name: 'LED infrarouges', w: IR_W, h: IR_H, pos: [IR_X, CAM_Y, floorTop + 0.8] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'ir', wood: t },
  ] : [];
  // cadre sous le toit, en trois planches collées (le toit n'est plus verrouillé par des barres : il tient avec l'habillage collé au corps) ;
  // en descendant dans l'isolant entre murs extérieur et intérieur, le cadre cale en plus le toit sur le corps
  const ring = (name: string, k: number, holes: Hole[]): Plank => ({ id: uid(), name, w: W - 2 * t, h: D - 2 * t, pos: [0, 0, bodyH - (2 * k + 1) * t / 2], rot: [0, 0, 0], notches: [], holes, group: roofGroup });
  // le cadre est en U : son ouverture centrale (l'extérieur de la boîte intérieure) est ouverte vers l'avant par une encoche qui va jusqu'au bord avant, de sorte
  // que le bloc d'entrée (plaques de 55 dans l'isolant) peut monter à fleur du haut du mur, toit retiré ou posé
  const uNotch = (): Notch => ({ id: uid(), edge: 'bottom', pos: r2((W - 2 * t) / 2), width: n.l + 2 * t, depth: r2((D / 2 - t) + (n.L / 2 + t)) });
  const frames: Plank[] = [
    { ...ring('Cadre toit haut', 0, []), notches: [uNotch()] },
    { ...ring('Cadre toit milieu', 1, []), notches: [uNotch()] },
    { ...ring('Cadre toit bas', 2, []), notches: [uNotch()] },
  ];
  // le Raspberry Pi sur le toit, à l'arrière (pas au-dessus de l'ouverture), calé par six petits bouts de bois collés sur le toit
  const roofTop = bodyH + roofH;
  const OAK = n.chene ? 18 : 0, topZ = roofTop + OAK; // dessus de la planche de chêne : tout ce qui est « sur le toit » (Pi, boîtier, toit en pente) se pose dessus
  const piZ = topZ + 7; // centre de la carte : sur des entretoises de 6 mm au-dessus du dessus du toit (les composants du dessous dépassent de 2,9)
  const wedgeNeed: number[] = []; // longueurs (mm) des cales de bois d'autrefois, une par côté de composant : le besoin que les baguettes de cale (3 × ce besoin) doivent couvrir
  if (n.cam > 0) wedgeNeed.push(16, 16, 16, 16, 16, 16); // Pi : six cales de 16 mm, deux par grand côté et une à chaque bout
  const pi: Plank[] = n.cam > 0 ? [
    { id: uid(), name: 'Raspberry Pi', w: PI_W, h: PI_H, pos: [piX, piY, piZ] as Vec3, rot: [0, 0, 90] as Vec3, notches: [], holes: [], group: elecGroup, special: 'pi' as const },
    // plus de cales de bois autour du Pi : des baguettes de contreplaqué à couper au montage (`wedgeNeed`, groupe « Baguettes de cale (à couper) »)
  ] : [];
  // la nappe de la caméra (câble plat) : du connecteur de la caméra, elle monte par l'ouverture du toit puis court sur le toit jusqu'au connecteur du Pi
  // la nappe sort à l'HORIZONTALE du connecteur de la caméra (côté arrière), monte par l'ouverture, puis arrive à l'horizontale dans le connecteur du Pi par le côté gauche
  // (Pi 5 : pas de jack audio ; les deux connecteurs de 22 broches sont à 6,3 mm l'un de l'autre, la nappe de la caméra 2 passe au-dessus de celle de la caméra 1 ; sens d'entrée réel à vérifier sur la carte) ; sa largeur (16) est dans l'axe de chaque connecteur
  const camZc = floorTop + 0.8 + 2.1; // hauteur du connecteur de la caméra
  const piZc = piZ + PI_CSI[2] - 2.6; // hauteur moyenne du connecteur du Pi (0,8 à 6,1 au-dessus du centre de la carte)
  // la nappe de la caméra 2 : LONGUE (la caméra est dehors) ; elle part du 2ᵉ port du Pi, court sur le dessus du toit, SORT par le trou de la plaque avant du toit et redescend jusqu'au connecteur de la caméra
  const MX = -50, MY = -16, MZ = topZ + 3; // module 2 × MOSFET des LED (20 × 14 × 6), posé sur le dessus du toit devant le Pi
  const ledSwitch: Plank[] = n.cam > 0 ? [
    { id: uid(), name: 'Module 2 MOSFET (LED infrarouges on / off)', w: 20, h: 14, depth: 6, pos: [MX, MY, MZ + 3] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'driver' as const, color: '#1f2937' },
    // masse du module → masse du Pi (broche 6) ; commandes : IN1 = GPIO23 (broche 16) pour les LED du nid, IN2 = GPIO24 (broche 18) pour les LED extérieures
    ...([['Fil masse module LED (noir)', '#111827', 2, 0, -4], ['Fil IN1 LED du nid (gris, GPIO23 broche 16)', '#6b7280', 7, 0, 0], ['Fil IN2 LED extérieures (blanc, GPIO24 broche 18)', '#e5e7eb', 8, 0, 4]] as const).map(([nm, color, pinIdx, _r, dx]): Plank => {
      const [xt, yt] = pw(PI_PIN_X0 + pinIdx * 2.54, PI_PIN_Y);
      return { id: uid(), name: nm, w: 1.2, h: 1.2, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'wire' as const, color,
        path: [[MX + dx, MY + 7, MZ + 4], [MX + dx, MY + 12, MZ + 16], [xt + 6, yt, topZ + 20], [xt, yt, piZ + 8], [xt, yt, piZ + 3.5]] as Vec3[] };
    }),
  ] : [];
  // trajet commun (de l'intérieur vers la caméra 2) : sous le pan à l'avant du caisson, MONTE par l'extrémité arrière (B) du canal, court DANS le canal (h = 2,5 : au milieu de la plaque crénelée de 5 mm, sous la plaque pleine), redescend par l'extrémité avant (A), dans le débord, jusqu'au-dessus de la caméra ; perpendiculaire au pan aux deux bouts
  // les FILS (coudes arrondis de 10 mm par `roundPath`) : segments droits de 10 mm au moins sous le pan ; la NAPPE (courbe lisse sans arrondi de coins) : points rapprochés aux deux bouts du canal
  const panRoute = (x: number, wireRoute: boolean): Vec3[] => wireRoute
    ? [panPt(x, PAN_SB + 30, -14), panPt(x, PAN_SB, -14), panPt(x, PAN_SB, 2.5), panPt(x, PAN_SA, 2.5), panPt(x, PAN_SA, -14)]
    : [panPt(x, PAN_SB + 45, -9), panPt(x, PAN_SB + 14, -9), panPt(x, PAN_SB + 4, -5), panPt(x, PAN_SB, -1), panPt(x, PAN_SB - 1, 1.5), panPt(x, PAN_SB - 5, 2.5), panPt(x, (PAN_SA + PAN_SB) / 2, 2.5), panPt(x, PAN_SA + 5, 2.5), panPt(x, PAN_SA + 1, 1.5), panPt(x, PAN_SA, -1), panPt(x, PAN_SA - 1, -6)];
  const wires2: Plank[] = n.cam2 ? ([['Fil 5 V LED extérieures (rouge)', '#dc2626', 0, 0, -10.5], ['Fil masse LED extérieures (noir)', '#111827', 9, 0, -13]] as const).map(([nm, color, pinIdx, _r, dx]): Plank => {
    const [xt, yt] = pw(PI_PIN_X0 + pinIdx * 2.54, PI_PIN_Y), sx = cam2SX + dx; // tous les deux à GAUCHE de la nappe (à 10,5 et 13 mm de son axe ; elle fait 16 de large, la fente 28) : jamais dessus, jamais croisée
    const end = cam2Pt(irOff[0] + dx / 4, -2 + irOff[1], IR_H / 2 + 2 + irOff[2]);
    return { id: uid(), name: nm, w: 1.2, h: 1.2, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'wire' as const, color,
      path: [...(pinIdx === 9 ? [[MX + 4, MY - 7, MZ + 4], [MX + 4, MY - 12, MZ + 10], [sx + 10, -34, topZ + 24]] as Vec3[] : [[xt, yt, piZ + 3.5], [xt, yt, piZ + 10], [xt + dx, yt - 10, topZ + 27]] as Vec3[]), ...panRoute(sx, true), [end[0], end[1], end[2] + 6], end] as Vec3[] };
  }) : [];
  const cable2: Plank[] = n.cam2 ? [{
    id: uid(), name: "Nappe caméra 2 (longue, vers l'extérieur)", w: 16, h: 0.3, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'cable' as const,
    path: (() => {
      const [xt, yt] = pw(PI_CSI2[0], PI_CSI2[1]);
      const con = camCon; // connecteur en haut de la caméra, qui pend dehors sous le débord
      return [[xt, yt, piZ + 1], [xt, yt - 6, piZ + 3], [xt, yt - 14, piZ + 10], [xt - 4, -8, topZ + 26], ...panRoute(cam2SX, false), con] as Vec3[];
    })(),
  }] : [];
  const cable: Plank[] = n.cam > 0 ? [{
    id: uid(), name: 'Nappe caméra', w: 16, h: 0.3, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'cable' as const,
    // sort à l'horizontale du connecteur de la caméra (vers l'avant), monte par l'ouverture, passe en arche au-dessus de la carte (composants jusqu'à 24 au-dessus du toit), puis redescend en douceur
    // sur le connecteur du Pi, où elle entre à l'horizontale ; points peu nombreux, courbe centripète
    path: (() => { const [xt, yt] = pw(PI_CSI[0], PI_CSI[1]); return [[CAM_X, CAM_Y - 6, camZc], [CAM_X, CAM_Y + 2, camZc + 10], [CAM_X, CAM_Y + 10, camZc + 23], [CAM_X - 2, CAM_Y + 16, roofTop + 2], [CAM_X - 6, CAM_Y + 23, topZ + 4], [CAM_X - 12, CAM_Y + 21, topZ + 18], [CAM_X - 30, CAM_Y + 24, topZ + 26], [CAM_X - 38, CAM_Y + 34, topZ + 26], [xt, yt - 12, piZc + 12], [xt, yt - 5, piZc + 2], [xt, yt + 2, piZc]] as Vec3[]; })(), // part DIRECTEMENT en diagonale du connecteur de la caméra, monte vers le fond du nichoir (l'arrière) par l'ouverture, puis rejoint le Pi
  }] : [];
  // l'alimentation des LED infrarouges : deux fils de la carte IR au GPIO du Pi, 5 V (broche 4, rouge) et masse (broche 6, noir)
  const wires: Plank[] = n.cam > 0 ? ([['Fil 5 V (rouge)', '#dc2626', -2, 1], ['Fil masse (noir)', '#111827', 2, 2]] as const).map(([nm, color, dx, pinIdx]): Plank => {
    const sx = IR_X + dx, px = PI_PIN_X0 + pinIdx * 2.54, top = topZ + 19.5 + dx * 0.4; // au-dessus de la carte du Pi (haut à topZ + 15,5)
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
    ...carveRects([-xo, -yo, xo, yo], [[AIR_X0, AIR_CY - AIR_LY / 2, AIR_X1, AIR_CY + AIR_LY / 2]]).flatMap(([x0, y0, x1, y1], k) => block(`Isolant sous le plancher ${k + 1}`, x0, x1, y0, y1, t, e)),
    ...carveRects([-xo, -yo, -xi, yo], [[AIR_X0, AIR_CY - AIR_LY / 2, AIR_X1, AIR_CY + AIR_LY / 2]]).flatMap(([x0, y0, x1, y1], k) => block(`Isolant gauche ${k + 1}`, x0, x1, y0, y1, z0, z1)), // découpé autour du conduit de la prise d'air
    ...block('Isolant gauche dessus conduit', AIR_X0, AIR_X1, AIR_CY - AIR_LY / 2, AIR_CY + AIR_LY / 2, AIR_ZTOP, z1),
    ...block('Isolant droite', xi, xo, -yo, yo, z0, z1), // pavé plein : la gaine se pousse dans la laine (plus de découpe, demande de l'utilisateur)
    ...block('Isolant arrière', -xi, xi, yi, yo, z0, z1),
    ...block('Isolant avant gauche', -xi, -wide, -yo, -yi, z0, z1),
    ...block('Isolant avant droite', wide, xi, -yo, -yi, z0, z1),
    ...block("Isolant sous le bloc d'entrée", -wide, wide, -yo, -yi, z0, holeZ - OPEN / 2 - 6),
    // le toit : des pavés autour du compartiment caméra et du siège du ventilateur
    ...carveRects([-xo, -yo, xo, yo], [...(n.cam > 0 ? [[CAMX0 - t, CAM_Y - cc, CAMX1 + t, CAM_Y + cc] as [number, number, number, number]] : []), [FANX - FO / 2, FY0, FANX + FO / 2, yo] as [number, number, number, number]])
      .flatMap(([x0, y0, x1, y1], k) => block(`Isolant toit ${k + 1}`, x0, x1, y0, y1, bodyH + t, bodyH + roofH - t)),
  ];
  // outils pour les pièces de l'électronique (groupe Électronique) : pavé et fil
  const part = (name: string, w: number, h: number, depth: number, x: number, y: number, z: number, special: 'block' | 'driver', color = '#cbd5e1', rot: Vec3 = [0, 0, 0]): Plank =>
    ({ id: uid(), name, w, h, depth, pos: [x, y, z] as Vec3, rot, notches: [], holes: [], group: elecGroup, special, color });
  const wire = (name: string, color: string, path: Vec3[], d = 1.2): Plank => ({ id: uid(), name, w: d, h: d, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'wire' as const, color, path });
  const CVX = -(W / 2 - t) + 10 + 18, CVY = -(D / 2 - t) + 10 + 30; // convertisseur : coin avant gauche, 1 cm des murs
  const BX = W / 2 - t - 10 - 64, BY = -(D / 2 - t) + 10 + 35; // batterie : coin avant droit, 1 cm des murs
  const WGX = W / 2 - t - 2 - 10; // les deux Wago du rail 12 V : à droite du fusible, contre le mur droit
  const FX = CND_X + 3, FY = CND_Y - 24; // fusible, près de la sortie de la gaine // centre du convertisseur : milieu de la place libre entre le tasseau gauche, la cale gauche de la batterie, le tasseau avant et la cale avant du Pi
  // Wago 221-413 (+, 3 entrées) et 221-415 (−, 5 entrées) : simples PAVÉS aux cotes officielles WAGO (fiche 08.05.2024 : 221-413 = 18,8 × 8,4 × 18,8 mm, 221-415 = 30 × 8,4 × 18,8 mm : largeur dans le sens de la rangée, hauteur, profondeur dans le sens des fils) ;
  // TOUS les fils entrent par la MÊME face (ouest, x = WGF), au pas de 6 mm (3 × 6 + 0,8 = 18,8 ; 5 × 6 = 30), à mi-hauteur : WG_Z
  const WG_W = 18.8, WG_H = 8.4, WG_PITCH = 6, WG_L3 = 18.8, WG_L5 = 30;
  const WGF = r2(WGX + 10 - WG_W), WGBX = r2(WGF + WG_W / 2), FUY = r2(FY - 1.5), WGP_Y = FUY, WGM_Y = r2(WGP_Y - WG_L3 / 2 - 1.5 - WG_L5 / 2), WG_Z = r2(topZ + 3 + WG_H / 2); // le fusible est dans l'axe de l'entrée du milieu du Wago +
  const wgPort = (cy: number, n: number, i: number) => r2(cy + WG_PITCH * ((n - 1) / 2 - i)); // y de l'entrée i (0 = au nord) d'un Wago de n entrées centré en cy
  const wgEnd = (y: number, from: [number, number, number][]): Vec3[] => [...from, [r2(WGF + 2.5), y, WG_Z]] as Vec3[]; // les ≥ 12 derniers mm sont rectilignes, perpendiculaires à la face, au niveau des orifices ; 2,5 mm dans l'orifice
  { // besoin en cales du convertisseur (66 + 66 + 36 + 36) et de la batterie (côtés 76 + 76, avant 128, arrière 128 ou deux morceaux autour de l'ouverture du compartiment caméra) : plus de pièces, seulement des longueurs
    wedgeNeed.push(66, 66, 36, 36, 76, 76, 128);
    const y = BY + 35 + 1.5, cutBack = y > CAM_Y - cc - t && y < CAM_Y + cc + t;
    const segs: [number, number][] = cutBack ? ([[BX - 64, CAMX0 - 2 * t], [CAMX1 + 2 * t, BX + 64]] as [number, number][]).filter(([a0, b0]) => b0 - a0 > 2) : [[BX - 64, BX + 64]];
    for (const [a0, b0] of segs) wedgeNeed.push(r2(b0 - a0));
  }
  // alimentation : toujours présente (le Pi en a besoin) — batterie 4 × 32700, fusible, deux Wago du rail 12 V, convertisseur 12 → 5 V, leurs cales et leurs fils
  const power: Plank[] = [
    part('Convertisseur 12 V → 5 V 5 A USB-C (taille à confirmer, ≈ 60 × 36 × 16)', 36, 60, 16, CVX, CVY, topZ + 3 + 8, 'block', '#0e7490'), // centré dans la place libre de l'avant gauche, calé
    part('Fusible lame 15 A (19 × 18 × 5, posé à plat)', 19, 18.5, 5, FX, FUY, topZ + 2.5, 'block', '#dc2626'), // près de la sortie de la gaine
    part('Wago 221-413 (3 entrées) rail 12 V +', WG_W, WG_L3, WG_H, WGBX, WGP_Y, WG_Z, 'block', '#f97316'), // bornier du rail 12 V : le fusible, l'interrupteur du ventilateur, le convertisseur
    part('Wago 221-415 (5 entrées) rail 12 V −', WG_W, WG_L5, WG_H, WGBX, WGM_Y, WG_Z, 'block', '#9ca3af'), // batterie −, convertisseur −, ventilateur −, masse de l'interrupteur (+ 1 entrée libre) ; taille à vérifier sur la fiche WAGO
    part('Batterie LiFePO4 12,8 V 6 Ah (4 × 32700, 128 × 70 × 32)', 128, 70, 32, BX, BY, topZ + 3 + 16, 'block', '#047857'), // dans le grenier, coin avant droit, à 1 cm du mur de droite et du mur avant
    wire('Fil fusible → batterie + (rouge)', '#dc2626', [[FX - 7.5, FUY, topZ + 5], [FX - 8, FUY - 7, topZ + 14], [(FX + BX) / 2, (FUY + BY) / 2, topZ + 34], [BX - 8, BY + 46, topZ + 22], [BX - 8, BY + 38, topZ + 19], [BX - 8, BY + 31, topZ + 19]] as Vec3[], 3.6),
    wire('Fil fusible → Wago + (rouge)', '#dc2626', wgEnd(wgPort(WGP_Y, 3, 1), [[FX + 3, FUY, WG_Z]]), 3.6), // le + sort du fusible, droit dans l'axe de l'entrée du milieu du Wago +
    wire('Fil batterie − → Wago − (noir)', '#111827', wgEnd(wgPort(WGM_Y, 5, 3), [[BX + 12, BY + 31, topZ + 19], [BX + 12, BY + 38, topZ + 19], [BX + 12, BY + 46, topZ + 22], [BX + 34, -6, topZ + 36], [r2(WGF - 25.2), r2(WGM_Y - 24.6), topZ + 20], [r2(WGF - 25.2), wgPort(WGM_Y, 5, 3), WG_Z]]), 3.6), // le − de la batterie arrive du sud et entre dans la 4ᵉ entrée du Wago −
    wire('Fil rail → convertisseur + (rouge)', '#dc2626', [...wgEnd(wgPort(WGP_Y, 3, 2), [[r2(WGF - 27.2), r2(WGP_Y - 18.5), topZ + 26], [r2(WGF - 27.2), r2(wgPort(WGP_Y, 3, 2) - 4), topZ + 26], [r2(WGF - 27.2), wgPort(WGP_Y, 3, 2), WG_Z]]).reverse(), [r2(WGF - 27.2), 2, topZ + 26], [58, 2, topZ + 24], [MX + 10, MY, topZ + 20], [MX - 10, MY - 4, topZ + 20], [CVX + 7, CVY + 36, topZ + 14], [CVX + 7, CVY + 30, topZ + 11]] as Vec3[], 3.6), // départ 2 du Wago +
    wire('Fil rail → convertisseur − (noir)', '#111827', [...wgEnd(wgPort(WGM_Y, 5, 2), [[r2(WGF - 31.2), r2(WGM_Y - 12.6), topZ + 28], [r2(WGF - 31.2), wgPort(WGM_Y, 5, 2), WG_Z]]).reverse(), [r2(WGF - 31.2), r2(FY0 - 8), topZ + 28], [50, -4, topZ + 28], [MX + 8, MY + 6, topZ + 24], [MX - 20, MY - 4, topZ + 22], [CVX - 7, CVY + 40, topZ + 13], [CVX - 7, CVY + 30, topZ + 11]] as Vec3[], 3.6), // départ 2 du Wago −
  ];
  // avec le panneau solaire : le régulateur sous le nichoir, ses deux fils vers la batterie et la gaine qui les porte
  const solarElec: Plank[] = n.solar ? [
    part('Régulateur de charge Genasun GV-10-Li (137 × 61 × 33, sous le nichoir)', 61, 137, 33, RGX, RGY, RGZ, 'block', '#1d4ed8'), // à plat sous le plancher, le lambris descend autour pour le protéger
    wire('Fil régulateur → batterie + (rouge, 2,5 mm²)', '#dc2626', [[RGX - 30.5, RGY - 8, RGZ + 6], [RGX - 37, RGY - 11, RGZ + 6], [RGX - 45, RGY - 14, RGZ + 5], [RGX - 45, RGY + 50, RGZ + 5], [RGX - 41, CND_Y - 26, RGZ + 5], [RGX - 26, CND_Y - 9, RGZ + 6], [CND_X - 13, CND_Y - 4, RGZ + 8], [CND_X - 2.5, CND_Y - 2.5, -4], [CND_X - 2.5, CND_Y - 2.5, topZ + 10], [FX - 7.5, FY + 9, topZ + 13], [FX - 7.5, FY, topZ + 5]] as Vec3[], 3.6),
    wire('Fil régulateur → batterie − (noir, 2,5 mm²)', '#111827', [[RGX - 30.5, RGY + 8, RGZ + 6], [RGX - 37, RGY + 6, RGZ + 4], [RGX - 49, RGY, RGZ + 2], [RGX - 49, RGY + 90, RGZ + 2], [RGX - 40, CND_Y + 2, RGZ + 3], [CND_X - 21, CND_Y + 7, RGZ + 5], [CND_X + 2.5, CND_Y + 2.5, -4], [CND_X + 2.5, CND_Y + 2.5, topZ + 14], [FANX + FO / 2 + 11.5, CND_Y - 6, topZ + 30], [FANX + FO / 2 + 6.5, CND_Y - 16, topZ + 30], [FANX + FO / 2 + 6.5, FY0 - 4, topZ + 30], [FANX + FO / 2 + 2.5, FY0 - 14, topZ + 28], [BX + 12, BY + 57, topZ + 24], [BX + 12, BY + 46, topZ + 19], [BX + 12, BY + 38, topZ + 19], [BX + 12, BY + 31, topZ + 19]] as Vec3[], 3.6),
    { id: uid(), name: 'Gaine des fils (ICTA Ø 16 ou multicouche Ø 16, dans l’isolant)', w: CND_D, h: CND_D, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'conduit' as const, color: '#1c1917', path: [[CND_X, CND_Y, -8], [CND_X, CND_Y, topZ + 6]] as Vec3[] }, // gaine annelée noire (ICTA)
  ] : [];
  // CAPTEUR température / humidité (BME280) : toujours présent, incrusté à fleur du plafond du nid (puce vers le bas), quatre fils vers le GPIO du Pi (par une fente du dessus du toit, dans l'isolant)
  const sensorSet: Plank[] = [
    { id: uid(), name: 'Capteur température / humidité (BME280, 19 × 19)', w: 19, h: 19, pos: [SENSOR_X, SENSOR_Y, floorTop + 0.8] as Vec3, rot: [180, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'sensor' as const, wood: t },
    ...([['Fil 3,3 V (rouge)', '#dc2626', 0, 0], ['Fil SDA (jaune)', '#eab308', 1, 1], ['Fil SCL (vert)', '#16a34a', 2, 2], ['Fil masse (noir)', '#111827', 4, 3]] as const).map(([nm, color, pinIdx, k]): Plank => {
      const sx = SENSOR_X - 3.75 + k * 2.5, px = PI_PIN_X0 + pinIdx * 2.54, hh = topZ + 24 + k * 2;
      return wire(nm, color, [[sx, SENSOR_Y - 7.5, bodyH + 6], [sx, SENSOR_Y - 4, bodyH + 12], [sx, SENSOR_Y + 2, bodyH + 22], [sx, SENSOR_Y + 2, topZ + 6], [sx, SENSOR_Y + 2, hh], [...pw(px, PI_PIN_Y - 2.54), hh], [...pw(px, PI_PIN_Y - 2.54), piZ + 3.5]] as Vec3[]);
    }),
  ];
  // SONDE DE TEMPÉRATURE EXTÉRIEURE : DS18B20 étanche (tube inox Ø 6 × 50) collée contre le DESSOUS du pan en okoumé, sous le débord de 30 mm du côté gauche, à l'ombre, à y ≈ +40 (milieu de la lame d'habillage qui porte son passage) :
  // loin de la caméra 2 (avant gauche), du ventilateur (arrière droit) et du régulateur (sous le nichoir, à droite). Son câble (3 conducteurs) entre dans le grenier par un petit passage rond Ø 5 percé dans la lame d'habillage gauche
  // et dans la plaque gauche du toit (le pan n'est pas percé : un trou y donnerait sur le dessus du toit), sous la baguette du couvercle ; il rejoint un petit module 3 broches (résistance de rappel 4,7 kΩ) près du Pi.
  // Trois cordons Dupont vont du module au Pi : 3,3 V broche 17, GPIO4 (1-Wire) broche 7, masse broche 20.
  const SONDE_LEN = 50, SONDE_D = 6, SONDE_HOLE = 5;
  const lamSy = D / Math.max(1, Math.round(D / LAM_W)), SONDE_Y = r2(-D / 2 + (Math.floor((40 + D / 2) / lamSy) + 0.5) * lamSy); // centre de la lame d'habillage gauche qui contient y = +40
  const sondeX = r2(-W / 2 - lamT - 4 - SONDE_D / 2), sondeCx = r2(-W / 2 - 24), sondeZh = r2(panZl(SONDE_Y) - 15); // sonde 4 mm devant l'habillage ; câble à 24 mm du mur ; passage sous le corps de la baguette (10 mm sous le pan) avec 5 mm de bois au-dessus
  const sondeS = (SONDE_Y - PAN_YMID) / PAN_COS, sondeC = panPt(sondeX, sondeS, -SONDE_D / 2), sondeBack = panPt(sondeX, sondeS + SONDE_LEN / 2, -SONDE_D / 2); // centre et bout arrière (sortie du câble) de la sonde, collée sous le pan
  const DSX = r2(-(W / 2 - t) + 12), DSY = r2(piY - 42.5 - 10), DSZ = topZ + 3 + 3; // module 3 broches : 16 × 10 × 6, sur le dessus du toit, devant le Pi, contre le mur gauche
  const probeSet: Plank[] = [
    part('Sonde de température extérieure DS18B20 (étanche, tube inox Ø 6 × 50, câble 1 à 3 m)', SONDE_D, SONDE_LEN, SONDE_D, sondeC[0], sondeC[1], sondeC[2], 'block', '#9ca3af', [r2((PAN_ANG * 180) / Math.PI), 0, 0]),
    part('Module DS18B20 (résistance 4,7 kΩ, 3 broches)', 16, 10, 6, DSX, DSY, DSZ, 'block', '#065f46'),
    wire('Câble sonde extérieure (DS18B20, 3 conducteurs)', '#1c1917', [
      sondeBack, [sondeX, r2(sondeBack[1] + 14), r2(sondeBack[2] - 1)], [sondeCx, r2(sondeBack[1] + 14), r2(sondeBack[2] - 12)], [sondeCx, SONDE_Y, sondeZh],
      [r2(-W / 2 + t + 12), SONDE_Y, sondeZh], [r2(-W / 2 + t + 12), r2(SONDE_Y - 30), sondeZh], [r2(-W / 2 + t + 12), r2(DSY + 8), sondeZh - 4], [DSX - 5, r2(DSY + 2), r2(DSZ + 14)], [DSX - 5, DSY, r2(DSZ + 3.5)],
    ] as Vec3[], 2.9),
    ...([['Fil sonde 3,3 V (rouge)', '#dc2626', 8, 0, 34, 1], ['Fil sonde DATA (jaune)', '#eab308', 3, 0, 38, 0], ['Fil sonde masse (noir)', '#111827', 9, 1, 42, -1]] as const).map(([nm, color, pinIdx, row, lvl, dx]): Plank => {
      const [xp, yp] = pw(PI_PIN_X0 + pinIdx * 2.54, PI_PIN_Y - 2.54 * (1 - row)), hh = topZ + lvl; // broches 17 et 7 : rangée intérieure (impaires) ; broche 20 : rangée extérieure
      return wire(nm, color, [[DSX + dx * 4, DSY + 4, DSZ + 3.5], [DSX + dx * 4, DSY + 9, r2(DSZ + 10)], [xp, yp - 12, hh], [xp, yp, hh], [xp, yp, r2(piZ + 8)], [xp, yp, r2(piZ + 3.5)]] as Vec3[]);
    }),
  ];
  // ===== VENTILATEUR =====
  const sideRot = rotFromBasis([0, 1, 0], [0, 0, 1]), faceRot = rotFromBasis([1, 0, 0], [0, 0, 1]);
  const wood = (name: string, w: number, h: number, pos: Vec3, rot: Vec3, grp: string, holes: Hole[] = []): Plank => ({ id: uid(), name, w: r2(w), h: r2(h), pos: [r2(pos[0]), r2(pos[1]), r2(pos[2])] as Vec3, rot, notches: [], holes, group: grp });
  const blk = (name: string, w: number, h: number, depth: number, pos: Vec3, grp: string | undefined, color: string, extra: Partial<Plank> = {}): Plank => ({ id: uid(), name, w: r2(w), h: r2(h), depth: r2(depth), pos: [r2(pos[0]), r2(pos[1]), r2(pos[2])] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: grp, special: 'block' as const, color, ...extra });
  // le SIÈGE fixe (goulotte) : trois parois collées sur le plancher du toit (dents dans des fentes), la plaque arrière du toit fait la quatrième ; il traverse le dessus du toit par son encoche arrière
  const seatH = DUCT_Z1 - bodyH, seatLen = YREAR - FY0, seatC = (FY0 + YREAR) / 2;
  const seatWall = (name: string, w: number, pos: Vec3, rot: Vec3): Plank => recastAll({ ...wood(name, w, seatH, pos, rot, roofGroup), cast: { bottom: { n: teethFor(w), phase: 0 } } }, t, fit);
  const seat: Plank[] = [
    seatWall('Goulotte ventilateur gauche', seatLen, [FANX - FO / 2 + t / 2, seatC, bodyH + seatH / 2], sideRot),
    seatWall('Goulotte ventilateur droite', seatLen, [FANX + FO / 2 - t / 2, seatC, bodyH + seatH / 2], sideRot),
    seatWall('Goulotte ventilateur avant', SI, [FANX, FY0 + t / 2, bodyH + seatH / 2], faceRot),
  ];
  // la CASSETTE amovible : cadre du bas (ouvert au-dessus de l'ouverture du plafond), quatre parois dont l'arrière a la fenêtre de sortie, couvercle à poignée ; le ventilateur est posé sur quatre plots sur le cadre
  // POIGNÉE en U (pontet) de bois, CENTRÉE sur le couvercle, incrustée par deux tenons traversants dans deux fentes du couvercle (comme les dents des murs) : barre de t + deux pieds de t, ouverture de 24 mm de large ;
  // la hauteur est la plus grande qui garde 2 mm de jeu sous la pente du toit au centre de la cassette (petite poignée : on glisse le bout des doigts) ; la cassette elle-même ne change pas
  const HU_W = 30, HU_LEG = t, HU_SLOT = r2(t + fit), HU_LEGX = r2((HU_W - HU_LEG) / 2);
  const slopeAtLid = bodyH + Hf + ((FANY - 1.5 * t + D / 2) * (Hb - Hf)) / D, HU_H = Math.max(2 * t, Math.min(12, Math.floor(slopeAtLid - (DUCT_Z1 + t) - 2))); // hauteur au-dessus du couvercle (barre comprise)
  const uPoly = (w: number, h: number): Pt[] => [[-w / 2, -h / 2], [-w / 2 + HU_LEG, -h / 2], [-w / 2 + HU_LEG, h / 2 - t], [w / 2 - HU_LEG, h / 2 - t], [w / 2 - HU_LEG, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]; // U vu de face : le bas des pieds = tenons
  const HU_N = 3, HU_SLOT3 = r2(HU_N * t + fit); // trois couches de contreplaqué collées face à face (9 mm) : une seule fente par pied
  const uSlots = (): Hole[] => [-1, 1].map((sg) => ({ id: uid(), shape: 'square' as const, x: sg * HU_LEGX, y: 0, size: HU_SLOT, sh: HU_SLOT3 })); // fentes du couvercle (t en x, 9 mm en y)
  const uHandle = (name: string, group: string, yc = FANY): Plank[] => [0, 1, 2].map((i) => ({ ...wood(`${name} ${i + 1}`, HU_W, HU_H + t, [FANX, yc + (i - 1) * t, DUCT_Z1 + t + (HU_H - t) / 2], faceRot, group), poly: uPoly(HU_W, HU_H + t) })); // z : tenons de t sous la face haute du couvercle
  // la cassette est une BOÎTE CRÉNELÉE (`makeBox`, comme les autres boîtes du nichoir) : quatre parois qui s'emboîtent par leurs arêtes verticales, cadre du bas et couvercle emboîtés dans les parois ; même enveloppe que le bloc d'hiver
  const EXZ = bodyH + VENT_Z; // centre de la fenêtre de sortie
  const cbH = r2(DUCT_Z1 + t - ZB), CASS_OPEN = r2(CO - 2 * t - 9); // l'ouverture du cadre laisse 4,5 mm de bois au-delà des crans
  const cassKey: Record<string, string> = { 'Face avant': 'Cassette ventilateur 1', 'Face arrière': 'Cassette ventilateur 2', 'Côté gauche': 'Cassette ventilateur 3', 'Côté droit': 'Cassette ventilateur 4', Dessous: 'Cassette ventilateur cadre du bas', Dessus: 'Cassette ventilateur couvercle' };
  // le CONDUIT DE SORTIE fait corps avec la cassette : ses QUATRE plaques (haut, bas, gauche, droite) portent chacune deux dents de t (aux deux tiers extérieurs de leur bord côté cassette) qui s'enfoncent dans des fentes
  // de la paroi arrière, contre la fenêtre : un seul trou « en peigne » (fenêtre + les huit fentes, elles touchent la fenêtre) ; la fenêtre est assez étroite pour laisser ≥ 4,5 mm de bois entre toute fente et les crans de la paroi
  const DUCT_TEETH_W = r2(EXW / 3), WIN_BOT = r2(EXZ - VENT_H / 2 - (ZB + cbH / 2)); // largeur d'une dent (haut, bas) ; bas de la fenêtre, dans le repère de la paroi
  const DUCT_TEETH: [number, number][] = [[-EXW / 2, -EXW / 2 + DUCT_TEETH_W], [EXW / 2 - DUCT_TEETH_W, EXW / 2]].map(([a, b]) => [r2(a), r2(b)] as [number, number]); // haut et bas : abscisses depuis le centre de la fenêtre
  const DUCT_SIDE_W = r2(VENT_H / 3), DUCT_SIDE_TEETH: [number, number][] = [[-VENT_H / 2, -VENT_H / 2 + DUCT_SIDE_W], [VENT_H / 2 - DUCT_SIDE_W, VENT_H / 2]].map(([a, b]) => [r2(a), r2(b)] as [number, number]); // gauche, droite : hauteurs depuis le centre de la fenêtre
  const exitComb = (): Hole => {
    const w: [number, number, number, number] = [-EXW / 2, WIN_BOT, EXW / 2, WIN_BOT + VENT_H], zc = WIN_BOT + VENT_H / 2;
    return { id: uid(), shape: 'square' as const, x: 0, y: 0, size: EXW, sh: VENT_H, poly: rectUnion([w,
      ...DUCT_TEETH.map(([a, b]): [number, number, number, number] => [a, WIN_BOT - t, b, WIN_BOT]), // plaque du bas
      ...DUCT_TEETH.map(([a, b]): [number, number, number, number] => [a, WIN_BOT + VENT_H, b, WIN_BOT + VENT_H + t]), // plaque du haut
      ...DUCT_SIDE_TEETH.flatMap(([a, b]): [number, number, number, number][] => [[-EXW / 2 - t, zc + a, -EXW / 2, zc + b], [EXW / 2, zc + a, EXW / 2 + t, zc + b]])]) }; // plaques gauche et droite
  };
  const cassHoles = (key: string): Hole[] => key === 'Face arrière' ? [exitComb()] : key === 'Dessous' ? [{ id: uid(), shape: 'square' as const, x: 0, y: 0, size: CASS_OPEN, sh: CASS_OPEN }] : key === 'Dessus' ? [{ id: uid(), shape: 'square' as const, x: 0, y: -21, size: 12, sh: 6 }, ...uSlots()] : [];
  const cassette: Plank[] = [
    ...makeBox(CO, CO, cbH, t, fit, start).planks.map((p) => { const key = p.name.replace(/ \d+$/, ''); return { ...p, name: cassKey[key], pos: [r2(p.pos[0] + FANX), r2(p.pos[1] + FANY), r2(p.pos[2] + ZB)] as Vec3, group: elecGroup, holes: cassHoles(key) }; }),
    ...uHandle('Poignée cassette', elecGroup),
    blk("Grille de protection ventilateur 60 mm (fil d'acier)", FAN, FAN, GUARD_T, [FANX, FANY, ZB + t + GUARD_T / 2], elecGroup, '#9ca3af', { special: 'guard' as const }), // grille à doigts, ≈ 90 % ouverte, sur la face d'aspiration (côté nid) : elle sort avec la cassette ; le plafond du nid reste une ouverture nue
  ];
  const plotsAt: [number, number, number, number][] = [[FANX, FANY - FAN / 2 + 1, 12, 2], [FANX, FANY + FAN / 2 - 1, 12, 2], [FANX - FAN / 2 + 1, FANY, 2, 12], [FANX + FAN / 2 - 1, FANY, 2, 12]]; // sur le bord du cadre, hors de l'ouverture
  const plots: Plank[] = plotsAt.map(([x, y, w, h], k) => blk(`Plot caoutchouc ventilateur ${k + 1}`, w, h, FAN_PLOT, [x, y, ZB + t + GUARD_T + FAN_PLOT / 2], elecGroup, '#6b7280'));
  const fanPart: Plank = { id: uid(), name: 'Ventilateur Noctua NF-A6x25 PWM (60 × 60 × 25)', w: FAN, h: FAN, depth: FAN_T, pos: [FANX, FANY, FAN_Z] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'fan' as const, color: '#8b5a2b' };
  // sortie : une GRILLE DE CONTREPLAQUÉ 3 mm (découpée au laser) posée À PLAT contre la face extérieure de la plaque arrière, dans la fenêtre du lambris (en retrait de 2 mm de sa face) ; fentes verticales de 4 mm (évacuent l'eau, aucune > 5 mm : guêpes et rongeurs ne passent pas)
  // séparées par des barreaux de 2 mm, sur toute la hauteur de la fenêtre du ventilateur, bord plein de 3,5 mm autour de la fenêtre ; ≈ 62 % de la fenêtre reste ouverte ; pas de clapet (supprimé à la demande de l'utilisateur)
  // le BLOC ISOLANT d'hiver : même empreinte que la cassette, une pièce de rechange (cachée par défaut) qui remplace le ventilateur et comble l'ouverture du plafond
  // le bloc remplace la cassette ET son conduit de sortie : il est plus long de la longueur du conduit (jusqu'à la plaque arrière), poignée centrée sur son couvercle
  const wGroup = uid(), blockH = cbH, blockDL = DUCT_LEN > 1 ? DUCT_LEN : 0, blockL = r2(CO + blockDL), blockY = r2(FANY + blockDL / 2);
  const blockKey: Record<string, string> = { 'Face avant': "Bloc isolant d'hiver 1", 'Face arrière': "Bloc isolant d'hiver 2", 'Côté droit': "Bloc isolant d'hiver 3", 'Côté gauche': "Bloc isolant d'hiver 4", Dessous: "Bloc isolant d'hiver fond", Dessus: "Bloc isolant d'hiver couvercle" };
  const winter: Plank[] = [
    ...makeBox(CO, blockL, blockH, t, fit, start).planks.map((p) => ({ ...p, name: blockKey[p.name.replace(/ \d+$/, '')], pos: [r2(p.pos[0] + FANX), r2(p.pos[1] + blockY), r2(p.pos[2] + ZB)] as Vec3, group: wGroup, holes: /^Dessus/.test(p.name) ? uSlots() : [] })), // boîte fermée crénelée : quatre parois, fond plein (bouche l'ouverture du plafond), couvercle
    blk("Isolant bloc d'hiver", CO - 2 * t, blockL - 2 * t, blockH - 2 * t - 0.4, [FANX, blockY, ZB + blockH / 2], wGroup, '#f59e0b', { transparent: true }), // laine de bois enfermée : remplit l'intérieur
    ...uHandle("Poignée bloc d'hiver", wGroup, blockY), // comme la poignée de la cassette, centrée sur le couvercle du bloc
  ];
  // PRISE D'ORIGINE du ventilateur + RALLONGE : le câble d'origine du Noctua (≈ 30 cm, quatre fils) monte dans la cassette, traverse le couvercle par un petit passage près de son bord AVANT et finit par sa prise 4 broches femelle,
  // collée sur le bord avant du couvercle, qui dépasse devant le siège ; la prise MÂLE de la rallonge est COLLÉE sur la face avant (extérieure, côté bloc caméra) de la paroi avant du siège (« Goulotte ventilateur avant »),
  // contre son haut, dans l'espace de 10 mm entre le siège et le bloc caméra : la femelle se pose dessus à la verticale, la cassette (et sa prise) se retire par le haut ; on débranche la prise à la main, une seule fois (le câble d'origine fait 30 cm)
  // les fils de la rallonge sortent de la face avant de la prise mâle, dans cet espace, et CONTOURNENT le siège par l'ouest ou par l'est (jamais par-dessus la cassette, ni dans l'ouverture du plafond, ni derrière le conduit de sortie)
  const LID = DUCT_Z1 + t, PLUG_FY = FY0, PW = 10.2, PX = (k: number) => r2(FANX + (1.5 - k) * 2.54), ZL = (j: number) => r2(DUCT_Z1 + 0.3 - 1.4 * j), yG = r2(FY0 - 8), HOLE_Y = -21; // + (rouge), PWM (bleu), tachymètre (jaune), − (noir) : de l'est à l'ouest ; ZL = niveaux des cinq fils, yG = leur ordonnée dans l'espace devant le siège
  const connection: Plank[] = [
    blk("Prise 4 broches du ventilateur (d'origine, femelle)", PW, 6, 6, [FANX, PLUG_FY, r2(DUCT_Z1 + 3.5)], elecGroup, '#111827'), // sur le couvercle de la cassette, dépasse de 6 mm devant elle, juste au-dessus de la prise mâle
    blk('Rallonge ventilateur 4 broches : prise mâle (mâle ⇄ femelle, câble ≈ 300 mm)', PW, 6, 6, [FANX, r2(PLUG_FY - 3), r2(DUCT_Z1 - 2.5)], elecGroup, '#374151'), // collée sur la face avant de la paroi avant du siège
  ];
  // module interrupteur 12 V (côté +), près du Wago + : le Noctua tourne encore à ≈ 20 % quand le PWM est à 0 %, il faut pouvoir couper son 12 V ; côté + (pas la masse) : une masse coupée ferait remonter 12 V dans les fils PWM / tachymètre
  wedgeNeed.push(31, 31, 17, 17); // besoin en cales de l'interrupteur
  const swFan: Plank[] = [
    part('Module interrupteur 12 V ventilateur (côté +, commande 3,3 V)', 17, 25, 8, SWX, SWY, topZ + 3 + 4, 'block', '#7e22ce'),
  ];
  // fils : côté cassette (câble d'origine du ventilateur : quatre fils du ventilateur par le trou du couvercle jusqu'à la prise femelle), côté toit (de la prise mâle au module, au Wago − et au Pi, en contournant le siège)
  const cw = (nm: string, color: string, k: number): Plank => wire(nm, color, ([[PX(k), FANY + HOLE_Y, FAN_Z + FAN_T / 2], [PX(k), FANY + HOLE_Y, FAN_Z + FAN_T / 2 + 4], [PX(k), FANY + HOLE_Y, DUCT_Z1 - 4], [PX(k), FANY + HOLE_Y, LID + 1.2], [PX(k), CASS_Y0 + 3, LID + 1.2], [PX(k), CASS_Y0 - 1.5, LID + 1.2]] as Vec3[]).map((q) => q.map(r2) as Vec3), k === 0 || k === 3 ? 1.6 : 1.2); // points au centième : la cassette se range et se remet en place sans écart
  const plugExit = (k: number, j: number): Vec3[] => [[PX(k), r2(PLUG_FY - 4), ZL(j)], [PX(k), yG, ZL(j)]]; // de la prise mâle, par sa face avant, dans l'espace devant le siège
  // les fils vers le Pi quittent la prise mâle vers l'OUEST dans l'espace devant le siège (à un niveau chacun, sous la pente), puis descendent à l'ouest du siège et longent le Pi jusqu'à leur broche ;
  // les broches 12 et 14 (rangée extérieure) sont abordées par l'ouest, la 11 et la 13 par l'est
  const toPi = (nm: string, color: string, j: number, pre: Vec3[], yN: number, idx: number, py: number, west: boolean, hN: number, d = 1.2): Plank => {
    const [xp, yp] = pw(PI_PIN_X0 + idx * 2.54, py), hS = topZ + 36 + 3 * j, xl = -64 - 3 * j;
    const pts = ([...pre, [xl, yN, hN], [xl, yN, hS], ...(west ? [[xl, 33.5 + 1.5 * j, hS], [-96 - j, 33.5 + 1.5 * j, hS], [-96 - j, yp, hS]] : [[xl, yp, hS]]), [xp, yp, hS], [xp, yp, piZ + 8], [xp, yp, piZ + 3.5]] as Vec3[]).filter((q, i, all) => i === 0 || q.some((v, k) => v !== all[i - 1][k])); // sans point double (la courbe lissée se tordrait)
    return wire(nm, color, pts, d);
  };
  const fanWires: Plank[] = [
    cw('Fil cassette + (rouge)', '#dc2626', 0), cw('Fil cassette PWM (bleu)', '#2563eb', 1), cw('Fil cassette tachymètre (jaune)', '#eab308', 2), cw('Fil cassette − (noir)', '#111827', 3),
    wire('Fil Wago + → interrupteur ventilateur (rouge)', '#dc2626', [...wgEnd(wgPort(WGP_Y, 3, 0), [[r2(WGF - 29), r2(WGP_Y + 17.5), topZ + 14], [r2(WGF - 29), wgPort(WGP_Y, 3, 0), WG_Z]]).reverse(), [SWX + 4, SWY - 17, topZ + 15], [SWX + 4, SWY - 12.5, topZ + 11.5]] as Vec3[], 1.6),
    // 12 V commuté : de l'interrupteur, par le couloir à l'est du siège (x = CONX, entre le siège et la gaine), jusqu'à l'espace devant le siège puis la prise mâle
    wire('Fil interrupteur → ventilateur + (rouge)', '#dc2626', [[SWX - 3, SWY + 10, topZ + 11.5], [SWX - 6, YREAR - 1.5, topZ + 14], [SWX - 6, YREAR - 1.5, ZL(0)], [CONX, YREAR - 3, ZL(0)], [CONX, yG, ZL(0)], ...plugExit(0, 0).reverse()] as Vec3[], 1.6),
    wire('Fil ventilateur − (noir)', '#111827', [...plugExit(3, 3), [CONX - 2, yG, ZL(3)], [CONX - 2, r2(WGP_Y - 8.5), ZL(3)], [CONX - 2, r2(WGP_Y - 8.5), topZ + 9], [CONX, r2(WGP_Y - 8.5), topZ + 9], ...wgEnd(wgPort(WGM_Y, 5, 1), [[r2(WGF - 25.2), r2(WGP_Y - 11), topZ + 9], [r2(WGF - 25.2), wgPort(WGM_Y, 5, 1), WG_Z]])] as Vec3[], 1.6),
    wire('Fil masse interrupteur → Wago − (noir)', '#111827', [[SWX - 2, SWY - 12.5, topZ + 11.5], [SWX - 4, SWY - 16, topZ + 14], [r2(WGF + 2.8), r2(WGP_Y + 11.5), topZ + 22], [r2(WGF - 20.7), r2(WGP_Y + 11.5), topZ + 22], ...wgEnd(wgPort(WGM_Y, 5, 0), [[r2(WGF - 20.7), wgPort(WGM_Y, 5, 0), WG_Z]])] as Vec3[], 1.6),
    toPi('Fil PWM ventilateur (bleu)', '#2563eb', 1, plugExit(1, 1), yG, 5, PI_PIN_Y, true, ZL(1)),
    toPi('Fil tachymètre ventilateur (jaune)', '#eab308', 2, plugExit(2, 2), yG, 5, PI_PIN_Y - 2.54, false, ZL(2)),
    toPi('Fil masse commune ventilateur (noir)', '#111827', 3, plugExit(3, 4), yG, 6, PI_PIN_Y, true, ZL(4)),
    // GPIO27 (broche 13) : de l'interrupteur, par le couloir à l'est du siège (x = CONX + 2), puis devant le siège vers l'ouest (plus par-dessus la cassette)
    toPi('Fil commande interrupteur ventilateur (orange)', '#f97316', 0, [[SWX + 3, SWY + 10, topZ + 11.5], [SWX + 4, YREAR - 6.5, topZ + 19], [CONX + 2, YREAR - 6.5, topZ + 19], [CONX + 2, yG - 1, topZ + 19], [CONX + 2, yG - 1, topZ + 36]], yG - 1, 6, PI_PIN_Y - 2.54, false, topZ + 36),
  ];
  // CONDUIT DE SORTIE : petit tube de contreplaqué (makeBox sans ses deux faces avant / arrière : quatre plaques crénelées) FIXE, collé à la face intérieure de la plaque arrière autour de sa fenêtre ;
  // la cassette (descendue par le haut) s'appuie sur son autre bout : fenêtre de la cassette, intérieur du conduit et fenêtre de la plaque ont la même section EXW × VENT_H
  const exitDuct: Plank[] = DUCT_LEN > 1 ? makeBox(EXW + 2 * t, DUCT_LEN, VENT_H + 2 * t, t, fit, start).planks.filter((p) => !/^Face/.test(p.name)).map((p) => {
    const cast = Object.fromEntries(Object.entries(p.cast ?? {}).filter(([e]) => (/^Côté/.test(p.name) ? e === 'top' || e === 'bottom' : e === 'left' || e === 'right'))); // les arêtes qui touchaient les faces retirées restent droites
    const key = /^Côté droit/.test(p.name) ? 'Conduit de sortie 1' : /^Côté gauche/.test(p.name) ? 'Conduit de sortie 2' : /^Dessus/.test(p.name) ? 'Conduit de sortie 3' : 'Conduit de sortie 4';
    const q = recastAll({ ...p, name: key, cast, notches: [], pos: [r2(p.pos[0] + FANX), r2(p.pos[1] + (CASS_Y1 + YREAR) / 2), r2(p.pos[2] + EXZ - VENT_H / 2 - t)] as Vec3, group: elecGroup, holes: [] }, t, fit); // groupe de la cassette : le conduit sort avec elle
    // dents de t qui dépassent du bord côté cassette (le plus près de −y) et entrent dans les fentes de la paroi arrière de la cassette (« exitComb ») : haut / bas = bord le plus bas du contour (axe y), côtés = bord le plus à gauche (axe x, la plaque est couchée : x local = y du monde)
    const side = key === 'Conduit de sortie 1' || key === 'Conduit de sortie 2', axis = side ? 0 : 1, c = 1 - axis, pts = outline(q), edge = Math.min(...pts.map((pt) => pt[axis])), poly: Pt[] = [];
    const teeth = side ? DUCT_SIDE_TEETH : DUCT_TEETH;
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length]; poly.push(a);
      if (Math.abs(a[axis] - edge) < 1e-6 && Math.abs(b[axis] - edge) < 1e-6 && Math.abs(b[c] - a[c]) > 1e-6) {
        const up = b[c] > a[c], lo = Math.min(a[c], b[c]), hi = Math.max(a[c], b[c]);
        for (const [t0, t1] of (up ? teeth : [...teeth].reverse())) {
          if (t0 < lo - 1e-6 || t1 > hi + 1e-6) continue;
          const [p0, p1] = up ? [t0, t1] : [t1, t0], at = (cv: number, ax: number): Pt => (axis === 1 ? [cv, ax] : [ax, cv]);
          poly.push(at(p0, edge), at(p0, edge - t), at(p1, edge - t), at(p1, edge));
        }
      }
    });
    return { ...q, poly: poly.map(([x, y]) => [r2(x), r2(y)] as Pt) };
  }) : [];
  const fanSet: Plank[] = [fanPart, ...plots, ...swFan, ...connection, ...fanWires, ...cassette.filter((p) => p.group === elecGroup), ...winter];
  const fanWood: Plank[] = [...seat, ...exitDuct, ...cassette.filter((p) => p.group === roofGroup)];
  // ===== PRISE D'AIR BASSE =====
  // le conduit est une vraie BOÎTE crénelée comme celles du nichoir (`makeBox`), ouverte en dessous : quatre parois qui s'emboîtent par des dents verticales et un couvercle qui s'emboîte dans leur haut
  const ZB0 = t, airHt = r2(AIR_ZTOP - ZB0); // le bas des parois (droit, sans dents) est posé sur le dessus du fond (« Dessous ext ») ; pas de crénelage avec le fond
  const airKey: Record<string, string> = { 'Côté gauche': "Conduit d'air 1", 'Côté droit': "Conduit d'air 2", 'Face avant': "Conduit d'air 3", 'Face arrière': "Conduit d'air 4", Dessus: "Conduit d'air 5 (couvercle)" };
  const airWood: Plank[] = [...makeBox(AIR_LX, AIR_LY, airHt, t, fit, start).planks.filter((p) => !/^Dessous/.test(p.name)).map((p) => {
    const key = airKey[p.name.replace(/ \d+$/, '')], cast = { ...(p.cast ?? {}) }, wall = key !== "Conduit d'air 5 (couvercle)"; if (wall) delete cast.bottom; // ouvert en dessous, bas droit : aucune dent dans le fond (« Dessous ext » n'a qu'une ouverture)
    let q = recastAll({ ...p, name: key, pos: [r2(p.pos[0] + AIR_CX), r2(p.pos[1] + AIR_CY), r2(p.pos[2] + ZB0)] as Vec3, group, cast, notches: wall ? p.notches.filter((x) => x.edge !== 'bottom') : p.notches }, t, fit);
    if (key === "Conduit d'air 2") q = { ...q, holes: [fitHole(q, { id: uid(), shape: 'square' as const, x: 0, y: r2(AIR_ZS - q.pos[2]), size: AIR_SW, sh: AIR_SH }), fitHole(q, { id: uid(), shape: 'square' as const, x: r2((DRAIN_HOLE[0] + DRAIN_HOLE[1]) / 2), y: r2(DRAIN_Z + DRAIN_H / 2 - q.pos[2]), size: DRAIN_HOLE[1] - DRAIN_HOLE[0], sh: DRAIN_H })] }; // côté nid : la fente, en face de la grille de la paroi intérieure, et l'ouverture d'évacuation de l'eau, au ras du plancher intérieur (rien dedans)
    return q;
  }),
  ];
  // SOUS-BOÎTE isolante (bouchon de la prise d'air, pièce de rechange) : boîte fermée crénelée (`makeBox` : quatre parois, fond plein, couvercle), extérieur PILE l'intérieur libre du conduit (jeu 0) : elle tient en force, aucun verrou ;
  // son fond est À FLEUR du dessous du nichoir (z = 0), elle monte jusqu'à 0,8 mm sous le couvercle du conduit ; la paroi côté fente est pleine ; la laine est enfermée ; une languette de saisie (3 mm) est collée sous le fond
  const PB_W = AIR_LX - 2 * t, PB_L = AIR_LY - 2 * t, PB_TOP = r2(AIR_ZTOP - t - 0.8), PB_HW = PB_TOP;
  const pbKey: Record<string, string> = { 'Côté gauche': "Bouchon-boîte prise d'air 1", 'Côté droit': "Bouchon-boîte prise d'air 2", 'Face avant': "Bouchon-boîte prise d'air 3", 'Face arrière': "Bouchon-boîte prise d'air 4", Dessus: "Bouchon-boîte prise d'air couvercle", Dessous: "Bouchon-boîte prise d'air fond" };
  const pbWalls: Plank[] = makeBox(PB_W, PB_L, PB_HW, t, fit, start).planks.map((p) => recastAll({ ...p, name: pbKey[p.name.replace(/ \d+$/, '')], pos: [r2(p.pos[0] + AIR_CX), r2(p.pos[1] + AIR_CY), r2(p.pos[2])] as Vec3, group: wGroup }, t, fit));
  // le bouchon s'insère par le dessous : sa poignée est SOUS le fond (U retourné : barre en bas, pieds vers le haut, tenons affleurant la face intérieure du fond)
  const PB_UW = 30, PB_UY = r2((PB_UW - HU_LEG) / 2), pbFond = pbWalls.find((p) => /fond$/.test(p.name))!;
  pbFond.holes = [...pbFond.holes, ...[-1, 1].map((sg) => ({ id: uid(), shape: 'square' as const, x: 0, y: sg * PB_UY, size: HU_SLOT3, sh: HU_SLOT }))]; // fentes du fond : les pieds du U y sont incrustés
  const woolH = r2(PB_TOP - 2 * t - 0.4);
  const plugBox: Plank[] = [...pbWalls, ...[0, 1, 2].map((i) => ({ ...wood(`Poignée bouchon prise d'air ${i + 1}`, PB_UW, PLUG_HANDLE + t, [AIR_CX + (i - 1) * t, AIR_CY, (t - PLUG_HANDLE) / 2], sideRot, wGroup), poly: uPoly(PB_UW, PLUG_HANDLE + t).map(([x, y]): Pt => [x, -y]).reverse() })), blk("Laine bouchon prise d'air", PB_W - 2 * t, PB_L - 2 * t, woolH, [AIR_CX, AIR_CY, t + 0.2 + woolH / 2], wGroup, '#f59e0b', { transparent: true })];
  // le conduit est COLLÉ au nid (demande de l'utilisateur : la bouche basse sert aussi d'évacuation) : sa paroi côté nid touche la face extérieure de « Côté gauche int » (jeu 0), sa fente 34 × 30 tombe en face de la grille de la paroi : il débouche dans le nid ; plus de manchon
  // la grille d'aération du corps est percée dans la paroi intérieure elle-même (« Côté gauche int » : fentes verticales de 4 mm, barreaux de 2 mm) ; plus de clapet (supprimé à la demande de l'utilisateur) : la prise d'air reste ouverte, la sous-boîte isolante la bouche en hiver
  // système solaire (groupe « Solaire ») : un panneau de 100 W DÉPORTÉ à côté du nichoir, sans piquet en bois (support métallique non dessiné), incliné de 35° et tourné vers l'avant (« le sud »),
  // et un câble qui rejoint le régulateur dans le toit (la batterie et le régulateur sont dans le toit)
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
  // habillage (groupe spécial « Habillage ») : un pourtour en lambris de 10 mm d'épaisseur qui descend de 10 mm sous le nichoir, et un toit en okoumé qui déborde

  // un lambris = une plaque de contreplaqué okoumé de LAM_T (`material: 'okoume'`, `depth` = épaisseur), peinte en blanc ; contour 2D = rectangle ou polygone (haut en diagonale sur les côtés)
  const LAM_COLOR = OKOUME_COLOR;
  const sidePlate = (name: string, xc: number, ya: number, yb: number, zBot: number, zTopA: number, zTopB: number): Plank => { // plaque verticale d'un côté : x local = y monde, y local = z monde
    const cy = (ya + yb) / 2, zc = (zBot + Math.max(zTopA, zTopB)) / 2;
    return { id: uid(), name, w: r2(yb - ya), h: r2(Math.max(zTopA, zTopB) - zBot), depth: LAM_T, pos: [xc, r2(cy), r2(zc)] as Vec3, rot: rotFromBasis([0, 1, 0], [0, 0, 1]), notches: [], holes: [], group: lamGroup, material: 'okoume' as const, color: LAM_COLOR,
      poly: [[ya - cy, zBot - zc], [yb - cy, zBot - zc], [yb - cy, zTopB - zc], [ya - cy, zTopA - zc]].map(([x, y]) => [r2(x), r2(y)] as [number, number]) };
  };
  const lambris: Plank[] = n.lambris ? (() => {
    const xe = W / 2, ye = D / 2, span = W + 2 * LAM_T, k0 = Math.max(1, Math.round(span / LAM_W)), k = k0 % 2 ? k0 : (k0 > 1 && Math.abs(span / (k0 - 1) - LAM_W) < Math.abs(span / (k0 + 1) - LAM_W) ? k0 - 1 : k0 + 1), kd = Math.max(1, Math.round(D / LAM_W)), sx = (2 * xe + 2 * LAM_T) / k, sy = (2 * ye) / kd; // façade et arrière : W + 2·LAM_T (elles recouvrent les bouts des côtés) ; côtés : D ; une largeur fixe par face // k IMPAIR : une lame est centrée sur x = 0 et porte le trou d'envol (avec k pair un joint tombait au milieu et la façade n'était pas percée)
    const fx0 = -(xe + LAM_T), bx0l = -(xe + LAM_T), ry0 = -ye, ly0 = -ye; // début des lames : façade et arrière de −(xe + LAM_T) à xe + LAM_T, côtés de −ye à ye
    const out: Plank[] = [];
    // les lames MONTENT JUSQU'AU TOIT : à plat sur la façade (hauteur Hf du toit) et l'arrière (Hb), en DIAGONALE sur les côtés (elles suivent le haut des côtés du toit) ;
    // les COINS sont à JOINT PLAT : la façade et l'arrière recouvrent les bouts des lames des côtés (demande de l'utilisateur) ; même largeur sur la façade et l'arrière, une autre largeur sur les côtés
    const frontTop = n.pente ? r2(bodyH + Hf - LAM_T * (Hb - Hf) / D - LAM_FRONT_GAP) : roofTop, // devant : le pan en okoumé descend vers l'avant ; le haut de la façade reste sous son dessous (au droit du bord extérieur), avec un jeu
      backTop = n.pente ? bodyH + Hb : roofTop;
    const slope = n.pente ? (Hb - Hf) / (2 * ye) : 0, sideA = n.pente ? bodyH + Hf + ye * slope : roofTop; // z = sideA + slope · y sur les côtés
    for (let i = 0; i < kd; i++) { // côtés gauche et droit : lames le long de y
      const ry0i = ry0 + i * sy, ry1i = ry0 + (i + 1) * sy, ly0i = ly0 + i * sy, ly1i = ly0 + (i + 1) * sy; // côtés : de −ye à ye, entre la façade et l'arrière
      out.push(sidePlate(`Lambris droite ${i + 1}`, r2(xe + LAM_T / 2), ry0i, ry1i, -LAM_DOWN, sideA + slope * ry0i, sideA + slope * ry1i));
      out.push(sidePlate(`Lambris gauche ${i + 1}`, r2(-xe - LAM_T / 2), ly0i, ly1i, -LAM_DOWN, sideA + slope * ly0i, sideA + slope * ly1i));
    }
    // BANDE COMMUNE des fenêtres de l'habillage arrière : la fenêtre de sortie du ventilateur et celle des prises du Pi s'arrêtent et reprennent aux MÊMES hauteurs, pour que toutes les lames s'interrompent au même niveau
    const BAND_Z0 = bodyH + Math.min(VENT_Z0 - 4, PORT_Z0 - 4), BAND_Z1 = bodyH + Math.max(VENT_Z0 + VENT_H + 4, PORT_Z1 + 4);
    const windows: [number, number, number, number][] = n.pente ? [...VENT_XS.map((vx): [number, number, number, number] => [vx - (VENT_W + 8) / 2, BAND_Z0, vx + (VENT_W + 8) / 2, BAND_Z1]), [FANX - EXW / 2 - 4, BAND_Z0, FANX + EXW / 2 + 4, BAND_Z1] as [number, number, number, number], ...(n.cam > 0 ? [[PORT_X0 - 4, BAND_Z0, PORT_X1 + 4, BAND_Z1] as [number, number, number, number]] : [])] : []; // fenêtres de l'habillage arrière : toutes sur la même bande en hauteur
    // les fenêtres sont AIMANTÉES aux joints entre lames et entre elles (à moins de 6 mm) : sinon il restait des lamelles de 2 ou 3 mm entre une fenêtre et un joint, ou entre deux fenêtres
    const jointsB = Array.from({ length: k - 1 }, (_, i) => bx0l + (i + 1) * sx);
    const snapWins = (ws: [number, number, number, number][], joints: number[]) => {
      for (const w of ws) for (const j of joints) { if (Math.abs(w[0] - j) < 10) w[0] = j; if (Math.abs(w[2] - j) < 10) w[2] = j; }
      for (const a of ws) for (const b of ws) { if (a !== b && Math.abs(a[2] - b[0]) < 10) b[0] = a[2]; }
    };
    snapWins(windows, jointsB);
    for (const x of RIB_XS) windows.push([x - RIB_T / 2 - 0.25, RIB_Z0 - 1, x + RIB_T / 2 + 0.25, RIB_Z1 + 1]); // les nervures de fixation traversent les lames arrière par une fente de 3,5 (ajoutées APRÈS l'aimantation : une fente de 3,5 ne doit pas être élargie jusqu'au joint)
    // façade et arrière : CHAQUE LAME EST UNE SEULE PLANCHE de largeur fixe (sx), percée de ses fenêtres (trous rectangulaires) ; une fenêtre qui mord sur le bord d'une lame
    // devient une encoche de ce bord ; seule une fenêtre qui traverse TOUTE la largeur d'une lame (la grande aération) la coupe en deux planches (dessous / dessus)
    type R = [number, number, number, number];
    const LAM_STUB = 15; // hauteur minimale du bois laissé au-dessus d'une fenêtre
    const lame = (name: string, xa: number, xb: number, yFace: number, zBot: number, zTop0: number, wins: R[], round: { x: number; z: number; d: number } | null) => {
      const E = 0.01;
      // une fenêtre qui laisserait au-dessus d'elle un bout de bois de moins de LAM_STUB mm de haut : la lame s'arrête au BAS de la fenêtre (haut plat sur toute la largeur, plus de languette ni de lambeau)
      const stubs = wins.filter(([wa, za, wb, zb]) => Math.min(wb, xb) - Math.max(wa, xa) >= 15 && za > zBot + 1 && za < zTop0 && zTop0 - zb > E && zTop0 - zb < LAM_STUB);
      const zTop = stubs.length ? Math.min(...stubs.map((w) => w[1])) : zTop0;
      const clipped: R[] = wins.map(([wa, za, wb, zb]): R => [Math.max(wa, xa), Math.max(za, zBot), Math.min(wb, xb), Math.min(zb, zTop)]).filter(([wa, za, wb, zb]) => wb - wa > E && zb - za > E);
      const full = clipped.filter(([wa, , wb]) => wa <= xa + E && wb >= xb - E).sort((p, q) => p[1] - q[1]); // traversent toute la lame : la coupent en morceaux selon z
      const zs: [number, number][] = []; let z = zBot;
      for (const [, za, , zb] of full) { if (za - z > 1) zs.push([z, za]); z = Math.max(z, zb); }
      if (zTop - z > 1) zs.push([z, zTop]);
      zs.forEach(([z0, z1], kk) => {
        const here = clipped.filter(([wa, za, wb, zb]) => !(wa <= xa + E && wb >= xb - E) && zb > z0 + E && za < z1 - E).map(([wa, za, wb, zb]): R => { const side = wa <= xa + E || wb >= xb - E; return [wa, side && za <= z0 + 1 ? z0 : Math.max(za, z0 + 1), wb, side && zb >= z1 - 1 ? z1 : Math.min(zb, z1 - 1)]; }); // une fenêtre de bord qui touche la coupe d'une autre fenêtre va jusqu'au bord (pas de lamelle de 1 mm)
        const left = here.filter(([wa]) => wa <= xa + E).sort((p, q) => p[1] - q[1]), right = here.filter(([, , wb]) => wb >= xb - E).sort((p, q) => p[1] - q[1]);
        const inner = here.filter(([wa, , wb]) => wa > xa + E && wb < xb - E);
        const cx = (xa + xb) / 2, cz = (z0 + z1) / 2;
        const poly: [number, number][] = [[xa, z0], [xb, z0]];
        for (const [wa, za, , zb] of right) poly.push([xb, za], [wa, za], [wa, zb], [xb, zb]);
        poly.push([xb, z1], [xa, z1]);
        for (const [, za, wb, zb] of [...left].reverse()) poly.push([xa, zb], [wb, zb], [wb, za], [xa, za]);
        const holes: Hole[] = inner.map(([wa, za, wb, zb]) => ({ id: uid(), shape: 'square' as const, x: r2((wa + wb) / 2 - cx), y: r2((za + zb) / 2 - cz), size: r2(wb - wa), sh: r2(zb - za) }));
        if (round && round.z > z0 && round.z < z1) holes.push({ id: uid(), shape: 'round' as const, x: r2(round.x - cx) || 0, y: r2(round.z - cz), size: round.d });
        out.push({ id: uid(), name: `${name}${zs.length > 1 ? '.' + (kk + 1) : ''}`, w: r2(xb - xa), h: r2(z1 - z0), depth: LAM_T, pos: [r2(cx), yFace, r2(cz)] as Vec3, rot: rotFromBasis([1, 0, 0], [0, 0, 1]), notches: [], holes, group: lamGroup, material: 'okoume' as const, color: LAM_COLOR,
          poly: poly.map(([x, y]) => [r2(x - cx), r2(y - cz)] as [number, number]) });
      });
    };
    for (let i = 0; i < k; i++) {
      const x0 = fx0 + i * sx, x1 = fx0 + (i + 1) * sx, centre = x0 < 0 && x1 > 0; // façade : la lame qui porte le centre de l'entrée est percée du trou d'envol
      const bx0i = bx0l + i * sx, bx1i = bx0l + (i + 1) * sx; // arrière : décalé d'une épaisseur (recouvre le coin droit)
      lame(`Lambris avant ${i + 1}${centre ? ' (percé)' : ''}`, x0, x1, -ye - LAM_T / 2, -LAM_DOWN, frontTop, [], centre ? { x: 0, z: holeZ, d: n.hole } : null);
      lame(`Lambris arrière ${i + 1}`, bx0i, bx1i, ye + LAM_T / 2, -LAM_DOWN, backTop, windows, null);
    }
    // TOIT EN OKOUMÉ : DEUX plaques de contreplaqué okoumé de 5 mm collées l'une sur l'autre (10 mm ; NON peintes : l'utilisateur les huile ou les sature pour l'extérieur), posées sur la diagonale des côtés du toit ;
    // elles débordent de 60 mm devant (abri de l'entrée) et de 30 mm seulement sur les côtés et derrière ; découpées au laser sur « Planche okoumé 5 mm » avec les lames de l'habillage.
    // (A) « plaque crénelée » (dessous) : reçoit par des fentes les dents des QUATRE BAGUETTES de contreplaqué 3 mm collées dessous, qui s'emboîtent dans l'ouverture du caisson (jeu 0) ; dents de 5 mm = l'épaisseur de A (affleurantes) ; elle porte aussi le CANAL de la nappe.
    // (B) « plaque pleine » (dessus) : sans trou ni fente, collée sur A : elle ferme le canal et les fentes (étanche, rien ne se voit de dessus). Faces avant / arrière : dents aux deux bouts (nombre impair) ; faces gauche / droite : ENTRE les dents des bouts (phase 1),
    // pour que les fentes ne se touchent jamais aux coins ; la baguette avant omet les dents qui tomberaient dans le canal (+ 3 mm de bois de chaque côté).
    if (n.pente) {
      const OVF = PAN_OVF, OVS = PAN_OVS, OVB = PAN_OVB, ang = PAN_ANG, sinA = PAN_SIN, cosA = PAN_COS, yMid = PAN_YMID, zl = panZl;
      const rotA: Vec3 = [r2((ang * 180) / Math.PI), 0, 0];
      const BG_BODY = 10, BG_TOOTH = OKOUME_T; // corps de la baguette sous le pan, dents au-dessus : elles traversent la plaque crénelée (OKOUME_T) et affleurent son dessus, que la plaque pleine recouvre
      const nU: Vec3 = [0, -sinA, cosA], uU: Vec3 = [0, cosA, sinA]; // normale du pan (vers le haut) et sens de la pente (vers l'arrière)
      const under = (x: number, s: number, h: number): Vec3 => [r2(x), r2(yMid + s * cosA + h * nU[1]), r2(zl(yMid) + s * sinA + h * nU[2])]; // point à l'abscisse s (le long de la pente, depuis le milieu du pan) et à la hauteur h au-dessus du dessous du pan
      const RW = W - 2 * t; // largeur libre du caisson ; le long de la pente : de s0 (face intérieure de la plaque avant) à s1 (plaque arrière, moins la pente du corps de la baguette)
      const s0 = PAN_S0, s1 = (D / 2 - t - BG_BODY * sinA - yMid) / cosA;
      const hMid = (BG_TOOTH - BG_BODY) / 2;
      const slots: Hole[] = [];
      const chanX0 = cam2SX - CHAN_W / 2 - 3, chanX1 = cam2SX + CHAN_W / 2 + 3; // zone du canal + 3 mm de ligament : aucune dent de la baguette avant dedans
      const strip = (name: string, len: number, teethAt: 0 | 1, skipChan: boolean, rot: Vec3, centre: Vec3, slot: (i: number, seg: number, nSeg: number) => Hole): void => {
        const nSeg = teethFor(len), seg = len / nSeg, xs = (i: number) => -len / 2 + i * seg, top = BG_TOOTH - hMid, bottom = -BG_BODY - hMid, shoulder = -hMid; // contour dans le repère de la plaque (y vers le pan)
        const poly: [number, number][] = [[-len / 2, bottom], [len / 2, bottom], [len / 2, shoulder]];
        for (let i = nSeg - 1; i >= 0; i--) { const tooth = i % 2 === teethAt && !(skipChan && xs(i + 1) > chanX0 && xs(i) < chanX1); if (tooth) { poly.push([xs(i + 1), shoulder], [xs(i + 1), top], [xs(i), top], [xs(i), shoulder]); slots.push(slot(i, seg, nSeg)); } }
        poly.push([-len / 2, shoulder]);
        // points doublons (bout de baguette en dent) et colinéaires retirés : contour propre
        const dedup = poly.filter((p, k) => k === 0 || p[0] !== poly[k - 1][0] || p[1] !== poly[k - 1][1]), clean = dedup.filter((p, k) => { const q = dedup[k - 1], r = dedup[k + 1]; return !(q && r && p[1] === q[1] && p[1] === r[1]); }).map(([x, y]) => [r2(x), r2(y)] as [number, number]);
        out.push({ id: uid(), name, w: r2(len), h: BG_BODY + BG_TOOTH, pos: centre, rot, notches: [], holes: [], poly: clean, group: coverGroup });
      };
      // baguettes avant et arrière : toute la largeur ; latérales : entre elles
      const sF = s0 + t / 2, sB = s1 - t / 2, sMid = (s0 + s1) / 2, lenSide = s1 - s0 - 2 * t, xSide = W / 2 - t - t / 2;
      const rotFB = rotFromBasis([1, 0, 0], nU), rotLR = rotFromBasis(uU, nU);
      const slotFB = (sC: number) => (i: number, seg: number): Hole => ({ id: uid(), shape: 'square', x: r2(-RW / 2 + (i + 0.5) * seg), y: r2(sC), size: r2(seg + fit), sh: r2(t + fit) }); // fente du pan : repère du pan (x monde, y le long de la pente depuis son milieu)
      const slotLR = (xC: number) => (i: number, seg: number): Hole => ({ id: uid(), shape: 'square', x: r2(xC), y: r2(s0 + t + (i + 0.5) * seg), size: r2(t + fit), sh: r2(seg + fit) });
      strip('Baguette couvercle avant', RW, 0, n.cam2, rotFB, under(0, sF, hMid), slotFB(sF));
      strip('Baguette couvercle arrière', RW, 0, false, rotFB, under(0, sB, hMid), slotFB(sB));
      strip('Baguette couvercle gauche', lenSide, 1, false, rotLR, under(-xSide, sMid, hMid), slotLR(-xSide));
      strip('Baguette couvercle droite', lenSide, 1, false, rotLR, under(xSide, sMid, hMid), slotLR(xSide));
      const chan: Hole[] = n.cam2 ? [{ id: uid(), shape: 'square', x: cam2SX, y: r2((PAN_SA + PAN_SB) / 2), size: CHAN_W, sh: r2(PAN_SB - PAN_SA + 2 * CHAN_END), r: 8 }] : []; // canal oblong : de l'à-plomb de la caméra 2 jusque dans le caisson
      const pan = (name: string, h: number, holes: Hole[]): Plank => ({ id: uid(), name, w: r2(W + 2 * OVS), h: r2((D + OVF + OVB) / cosA), depth: OKOUME_T, material: 'okoume' as const, color: OKOUME_NATURAL, pos: [0, r2(yMid - sinA * h), r2(zl(yMid) + cosA * h)] as Vec3, rot: rotA, notches: [], holes, group: coverGroup }); // h = hauteur du milieu de la plaque au-dessus du dessous du pan
      out.push(pan('Toit en okoumé (plaque crénelée)', OKOUME_T / 2, [...slots, ...chan]), pan('Toit en okoumé (plaque pleine)', OKOUME_T * 1.5, []));
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
  if (n.cam > 0) oakHoles.push([CAMX0, CAM_Y - n.cam / 2, CAMX1, CAM_Y + n.cam / 2]);
  const oak: Plank[] = n.chene
    ? carve([-(W / 2 + OV_OAK), -(D / 2 + OV_OAK), W / 2 + OV_OAK, D / 2 + OV_OAK], oakHoles).map(([x0, y0, x1, y1], k): Plank => (
      { id: uid(), name: `Planche chêne ${k + 1}`, w: r2(x1 - x0), h: r2(y1 - y0), depth: OAK, pos: [r2((x0 + x1) / 2), r2((y0 + y1) / 2), r2(roofTop + OAK / 2)] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: roofGroup, special: 'block' as const, color: '#c4a574' }))
    : [];
  // BAGUETTES DE CALE : à la place des petites cales de bois collées contre les composants, de longues baguettes de contreplaqué 3 mm, de la longueur maximale qui tient sur la planche, que l'on coupe à la demande au montage ;
  // le TRIPLE du besoin ; rangées au sol, côte à côte, à gauche des pièces d'hiver (hors du nichoir, jamais sous lui)
  const stripGroup = uid();
  const stripCount = Math.ceil((STRIP.spare * wedgeNeed.reduce((a, b) => a + b, 0)) / STRIP.length);
  const strips: Plank[] = Array.from({ length: stripCount }, (_, k): Plank => ({ id: uid(), name: `Baguette de cale ${k + 1}`, w: STRIP.length, h: STRIP.width, pos: [r2(-W / 2 - SPARE_GAP - 60 - k * STRIP.pitch), 0, r2(t / 2)] as Vec3, rot: [0, 0, 90] as Vec3, notches: [], holes: [], group: stripGroup }));
  const planks = [
    ...oak,
    ...lambris, ...pitched,
    ...solar, ...brackets, ...mounts, ...keys,
    ...camBox, ...cable2, ...wires2, ...ledSwitch,
    ...power, ...solarElec,
    ...sensorSet, ...probeSet, ...fanSet, ...fanWood, ...airWood, ...plugBox,
    ...insulation,
    ...entry,
    ...strips,
    ...slotted.map((p) => ({ ...p, group, name: p.name.replace(/ (\d+)$/, ' ext $1') })),
    { ...floorSlotted, group },
    ...innerParts.map((p) => ({ ...p, name: p.name.replace(/ (\d+)$/, ' int $1') })),
    ...roofParts, ...frames, ...camParts, ...camera, ...pi, ...cable, ...wires,
    { id: uid(), name: 'Schéma électronique', w: 1, h: 1, pos: [0, 0, -30] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: docGroupId, special: 'doc' as const }, // document (pas une pièce physique) : un clic dans « Pièces » l'ouvre
  ];
  for (const p of planks) { // passage du câble de la sonde extérieure : trou Ø 5 dans la plaque gauche du toit et dans la lame d'habillage gauche qui porte la sonde
    if (/^Côté gauche toit/.test(p.name)) p.holes = [...p.holes, fitHole(p, { id: uid(), shape: 'round' as const, x: r2(SONDE_Y - p.pos[1]), y: r2(sondeZh - p.pos[2]), size: SONDE_HOLE })];
    if (/^Lambris gauche/.test(p.name) && Math.abs(p.pos[1] - SONDE_Y) < 0.01) p.holes = [...p.holes, fitHole(p, { id: uid(), shape: 'round' as const, x: 0, y: r2(sondeZh - p.pos[2]), size: SONDE_HOLE })];
  }
  if (n.solar) { // la gaine traverse le fond, le plancher intérieur, le cadre du toit et le plancher / dessus du toit, dans l'isolant du côté droit
    for (const p of planks) if (/^(Dessous ext|Plancher int|Cadre toit (bas|milieu|haut)|Dessous toit|Dessus toit)/.test(p.name)) p.holes = [...p.holes, fitHole(p, { id: uid(), shape: 'round' as const, x: r2(CND_X - p.pos[0]), y: r2(CND_Y - p.pos[1]), size: CND_D })]; // pile le diamètre de la gaine, serrée (plus de jeu : elle nageait)
  }
  for (const p of planks) { // prise d'air basse : l'ouverture du dessous, le passage du conduit dans le fond intérieur et la fente de la paroi intérieure gauche
    if (/^Dessous ext/.test(p.name)) p.holes = [...p.holes, { id: uid(), shape: 'square' as const, x: AIR_CX, y: AIR_CY, size: r2(AIR_LX - 2 * t), sh: r2(AIR_LY - 2 * t) }]; // ouverture du conduit : son intérieur, rectangle simple (les parois reposent sur le fond autour)
    if (/^Plancher int/.test(p.name)) { // passage du conduit (collé à la paroi intérieure) : les fentes des dents du bas de « Côté gauche int » qui le touchent ou le recoupent sont fondues avec lui en UN trou « en peigne » (deux trous qui se recoupent casseraient la triangulation)
      const pass: [number, number, number, number] = [AIR_CX - (AIR_LX + 0.4) / 2, AIR_CY - (AIR_LY + 0.4) / 2, AIR_CX + (AIR_LX + 0.4) / 2, AIR_CY + (AIR_LY + 0.4) / 2];
      const box = (h: Hole): [number, number, number, number] => [h.x - h.size / 2, h.y - (h.sh ?? h.size) / 2, h.x + h.size / 2, h.y + (h.sh ?? h.size) / 2];
      const touch = (h: Hole) => { const [a, b, c, d] = box(h); return !h.poly && h.shape === 'square' && a <= pass[2] + 1e-6 && c >= pass[0] - 1e-6 && b <= pass[3] + 1e-6 && d >= pass[1] - 1e-6; };
      const merged = p.holes.filter(touch);
      p.holes = [...p.holes.filter((h) => !touch(h)), { id: uid(), shape: 'square' as const, x: AIR_CX, y: AIR_CY, size: AIR_LX + 0.4, sh: AIR_LY + 0.4, poly: rectUnion([pass, ...merged.map(box)]) }];
    }
    if (/^Côté gauche int/.test(p.name)) { // la fente de la prise d'air est une grille : N fentes verticales de 4 mm (aucune > 5 mm) séparées par des barreaux de 2 mm, dans l'emprise 34 × 30
      const N = Math.floor((AIR_SW + GR_BAR) / (GR_SLOT + GR_BAR)), span = N * GR_SLOT + (N - 1) * GR_BAR;
      p.holes = [...p.holes, ...Array.from({ length: N }, (_, k) => fitHole(p, { id: uid(), shape: 'square' as const, x: r2(AIR_CY - p.pos[1] - span / 2 + GR_SLOT / 2 + k * (GR_SLOT + GR_BAR)), y: r2(AIR_ZS - p.pos[2]), size: GR_SLOT, sh: AIR_SH }))];
    }
  }
  if (n.cam > 0) { // fentes du plancher du toit pour les dents du bas des murs du compartiment
    const tmp: PlankScene = { t, fit, planks: planks.map((p) => ((/ (compartiment|caméra) \d+$/.test(p.name) || /^Goulotte ventilateur/.test(p.name)) && !p.special ? { ...p, group: '__compartiment' } : p)) };
    const floor = tmp.planks.find((p) => /^Dessous toit/.test(p.name));
    if (floor) { const r = slotsForTeeth(tmp, floor.id); const q = r.scene.planks.find((p) => p.id === floor.id); const f = planks.find((p) => p.id === floor.id); if (q && f) f.holes = q.holes; }
  }
  // un seul groupe « Électronique » : tout le reste de l'électronique (Pi, caméras, nappes, fils, ventilateur, batterie…) et le panneau solaire
  const merged = new Set([solGroupId]);
  const LINKS: [RegExp, string][] = [ // fiches de référence (constructeur ou revendeur)
    [/^Raspberry Pi/, 'https://www.kubii.com/fr/cartes-nano-ordinateurs/4106-2106-raspberry-pi-5-3272496315938.html#/ram-2_gb'],
    [/^Caméra( 2)?$/, 'https://www.amazon.fr/dp/B0BRY3L9H7'],
    [/^(Ventilateur Noctua|Prise 4 broches du ventilateur|Rallonge ventilateur)/, 'https://www.amazon.fr/dp/B00VXTANZ4'],
    [/^Grille de protection ventilateur/, 'https://www.amazon.fr/dp/B0B1QRWHW3'],
    [/^Wago 221-413/, 'https://www.wago.com/221-413'],
    [/^Wago 221-415/, 'https://www.wago.com/221-415'],
    [/^Batterie/, 'https://robu.in/?p=2024523'],
    [/^Régulateur/, 'https://sunforgellc.com/product/gv-10/'],
    [/^Capteur/, 'https://www.kubii.com/fr/modules-capteurs/2858-capteur-de-pression-temperature-et-humidite-bme280-breakout-0606034879638.html'],
    [/^Panneau solaire/, 'https://www.wattuneed.com/fr/panneaux-solaires/8120-panneau-solaire-12v-100wc-monocristallin-0712971138629.html'],
  ];
  const underRoof = (pt: Vec3): Vec3 => (Math.abs(pt[0]) < W / 2 - t && Math.abs(pt[1]) < D / 2 - t ? [pt[0], pt[1], r2(Math.min(pt[2], bodyH + Hf + ((pt[1] + D / 2) * (Hb - Hf)) / D - 2))] : pt); // fils et nappes restent sous la pente du toit
  const unnumber = (nm: string) => (start === 1 ? nm.replace(/^((?:Face avant|Face arrière|Côté droit|Côté gauche|Dessus|Dessous)(?: (?:ext|int|toit|compartiment))?|Grille anti-insectes) 1$/, "$1") : nm); // un seul nichoir : plus de « 1 » derrière les plaques des boîtes (les numéros des séries — lambris, cales, isolant… — restent)
  const ventGroup = uid(); // groupe « Ventilation » : tout ce qui sert à ventiler (cassette du ventilateur, siège, grilles, clapets, interrupteur 12 V, fils, prise d'air basse) ; le bloc isolant d'hiver garde son groupe
  const finalPlanks = planks.map((p) => { let q = p.group && merged.has(p.group) ? { ...p, group: elecGroup, name: unnumber(p.name) } : { ...p, name: unnumber(p.name) }; if (q.path && q.special !== 'solar' && q.name !== 'Câble 12 V vers le toit') if (!/LED extérieures|^Nappe caméra 2/.test(q.name)) q = { ...q, path: q.path.map(underRoof) }; /* la nappe et les fils de la caméra 2 passent DANS le toit (canal du pan) : pas ramenés sous la pente */ const l = LINKS.find(([re]) => re.test(q.name)); if (VENT_PIECES.test(q.name)) q = { ...q, group: ventGroup }; return l ? { ...q, url: l[1] } : q; });
  const spareGroup = uid(); // « Pièces fines de rechange » : THIN.copies exemplaires de chaque plaque fine, à plat derrière les pièces d'hiver et les baguettes de cale (à gauche du nichoir, à l'arrière : jamais sur eux)
  const spares = thinSpares(finalPlanks, t, spareGroup, r2(-W / 2 - SPARE_GAP), r2(D / 2 + SPARE_GAP + 100));
  return { planks: [...summerLayout({ t, fit, planks: finalPlanks }).planks, ...spares], group, name: 'Corps', groupNames: { [group]: 'Corps', [roofGroup]: 'Toit', [elecGroup]: 'Électronique', [docGroupId]: 'Schéma électronique', ...(n.lambris && n.pente ? { [coverGroup]: 'Couvercle' } : {}), [entryGroup]: 'Entrée', [isoGroup]: 'Isolant', [wGroup]: "Pièces d'hiver (rechange)", [stripGroup]: 'Baguettes de cale (à couper)', ...(spares.length ? { [spareGroup]: 'Pièces fines de rechange' } : {}), [ventGroup]: 'Ventilation', [lamGroup]: 'Habillage' } }; // un seul nichoir : groupes sans numéro, le corps s'appelle « Corps »
}
