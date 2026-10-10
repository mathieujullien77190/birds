import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AmbientLight, BoxGeometry, BufferAttribute, CatmullRomCurve3, TubeGeometry, CylinderGeometry, EdgesGeometry, BufferGeometry, Color, DirectionalLight, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, MathUtils, Mesh, MeshStandardMaterial, MOUSE, PerspectiveCamera, Raycaster, Path, Scene, Shape, Vector2, WebGLRenderer, Vector3, CanvasTexture, Sprite, SpriteMaterial, Group, MeshBasicMaterial, Plane, PlaneGeometry, Quaternion, Line, LineDashedMaterial, LineLoop, RepeatWrapping, SRGBColorSpace } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Slider from '@/ui/Slider';
import { Btn, Chip, Hint, Section } from '@/ui/kit';
import { saveSvg, Sheet2D } from '../ui/Sheet2D';
import { bounds, castellation, pullFace, type FaceAxis, edgeLength, teethFor, slotsForTeeth, makeNest, NEST_DEFAULT, type NestParams, nestSheets, sheetSvg, sheetsPreviewSvg, moveWithGroup, r2, EDGES, extents, fitHole, holeOutline, recastAll, loadHistory, loadScene, newHole, outline, plankSvg, saveHistory, saveScene, type Edge, type Hole, type HistoryEntry, type Plank, type PlankScene, type Vec3 } from './model';
import { DocModal, DOCS } from './DocModal';
import { SchemaPanel } from './SchemaPanel';

/** Dessus (face +z de la plaque) clair, dessous un peu plus foncé, tranche (épaisseur) marron foncé : on voit tout de suite le sens et l'épaisseur. */
const TOP = new Color('#e2c79a'), BOTTOM = new Color('#c9a874'), SIDE = new Color('#6f4a22');
/** Géométrie d'une plaque : son contour extrudé sur l'épaisseur, centré, percé des trous ; couleur par face (dessus, dessous, tranche) ; arêtes tracées depuis le contour. */
/** Modèle 3D de la caméra (élément spécial) : carte verte, connecteur nappe, objectif noir vers −z. */
/** Modèle 3D du Raspberry Pi 4 (STEP converti en binaire compact, voir public/models/pi4.bin) : chargé une fois, partagé. */
let piModel: BufferGeometry | null = null;
let piLoading: Promise<void> | null = null;
function loadPiModel(): Promise<void> {
  piLoading ??= fetch(`${import.meta.env.BASE_URL}models/pi4.bin`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('pi4.bin')))).then((buf) => {
    const head = new Uint32Array(buf, 0, 2), nV = head[0], nI = head[1];
    const pos = new Float32Array(buf, 8, nV * 3), col = new Uint8Array(buf, 8 + nV * 12, nV * 3), idx = new Uint32Array(buf.slice(8 + nV * 15, 8 + nV * 15 + nI * 4));
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('color', new Float32BufferAttribute(Float32Array.from(col, (v) => v / 255), 3));
    g.setIndex(new BufferAttribute(idx, 1));
    const flat = g.toNonIndexed(); // ombrage à facettes : les arêtes vives restent nettes
    flat.computeVertexNormals();
    g.dispose();
    piModel = flat;
  }).catch(() => { /* pas de modèle : on garde le dessin simplifié */ });
  return piLoading;
}

/** Fil électrique : tube lissé le long de p.path, diamètre p.w, couleur p.color. */
/** Gaine annelée (ICTA) : un tube dont le rayon ondule le long de la courbe (anneaux tous les 3 mm, ± 8 %), noir. */
function conduitGeometry(p: Plank): { geo: BufferGeometry; edges: BufferGeometry } {
  const curve = new CatmullRomCurve3((p.path ?? []).map((q) => new Vector3(...q)), false, 'catmullrom', 0.5);
  const len = curve.getLength(), pitch = 3, tub = Math.max(8, Math.round((len / pitch) * 6)), rad = 14;
  const geo = new TubeGeometry(curve, tub, p.w / 2, rad, false);
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) { // la grille du tube est (tub + 1) rangées de (rad + 1) sommets : la rangée donne l'abscisse le long de la gaine
    const j = Math.floor(i / (rad + 1)), s = (j / tub) * len, k = 1 + 0.08 * Math.sin((2 * Math.PI * s) / pitch);
    const r = p.w / 2;
    pos.setXYZ(i, pos.getX(i) + nrm.getX(i) * r * (k - 1), pos.getY(i) + nrm.getY(i) * r * (k - 1), pos.getZ(i) + nrm.getZ(i) * r * (k - 1));
  }
  geo.computeVertexNormals();
  const c = new Color(p.color ?? '#1c1917'), n = pos.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  return { geo, edges: new BufferGeometry().setAttribute('position', new Float32BufferAttribute([], 3)) };
}
/** Texture de chêne procédurale (une seule, partagée) : fond chêne clair, veines sinueuses plus sombres, grain fin, quelques maillures claires — dessinée dans un canvas. */
let oakTex: CanvasTexture | null = null;
function oakTexture(): CanvasTexture {
  if (oakTex) return oakTex;
  const S = 512, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d')!, img = ctx.createImageData(S, S), d = img.data;
  const base = [196, 154, 96], dark = [132, 92, 48], light = [222, 190, 140];
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const ph = Array.from({ length: 6 }, () => rnd() * 6.28), amp = Array.from({ length: 6 }, () => 6 + rnd() * 10);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // veines le long de x : la position de la veine ondule avec x (sinus superposés), le long de y les veines se répètent tous les ~18 px avec un contraste variable
    // veines le long de x : leur position ondule (sinus superposés), leur ESPACEMENT varie le long de y (cernes serrés puis larges), lignes fines et sombres sur fond clair,
    // contraste qui change le long de x (la veine s'estompe par endroits), grain fin dans le sens du fil, quelques maillures claires
    const wobble = amp[0] * Math.sin(x * 0.008 + ph[0]) + amp[1] * 0.6 * Math.sin(x * 0.023 + ph[1]) + 3 * Math.sin(x * 0.07 + ph[2]);
    const v = y + wobble, u = v * 0.045 + 0.9 * Math.sin(v * 0.011 + ph[3]) + 0.3 * Math.sin(v * 0.037 + ph[4]);
    const line = Math.pow(0.5 + 0.5 * Math.sin(u * 6.283), 5); // 1 sur la veine (fine), 0 entre
    const fade = 0.55 + 0.45 * Math.sin(x * 0.014 + v * 0.02 + ph[5]); // la veine est plus ou moins marquée selon l'endroit
    const grain = (Math.sin(x * 0.5 + y * 1.9 + ph[4]) * 0.5 + 0.5) * 0.07 + (rnd() - 0.5) * 0.06;
    const ray = Math.max(0, Math.sin(y * 0.09 + x * 0.004 + ph[5]) - 0.95) * 8; // maillures claires, rares
    const t = Math.min(1, Math.max(0, line * fade * 0.9 + grain + 0.08 * Math.sin(v * 0.02) - ray));
    const i = (y * S + x) * 4;
    for (let c = 0; c < 3; c++) d[i + c] = Math.round(base[c] + (dark[c] - base[c]) * t + (light[c] - base[c]) * Math.max(0, ray - 0.1) * 0.5);
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  oakTex = new CanvasTexture(cv); oakTex.wrapS = oakTex.wrapT = RepeatWrapping; oakTex.colorSpace = SRGBColorSpace; oakTex.anisotropy = 8;
  return oakTex;
}

/** Arrondit les angles d'un chemin : à chaque sommet intermédiaire, le coude est remplacé par un arc (Bézier quadratique) de rayon r — un vrai fil ne fait pas d'angle vif,
 *  il tourne en courbe. r est limité à la moitié des deux segments voisins pour que les arcs ne se chevauchent pas. */
function roundPath(pts: Vector3[], r: number): Vector3[] {
  if (pts.length < 3) return pts;
  const out: Vector3[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i - 1], P = pts[i], B = pts[i + 1];
    const da = A.clone().sub(P), db = B.clone().sub(P), la = da.length(), lb = db.length();
    if (la < 1e-6 || lb < 1e-6) continue;
    const rr = Math.min(r, la / 2, lb / 2);
    const p0 = P.clone().addScaledVector(da, rr / la), p2 = P.clone().addScaledVector(db, rr / lb);
    for (let k = 0; k <= 6; k++) { const u = k / 6; out.push(p0.clone().multiplyScalar((1 - u) * (1 - u)).addScaledVector(P, 2 * (1 - u) * u).addScaledVector(p2, u * u)); }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function wireGeometry(p: Plank): { geo: BufferGeometry; edges: BufferGeometry } {
  const raw = (p.path ?? []).map((q) => new Vector3(...q));
  const curve = new CatmullRomCurve3(roundPath(raw, Math.max(10, 4 * p.w)), false, 'centripetal'); // coudes arrondis (rayon 10 mm, plus pour les gros fils), puis lissage sans dépassement
  const geo = new TubeGeometry(curve, Math.max(64, raw.length * 24), p.w / 2, 8, false);
  const c = new Color(p.color ?? '#111827'), n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  return { geo, edges: new BufferGeometry().setAttribute('position', new Float32BufferAttribute([], 3)) };
}

/** Boîtier étanche du Pi : fond, quatre parois, couvercle (plaques minces). Origine : milieu du fond. */
function caseGeometry(p: Plank): { geo: BufferGeometry; edges: BufferGeometry } {
  const W = p.w, D = p.h, H = 35, w = 2.5;
  const parts: { g: BufferGeometry; c: Color }[] = [];
  const slab = (sx: number, sy: number, sz: number, x: number, y: number, z: number, c = '#cbd5e1') => { const g = new BoxGeometry(sx, sy, sz); g.translate(x, y, z); parts.push({ g, c: new Color(c) }); };
  slab(W, D, w, 0, 0, w / 2); // fond
  slab(W, D, w, 0, 0, H - w / 2); // couvercle
  slab(W, w, H - 2 * w, 0, -(D - w) / 2, H / 2); slab(W, w, H - 2 * w, 0, (D - w) / 2, H / 2); // avant, arrière
  slab(w, D - 2 * w, H - 2 * w, -(W - w) / 2, 0, H / 2); slab(w, D - 2 * w, H - 2 * w, (W - w) / 2, 0, H / 2); // gauche, droite
  const geos = parts.map(({ g, c }) => { const ni = g.toNonIndexed(); ni.deleteAttribute('uv'); const n = ni.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; } ni.setAttribute('color', new Float32BufferAttribute(col, 3)); return ni; });
  const geo = mergeGeometries(geos)!;
  return { geo, edges: new EdgesGeometry(geo, 30) };
}

/** Nappe plate (câble CSI) : ruban lissé le long de p.path, largeur p.w, repère transporté sans torsion. */
function ribbonGeometry(p: Plank): { geo: BufferGeometry; edges: BufferGeometry } {
  const curve = new CatmullRomCurve3((p.path ?? []).map((q) => new Vector3(...q)), false, 'centripetal'); // centripète : pas de boucle ni de dépassement entre les points
  const N = 120, pts = curve.getPoints(N), pos: number[] = [], idx: number[] = [], col: number[] = [];
  const c = new Color('#e08a1e'), tip = new Color('#5b8def'); // ruban orange, embouts bleus (renforts des connecteurs)
  // repère transporté sans torsion, puis torsion répartie sur la fin pour que la largeur de la nappe tombe dans l'axe du connecteur d'arrivée :
  // la nappe arrive à l'horizontale, sa largeur horizontale et perpendiculaire à sa direction
  const tans: Vector3[] = [], sides: Vector3[] = [];
  let side = new Vector3(1, 0, 0), prev = curve.getTangent(0);
  for (let i = 0; i <= N; i++) {
    const tg = curve.getTangent(i / N);
    if (i > 0) side = side.clone().applyQuaternion(new Quaternion().setFromUnitVectors(prev, tg));
    prev = tg; tans.push(tg); sides.push(side.clone());
  }
  const tEnd = tans[N], sEnd = sides[N];
  let want = new Vector3().crossVectors(tEnd, new Vector3(0, 0, 1)); // largeur horizontale à l'arrivée
  if (want.lengthSq() > 1e-6) {
    want.normalize();
    if (sEnd.dot(want) < 0) want = want.negate();
    const phi = Math.atan2(new Vector3().crossVectors(sEnd, want).dot(tEnd), sEnd.dot(want)); // torsion à répartir
    for (let i = 0; i <= N; i++) { const u = Math.min(1, Math.max(0, (i / N - 0.5) / 0.5)), k = u * u * (3 - 2 * u); sides[i].applyAxisAngle(tans[i], phi * k); }
  }
  for (let i = 0; i <= N; i++) {
    const a = pts[i].clone().addScaledVector(sides[i], -p.w / 2), b = pts[i].clone().addScaledVector(sides[i], p.w / 2);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z); const cc = i / N < 0.04 || i / N > 0.96 ? tip : c; col.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b);
    if (i > 0) { const k = 2 * (i - 1); idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, edges: new BufferGeometry().setAttribute('position', new Float32BufferAttribute([], 3)) };
}

function cameraGeometry(p: Plank, t = 3): { geo: BufferGeometry; edges: BufferGeometry } {
  if (p.special === 'case') return caseGeometry(p);
  if (p.special === 'solar') { // panneau solaire : cadre alu, verre bleu nuit, 10 × 6 cellules séparées par de fins joints, 3 barres collectrices par cellule, 2 rails et une boîte de jonction au dos
    const parts: { g: BufferGeometry; c: Color }[] = [], W = p.w, H = p.h, D = p.depth ?? 35, F = 30, top = D / 2;
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: string) => { const g = new BoxGeometry(w, h, d); g.translate(x, y, z); parts.push({ g, c: new Color(c) }); };
    box(W, F, D, 0, H / 2 - F / 2, 0, '#c7ccd1'); box(W, F, D, 0, -H / 2 + F / 2, 0, '#c7ccd1'); // cadre : deux grands côtés
    box(F, H - 2 * F, D, -W / 2 + F / 2, 0, 0, '#c7ccd1'); box(F, H - 2 * F, D, W / 2 - F / 2, 0, 0, '#c7ccd1'); // deux petits côtés
    const iw = W - 2 * F, ih = H - 2 * F;
    box(iw, ih, 6, 0, 0, top - 3 - 4, '#0b1b4a'); // verre + fond bleu nuit
    const cols = 10, rows = 6, gap = 3, cw = (iw - 2 * 6 - (cols - 1) * gap) / cols, ch = (ih - 2 * 6 - (rows - 1) * gap) / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const cx = -iw / 2 + 6 + cw / 2 + i * (cw + gap), cy = -ih / 2 + 6 + ch / 2 + j * (ch + gap), cz = top - 3.6; // posées sur le verre
      box(cw, ch, 0.8, cx, cy, cz, '#1d3f9c'); // cellule
      for (const f of [-1, 0, 1]) box(0.8, ch, 0.3, cx + f * cw / 3.2, cy, cz + 0.55, '#b8c4d8'); // barres collectrices
    }
    box(W - 80, 30, 18, 0, -ih / 4, -top - 9, '#9ca3af'); box(W - 80, 30, 18, 0, ih / 4, -top - 9, '#9ca3af'); // deux rails alu au dos
    box(120, 70, 26, 0, H / 2 - F - 50, -top - 13, '#18181b'); // boîte de jonction
    const geos = parts.map(({ g, c }) => { const ni = g.toNonIndexed(); ni.deleteAttribute('uv'); const n = ni.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; } ni.setAttribute('color', new Float32BufferAttribute(col, 3)); return ni; });
    const geo = mergeGeometries(geos)!;
    return { geo, edges: new BufferGeometry().setAttribute('position', new Float32BufferAttribute([], 3)) };
  }
  if (p.special === 'fan') { // ventilateur 40 : cadre noir, rotor gris à pales, moyeu
    const parts: { g: BufferGeometry; c: Color }[] = [], d = p.depth ?? 10;
    parts.push({ g: new BoxGeometry(p.w, p.h, d), c: new Color('#111827') });
    const rotor = new CylinderGeometry(p.w * 0.44, p.w * 0.44, d + 0.4, 28); rotor.rotateX(Math.PI / 2); parts.push({ g: rotor, c: new Color('#374151') });
    for (let i = 0; i < 7; i++) { const blade = new BoxGeometry(p.w * 0.36, 2.2, d + 0.8); blade.translate(p.w * 0.2, 0, 0); blade.rotateZ((i * 2 * Math.PI) / 7); parts.push({ g: blade, c: new Color('#6b7280') }); }
    const hub = new CylinderGeometry(p.w * 0.14, p.w * 0.14, d + 1.2, 20); hub.rotateX(Math.PI / 2); parts.push({ g: hub, c: new Color('#0f172a') });
    const geos = parts.map(({ g, c }) => { const ni = g.toNonIndexed(); ni.deleteAttribute('uv'); const n = ni.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; } ni.setAttribute('color', new Float32BufferAttribute(col, 3)); return ni; });
    const geo = mergeGeometries(geos)!;
    return { geo, edges: new EdgesGeometry(geo, 30) };
  }
  if (p.special === 'peltier') { // TEC1-12706 : deux céramiques blanches de 0,8 et l'âme grise (plots) entre elles
    const parts: { g: BufferGeometry; c: Color }[] = [], d = p.depth ?? 3.8, core = d - 1.6;
    const lo = new BoxGeometry(p.w, p.h, 0.8); lo.translate(0, 0, -d / 2 + 0.4); parts.push({ g: lo, c: new Color('#f8fafc') });
    const hi = new BoxGeometry(p.w, p.h, 0.8); hi.translate(0, 0, d / 2 - 0.4); parts.push({ g: hi, c: new Color('#f8fafc') });
    const mid = new BoxGeometry(p.w - 3, p.h - 3, core); parts.push({ g: mid, c: new Color('#4b5563') });
    const geos = parts.map(({ g, c }) => { const ni = g.toNonIndexed(); ni.deleteAttribute('uv'); const n = ni.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; } ni.setAttribute('color', new Float32BufferAttribute(col, 3)); return ni; });
    const geo = mergeGeometries(geos)!;
    return { geo, edges: new EdgesGeometry(geo, 30) };
  }
  if (p.special === 'driver') { // module MOSFET (type XY-MOS) : carte rouge, MOSFET noir avec languette, deux borniers bleus de chaque côté
    const parts: { g: BufferGeometry; c: Color }[] = [];
    parts.push({ g: (() => { const g = new BoxGeometry(p.w, p.h, 1.6); g.translate(0, 0, -(p.depth ?? 20) / 2 + 0.8); return g; })(), c: new Color(p.color ?? '#b91c1c') });
    const z0 = -(p.depth ?? 20) / 2 + 1.6;
    const mos = new BoxGeometry(10, 4.5, 15); mos.translate(0, 2, z0 + 7.5); parts.push({ g: mos, c: new Color('#111827') });
    const tab = new BoxGeometry(10, 1, 10); tab.translate(0, 4.9, z0 + 6); parts.push({ g: tab, c: new Color('#9ca3af') });
    for (const sx of [-1, 1]) for (const dy of [-5, 5]) { const term = new BoxGeometry(8, 8, 10); term.translate(sx * (p.w / 2 - 4.5), dy, z0 + 5); parts.push({ g: term, c: new Color('#2563eb') }); }
    const led = new BoxGeometry(3, 3, 1.5); led.translate(8, -7, z0 + 0.75); parts.push({ g: led, c: new Color('#22c55e') });
    const geos = parts.map(({ g, c }) => { const ni = g.toNonIndexed(); ni.deleteAttribute('uv'); const n = ni.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; } ni.setAttribute('color', new Float32BufferAttribute(col, 3)); return ni; });
    const geo = mergeGeometries(geos)!;
    return { geo, edges: new EdgesGeometry(geo, 30) };
  }
  if (p.special === 'heatsink') { // radiateur alu : semelle de 3 mm et 11 ailettes de 1,2 mm (z local : vers l'extérieur)
    const parts: { g: BufferGeometry; c: Color }[] = [], c = new Color(p.color ?? '#cbd5e1'), D = p.depth ?? 23;
    const base = new BoxGeometry(p.w, p.h, 3); base.translate(0, 0, -D / 2 + 1.5); parts.push({ g: base, c });
    const nF = 11;
    for (let i = 0; i < nF; i++) { const fin = new BoxGeometry(1.2, p.h, D - 3); fin.translate(-p.w / 2 + 0.6 + i * ((p.w - 1.2) / (nF - 1)), 0, 1.5); parts.push({ g: fin, c: c.clone().multiplyScalar(0.85) }); }
    const geos = parts.map(({ g, c: cc }) => { const ni = g.toNonIndexed(); ni.deleteAttribute('uv'); const n = ni.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[3 * i] = cc.r; col[3 * i + 1] = cc.g; col[3 * i + 2] = cc.b; } ni.setAttribute('color', new Float32BufferAttribute(col, 3)); return ni; });
    const geo = mergeGeometries(geos)!;
    return { geo, edges: new EdgesGeometry(geo, 30) };
  }
  if (p.special === 'sensor') { // carte du capteur : circuit bleu, puce blanche à grille noire (côté +z local = vers le nid), quatre broches dorées
    const parts: { g: BufferGeometry; c: Color }[] = [];
    parts.push({ g: new BoxGeometry(p.w, p.h, 1.6), c: new Color('#1d4ed8') });
    const chip = new BoxGeometry(6, 6, 1.6); chip.translate(-1.5, 0, 1.6); parts.push({ g: chip, c: new Color('#e5e7eb') });
    const grille = new BoxGeometry(2, 2, 0.4); grille.translate(-1.5, 0, 2.5); parts.push({ g: grille, c: new Color('#111827') });
    for (let i = 0; i < 4; i++) { const pin = new BoxGeometry(0.64, 0.64, 4); pin.translate(-3.75 + i * 2.5, -p.h / 2 + 1.5, -1.8); parts.push({ g: pin, c: new Color('#d4a017') }); }
    const geos = parts.map(({ g, c }) => { const ni = g.toNonIndexed(); ni.deleteAttribute('uv'); const n = ni.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; } ni.setAttribute('color', new Float32BufferAttribute(col, 3)); return ni; });
    const geo = mergeGeometries(geos)!;
    return { geo, edges: new EdgesGeometry(geo, 30) };
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
    const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new Color(p.color ?? '#c8995a');
    for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; }
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    return { geo: g, edges: new EdgesGeometry(g, 30) };
  }
  if (p.special === 'block') { // pavé d'isolant : une boîte pleine
    const g = new BoxGeometry(p.w, p.h, p.depth ?? t), n = g.attributes.position.count, col = new Float32Array(n * 3), c = new Color(p.color ?? '#f59e0b');
    for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; }
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    return { geo: g, edges: new EdgesGeometry(g, 30) };
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
    parts.push({ g: board, c: new Color('#0f5132') });
    const SILVER = new Color('#b8bcc2'), BLACK = new Color('#18181b'), GOLD = new Color('#d4a017'), WHITE = new Color('#f5f5f4');
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: Color) => { const g = new BoxGeometry(w, h, d); g.translate(px(x), py(y), z); parts.push({ g, c }); };
    box(12.5, 12.5, 1.1, 33, 14, 1.25, SILVER); // RP3A0 sous son blindage
    box(11.2, 7.5, 3.3, 12.4, 3.5, 2.35, SILVER); // mini HDMI, au bord bas
    box(8, 5.6, 2.6, 41.4, 2.8, 2.0, SILVER); // micro USB données
    box(8, 5.6, 2.6, 54, 2.8, 2.0, SILVER); // micro USB alimentation
    box(14, 11.5, 1.8, 6.5, 16.9, 1.1, SILVER); // lecteur microSD, au bout gauche
    box(4, 17, 2, 61.5, 15, 1.7, WHITE); // connecteur de nappe caméra, au bout droit
    box(51, 5, 2.5, 32.5, 26.5, 1.95, BLACK); // support des broches GPIO 2 × 20
    for (let i = 0; i < 20; i++) for (const dy of [-1.27, 1.27]) box(0.64, 0.64, 3, 32.5 + (i - 9.5) * 2.54, 26.5 + dy, 3.2, GOLD);
  } else if (p.special === 'bar') parts.push({ g: new BoxGeometry(p.w, p.h, t), c: new Color('#a16207') }); // barre de bois : longueur w, largeur h, 3 mm
  else if (p.special === 'ir') { // carte de 4 LED infrarouges, côté LED vers −z
    parts.push({ g: new BoxGeometry(p.w, p.h, 1.6), c: new Color('#3f1d1d') });
    for (const dx of [-3, 3]) for (const dy of [-6, 6]) { const led = new BoxGeometry(3.2, 3.2, 3.2); led.translate(dx, dy, -2.4); parts.push({ g: led, c: new Color('#f87171') }); }
  } else {
  const pcb = new BoxGeometry(p.w, p.h, 1.6);
  parts.push({ g: pcb, c: new Color('#1f7a3d') });
  const con = new BoxGeometry(17, 5.5, 2.6); con.translate(0, p.h / 2 - 4.5, 2.1);
  parts.push({ g: con, c: new Color('#e5e5e5') });
  const lensBase = new BoxGeometry(8.5, 8.5, 3); lensBase.translate(0, 0, -2.3);
  parts.push({ g: lensBase, c: new Color('#27272a') });
  const lens = new CylinderGeometry(4, 4, 6, 24); lens.rotateX(Math.PI / 2); lens.translate(0, 0, -6.8);
  parts.push({ g: lens, c: new Color('#09090b') });
  }
  const geos = parts.map(({ g, c }) => {
    const ni = g.toNonIndexed(); ni.deleteAttribute('uv');
    const n = ni.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; }
    ni.setAttribute('color', new Float32BufferAttribute(col, 3));
    return ni;
  });
  const geo = mergeGeometries(geos)!;
  return { geo, edges: new EdgesGeometry(geo, 30) };
}

function plankGeometry(p: Plank, t: number): { geo: BufferGeometry; edges: BufferGeometry } {
  if (p.special && p.special !== 'alu') return cameraGeometry(p, t);
  const pts = outline(p);
  const shape = new Shape(pts.map(([x, y]) => new Vector2(x, y)));
  for (const h of p.holes) shape.holes.push(new Path(holeOutline(h).map(([x, y]) => new Vector2(x, y))));
  const geo = new ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  geo.translate(0, 0, -t / 2);
  // couleur par face d'après la normale : dessus, dessous, tranche
  const nrm = geo.attributes.normal, col = new Float32Array(nrm.count * 3);
  for (let i = 0; i < nrm.count; i++) {
    const z = nrm.getZ(i), c = z > 0.5 ? TOP : z < -0.5 ? BOTTOM : SIDE;
    col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b;
  }
  if (p.special === 'alu') { const c = new Color(p.color ?? '#cbd5e1'); for (let i = 0; i < nrm.count; i++) { const k = nrm.getZ(i) < -0.5 ? 0.9 : Math.abs(nrm.getZ(i)) <= 0.5 ? 0.8 : 1; col[3 * i] = c.r * k; col[3 * i + 1] = c.g * k; col[3 * i + 2] = c.b * k; } } // aluminium : une seule teinte
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  const pos: number[] = [];
  for (const loop of [pts, ...p.holes.map(holeOutline)]) for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    pos.push(a[0], a[1], -t / 2, b[0], b[1], -t / 2, a[0], a[1], t / 2, b[0], b[1], t / 2);
    if (loop.length <= 12) pos.push(a[0], a[1], -t / 2, a[0], a[1], t / 2); // verticales aux angles (pas sur les cercles)
  }
  return { geo, edges: new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pos, 3)) };
}

/** Les réglages d'un trou : forme, dimensions, position depuis le coin haut-gauche de la plaque. Servi par la fenêtre du clic droit et par la section « Trous ». */
function HoleFields({ plank, hole, onChange }: { plank: Plank; hole: Hole; onChange: (patch: Partial<Hole>) => void }) {
  const rounded = !!hole.r && hole.r > 0;
  return (
    <>
      <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
        Forme
        <Chip active={hole.shape === 'round'} onClick={() => onChange({ shape: 'round' })}>Rond</Chip>
        <Chip active={hole.shape === 'square'} onClick={() => onChange({ shape: 'square', sh: hole.sh ?? hole.size })}>Rectangle</Chip>
      </div>
      {hole.shape === 'round' ? (
        <Slider label="Diamètre" value={hole.size} min={1} max={Math.max(2, Math.min(plank.w, plank.h) - 2)} step={1} unit=" mm" onChange={(v) => onChange({ size: v })} />
      ) : (
        <>
          <Slider label="Longueur (selon la largeur de la plaque)" value={hole.size} min={1} max={Math.max(2, plank.w - 2)} step={1} unit=" mm" onChange={(v) => onChange({ size: v })} />
          <Slider label="Largeur (selon la hauteur de la plaque)" value={hole.sh ?? hole.size} min={1} max={Math.max(2, plank.h - 2)} step={1} unit=" mm" onChange={(v) => onChange({ sh: v })} />
          <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
            Coins
            <Chip active={!rounded} onClick={() => onChange({ r: 0 })}>Droits</Chip>
            <Chip active={rounded} onClick={() => onChange({ r: Math.min(3, hole.size / 2, (hole.sh ?? hole.size) / 2) })}>Arrondis</Chip>
          </div>
          {rounded && <Slider label="Rayon des coins" value={hole.r!} min={0.5} max={Math.max(0.5, Math.min(hole.size, hole.sh ?? hole.size) / 2)} step={0.5} unit=" mm" onChange={(v) => onChange({ r: v })} />}
        </>
      )}
      {/* réglage : distance du bord gauche / haut de la plaque au centre du trou (en interne, repère centré) */}
      <Slider label="Centre du trou depuis le bord gauche" value={Math.round(hole.x + plank.w / 2)} min={0} max={plank.w} step={1} unit=" mm" onChange={(v) => onChange({ x: v - plank.w / 2 })} marks={[{ at: plank.w / 2, label: `milieu : ${plank.w / 2}` }]} />
      <Slider label="Centre du trou depuis le bord haut" value={Math.round(plank.h / 2 - hole.y)} min={0} max={plank.h} step={1} unit=" mm" onChange={(v) => onChange({ y: plank.h / 2 - v })} marks={[{ at: plank.h / 2, label: `milieu : ${plank.h / 2}` }]} />
    </>
  );
}

/** Volet du panneau de droite : un titre-bouton toujours visible, le contenu déroulé dessous prend la place et défile. Un seul volet ouvert à la fois (onglets verticaux). */
function Drawer({ title, note, open, onToggle, children }: { title: string; note?: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className={`flex min-h-0 flex-col border-b border-stone-200 ${open ? 'flex-1' : ''}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-emerald-900 select-none hover:bg-stone-100/70">
        <span className="flex items-center gap-1.5"><span aria-hidden className={`inline-block w-3 text-stone-400 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>{title}</span>
        {note && <span className="text-[10px] font-normal text-stone-400">{note}</span>}
      </button>
      {open && <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">{children}</div>}
    </div>
  );
}

/** Nom cliquable : un clic choisit ; un clic sur le nom déjà choisi (ou un double-clic) permet de le renommer (Entrée / clic ailleurs : valide, Échap : annule). */
function NameEdit({ value, active, onSelect, onRename, prefix = '', title }: { value: string; active: boolean; onSelect: (e: React.MouseEvent) => void; onRename: (v: string) => void; prefix?: string; title?: string }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(value);
  const done = (ok: boolean) => { setEdit(false); const v = text.trim(); if (ok && v && v !== value) onRename(v); };
  if (edit) return <input autoFocus value={text} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setText(e.target.value)} onBlur={() => done(true)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); }} onClick={(e) => e.stopPropagation()} className="min-w-0 flex-1 rounded border border-emerald-400 bg-white px-1 py-0.5 text-[11px] font-semibold text-stone-800 outline-none" />;
  const start = () => { setText(value); setEdit(true); };
  return <button onClick={(e) => { if (active && !e.ctrlKey && !e.metaKey) start(); else onSelect(e); }} onDoubleClick={start} className="min-w-0 flex-1 whitespace-normal text-left font-semibold leading-tight text-stone-800 [overflow-wrap:anywhere]" title={title ?? 'Clique à nouveau pour renommer'}>{prefix}{value}</button>;
}

/** Icône d'œil : ouvert = affiché, barré = caché. */
function Eye({ off }: { off: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

interface View { scene: Scene; camera: PerspectiveCamera; renderer: WebGLRenderer; orbit: OrbitControls; meshes: Map<string, Mesh>; labels: Group; handles: Group; targets: Group; holeMark: Group; pullMark: Group; cutMark: Group; dragging: boolean }

/** Plan de coupe : l'espace est coupé en deux, on voit un côté, l'autre est invisible. */
interface Cut { on: boolean; axis: 'x' | 'y' | 'z'; pos: number; flip: boolean }
const AXIS_N: Record<Cut['axis'], Vector3> = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };
const AXIS_I = { x: 0, y: 1, z: 2 } as const;
const CUT_MAT = new MeshBasicMaterial({ color: '#2563eb', transparent: true, opacity: 0.18, side: DoubleSide, depthWrite: false });

const PULL_MARK = new LineDashedMaterial({ color: '#0284c7', dashSize: 3, gapSize: 2, depthTest: false });


const HOLE_MARK = new LineDashedMaterial({ color: '#d97706', dashSize: 2.5, gapSize: 1.5, depthTest: false });

/** Ronds de coin : vert clair sur la face avant (+z de la plaque, ou z max d'une boîte), vert foncé sur la face arrière — sur une plaque fine les deux se chevauchent, on les distingue à la couleur. */
const SNAP = 16; // pixels à l'écran : un coin tiré qui passe devant ou derrière un coin d'une autre pièce s'y aimante, quelle que soit la profondeur

/** Étiquette de mesure flottante : texte dessiné sur un canvas, toujours face à la caméra, au-dessus de tout. */
function measureSprite(text: string): Sprite {
  const cv = document.createElement('canvas');
  cv.width = 320; cv.height = 72;
  const g = cv.getContext('2d')!;
  g.font = '600 34px system-ui, sans-serif';
  const w = g.measureText(text).width + 28;
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.beginPath(); g.roundRect((cv.width - w) / 2, 8, w, 56, 12); g.fill();
  g.strokeStyle = '#a8a29e'; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#1c1917'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, cv.width / 2, 37);
  const sp = new Sprite(new SpriteMaterial({ map: new CanvasTexture(cv), transparent: true })); // testée en profondeur : cachée derrière le bois
  sp.scale.set(60, 13.5, 1);
  sp.renderOrder = 20;
  return sp;
}

// cotes testées en profondeur : on ne voit pas celles qui sont derrière une pièce
const DIM = new LineBasicMaterial({ color: '#1c1917' });
const EXT = new LineBasicMaterial({ color: '#a8a29e' });

/**
 * Une cote : trait de a à b, petites barres aux deux bouts (le long de `tick`), traits de rappel vers l'objet (de a − off et b − off),
 * et la mesure au milieu. Tout en coordonnées du groupe parent.
 */
function dimension(a: Vector3, b: Vector3, tick: Vector3, off: Vector3, text: string): Group {
  const g = new Group();
  const t = tick.clone().multiplyScalar(4);
  const pos = [a, b, a.clone().sub(t), a.clone().add(t), b.clone().sub(t), b.clone().add(t)].flatMap((p) => [p.x, p.y, p.z]);
  g.add(new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pos, 3)), DIM));
  const ext = [a.clone().sub(off), a, b.clone().sub(off), b].flatMap((p) => [p.x, p.y, p.z]);
  g.add(new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(ext, 3)), EXT));
  const sp = measureSprite(text);
  sp.position.copy(a).add(b).multiplyScalar(0.5).add(tick.clone().multiplyScalar(9));
  g.add(sp);
  return g;
}

export default function Planks() {
  const [sc, setSc] = useState<PlankScene>(() => loadScene());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [extra, setExtra] = useState<Set<string>>(new Set()); // sélection multiple (Ctrl + clic) en plus de la plaque principale
  const [hover, setHover] = useState<{ plank?: string; group?: string } | null>(null); // survol dans le volet « Pièces » : surbrillance dans la 3D
  const [cutCfg, setCutCfg] = useState<{ W: number; H: number; gap: number }>(() => { try { const d = JSON.parse(localStorage.getItem('plaques-decoupe') ?? ''); if (d && typeof d.W === 'number') return d; } catch { /* rien */ } return { W: 410, H: 400, gap: 5 }; });
  useEffect(() => { try { localStorage.setItem('plaques-decoupe', JSON.stringify(cutCfg)); } catch { /* rien */ } }, [cutCfg]);
  const [cutView, setCutView] = useState(false); // aperçu des planches à la place de la 3D
  const sheets = useMemo(() => nestSheets(sc, cutCfg.W, cutCfg.H, cutCfg.gap), [sc, cutCfg]);
  const preview = useMemo(() => sheetsPreviewSvg(sheets, cutCfg.W, cutCfg.H), [sheets, cutCfg]);
  const [pull, setPull] = useState<{ plankId: string; axis: FaceAxis; sign: 1 | -1 } | null>(null); // face double-cliquée, à tirer
  const pullRef = useRef(pull);
  pullRef.current = pull;
  const [leftOpen, setLeftOpen] = useState<boolean>(() => { try { return localStorage.getItem('plaques-menu-gauche') !== '0'; } catch { return true; } }); // panneau de gauche replié ou non
  useEffect(() => { try { localStorage.setItem('plaques-menu-gauche', leftOpen ? '1' : '0'); } catch { /* rien */ } }, [leftOpen]);
  const [schemaOn, setSchemaOn] = useState<boolean>(() => { try { return localStorage.getItem('plaques-schema') !== '0'; } catch { return true; } }); // ouvert par défaut // schéma électrique à côté de la 3D
  useEffect(() => { try { localStorage.setItem('plaques-schema', schemaOn ? '1' : '0'); } catch { /* rien */ } }, [schemaOn]);
  const [cut, setCut] = useState<Cut>(() => { try { const j = JSON.parse(localStorage.getItem('plaques-coupe') ?? '{}'); return { on: false, axis: j.axis ?? 'y', pos: 0, flip: !!j.flip }; } catch { return { on: false, axis: 'y', pos: 0, flip: false }; } });
  const cutRef = useRef(cut);
  cutRef.current = cut;
  useEffect(() => { try { localStorage.setItem('plaques-coupe', JSON.stringify({ axis: cut.axis, flip: cut.flip })); } catch { /* rien */ } }, [cut.axis, cut.flip]);
  /** Milieu de la scène le long d'un axe : position de départ du plan de coupe. */
  const midOf = (axis: Cut['axis']) => { const s = scRef.current; if (!s.planks.length) return 0; const b = bounds(s.planks, s.t); const i = AXIS_I[axis]; return Math.round((b.min[i] + b.max[i]) / 2); };
  const [hidden, setHidden] = useState<Set<string>>(() => { try { return new Set<string>(JSON.parse(localStorage.getItem('plaques-caches') ?? '[]')); } catch { return new Set<string>(); } }); // pièces cachées dans la 3D (œil du volet « Pièces »)
  useEffect(() => { try { localStorage.setItem('plaques-caches', JSON.stringify([...hidden])); } catch { /* rien */ } }, [hidden]);
  const toggleHidden = (ids: string[]) => setHidden((h) => { const n = new Set(h); const allHidden = ids.every((i) => n.has(i)); for (const i of ids) { if (allHidden) n.delete(i); else n.add(i); } return n; });
  const [piReady, setPiReady] = useState(!!piModel); // le modèle 3D du Pi est chargé : on redessine les Pi
  useEffect(() => { if (!piModel) void loadPiModel().then(() => setPiReady(!!piModel)); }, []);
  const [groupSel, setGroupSel] = useState<string | null>(null); // la sélection est toute une boîte (groupe) : clic dans la 3D ou sur la ligne du groupe
  const groupSelRef = useRef(groupSel);
  groupSelRef.current = groupSel;
  const extraRef = useRef(extra);
  extraRef.current = extra;
  /** Clic sur une plaque : Ctrl = ajoute / retire de la sélection multiple, sinon la choisit seule. */
  const pick = (id: string | null, ctrl: boolean) => {
    if (!ctrl && id) { // un composant électronique : choisi seul, son groupe est déplié dans « Pièces » et la carte affichée
      const pl = scRef.current.planks.find((p) => p.id === id);
      if (pl) { // n'importe quelle pièce (plus seulement l'électronique) : choisie seule, son groupe déplié dans « Pièces », la carte affichée
        setSelectedId(id); setExtra(new Set()); setGroupSel(null); setDrawer('pieces'); if (pl.group) { const g = pl.group; setOpenGroups((s) => new Set([...s, g])); }
        setTimeout(() => document.querySelector(`[data-pid="${id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
        return;
      }
    }
    if (!ctrl) { setSelectedId(id); setExtra(new Set()); const g = id ? scRef.current.planks.find((p) => p.id === id)?.group : undefined; setGroupSel(g ?? null); return; }
    if (!id) return;
    const cur = selRef.current;
    if (!cur) { setSelectedId(id); return; }
    if (id === cur) return;
    setExtra((e) => { const n = new Set(e); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const history = useRef<HistoryEntry[]>(loadHistory()); // Retour : états précédents, le plus récent en dernier ; gardé au rechargement
  const [backLabel, setBackLabel] = useState<string | null>(() => { const h = loadHistory(); return h.length ? h[h.length - 1].label : null; });
  const [histN, setHistN] = useState(0); // change à chaque modification de l'historique, pour redessiner la liste
  const [drawer, setDrawer] = useState<'pieces' | 'history' | null>(() => { try { return (localStorage.getItem('plaques-volet') as 'pieces' | 'history' | null) ?? 'pieces'; } catch { return 'pieces'; } }); // volet ouvert à droite
  useEffect(() => { try { localStorage.setItem('plaques-volet', drawer ?? ''); } catch { /* rien */ } }, [drawer]);
  const [ctx, setCtx] = useState<{ x: number; y: number; plankId: string; local: [number, number] } | null>(null); // menu du clic droit
  const [holeEdit, setHoleEdit] = useState<{ plankId: string; holeId: string; fresh?: boolean } | null>(null); // fenêtre de réglage d'un trou ; `fresh` : trou qui vient d'être créé, ses réglages se fondent dans « Trou ajouté »
  const [holeHover, setHoleHover] = useState<{ plankId: string; holeId: string } | null>(null); // trou survolé dans la section « Trous »
  const [cast, setCast] = useState<{ n: number; phase: 0 | 1; auto: boolean }>({ n: 7, phase: 0, auto: true }); // réglages du prochain crénelage ; auto = même règle que les boîtes (une dent ≈ 16 mm, impair)
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<View | null>(null);
  const scRef = useRef(sc);
  scRef.current = sc;
  const selRef = useRef(selectedId);
  selRef.current = selectedId;
  useEffect(() => { saveScene(sc); saveHistory(history.current); }, [sc]); // la scène et l'historique sont enregistrés ensemble

  /** Toute modification passe ici : l'état d'avant est gardé pour « Retour » (un même geste répété en moins d'une seconde — curseur, glissé — ne fait qu'une entrée). */
  const commit = (label: string, next: (s: PlankScene) => PlankScene, merge = false) => {
    const prev = scRef.current;
    const top = history.current[history.current.length - 1];
    const now = Date.now();
    if (top && top.label === label && (now - top.at < 1000 || merge)) top.at = now; // `merge` : se fond dans l'entrée précédente de même nom, quel que soit le délai
    else history.current.push({ label, scene: prev, at: now }); // sans limite : tout l'historique est gardé
    setBackLabel(label);
    setHistN((n) => n + 1);
    const n = next(prev);
    scRef.current = n;
    setSc(n);
  };
  /** Revient à l'état d'avant l'action n° `index` de l'historique (elle et les suivantes sont annulées) ; sans index : la dernière. */
  const undoTo = (index = history.current.length - 1) => {
    const e = history.current[index];
    if (!e) return;
    history.current.length = index;
    scRef.current = e.scene;
    setSc(e.scene);
    if (selRef.current && !e.scene.planks.some((p) => p.id === selRef.current)) setSelectedId(null);
    setHoleEdit(null);
    setBackLabel(history.current.length ? history.current[history.current.length - 1].label : null);
    setHistN((n) => n + 1);
  };
  const back = () => undoTo();
  /** Vide l'historique (la scène ne change pas) : plus rien à annuler. */
  const clearHistory = () => { history.current = []; saveHistory([]); setBackLabel(null); setHistN((n) => n + 1); };
  const backRef = useRef(back);
  backRef.current = back;
  const update = (id: string, patch: Partial<Plank>, label = 'Réglage de la plaque') => commit(label, (s) => ({ ...s, planks: s.planks.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const selected = sc.planks.find((p) => p.id === selectedId) ?? null;
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const moveRef = useRef(moveWithGroup);
  moveRef.current = moveWithGroup;
  // Suppr : supprime la plaque choisie ; Ctrl+Z : Retour ; Échap : ferme menu et fenêtre
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); backRef.current(); }
      if ((e.key === 'Delete' || (e.key === 'Backspace' && !typing)) && !typing && selRef.current) {
        e.preventDefault();
        const id = selRef.current, g = groupSelRef.current;
        if (g) commitRef.current('Boîte supprimée', (s) => ({ ...s, planks: s.planks.filter((p) => p.group !== g) }));
        else commitRef.current('Plaque supprimée', (s) => ({ ...s, planks: s.planks.filter((p) => p.id !== id) }));
        setSelectedId(null); setGroupSel(null); setHoleEdit(null);
      }
      if (e.key === 'Escape') { setCtx(null); setHoleEdit(null); setExtra(new Set()); setPull(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ----- vue 3D -----
  useEffect(() => {
    const el = host.current!;
    const scene = new Scene();
    scene.background = new Color('#eef2f1');
    scene.add(new AmbientLight('#ffffff', 1.1));
    const sun = new DirectionalLight('#ffffff', 1.8);
    sun.position.set(300, -400, 500);
    scene.add(sun);
    const camera = new PerspectiveCamera(40, 1, 1, 6000);
    camera.up.set(0, 0, 1); // Z = hauteur, comme la visionneuse STL
    camera.position.set(1150, -1250, 700); // vue de départ en 3/4, assez loin pour voir le nichoir ET le panneau solaire (à 70 cm à droite)
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.PAN };
    orbit.target.set(330, 0, 100);
    orbit.enableDamping = true;
    const labels = new Group();
    const handles = new Group(); // ronds aux coins de l'élément choisi : on les tire pour déplacer l'élément par ce coin
    const targets = new Group(); // ronds aux coins des autres pièces (demi-transparents), visibles pendant un tel glissé : le coin tiré s'y aimante
    targets.visible = false;
    scene.add(labels, handles, targets);
    const holeMark = new Group(); // le trou en cours de réglage, en pointillés ambre sur les deux faces de la plaque
    renderer.localClippingEnabled = true;
    const cutMark = new Group(); // le plan de coupe (carré bleu transparent), qu'on glisse le long de son axe
    scene.add(cutMark);
    const pullMark = new Group(); // la face double-cliquée, en pointillés bleus : on la tire ou on la pousse
    scene.add(holeMark, pullMark);
    const v: View = { scene, camera, renderer, orbit, meshes: new Map(), labels, handles, targets, holeMark, pullMark, cutMark, dragging: false };
    // glissé de la face : le long de sa normale
    let pullDrag: { total: number; s0: number; P0: Vector3; N: Vector3 } | null = null;
    const lineParam = (P0: Vector3, N: Vector3): number | null => { // paramètre du point de la droite (P0, N) le plus proche du rayon souris
      const o = ray.ray.origin, r = ray.ray.direction, w0 = o.clone().sub(P0);
      const b = r.dot(N), dd = r.dot(w0), ee = N.dot(w0), den = 1 - b * b;
      if (Math.abs(den) < 1e-4) return null;
      return (ee - b * dd) / den;
    };
    const onPullDown = (e: PointerEvent) => {
      const pl = pullRef.current;
      if (e.button !== 0 || !pl) return;
      rayAt(e);
      const hit = ray.intersectObjects([...v.meshes.values()], false)[0];
      if (!hit || (hit.object.userData.id as string) !== pl.plankId) return;
      const m = v.meshes.get(pl.plankId)!;
      const p = scRef.current.planks.find((x) => x.id === pl.plankId)!;
      const N = new Vector3(pl.axis === 'x' ? 1 : 0, pl.axis === 'y' ? 1 : 0, pl.axis === 'z' ? 1 : 0).multiplyScalar(pl.sign).applyQuaternion(m.quaternion).normalize();
      const half = pl.axis === 'x' ? p.w / 2 : pl.axis === 'y' ? p.h / 2 : scRef.current.t / 2;
      const P0 = m.position.clone().addScaledVector(N, half);
      const s0 = lineParam(P0, N);
      if (s0 === null) return;
      pullDrag = { total: 0, s0, P0, N };
      orbit.enabled = false; v.dragging = true;
      renderer.domElement.setPointerCapture(e.pointerId);
      history.current.push({ label: 'Face tirée', scene: scRef.current, at: Date.now() });
      setBackLabel('Face tirée'); setHistN((k) => k + 1);
      e.stopImmediatePropagation();
    };
    const onPullMove = (e: PointerEvent) => {
      if (!pullDrag) return;
      rayAt(e);
      const sNow = lineParam(pullDrag.P0, pullDrag.N);
      if (sNow === null) return;
      const want = Math.round(sNow - pullDrag.s0); // au millimètre
      const inc = want - pullDrag.total;
      if (!inc) return;
      const pl = pullRef.current!;
      const { scene: n, applied } = pullFace(scRef.current, pl.plankId, pl.axis, pl.sign, inc);
      pullDrag.total += applied;
      if (applied) { scRef.current = n; setSc(n); }
    };
    const onPullUp = () => { if (!pullDrag) return; pullDrag = null; orbit.enabled = true; setTimeout(() => { v.dragging = false; }, 0); };
    // glisser le plan de coupe le long de son axe
    let cutDrag: { s0: number; pos0: number; P0: Vector3; N: Vector3 } | null = null;
    const onCutDown = (e: PointerEvent) => {
      const c = cutRef.current;
      if (e.button !== 0 || !c.on) return;
      rayAt(e);
      const hit = ray.intersectObjects(v.cutMark.children, false)[0];
      if (!hit) return;
      const plankHit = ray.intersectObjects([...v.meshes.values()], false)[0];
      if (plankHit && plankHit.distance < hit.distance - 0.5) return; // une plaque devant le plan : on la laisse
      const N = AXIS_N[c.axis].clone();
      const s0 = lineParam(hit.point.clone(), N);
      if (s0 === null) return;
      cutDrag = { s0, pos0: c.pos, P0: hit.point.clone(), N };
      orbit.enabled = false; v.dragging = true;
      renderer.domElement.setPointerCapture(e.pointerId);
      e.stopImmediatePropagation();
    };
    const onCutMove = (e: PointerEvent) => {
      if (!cutDrag) return;
      rayAt(e);
      const sNow = lineParam(cutDrag.P0, cutDrag.N);
      if (sNow === null) return;
      const pos = Math.round(cutDrag.pos0 + sNow - cutDrag.s0);
      setCut((c) => (c.pos === pos ? c : { ...c, pos }));
    };
    const onCutUp = () => { if (!cutDrag) return; cutDrag = null; orbit.enabled = true; setTimeout(() => { v.dragging = false; }, 0); };
    renderer.domElement.addEventListener('pointerdown', onCutDown, true);
    renderer.domElement.addEventListener('pointermove', onCutMove);
    renderer.domElement.addEventListener('pointerup', onCutUp);
    renderer.domElement.addEventListener('pointerdown', onPullDown, true);
    renderer.domElement.addEventListener('pointermove', onPullMove);
    renderer.domElement.addEventListener('pointerup', onPullUp);
    // glissé par un coin
    let cornerDrag: { anchorId: string; start: Vector3; plane: Plane; startPos: Vec3; rot: Vec3 } | null = null;
    const rayAt = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    };
    const onCornerDown = (e: PointerEvent) => {
      if (e.button !== 0 || !handles.visible || pullRef.current) return;
      rayAt(e);
      const hit = ray.intersectObjects(handles.children, false)[0];
      const id = selRef.current;
      const p = id ? scRef.current.planks.find((x) => x.id === id) : undefined;
      if (!hit || !p) return;
      const start = hit.object.position.clone();
      const n = camera.getWorldDirection(new Vector3());
      cornerDrag = { anchorId: p.id, start, plane: new Plane().setFromNormalAndCoplanarPoint(n, start), startPos: [...p.pos] as Vec3, rot: [...p.rot] as Vec3 };
      orbit.enabled = false; v.dragging = true; targets.visible = true;
      renderer.domElement.setPointerCapture(e.pointerId);
      history.current.push({ label: 'Déplacement par un coin', scene: scRef.current, at: Date.now() });
      setBackLabel('Déplacement par un coin'); setHistN((k) => k + 1);
      e.stopImmediatePropagation();
    };
    const onCornerMove = (e: PointerEvent) => {
      if (!cornerDrag) return;
      rayAt(e);
      const P = new Vector3();
      if (!ray.ray.intersectPlane(cornerDrag.plane, P)) return;
      // aimantation à l'écran : si la souris passe sur un coin d'une autre pièce (devant ou derrière, même loin), le coin tiré y saute
      const r = renderer.domElement.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let best: Vector3 | null = null, bd = SNAP;
      for (const tg of targets.children) {
        const q = tg.position.clone().project(camera);
        if (q.z > 1) continue; // derrière la caméra
        const d = Math.hypot(((q.x + 1) / 2) * r.width - mx, ((1 - q.y) / 2) * r.height - my);
        if (d < bd) { bd = d; best = tg.position; }
      }
      if (best) P.copy(best);
      const d = P.clone().sub(cornerDrag.start);
      const pos: Vec3 = [r2(cornerDrag.startPos[0] + d.x), r2(cornerDrag.startPos[1] + d.y), r2(cornerDrag.startPos[2] + d.z)];
      const { anchorId, rot } = cornerDrag;
      setSc((s) => { const n = moveWithGroup(s, anchorId, pos, rot); scRef.current = n; return n; });
    };
    const onCornerUp = () => { if (!cornerDrag) return; cornerDrag = null; orbit.enabled = true; targets.visible = false; setTimeout(() => { v.dragging = false; }, 0); };
    renderer.domElement.addEventListener('pointerdown', onCornerDown, true);
    renderer.domElement.addEventListener('pointermove', onCornerMove);
    renderer.domElement.addEventListener('pointerup', onCornerUp);
    // un clic (sans glissé) choisit une plaque ; dans le vide, désélectionne
    const ray = new Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (cornerDrag) { down = null; return; }
      if (!down || v.dragging || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || (e.button !== 0 && e.button !== 2)) { down = null; return; }
      down = null;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects([...v.meshes.values()], false)[0];
      const id = hit ? (hit.object.userData.id as string) : null;
      if (e.button === 2) { // clic droit sur une plaque : menu, avec le point touché en coordonnées de la plaque
        if (hit && id) { const local = hit.object.worldToLocal(hit.point.clone()); setSelectedId(id); setCtx({ x: e.clientX - r.left, y: e.clientY - r.top, plankId: id, local: [local.x, local.y] }); }
        else setCtx(null);
        return;
      }
      setCtx(null);
      pickRef.current(id, e.ctrlKey || e.metaKey);
    };
    // survol : un composant électronique passe en surbrillance (la même que le survol dans « Pièces »), curseur main
    let hov: string | null = null;
    const onHover = (e: PointerEvent) => {
      let id: string | null = null;
      if (e.buttons === 0 && !v.dragging && !cornerDrag) {
        const r = renderer.domElement.getBoundingClientRect();
        ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
        const h = ray.intersectObjects([...v.meshes.values()].filter((m) => m.visible), false)[0];
        const hid = h ? (h.object.userData.id as string) : null;
        const pl = hid ? scRef.current.planks.find((p) => p.id === hid) : undefined;
        if (pl) id = pl.id; // toute pièce survolée passe en surbrillance
      }
      renderer.domElement.style.cursor = id ? 'pointer' : '';
      if (id !== hov) { hov = id; setHover(id ? { plank: id } : null); }
    };
    renderer.domElement.addEventListener('pointermove', onHover);
    renderer.domElement.addEventListener('pointerleave', () => { if (hov) { hov = null; setHover(null); } });
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let raf = 0;
    const loop = () => { orbit.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    view.current = v;
    return () => { cancelAnimationFrame(raf); ro.disconnect(); orbit.dispose(); renderer.dispose(); renderer.domElement.remove(); view.current = null; };
  }, []);

  // l'état → la scène : une mesh par plaque, géométrie refaite si la forme change, position / rotation recopiées (sauf pendant un glissé)
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const seen = new Set<string>();
    const clipPlanes = cut.on ? [new Plane(AXIS_N[cut.axis].clone().multiplyScalar(cut.flip ? -1 : 1), cut.flip ? cut.pos : -cut.pos)] : null; // le côté « devant » est gardé, l'autre devient invisible
    for (const p of sc.planks) {
      if (p.special === 'doc') continue; // document : rien à dessiner dans la 3D
      seen.add(p.id);
      let m = v.meshes.get(p.id);
      const key = JSON.stringify([p.w, p.h, p.notches, p.holes, sc.t, p.path, p.depth, p.special === 'pi' && !!piModel]); // tout ce qui change la forme : dimensions, crans, trous, épaisseur
      if (!m) {
        m = new Mesh(new BufferGeometry(), new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.85, side: DoubleSide }));
        m.userData.id = p.id;
        m.add(new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: '#4a3014' })));
        v.scene.add(m);
        v.meshes.set(p.id, m);
      }
      if (m.userData.key !== key) {
        const { geo, edges } = plankGeometry(p, sc.t);
        m.geometry.dispose();
        m.geometry = geo;
        const lines = m.children[0] as LineSegments;
        lines.geometry.dispose();
        lines.geometry = edges;
        m.userData.key = key;
      }
      m.position.set(...p.pos);
      m.rotation.set(...(p.rot.map(MathUtils.degToRad) as Vec3));
      const mat = m.material as MeshStandardMaterial;
      const hovered = !!hover && (hover.plank === p.id || (!!hover.group && hover.group === p.group));
      const chosen = groupSel ? p.group === groupSel : p.id === selectedId; // boîte choisie : toutes ses plaques
      mat.emissive.set(hovered ? '#d97706' : chosen ? '#3d6f5a' : extra.has(p.id) ? '#2f5f8a' : '#000000'); // survolé dans la liste : ambre
      mat.emissiveIntensity = hovered ? 0.5 : 0.35;
      if (p.name === 'Toit en chêne') { if (!mat.map) { mat.map = oakTexture(); mat.vertexColors = false; mat.color.set('#ffffff'); mat.roughness = 0.7; mat.needsUpdate = true; } } // le pan de toit en chêne porte une texture de bois (le reste garde ses couleurs par sommets)
      mat.transparent = !!p.transparent;
      mat.opacity = p.transparent ? 0.3 : 1;
      mat.depthWrite = !p.transparent;
      mat.needsUpdate = true;
      mat.clippingPlanes = clipPlanes;
      const isHidden = hidden.has(p.id);
      m.visible = !isHidden;
      m.layers.set(isHidden ? 1 : 0); // hors de la couche 0 : ni dessinée ni touchée par les clics
      ((m.children[0] as LineSegments).material as LineBasicMaterial).clippingPlanes = clipPlanes;
    }
    for (const [id, m] of v.meshes) if (!seen.has(id)) { v.scene.remove(m); m.geometry.dispose(); v.meshes.delete(id); }
    // ronds de coin : sur l'élément choisi (vert, à tirer) et sur toutes les autres pièces (bleu à 50 %, cibles d'aimantation, visibles pendant le glissé)
    for (const g of [v.handles, v.targets]) for (const o of [...g.children]) g.remove(o);
    v.handles.visible = false; // plus de ronds de coin : on ne déplace plus les pièces à la souris (retirés à la demande de l'utilisateur)
    // trou en cours de réglage (ou survolé) : son contour en pointillés sur les deux faces de la plaque
    for (const o of [...v.holeMark.children]) { v.holeMark.remove(o); o.traverse((c) => { const sp = c as Sprite; if (sp.isSprite) { sp.material.map?.dispose(); sp.material.dispose(); } else (c as Line).geometry?.dispose(); }); }
    const mark = holeEdit ?? holeHover;
    const mp = mark ? sc.planks.find((p) => p.id === mark.plankId) : undefined;
    const mh = mp?.holes.find((h) => h.id === mark!.holeId);
    const mm = mp ? v.meshes.get(mp.id) : undefined;
    if (mp && mh && mm) {
      const loop = holeOutline(mh);
      for (const z of [-sc.t / 2 - 0.3, sc.t / 2 + 0.3]) {
        const geo = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(loop.flatMap(([x, y]) => [x, y, z]), 3));
        const line = new LineLoop(geo, HOLE_MARK);
        line.computeLineDistances();
        line.renderOrder = 25;
        v.holeMark.add(line);
      }
      // cotes : du bord de la plaque au bord du trou, des quatre côtés, dans le plan de la face avant
      const hw = mh.shape === 'square' ? mh.size / 2 : mh.size / 2, hh = mh.shape === 'square' ? (mh.sh ?? mh.size) / 2 : mh.size / 2;
      const z = sc.t / 2 + 0.6, X = new Vector3(1, 0, 0), Yv = new Vector3(0, 1, 0), none = new Vector3();
      const r1 = (v: number) => `${+v.toFixed(2)}`; // valeur exacte au centième, sans zéros inutiles
      v.holeMark.add(
        dimension(new Vector3(-mp.w / 2, mh.y, z), new Vector3(mh.x - hw, mh.y, z), Yv, none, r1(mh.x - hw + mp.w / 2)), // gauche
        dimension(new Vector3(mh.x + hw, mh.y, z), new Vector3(mp.w / 2, mh.y, z), Yv, none, r1(mp.w / 2 - mh.x - hw)), // droite
        dimension(new Vector3(mh.x, mh.y + hh, z), new Vector3(mh.x, mp.h / 2, z), X, none, r1(mp.h / 2 - mh.y - hh)), // haut
        dimension(new Vector3(mh.x, -mp.h / 2, z), new Vector3(mh.x, mh.y - hh, z), X, none, r1(mh.y - hh + mp.h / 2)), // bas
      );
      v.holeMark.position.copy(mm.position);
      v.holeMark.quaternion.copy(mm.quaternion);
    }
    // face à tirer : son contour en pointillés bleus
    for (const o of [...v.pullMark.children]) { v.pullMark.remove(o); (o as Line).geometry.dispose(); }
    const pp = pull ? sc.planks.find((x) => x.id === pull.plankId) : undefined;
    const pm = pp ? v.meshes.get(pp.id) : undefined;
    if (pp && pm && pull) {
      const t2 = sc.t / 2 + 0.3, w2 = pp.w / 2 + 0.3, h2 = pp.h / 2 + 0.3;
      let loop: number[];
      if (pull.axis === 'z') { const z = pull.sign * t2; loop = outline(pp).flatMap(([x, y]) => [x, y, z]); }
      else if (pull.axis === 'x') { const x = pull.sign * w2; loop = [x, -h2, -t2, x, h2, -t2, x, h2, t2, x, -h2, t2]; }
      else { const y = pull.sign * h2; loop = [-w2, y, -t2, w2, y, -t2, w2, y, t2, -w2, y, t2]; }
      const line = new LineLoop(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(loop, 3)), PULL_MARK);
      line.computeLineDistances();
      line.renderOrder = 26;
      v.pullMark.add(line);
      v.pullMark.position.copy(pm.position);
      v.pullMark.quaternion.copy(pm.quaternion);
    }
    // plan de coupe : un grand carré bleu transparent, à la position réglée
    for (const o of [...v.cutMark.children]) { v.cutMark.remove(o); (o as Mesh).geometry.dispose(); }
    if (cut.on && sc.planks.length) {
      const { min, max } = bounds(sc.planks, sc.t);
      const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 50) * 1.4;
      const quad = new Mesh(new PlaneGeometry(size, size), CUT_MAT);
      const n = AXIS_N[cut.axis];
      quad.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), n);
      quad.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
      quad.position.setComponent(AXIS_I[cut.axis], cut.pos);
      quad.renderOrder = 5;
      v.cutMark.add(quad);
    }
    // cotes : traits le long des côtés de chaque composant de plus haut niveau (plaque seule : largeur et hauteur dans son plan ; groupe : l, L, H de son encombrement)
    for (const o of [...v.labels.children]) { v.labels.remove(o); o.traverse((c) => { const sp = c as Sprite; if (sp.isSprite) { sp.material.map?.dispose(); sp.material.dispose(); } else (c as Mesh).geometry?.dispose(); }); }
    { // cotes de l'HABILLAGE seulement (demande de l'utilisateur : plus de bouton « Mesures », plus de cotes sur les autres pièces) : l × L × H de son encombrement
      const O = 14; // écart entre l'objet et la cote
      const done = new Set<string>();
      for (const p of sc.planks) {
        if (p.group && (sc.groupNames?.[p.group] ?? '').startsWith('Habillage')) {
          if (done.has(p.group)) continue;
          done.add(p.group);
          const members = sc.planks.filter((x) => x.group === p.group && !hidden.has(x.id));
          if (!members.length) continue;
          const { min, max } = bounds(members, sc.t);
          const [l, L, H] = extents(members, sc.t);
          const X = new Vector3(1, 0, 0), Yn = new Vector3(0, -1, 0);
          v.labels.add(
            dimension(new Vector3(min[0], min[1] - O, min[2]), new Vector3(max[0], min[1] - O, min[2]), Yn, Yn.clone().multiplyScalar(O), `${l}`), // largeur, devant (−y), au sol
            dimension(new Vector3(max[0] + O, min[1], min[2]), new Vector3(max[0] + O, max[1], min[2]), X, X.clone().multiplyScalar(O), `${L}`), // profondeur, à droite, au sol
            dimension(new Vector3(max[0] + O, min[1] - O, min[2]), new Vector3(max[0] + O, min[1] - O, max[2]), X, new Vector3(O, -O, 0), `${H}`), // hauteur, sur l'arête avant droite
          );
        }
      }
    }
  }, [sc, selectedId, extra, hover, groupSel, holeEdit, holeHover, pull, cut, hidden, piReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- actions -----
  const duplicate = (p: Plank) => { const c: Plank = { ...p, id: Math.random().toString(36).slice(2, 9), name: p.name + ' bis', pos: [p.pos[0] + 30, p.pos[1], p.pos[2] + 30], notches: p.notches.map((n) => ({ ...n, id: Math.random().toString(36).slice(2, 9) })), holes: p.holes.map((h) => ({ ...h, id: Math.random().toString(36).slice(2, 9) })) }; commit('Plaque dupliquée', (s) => ({ ...s, planks: [...s.planks, c] })); setSelectedId(c.id); };
  const remove = (id: string) => { commit('Plaque supprimée', (s) => ({ ...s, planks: s.planks.filter((p) => p.id !== id) })); if (selectedId === id) setSelectedId(null); setHoleEdit(null); };
  const [nest, setNest] = useState<NestParams>(() => { try { return { ...NEST_DEFAULT, ...JSON.parse(localStorage.getItem('plaques-nichoir-2') ?? '{}') }; } catch { return NEST_DEFAULT; } });
  useEffect(() => { try { localStorage.setItem('plaques-nichoir-2', JSON.stringify(nest)); } catch { /* rien */ } }, [nest]);
  const addNest = () => { const b = makeNest(nest, sc.t, sc.fit, sc.planks.length + 1); commit('Nichoir créé', (s) => ({ ...s, planks: [...s.planks, ...b.planks], groupNames: { ...(s.groupNames ?? {}), ...b.groupNames } })); setSelectedId(b.planks[0].id); setGroupSel(b.group); setOpenGroups((g) => new Set([...g, b.group])); setHidden((h) => new Set([...h, ...b.planks.filter((p) => /^Isolant/.test(p.name) || /^Barre /.test(p.name) || p.name === 'Toit en chêne').map((p) => p.id)])); /* l'isolant, les quatre barres du toit et le pan de toit en chêne sont cachés par défaut (l'œil de « Pièces » les affiche) */ };
  const autoNest = useRef(false);
  useEffect(() => { if (!autoNest.current && sc.planks.length === 0) { autoNest.current = true; addNest(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /** Membres d'un groupe (boîte). */
  const groupMembers = (g: string) => sc.planks.filter((p) => p.group === g);
  /** Copie une boîte entière (nouveau groupe), décalée vers la droite de sa largeur + 20 mm. */
  const duplicateGroup = (g: string) => {
    const ms = groupMembers(g); if (!ms.length) return;
    const ng = Math.random().toString(36).slice(2, 9), dx = extents(ms, sc.t)[0] + 20;
    const copies = ms.map((p) => ({ ...p, id: Math.random().toString(36).slice(2, 9), group: ng, pos: [p.pos[0] + dx, p.pos[1], p.pos[2]] as Vec3, notches: p.notches.map((n) => ({ ...n, id: Math.random().toString(36).slice(2, 9) })), holes: p.holes.map((h) => ({ ...h, id: Math.random().toString(36).slice(2, 9) })) }));
    const name = (sc.groupNames?.[g] ?? 'Boîte').replace(/ \(.*\)$/, '') + ' bis';
    commit('Boîte dupliquée', (s) => ({ ...s, planks: [...s.planks, ...copies], groupNames: { ...(s.groupNames ?? {}), [ng]: name } }));
    setSelectedId(copies[0].id); setGroupSel(ng);
  };
  const [dropOn, setDropOn] = useState<string | null>(null); // cible survolée pendant un glisser-déposer dans « Pièces »
  /** Glisser-déposer dans « Pièces » : une plaque seule lâchée sur une boîte y entre ; lâchée sur une autre plaque seule, les deux forment un groupe. */
  const dropPlank = (id: string, target: { group?: string; plank?: string }) => {
    setDropOn(null);
    const p = sc.planks.find((x) => x.id === id);
    if (!p || p.group) return;
    if (target.group) { update(id, { group: target.group }, 'Plaque mise dans la boîte'); return; }
    const other = target.plank ? sc.planks.find((x) => x.id === target.plank) : undefined;
    if (!other || other.id === id) return;
    const g = other.group ?? Math.random().toString(36).slice(2, 9);
    commit('Plaques groupées', (s) => ({ ...s, planks: s.planks.map((x) => (x.id === id || x.id === other.id ? { ...x, group: g } : x)) }));
  };
  const [docOpen, setDocOpen] = useState<string | null>(null); // document Markdown affiché en fenêtre par-dessus la vue
  const [confirmAll, setConfirmAll] = useState(false); // « Tout supprimer » demande un second clic
  useEffect(() => { if (!confirmAll) return; const id = setTimeout(() => setConfirmAll(false), 4000); return () => clearTimeout(id); }, [confirmAll]);
  const removeAll = () => {
    if (!confirmAll) { setConfirmAll(true); return; }
    setConfirmAll(false); commit('Tout supprimé', (s) => ({ ...s, planks: [], groupNames: {} })); setSelectedId(null); setGroupSel(null); setExtra(new Set()); setPull(null); };
  const removeGroup = (g: string) => { commit('Groupe supprimé', (s) => ({ ...s, planks: s.planks.filter((p) => p.group !== g) })); if (selected?.group === g) setSelectedId(null); };
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set()); // groupes dépliés dans le volet « Pièces »
  const addHole = (plankId: string, local: [number, number], openWindow = true) => { const pl = scRef.current.planks.find((p) => p.id === plankId); const h = pl ? fitHole(pl, newHole(local[0], local[1])) : newHole(local[0], local[1]); commit('Trou ajouté', (s) => ({ ...s, planks: s.planks.map((p) => (p.id === plankId ? { ...p, holes: [...p.holes, h] } : p)) })); if (openWindow) setHoleEdit({ plankId, holeId: h.id, fresh: true }); setCtx(null); };
  const setHole = (p: Plank, id: string, patch: Partial<Hole>) => {
    const fresh = !!holeEdit?.fresh && holeEdit.holeId === id; // un trou tout neuf : un seul Retour l'enlève avec ses réglages
    commit(fresh ? 'Trou ajouté' : 'Réglage du trou', (s) => ({ ...s, planks: s.planks.map((x) => (x.id === p.id ? { ...x, holes: x.holes.map((h) => (h.id === id ? fitHole(x, { ...h, ...patch }) : h)) } : x)) }), fresh);
  };
  /** Bouton magique : perce les fentes partout où la plaque en traverse d'autres. */
  const [magicMsg, setMagicMsg] = useState<string | null>(null);
  const magic = (p: Plank) => {
    const r = slotsForTeeth(scRef.current, p.id);
    if (!r.added) { setMagicMsg('Rien à percer : aucune autre plaque ne traverse celle-ci (ou les fentes existent déjà).'); return; }
    commit('Fentes percées', () => r.scene);
    setMagicMsg(`${r.added} fente${r.added > 1 ? 's' : ''} percée${r.added > 1 ? 's' : ''} pour ${r.planks} plaque${r.planks > 1 ? 's' : ''} qui la traversent.`);
  };
  const removeHole = (p: Plank, id: string) => { update(p.id, { holes: p.holes.filter((h) => h.id !== id) }, 'Trou retiré'); setHoleEdit(null); };
  const editingHole = holeEdit ? sc.planks.find((p) => p.id === holeEdit.plankId)?.holes.find((h) => h.id === holeEdit.holeId) : undefined;
  const editingPlank = holeEdit ? sc.planks.find((p) => p.id === holeEdit.plankId) : undefined;
  const setRot = (p: Plank, i: number, val: number) => { const rot = [...p.rot] as Vec3; rot[i] = ((((val + 180) % 360) + 360) % 360) - 180; commit('Rotation', (s) => moveWithGroup(s, p.id, p.pos, rot)); };
  /** Lie toutes les plaques sélectionnées (principale + Ctrl + clic) dans un seul groupe (les groupes existants fusionnent). */
  const linkSelection = () => {
    const ids = new Set([selectedId, ...extra].filter(Boolean) as string[]);
    if (ids.size < 2) return;
    const olds = new Set(sc.planks.filter((p) => ids.has(p.id) && p.group).map((p) => p.group as string));
    const g = [...olds][0] ?? Math.random().toString(36).slice(2, 9);
    commit('Plaques liées', (s) => ({ ...s, planks: s.planks.map((x) => (ids.has(x.id) || (x.group && olds.has(x.group)) ? { ...x, group: g } : x)) }));
    setExtra(new Set());
  };
  const unlinkSelection = () => {
    const ids = new Set([selectedId, ...extra].filter(Boolean) as string[]);
    commit('Plaques déliées', (s) => ({ ...s, planks: s.planks.map((x) => (ids.has(x.id) ? { ...x, group: undefined } : x)) }));
    setExtra(new Set());
  };
  /** Détache la plaque de son groupe. */
  const link = (p: Plank, _otherId: null) => update(p.id, { group: undefined }, 'Plaque déliée');
  /** Bascule le crénelage d'un bord : on / off ; les crans de ce bord sont régénérés ou retirés. */
  const toggleCast = (p: Plank, edge: Edge) => {
    const on = !!p.cast?.[edge];
    const nextCast = { ...(p.cast ?? {}) };
    const n = cast.auto ? teethFor(edgeLength(p, edge)) : cast.n; // auto : comme les boîtes, le nombre de dents dépend de la longueur du bord
    if (on) delete nextCast[edge]; else nextCast[edge] = { n, phase: cast.phase };
    const kept = p.notches.filter((n) => n.edge !== edge);
    update(p.id, { cast: nextCast, notches: on ? kept : [...kept, ...castellation(p, edge, n, cast.phase, sc.t, sc.fit)] }, on ? 'Crénelage retiré' : 'Crénelage');
  };
  /** Nouveaux réglages (dents, phase) : appliqués aux bords déjà crénelés. */
  const recast = (p: Plank, n: number, phase: 0 | 1, auto = cast.auto) => {
    setCast({ n, phase, auto });
    const edges = Object.keys(p.cast ?? {}) as Edge[];
    if (!edges.length) return;
    const nFor = (e: Edge) => (auto ? teethFor(edgeLength(p, e)) : n);
    const nextCast = Object.fromEntries(edges.map((e) => [e, { n: nFor(e), phase }])) as Plank['cast'];
    update(p.id, { cast: nextCast, notches: [...p.notches.filter((x) => !edges.includes(x.edge)), ...edges.flatMap((e) => castellation(p, e, nFor(e), phase, sc.t, sc.fit))] }, 'Crénelage');
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-stone-100 text-stone-800">
      {!leftOpen && <button onClick={() => setLeftOpen(true)} title="Ouvrir le menu" className="flex h-full w-7 shrink-0 items-start justify-center border-r border-stone-200 bg-stone-50 pt-3 text-stone-500 hover:bg-stone-100">▸</button>}
      {leftOpen && <aside className="flex h-full w-[22rem] shrink-0 flex-col gap-3 overflow-y-auto border-r border-stone-200 bg-stone-50 p-3">
        <header className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold text-emerald-900">Nichoir mésange</h1>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setLeftOpen(false)} title="Replier le menu" className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-600 hover:bg-stone-100">◂</button>
          </div>
        </header>

        <Section title="Bois" defaultOpen note={`${sc.t} mm`}>
          <Slider label="Épaisseur de toutes les plaques" value={sc.t} min={1} max={30} step={0.5} unit=" mm" onChange={(t) => commit('Épaisseur', (s) => ({ ...s, t, planks: s.planks.map((p) => recastAll(p, t, s.fit)) }))} />
        </Section>

        <Section title="Nichoir mésange" defaultOpen={false} note={`${nest.l} × ${nest.L}`}>
          <Slider label="Intérieur (carré, fond)" value={nest.l} min={120} max={300} step={1} unit=" mm" onChange={(l) => setNest({ ...nest, l, L: l })} />
          <Slider label="Du sol au bas du trou" value={nest.floorToHole} min={60} max={600} step={1} unit=" mm" onChange={(floorToHole) => setNest({ ...nest, floorToHole })} />
          <Slider label="Diamètre du trou" value={nest.hole} min={20} max={120} step={1} unit=" mm" onChange={(hole) => setNest({ ...nest, hole })} />
          <Slider label="Hauteur au-dessus du trou" value={nest.above} min={0} max={100} step={1} unit=" mm" onChange={(above) => setNest({ ...nest, above })} />
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-stone-700">
            Options
            <Chip active={nest.solar} onClick={() => setNest({ ...nest, solar: !nest.solar })} title="Panneau solaire de 100 W déporté sur deux poteaux, câble vers le toit ; batterie, régulateur et pont en H dans le toit">Solaire</Chip>
            <Chip active={nest.cam2} onClick={() => setNest({ ...nest, cam2: !nest.cam2 })} title="Deuxième caméra dans une mini boîte en contreplaqué sous le toit à gauche, tournée vers le trou d'entrée">2ᵉ caméra</Chip>
            <Chip active={nest.clim} onClick={() => setNest({ ...nest, clim: !nest.clim })} title="Peltier + radiateur alu sur la moitié haute du mur arrière, capteur de température et d'humidité">Peltier + capteur</Chip>
          </div>
          <Btn variant="primary" onClick={addNest} disabled={sc.planks.length > 0} title={sc.planks.length > 0 ? "Un nichoir est déjà là : « Tout supprimer » dans « Pièces » pour en créer un autre" : undefined}>Créer le nichoir ({nest.l + 2 * (2 * sc.t + nest.ins)} × {nest.L + 2 * (2 * sc.t + nest.ins)} × {nest.floorToHole + nest.hole + nest.above + 2 * sc.t + 2 * (sc.t + nest.ins)})</Btn>
        </Section>


        {selected && !groupSel && (
          <>
            <Section title="Plaque choisie" defaultOpen note={`${selected.name} · ${selected.w} × ${selected.h} mm`}>
              <input value={selected.name} onChange={(e) => update(selected.id, { name: e.target.value }, 'Nom')} className="w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-xs" />
              <Slider label="Largeur" value={selected.w} min={10} max={600} step={1} unit=" mm" onChange={(v) => update(selected.id, { w: v }, 'Largeur')} />
              <Slider label="Hauteur" value={selected.h} min={10} max={600} step={1} unit=" mm" onChange={(v) => update(selected.id, { h: v }, 'Hauteur')} />
              <Hint>Déplacer : tire un rond vert d'un coin ; il s'aimante aux coins des autres pièces (ronds bleus). Clic droit : trou, transparence. Ctrl + clic : sélection multiple, puis « Lier ». Suppr : supprimer.</Hint>
              {selected.group && (
                <div className="flex items-center gap-2 text-[11px] text-stone-600">
                  <span className="min-w-0 flex-1 truncate">Liée avec {sc.planks.filter((p) => p.group === selected.group && p.id !== selected.id).map((p) => p.name).join(', ') || 'personne'}</span>
                  <Btn block={false} onClick={() => link(selected, null)}>Délier</Btn>
                </div>
              )}
            </Section>

            <Section title="Rotation" defaultOpen>
              <Hint>Pour déplacer : tire un rond vert d'un coin dans la 3D. La rotation se règle ici, aux curseurs ou par quarts de tour.</Hint>
              {(['X', 'Y', 'Z'] as const).map((ax, i) => (
                <div key={ax} className="flex items-end gap-1.5">
                  <div className="min-w-0 flex-1"><Slider label={`Rotation ${ax}`} value={selected.rot[i]} min={-180} max={180} step={1} unit="°" onChange={(v) => setRot(selected, i, v)} /></div>
                  <Btn block={false} onClick={() => setRot(selected, i, selected.rot[i] - 90)} title="Un quart de tour en arrière">−90°</Btn>
                  <Btn block={false} onClick={() => setRot(selected, i, selected.rot[i] + 90)} title="Un quart de tour en avant">+90°</Btn>
                </div>
              ))}
            </Section>

            <Section title="Crans" defaultOpen={false} note={Object.keys(selected.cast ?? {}).length ? `${Object.keys(selected.cast ?? {}).length} bord${Object.keys(selected.cast ?? {}).length > 1 ? 's' : ''}` : 'aucun'}>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-stone-700">
                Bords crénelés
                {EDGES.map((e) => <Chip key={e.id} active={!!selected.cast?.[e.id]} onClick={() => toggleCast(selected, e.id)} title={selected.cast?.[e.id] ? 'Retirer les crans de ce bord' : 'Créneler ce bord'}>{e.label}</Chip>)}
              </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-stone-700">
                Dents
                <Chip active={cast.auto} onClick={() => recast(selected, cast.n, cast.phase, true)} title="Une dent ≈ 16 mm, nombre impair : la même règle que les boîtes">auto (comme les boîtes)</Chip>
                <Chip active={!cast.auto} onClick={() => recast(selected, cast.n, cast.phase, false)}>fixe</Chip>
              </div>
              {cast.auto ? (
                <Hint>Haut / bas : {teethFor(selected.w)} dents ({+(selected.w / teethFor(selected.w)).toFixed(2)} mm) · gauche / droite : {teethFor(selected.h)} dents ({+(selected.h / teethFor(selected.h)).toFixed(2)} mm). Deux bords de même longueur ont exactement les mêmes crans.</Hint>
              ) : (
                <Slider label="Dents (nombre impair : les deux bouts pareils)" value={cast.n} min={3} max={25} step={2} onChange={(n) => recast(selected, n, cast.phase)} />
              )}
              <div className="flex items-center gap-1.5 text-[11px] text-stone-700">
                Première dent
                <Chip active={cast.phase === 0} onClick={() => recast(selected, cast.n, 0)}>creuse</Chip>
                <Chip active={cast.phase === 1} onClick={() => recast(selected, cast.n, 1)}>pleine</Chip>
              </div>
              <Hint>Un bouton par bord : allumé = crénelé. Une dent sur deux est creusée de l'épaisseur du bois ; la plaque d'en face, crénelée pareil avec la première dent inversée, s'emboîte à fleur.</Hint>
            </Section>

            <Section title="Fentes magiques" defaultOpen={false}>
              <Btn variant="primary" onClick={() => magic(selected)}>✨ Percer les fentes de cette plaque</Btn>
              {magicMsg && <Hint>{magicMsg}</Hint>}
              <Hint>Partout où une autre plaque (perpendiculaire, pas du même groupe) traverse la plaque choisie, une fente rectangulaire est percée dans celle-ci : longueur de chaque dent × épaisseur du bois. Les fentes déjà là ne sont pas doublées.</Hint>
            </Section>

            <Section title="Trous" defaultOpen={false} note={`${selected.holes.length}`}>
              <Btn onClick={() => addHole(selected.id, [0, 0], false)}>Ajouter un trou au centre</Btn>
              <Hint>Ou clic droit sur la plaque dans la 3D, à l'endroit voulu.</Hint>
              {selected.holes.map((h, k) => (
                <div key={h.id} onMouseEnter={() => setHoleHover({ plankId: selected.id, holeId: h.id })} onMouseLeave={() => setHoleHover(null)} className={`space-y-2 rounded-md border bg-white p-2 ${holeEdit?.holeId === h.id ? 'border-emerald-400' : 'border-stone-200'}`}>
                  <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
                    <span className="font-semibold">Trou {k + 1}</span>
                    <span className="text-stone-400">{h.shape === 'round' ? `Ø ${h.size}` : `${h.size} × ${h.sh ?? h.size}`} mm</span>
                    <button onClick={() => removeHole(selected, h.id)} className="ml-auto rounded px-1.5 text-sm text-stone-400 hover:bg-stone-200 hover:text-stone-700" title="Retirer ce trou">×</button>
                  </div>
                  <HoleFields plank={selected} hole={h} onChange={(patch) => setHole(selected, h.id, patch)} />
                </div>
              ))}
            </Section>
          </>
        )}

        <Section title="Découpe laser" defaultOpen={false} note={`${sheets.length} planche${sheets.length > 1 ? 's' : ''} de ${cutCfg.W} × ${cutCfg.H}`}>
          <Slider label="Largeur de la planche" value={cutCfg.W} min={100} max={1500} step={5} unit=" mm" onChange={(W) => setCutCfg({ ...cutCfg, W })} />
          <Slider label="Hauteur de la planche" value={cutCfg.H} min={100} max={1500} step={5} unit=" mm" onChange={(H) => setCutCfg({ ...cutCfg, H })} />
          <Slider label="Espace entre les pièces" value={cutCfg.gap} min={0} max={20} step={0.5} unit=" mm" onChange={(gap) => setCutCfg({ ...cutCfg, gap })} />
          <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
            Vue
            <Chip active={!cutView} onClick={() => setCutView(false)}>3D</Chip>
            <Chip active={cutView} onClick={() => setCutView(true)}>Planches à découper</Chip>
          </div>
          {sheets.map((sh, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="min-w-0 flex-1 truncate text-stone-700">Planche {i + 1} : {sh.items.length} pièce{sh.items.length > 1 ? 's' : ''}, {Math.round(Math.min(sh.used, 1) * 100)} % de la hauteur{sh.used > 1 ? ' — déborde !' : ''}</span>
              <Btn block={false} variant="primary" onClick={() => saveSvg(sheetSvg(sh, cutCfg.W, cutCfg.H, i), `planche-${i + 1}-${cutCfg.W}x${cutCfg.H}.svg`)}>SVG</Btn>
            </div>
          ))}
        </Section>
      </aside>}

      <main className="relative min-w-0 flex-1" onClick={() => setCtx(null)}>
        <div ref={host} className="h-full w-full" />
        {cutView && <Sheet2D svg={preview} width={cutCfg.W} height={sheets.length * (cutCfg.H + 12)} />}
        <div className="absolute top-3 left-3 flex items-center gap-1 rounded-lg border border-stone-200 bg-white/90 p-1 shadow-sm backdrop-blur">
          <button onClick={back} disabled={!backLabel} title={backLabel ? `Annuler : ${backLabel} (Ctrl+Z)` : 'Rien à annuler'} className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold text-stone-800 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40">
            <span aria-hidden className="text-sm leading-none">↶</span> Retour
            {backLabel && <span className="max-w-40 truncate text-[10px] font-normal text-stone-500">{backLabel}</span>}
          </button>
        </div>
        <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white/90 p-1 shadow-sm backdrop-blur">
          <button onClick={() => setSchemaOn((s) => !s)} aria-pressed={schemaOn} title="Schéma électrique à côté de la 3D : survoler un fil ou un composant le met en surbrillance des deux côtés" className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${schemaOn ? 'bg-emerald-600 text-white' : 'text-stone-700 hover:bg-stone-100'}`}>
            <span aria-hidden>🔌</span> Schéma
          </button>
          <button onClick={() => setCut((c) => (c.on ? { ...c, on: false } : { ...c, on: true, pos: midOf(c.axis) }))} aria-pressed={cut.on} title="Plan de coupe : l'espace est coupé en deux, un côté devient invisible" className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-colors ${cut.on ? 'bg-sky-100 text-sky-900' : 'text-stone-800 hover:bg-stone-100'}`}>
            <span aria-hidden>✂</span> Coupe
          </button>
        </div>
        {cut.on && (() => {
          const b = sc.planks.length ? bounds(sc.planks, sc.t) : { min: [0, 0, 0], max: [0, 0, 0] };
          const i = AXIS_I[cut.axis];
          return (
            <div className="absolute top-14 right-3 w-64 space-y-1.5 rounded-lg border border-sky-200 bg-white/90 p-2 text-[11px] text-sky-900 shadow-sm backdrop-blur">
              <div className="flex items-center gap-1.5">
                Plan ⟂
                {(['x', 'y', 'z'] as const).map((ax) => <Chip key={ax} active={cut.axis === ax} onClick={() => setCut((c) => ({ ...c, axis: ax, pos: midOf(ax) }))}>{ax.toUpperCase()}</Chip>)}
                <Chip active={false} onClick={() => setCut((c) => ({ ...c, flip: !c.flip }))} title="Voir l'autre côté">⇄ autre côté</Chip>
              </div>
              <Slider label={`Position ${cut.axis.toUpperCase()}`} value={cut.pos} min={Math.floor(b.min[i]) - 10} max={Math.ceil(b.max[i]) + 10} step={1} unit=" mm" marks={[{ at: Math.round((b.min[i] + b.max[i]) / 2), label: 'milieu' }]} onChange={(pos) => setCut((c) => ({ ...c, pos }))} />
              <Btn block={false} variant="ghost" onClick={() => setCut((c) => ({ ...c, on: false }))}>Fermer la coupe</Btn>
            </div>
          );
        })()}
        {pull && (
          <div className={`absolute ${cut.on ? 'top-72' : 'top-14'} right-3 flex items-center gap-2 rounded-lg border border-sky-200 bg-white/90 px-2.5 py-1.5 text-[11px] text-sky-800 shadow-sm backdrop-blur`}>
            Face en pointillés : tire-la ou pousse-la (les plaques connectées suivent, 1 mm minimum).
            <Btn block={false} variant="ghost" onClick={() => setPull(null)}>Terminer</Btn>
          </div>
        )}
        {extra.size > 0 && (
          <div className="absolute top-14 left-3 flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white/90 p-1.5 text-[11px] shadow-sm backdrop-blur">
            <span className="px-1 text-stone-600">{extra.size + (selectedId ? 1 : 0)} plaques sélectionnées</span>
            <Btn variant="primary" block={false} onClick={linkSelection}>Lier</Btn>
            <Btn block={false} onClick={unlinkSelection}>Délier</Btn>
            <Btn variant="ghost" block={false} onClick={() => setExtra(new Set())}>Annuler</Btn>
          </div>
        )}

        {ctx && (
          <div className="absolute z-10 min-w-36 rounded-md border border-stone-200 bg-white py-1 text-xs shadow-lg" style={{ left: ctx.x, top: ctx.y }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => addHole(ctx.plankId, ctx.local)} className="block w-full px-3 py-1.5 text-left hover:bg-emerald-50">Trou…</button>
            <button onClick={() => { const pl = sc.planks.find((p) => p.id === ctx.plankId); if (pl) magic(pl); setCtx(null); }} className="block w-full px-3 py-1.5 text-left hover:bg-emerald-50" title="Perce, dans cette plaque, les fentes où d'autres plaques la traversent">✨ Percer les fentes</button>
            <button onClick={() => { toggleHidden([ctx.plankId]); setCtx(null); }} className="block w-full px-3 py-1.5 text-left hover:bg-emerald-50">{hidden.has(ctx.plankId) ? 'Voir' : 'Cacher'}</button>
            {sc.planks.find((p) => p.id === ctx.plankId)?.group && (
              <button onClick={() => { const g = sc.planks.find((p) => p.id === ctx.plankId)?.group; if (g) toggleHidden(sc.planks.filter((p) => p.group === g).map((p) => p.id)); setCtx(null); }} className="block w-full px-3 py-1.5 text-left hover:bg-emerald-50">Cacher le groupe</button>
            )}
            {sc.planks.find((p) => p.id === ctx.plankId)?.group && (
              <button onClick={() => { const pl = sc.planks.find((p) => p.id === ctx.plankId); if (pl) { update(pl.id, { group: undefined }, 'Plaque déliée'); if (groupSel === pl.group) setGroupSel(null); } setCtx(null); }} className="block w-full px-3 py-1.5 text-left hover:bg-emerald-50">Délier cette plaque</button>
            )}
          </div>
        )}
        {editingHole && editingPlank && (
          <div className="absolute top-14 left-3 z-10 w-72 space-y-2.5 rounded-lg border border-stone-200 bg-white p-3 text-xs shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-emerald-900">Trou dans {editingPlank.name}</span>
              <button onClick={() => setHoleEdit(null)} className="rounded px-1.5 text-sm text-stone-400 hover:bg-stone-200 hover:text-stone-700" title="Fermer">×</button>
            </div>
            <HoleFields plank={editingPlank} hole={editingHole} onChange={(patch) => setHole(editingPlank, editingHole.id, patch)} />
            <div className="grid grid-cols-2 gap-1.5">
              <Btn variant="primary" onClick={() => setHoleEdit(null)}>OK</Btn>
              <Btn variant="danger" onClick={() => removeHole(editingPlank, editingHole.id)}>Supprimer le trou</Btn>
            </div>
          </div>
        )}
      </main>

      {docOpen && DOCS.find((d) => d.id === docOpen) && <DocModal doc={DOCS.find((d) => d.id === docOpen)!} onClose={() => setDocOpen(null)} />}
      {schemaOn && <SchemaPanel hover={hover} planks={sc.planks} onHover={(id) => setHover(id ? { plank: id } : null)} />}
      <aside className="flex h-full w-[20rem] shrink-0 flex-col border-l border-stone-200 bg-stone-50">
        <Drawer title="Pièces" note={`${sc.planks.length}`} open={drawer === 'pieces'} onToggle={() => setDrawer(drawer === 'pieces' ? null : 'pieces')}>
          {(() => {
            if (!sc.planks.length) return <Hint>Aucune plaque.</Hint>;
            const widest = Math.max(...sc.planks.map((p) => p.w + 8));
            const scale = Math.min(1.2, 216 / widest);
            const card = (p: Plank) => (
              <div
                key={p.id}
                data-pid={p.id}
                draggable={!p.group}
                onDragStart={(e) => { e.dataTransfer.setData('text/plank', p.id); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => { if (!p.group && e.dataTransfer.types.includes('text/plank')) { e.preventDefault(); setDropOn(p.id); } }}
                onDragLeave={() => setDropOn((d) => (d === p.id ? null : d))}
                onDrop={(e) => { e.preventDefault(); dropPlank(e.dataTransfer.getData('text/plank'), { plank: p.id }); }}
                onMouseEnter={() => setHover({ plank: p.id })}
                onMouseLeave={() => setHover(null)}
                className={`rounded-lg border bg-white p-2 transition-colors hover:bg-amber-50 ${dropOn === p.id ? 'border-emerald-500 bg-emerald-50' : p.id === selectedId && !groupSel ? 'border-emerald-400' : extra.has(p.id) ? 'border-sky-400' : 'border-stone-200'} ${p.group ? '' : 'cursor-grab'}`}
                title={p.group ? undefined : 'Glisse cette plaque sur une boîte (ou une autre plaque) pour les grouper'}
              >
                <div className="mb-1 flex items-center gap-1 text-[11px]">
                  <NameEdit value={p.name} active={p.id === selectedId && !groupSel} onSelect={(e) => { pick(p.id, e.ctrlKey || e.metaKey); if (!(e.ctrlKey || e.metaKey)) setGroupSel(null); }} onRename={(v) => update(p.id, { name: v }, 'Nom')} />
                  <button onClick={() => toggleHidden([p.id])} title={hidden.has(p.id) ? 'Afficher' : 'Cacher'} className={`rounded px-1 ${hidden.has(p.id) ? 'text-stone-300' : 'text-stone-400'} hover:bg-stone-200 hover:text-stone-700`}><Eye off={hidden.has(p.id)} /></button>
                  <button onClick={() => duplicate(p)} title="Dupliquer" className="rounded px-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700">⧉</button>
                  <button onClick={() => remove(p.id)} title="Supprimer" className="rounded px-1 text-sm text-stone-400 hover:bg-stone-200 hover:text-stone-700">×</button>
                </div>
                {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="mb-1 block truncate text-[11px] text-sky-700 underline" title={p.url}>🔗 Fiche du composant</a>}
                {p.special === 'doc' ? <button onClick={() => setDocOpen('schema')} className="flex w-full items-center gap-2 rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-left text-[11px] font-semibold text-sky-900 hover:bg-sky-100">📄 Ouvrir le document <span className="ml-auto rounded bg-white px-1.5 py-0.5 text-[10px] font-normal text-sky-700">Document</span></button> : p.special ? <div className="py-2 text-center text-[11px] text-stone-500">Élément spécial : pas découpé (modèle 3D)</div> : <button onClick={(e) => { pick(p.id, e.ctrlKey || e.metaKey); if (!(e.ctrlKey || e.metaKey)) setGroupSel(null); }} className="flex w-full justify-center" dangerouslySetInnerHTML={{ __html: plankSvg(p, scale) }} />}
              </div>
            );
            // les plaques liées sont rangées sous une seule ligne (boîte, groupe) qui se déplie
            const seen = new Set<string>();
            const rows: ReactNode[] = [];
            for (const p of sc.planks) {
              if (!p.group) { rows.push(card(p)); continue; }
              if (seen.has(p.group)) continue;
              seen.add(p.group);
              const g = p.group, members = sc.planks.filter((x) => x.group === g), open = openGroups.has(g);
              const isDoc = members.every((x) => x.special === 'doc'); // le document : son œil l'affiche ou le ferme
              const face = members.map((m) => /^Face avant (\d+)/.exec(m.name)).find(Boolean); // boîte créée avant que son nom soit enregistré
              const name = (sc.groupNames?.[g] ?? (face ? `Boîte ${face[1]}` : 'Groupe')).replace(/ \(.*\)$/, '');
              rows.push(
                <div
                  key={'g' + g}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes('text/plank')) { e.preventDefault(); setDropOn(g); } }}
                  onDragLeave={() => setDropOn((d) => (d === g ? null : d))}
                  onDrop={(e) => { e.preventDefault(); dropPlank(e.dataTransfer.getData('text/plank'), { group: g }); }}
                  className={`rounded-lg border bg-white ${dropOn === g ? 'border-emerald-500 bg-emerald-50' : selected?.group === g ? 'border-emerald-400' : 'border-stone-200'}`}
                >
                  <div onMouseEnter={() => setHover({ group: g })} onMouseLeave={() => setHover(null)} className="flex items-center gap-1 rounded-lg p-2 text-[11px] transition-colors hover:bg-amber-50">
                    <button onClick={() => setOpenGroups((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; })} className="w-4 text-stone-400 hover:text-stone-700" title={open ? 'Replier' : 'Voir les plaques'}><span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>▸</span></button>
                    <NameEdit value={name} prefix="⛓ " active={groupSel === g} title="Choisir la boîte entière · clique à nouveau pour renommer" onSelect={() => { if (isDoc) { setDocOpen(docOpen ? null : 'schema'); return; } setSelectedId(members[0].id); setGroupSel(g); setExtra(new Set()); }} onRename={(v) => commit('Nom du groupe', (s) => ({ ...s, groupNames: { ...(s.groupNames ?? {}), [g]: v } }))} />
                    {!isDoc && <button onClick={() => toggleHidden(members.map((x) => x.id))} title={members.every((x) => hidden.has(x.id)) ? 'Tout afficher' : 'Tout cacher'} className={`rounded px-1 ${members.every((x) => hidden.has(x.id)) ? 'text-stone-300' : 'text-stone-400'} hover:bg-stone-200 hover:text-stone-700`}><Eye off={members.every((x) => hidden.has(x.id))} /></button>}
                    {!isDoc && <button onClick={() => duplicateGroup(g)} title="Dupliquer la boîte" className="rounded px-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700">⧉</button>}
                    <button onClick={() => removeGroup(g)} title="Supprimer tout le groupe" className="rounded px-1 text-sm text-stone-400 hover:bg-stone-200 hover:text-stone-700">×</button>
                  </div>
                  {open && <div className="space-y-2 border-t border-stone-100 p-2 pl-4">{members.map((m) => card(m))}</div>}
                </div>,
              );
            }
            return [<Btn key="all" variant={confirmAll ? 'danger' : 'secondary'} onClick={removeAll}>{confirmAll ? `Cliquer encore pour tout supprimer (${sc.planks.length})` : `Tout supprimer (${sc.planks.length})`}</Btn>, ...rows];
          })()}
        </Drawer>
        <Drawer title="Historique" note={`${history.current.length}`} open={drawer === 'history'} onToggle={() => setDrawer(drawer === 'history' ? null : 'history')}>
          {history.current.length === 0 ? <Hint>Aucune action pour l'instant.</Hint> : (
            <ul className="space-y-0.5 text-[11px]" data-n={histN}>
              {history.current.map((e, i) => ({ e, i })).reverse().map(({ e, i }) => (
                <li key={i} className="flex items-center gap-2 rounded px-1.5 py-0.5 hover:bg-stone-100">
                  <span className="w-5 text-right text-stone-400">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-stone-700">{e.label}</span>
                  <span className="text-[10px] text-stone-400">{e.at ? new Date(e.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  {i === history.current.length - 1 ? <button onClick={() => undoTo(i)} title="Annuler la dernière action" className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[10px] hover:bg-stone-100">↶</button> : <span className="w-6" />}
                </li>
              ))}
            </ul>
          )}
          {history.current.length > 0 && <Btn variant="warn" onClick={clearHistory}>Vider l'historique</Btn>}
        </Drawer>
      </aside>
    </div>
  );
}
