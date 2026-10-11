import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, EdgesGeometry, ExtrudeGeometry, Float32BufferAttribute, Path, Shape, Vector2 } from 'three';
import { holeOutline, type Plank } from '../model';
import { PALETTE } from './registry/palette';
import { PART } from './constants';
import { piModel } from './piModel';
import { conduitGeometry, ribbonGeometry, wireGeometry } from './wires';

/** Boîtier étanche du Pi : fond, quatre parois, couvercle (plaques minces). Origine : milieu du fond. */
function caseGeometry(p: Plank): { geo: BufferGeometry; edges: BufferGeometry } {
  const W = p.w, D = p.h, H = PART.caseHeight, w = PART.caseWall;
  const parts: { g: BufferGeometry; c: Color }[] = [];
  const slab = (sx: number, sy: number, sz: number, x: number, y: number, z: number, c = PALETTE.aluminium) => { const g = new BoxGeometry(sx, sy, sz); g.translate(x, y, z); parts.push({ g, c: new Color(c) }); };
  slab(W, D, w, 0, 0, w / 2); // fond
  slab(W, D, w, 0, 0, H - w / 2); // couvercle
  slab(W, w, H - 2 * w, 0, -(D - w) / 2, H / 2); slab(W, w, H - 2 * w, 0, (D - w) / 2, H / 2); // avant, arrière
  slab(w, D - 2 * w, H - 2 * w, -(W - w) / 2, 0, H / 2); slab(w, D - 2 * w, H - 2 * w, (W - w) / 2, 0, H / 2); // gauche, droite
  const geos = parts.map(({ g, c }) => { const ni = g.toNonIndexed(); ni.deleteAttribute('uv'); const n = ni.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; } ni.setAttribute('color', new Float32BufferAttribute(col, 3)); return ni; });
  const geo = mergeGeometries(geos)!;
  return { geo, edges: new EdgesGeometry(geo, PART.edgeAngle) };
}

export function cameraGeometry(p: Plank, t = 3): { geo: BufferGeometry; edges: BufferGeometry } {
  if (p.special === 'case') return caseGeometry(p);
  if (p.special === 'solar') { // panneau solaire : cadre alu, verre bleu nuit, 10 × 6 cellules séparées par de fins joints, 3 barres collectrices par cellule, 2 rails et une boîte de jonction au dos
    const parts: { g: BufferGeometry; c: Color }[] = [], W = p.w, H = p.h, D = p.depth ?? 35, F = 30, top = D / 2;
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: string) => { const g = new BoxGeometry(w, h, d); g.translate(x, y, z); parts.push({ g, c: new Color(c) }); };
    box(W, F, D, 0, H / 2 - F / 2, 0, PALETTE.aluminiumFrame); box(W, F, D, 0, -H / 2 + F / 2, 0, PALETTE.aluminiumFrame); // cadre : deux grands côtés
    box(F, H - 2 * F, D, -W / 2 + F / 2, 0, 0, PALETTE.aluminiumFrame); box(F, H - 2 * F, D, W / 2 - F / 2, 0, 0, PALETTE.aluminiumFrame); // deux petits côtés
    const iw = W - 2 * F, ih = H - 2 * F;
    box(iw, ih, 6, 0, 0, top - 3 - 4, PALETTE.solarGlass); // verre + fond bleu nuit
    const cols = 10, rows = 6, gap = 3, cw = (iw - 2 * 6 - (cols - 1) * gap) / cols, ch = (ih - 2 * 6 - (rows - 1) * gap) / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const cx = -iw / 2 + 6 + cw / 2 + i * (cw + gap), cy = -ih / 2 + 6 + ch / 2 + j * (ch + gap), cz = top - 3.6; // posées sur le verre
      box(cw, ch, 0.8, cx, cy, cz, PALETTE.solarCell); // cellule
      for (const f of [-1, 0, 1]) box(0.8, ch, 0.3, cx + f * cw / 3.2, cy, cz + 0.55, PALETTE.solarBusbar); // barres collectrices
    }
    box(W - 80, 30, 18, 0, -ih / 4, -top - 9, PALETTE.steel); box(W - 80, 30, 18, 0, ih / 4, -top - 9, PALETTE.steel); // deux rails alu au dos
    box(120, 70, 26, 0, H / 2 - F - 50, -top - 13, PALETTE.nearBlack); // boîte de jonction
    const geos = parts.map(({ g, c }) => { const ni = g.toNonIndexed(); ni.deleteAttribute('uv'); const n = ni.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; } ni.setAttribute('color', new Float32BufferAttribute(col, 3)); return ni; });
    const geo = mergeGeometries(geos)!;
    return { geo, edges: new BufferGeometry().setAttribute('position', new Float32BufferAttribute([], 3)) };
  }
  if (p.special === 'fan') { // ventilateur 40 : cadre noir, rotor gris à pales, moyeu
    const parts: { g: BufferGeometry; c: Color }[] = [], d = p.depth ?? 10;
    parts.push({ g: new BoxGeometry(p.w, p.h, d), c: new Color(PALETTE.slate) });
    const rotor = new CylinderGeometry(p.w * 0.44, p.w * 0.44, d + 0.4, 28); rotor.rotateX(Math.PI / 2); parts.push({ g: rotor, c: new Color(PALETTE.slate600) });
    for (let i = 0; i < 7; i++) { const blade = new BoxGeometry(p.w * 0.36, 2.2, d + 0.8); blade.translate(p.w * 0.2, 0, 0); blade.rotateZ((i * 2 * Math.PI) / 7); parts.push({ g: blade, c: new Color(PALETTE.gray500) }); }
    const hub = new CylinderGeometry(p.w * 0.14, p.w * 0.14, d + 1.2, 20); hub.rotateX(Math.PI / 2); parts.push({ g: hub, c: new Color(PALETTE.darkNavy) });
    const geos = parts.map(({ g, c }) => { const ni = g.toNonIndexed(); ni.deleteAttribute('uv'); const n = ni.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; } ni.setAttribute('color', new Float32BufferAttribute(col, 3)); return ni; });
    const geo = mergeGeometries(geos)!;
    return { geo, edges: new EdgesGeometry(geo, PART.edgeAngle) };
  }
  if (p.special === 'peltier') { // TEC1-12706 : deux céramiques blanches de 0,8 et l'âme grise (plots) entre elles
    const parts: { g: BufferGeometry; c: Color }[] = [], d = p.depth ?? 3.8, core = d - 1.6;
    const lo = new BoxGeometry(p.w, p.h, 0.8); lo.translate(0, 0, -d / 2 + 0.4); parts.push({ g: lo, c: new Color(PALETTE.coolWhite) });
    const hi = new BoxGeometry(p.w, p.h, 0.8); hi.translate(0, 0, d / 2 - 0.4); parts.push({ g: hi, c: new Color(PALETTE.coolWhite) });
    const mid = new BoxGeometry(p.w - 3, p.h - 3, core); parts.push({ g: mid, c: new Color(PALETTE.slate700) });
    const geos = parts.map(({ g, c }) => { const ni = g.toNonIndexed(); ni.deleteAttribute('uv'); const n = ni.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; } ni.setAttribute('color', new Float32BufferAttribute(col, 3)); return ni; });
    const geo = mergeGeometries(geos)!;
    return { geo, edges: new EdgesGeometry(geo, PART.edgeAngle) };
  }
  if (p.special === 'driver') { // module MOSFET (type XY-MOS) : carte rouge, MOSFET noir avec languette, deux borniers bleus de chaque côté
    const parts: { g: BufferGeometry; c: Color }[] = [];
    parts.push({ g: (() => { const g = new BoxGeometry(p.w, p.h, 1.6); g.translate(0, 0, -(p.depth ?? 20) / 2 + 0.8); return g; })(), c: new Color(p.color ?? PALETTE.driverRed) });
    const z0 = -(p.depth ?? 20) / 2 + 1.6;
    const mos = new BoxGeometry(10, 4.5, 15); mos.translate(0, 2, z0 + 7.5); parts.push({ g: mos, c: new Color(PALETTE.slate) });
    const tab = new BoxGeometry(10, 1, 10); tab.translate(0, 4.9, z0 + 6); parts.push({ g: tab, c: new Color(PALETTE.steel) });
    for (const sx of [-1, 1]) for (const dy of [-5, 5]) { const term = new BoxGeometry(8, 8, 10); term.translate(sx * (p.w / 2 - 4.5), dy, z0 + 5); parts.push({ g: term, c: new Color(PALETTE.terminalBlue) }); }
    const led = new BoxGeometry(3, 3, 1.5); led.translate(8, -7, z0 + 0.75); parts.push({ g: led, c: new Color(PALETTE.ledGreen) });
    const geos = parts.map(({ g, c }) => { const ni = g.toNonIndexed(); ni.deleteAttribute('uv'); const n = ni.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; } ni.setAttribute('color', new Float32BufferAttribute(col, 3)); return ni; });
    const geo = mergeGeometries(geos)!;
    return { geo, edges: new EdgesGeometry(geo, PART.edgeAngle) };
  }
  if (p.special === 'heatsink') { // radiateur alu : semelle de 3 mm et 11 ailettes de 1,2 mm (z local : vers l'extérieur)
    const parts: { g: BufferGeometry; c: Color }[] = [], c = new Color(p.color ?? PALETTE.aluminium), D = p.depth ?? 23;
    const base = new BoxGeometry(p.w, p.h, 3); base.translate(0, 0, -D / 2 + 1.5); parts.push({ g: base, c });
    const nF = 11;
    for (let i = 0; i < nF; i++) { const fin = new BoxGeometry(1.2, p.h, D - 3); fin.translate(-p.w / 2 + 0.6 + i * ((p.w - 1.2) / (nF - 1)), 0, 1.5); parts.push({ g: fin, c: c.clone().multiplyScalar(0.85) }); }
    const geos = parts.map(({ g, c: cc }) => { const ni = g.toNonIndexed(); ni.deleteAttribute('uv'); const n = ni.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[3 * i] = cc.r; col[3 * i + 1] = cc.g; col[3 * i + 2] = cc.b; } ni.setAttribute('color', new Float32BufferAttribute(col, 3)); return ni; });
    const geo = mergeGeometries(geos)!;
    return { geo, edges: new EdgesGeometry(geo, PART.edgeAngle) };
  }
  if (p.special === 'sensor') { // carte du capteur : circuit bleu, puce blanche à grille noire (côté +z local = vers le nid), quatre broches dorées
    const parts: { g: BufferGeometry; c: Color }[] = [];
    parts.push({ g: new BoxGeometry(p.w, p.h, 1.6), c: new Color(PALETTE.sensorBlue) });
    const chip = new BoxGeometry(6, 6, 1.6); chip.translate(-1.5, 0, 1.6); parts.push({ g: chip, c: new Color(PALETTE.lightGray) });
    const grille = new BoxGeometry(2, 2, 0.4); grille.translate(-1.5, 0, 2.5); parts.push({ g: grille, c: new Color(PALETTE.slate) });
    for (let i = 0; i < 4; i++) { const pin = new BoxGeometry(0.64, 0.64, 4); pin.translate(-3.75 + i * 2.5, -p.h / 2 + 1.5, -1.8); parts.push({ g: pin, c: new Color(PALETTE.gold) }); }
    const geos = parts.map(({ g, c }) => { const ni = g.toNonIndexed(); ni.deleteAttribute('uv'); const n = ni.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; } ni.setAttribute('color', new Float32BufferAttribute(col, 3)); return ni; });
    const geo = mergeGeometries(geos)!;
    return { geo, edges: new EdgesGeometry(geo, PART.edgeAngle) };
  }
  if (p.special === 'block' && (p.holes.length || p.poly)) { // pavé percé (lambris à l'entrée) ou à contour libre (lames qui montent en diagonale) : une plaque épaisse, épaisseur p.depth selon z
    const shape = new Shape((p.poly ?? [[-p.w / 2, -p.h / 2], [p.w / 2, -p.h / 2], [p.w / 2, p.h / 2], [-p.w / 2, p.h / 2]]).map(([x, y]) => new Vector2(x, y)));
    for (const h of p.holes) shape.holes.push(new Path(holeOutline(h).map(([x, y]) => new Vector2(x, y))));
    const g = new ExtrudeGeometry(shape, { depth: p.depth ?? t, bevelEnabled: false }); g.translate(0, 0, -(p.depth ?? t) / 2);
    if (p.top) { // le haut du prisme suit un plan incliné : on remonte les sommets du dessus sur ce plan (les arêtes restent verticales)
      const pos = g.attributes.position, hz = (p.depth ?? t) / 2;
      for (let i = 0; i < pos.count; i++) if (pos.getZ(i) > hz - 1e-6) pos.setZ(i, p.top.z0 + p.top.bx * pos.getX(i) + p.top.by * pos.getY(i));
      g.computeVertexNormals();
    }
    const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new Color(p.color ?? PALETTE.woodBlock);
    for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; }
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    return { geo: g, edges: new EdgesGeometry(g, PART.edgeAngle) };
  }
  if (p.special === 'block') { // pavé d'isolant : une boîte pleine
    const g = new BoxGeometry(p.w, p.h, p.depth ?? t), n = g.attributes.position.count, col = new Float32Array(n * 3), c = new Color(p.color ?? PALETTE.insulation);
    for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; }
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    return { geo: g, edges: new EdgesGeometry(g, PART.edgeAngle) };
  }
  if (p.special === 'cable') return ribbonGeometry(p);
  if (p.special === 'conduit') return conduitGeometry(p);
  if (p.special === 'wire') return wireGeometry(p);
  if (p.special === 'pi' && piModel) return { geo: piModel.clone(), edges: new BufferGeometry().setAttribute('position', new Float32BufferAttribute([], 3)) };
  const parts: { g: BufferGeometry; c: Color }[] = [];
  if (p.special === 'pi') { // Raspberry Pi Zero 2 W d'après le plan mécanique officiel (65 × 30, coins de 3, trous Ø 2,75 à 3,5 des bords) ; composants à leur place, formes simplifiées
    const px = (x: number) => x - p.w / 2, py = (y: number) => y - p.h / 2; // repère du plan (coin bas gauche) → repère centré
    const W = p.w, H = p.h, R = 3;
    const shape = new Shape();
    shape.moveTo(-W / 2 + R, -H / 2); shape.lineTo(W / 2 - R, -H / 2); shape.absarc(W / 2 - R, -H / 2 + R, R, -Math.PI / 2, 0, false);
    shape.lineTo(W / 2, H / 2 - R); shape.absarc(W / 2 - R, H / 2 - R, R, 0, Math.PI / 2, false);
    shape.lineTo(-W / 2 + R, H / 2); shape.absarc(-W / 2 + R, H / 2 - R, R, Math.PI / 2, Math.PI, false);
    shape.lineTo(-W / 2, -H / 2 + R); shape.absarc(-W / 2 + R, -H / 2 + R, R, Math.PI, 1.5 * Math.PI, false);
    for (const [hx, hy] of [[3.5, 3.5], [61.5, 3.5], [3.5, 26.5], [61.5, 26.5]]) { const h = new Path(); h.absarc(px(hx), py(hy), 1.375, 0, Math.PI * 2, true); shape.holes.push(h); }
    const board = new ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false, curveSegments: 12 }); board.translate(0, 0, -0.7);
    parts.push({ g: board, c: new Color(PALETTE.piGreen) });
    const SILVER = new Color(PALETTE.silver), BLACK = new Color(PALETTE.nearBlack), GOLD = new Color(PALETTE.gold), WHITE = new Color(PALETTE.offWhite);
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: Color) => { const g = new BoxGeometry(w, h, d); g.translate(px(x), py(y), z); parts.push({ g, c }); };
    box(12.5, 12.5, 1.1, 33, 14, 1.25, SILVER); // RP3A0 sous son blindage
    box(11.2, 7.5, 3.3, 12.4, 3.5, 2.35, SILVER); // mini HDMI, au bord bas
    box(8, 5.6, 2.6, 41.4, 2.8, 2.0, SILVER); // micro USB données
    box(8, 5.6, 2.6, 54, 2.8, 2.0, SILVER); // micro USB alimentation
    box(14, 11.5, 1.8, 6.5, 16.9, 1.1, SILVER); // lecteur microSD, au bout gauche
    box(4, 17, 2, 61.5, 15, 1.7, WHITE); // connecteur de nappe caméra, au bout droit
    box(51, 5, 2.5, 32.5, 26.5, 1.95, BLACK); // support des broches GPIO 2 × 20
    for (let i = 0; i < 20; i++) for (const dy of [-1.27, 1.27]) box(0.64, 0.64, 3, 32.5 + (i - 9.5) * 2.54, 26.5 + dy, 3.2, GOLD);
  } else if (p.special === 'bar') parts.push({ g: new BoxGeometry(p.w, p.h, t), c: new Color(PALETTE.woodBar) }); // barre de bois : longueur w, largeur h, 3 mm
  else if (p.special === 'ir') { // carte de 4 LED infrarouges, côté LED vers −z
    parts.push({ g: new BoxGeometry(p.w, p.h, 1.6), c: new Color(PALETTE.irBoard) });
    for (const dx of [-3, 3]) for (const dy of [-6, 6]) { const led = new BoxGeometry(3.2, 3.2, 3.2); led.translate(dx, dy, -2.4); parts.push({ g: led, c: new Color(PALETTE.irLed) }); }
  } else {
  const pcb = new BoxGeometry(p.w, p.h, 1.6);
  parts.push({ g: pcb, c: new Color(PALETTE.pcbGreen) });
  const con = new BoxGeometry(17, 5.5, 2.6); con.translate(0, p.h / 2 - 4.5, 2.1);
  parts.push({ g: con, c: new Color(PALETTE.connectorGray) });
  const lensBase = new BoxGeometry(8.5, 8.5, 3); lensBase.translate(0, 0, -2.3);
  parts.push({ g: lensBase, c: new Color(PALETTE.lensBase) });
  const lens = new CylinderGeometry(4, 4, 6, 24); lens.rotateX(Math.PI / 2); lens.translate(0, 0, -6.8);
  parts.push({ g: lens, c: new Color(PALETTE.lens) });
  }
  const geos = parts.map(({ g, c }) => {
    const ni = g.toNonIndexed(); ni.deleteAttribute('uv');
    const n = ni.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; }
    ni.setAttribute('color', new Float32BufferAttribute(col, 3));
    return ni;
  });
  const geo = mergeGeometries(geos)!;
  return { geo, edges: new EdgesGeometry(geo, PART.edgeAngle) };
}
