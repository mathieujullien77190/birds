import { type Pt, type Plank, type PlankScene, type Placed, type NestItem, type NestSheet } from '../types';
import { holeOutline } from '../geometry/holes';
import { outline } from '../geometry/outline';

/** Rangement de toutes les plaques à plat sur une planche de largeur `sheet` (étagères). */
export function layout(s: PlankScene, sheet: number, gap = 6): { placed: Placed[]; height: number } {
  const items = s.planks.map((plank) => ({ plank, poly: outline(plank) })).sort((a, b) => b.plank.h - a.plank.h);
  const placed: Placed[] = [];
  let x = gap, y = gap, row = 0;
  for (const it of items) {
    if (x + it.plank.w + gap > sheet && x > gap) { x = gap; y += row + gap; row = 0; }
    placed.push({ ...it, x, y });
    x += it.plank.w + gap;
    row = Math.max(row, it.plank.h);
  }
  return { placed, height: y + row + gap };
}

const f = (n: number) => +n.toFixed(2);

/** SVG à l'échelle réelle (1 unité = 1 mm) : noir 0,1 mm = coupe, bleu = nom. */
export function planksSvg(s: PlankScene, sheet: number): string {
  const { placed, height } = layout(s, sheet);
  const parts = placed.map(({ plank, poly, x, y }) => {
    const px = (a: number) => f(x + a + plank.w / 2);
    const py = (b: number) => f(y + plank.h / 2 - b); // y du SVG vers le bas
    const holes = plank.holes.map((h) => `<polygon points="${holeOutline(h).map(([a, b]) => `${px(a)},${py(b)}`).join(' ')}" fill="none" stroke="#000" stroke-width="0.1"/>`).join('');
    return `<polygon points="${poly.map(([a, b]) => `${px(a)},${py(b)}`).join(' ')}" fill="none" stroke="#000" stroke-width="0.1"/>${holes}<text x="${f(x + plank.w / 2)}" y="${f(y + plank.h / 2)}" font-size="5" text-anchor="middle" fill="#00f" font-family="sans-serif">${plank.name}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sheet}mm" height="${f(height)}mm" viewBox="0 0 ${sheet} ${f(height)}">${parts.join('')}</svg>`;
}

/** Une plaque seule en SVG (liste des pièces), à l'échelle `scale` px/mm, marge 4 mm. */
export function plankSvg(p: Plank, scale: number): string {
  const M = 4;
  const px = (a: number) => f((a + p.w / 2 + M) * scale), py = (b: number) => f((p.h / 2 - b + M) * scale);
  const pts = outline(p).map(([a, b]) => `${px(a)},${py(b)}`).join(' ');
  const w = f((p.w + 2 * M) * scale), h = f((p.h + 2 * M) * scale);
  const holes = p.holes.map((hl) => `<polygon points="${holeOutline(hl).map(([a, b]) => `${px(a)},${py(b)}`).join(' ')}" fill="#fff" stroke="#111" stroke-width="1"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polygon points="${pts}" fill="#f5ead8" stroke="#111" stroke-width="1"/>${holes}</svg>`;
}

// ----- découpe laser : rangement des plaques sur des planches -----


/** Contour et trous d'une plaque, éventuellement tournés d'un quart de tour, ramenés en (0, 0) en bas à gauche. */
function flat(p: Plank, rotated: boolean): { poly: Pt[]; holes: Pt[][]; w: number; h: number } {
  const turn = (q: Pt): Pt => (rotated ? [-q[1], q[0]] : q);
  const poly = outline(p).map(turn), holes = p.holes.map((h) => holeOutline(h).map(turn));
  const w = rotated ? p.h : p.w, hh = rotated ? p.w : p.h;
  const sh = (q: Pt): Pt => [q[0] + w / 2, q[1] + hh / 2];
  return { poly: poly.map(sh), holes: holes.map((h) => h.map(sh)), w, h: hh };
}

/** Comme `flat` mais pour `k` quarts de tour (0 à 3). */
function flatK(p: Plank, k: number): { poly: Pt[]; holes: Pt[][]; w: number; h: number } {
  const turn = (q: Pt): Pt => { let [x, y] = q; for (let i = 0; i < k; i++) [x, y] = [-y, x]; return [x, y]; };
  const poly = outline(p).map(turn), holes = p.holes.map((hh) => holeOutline(hh).map(turn));
  const w = k % 2 ? p.h : p.w, hh = k % 2 ? p.w : p.h;
  const sh = (q: Pt): Pt => [q[0] + w / 2, q[1] + hh / 2];
  return { poly: poly.map(sh), holes: holes.map((h) => h.map(sh)), w, h: hh };
}

/**
 * Poches vides d'une pièce (les creux d'un U, les grands trous) : rectangles libres à l'intérieur de son encombrement où l'on peut ranger d'autres pièces.
 * On quadrille l'encombrement (2 mm), on marque la matière (dans le contour, hors des trous), puis on prend à plusieurs reprises le plus grand rectangle vide
 * (méthode de l'histogramme) tant qu'il fait au moins `min` mm de côté. Coordonnées de la pièce (origine en bas à gauche).
 */
function pockets(poly: Pt[], holes: Pt[][], w: number, h: number, min = 28, res = 2): [number, number, number, number][] {
  const nx = Math.ceil(w / res), ny = Math.ceil(h / res);
  const inside = (pts: Pt[], x: number, y: number) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const occ = new Uint8Array(nx * ny); // 1 = matière
  for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) {
    const x = (ix + 0.5) * res, y = (iy + 0.5) * res;
    if (inside(poly, x, y) && !holes.some((hh) => inside(hh, x, y))) occ[ix * ny + iy] = 1;
  }
  return emptyRects(occ, nx, ny, res, min, 8);
}

/** Plus grands rectangles vides d'une grille d'occupation (indice ix * ny + iy, 1 = pris), pris un à un (histogramme) : [x0, y0, x1, y1] en mm. La grille est modifiée. */
function emptyRects(occ: Uint8Array, nx: number, ny: number, res: number, min: number, rounds: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let round = 0; round < rounds; round++) {
    let best = { area: 0, x0: 0, y0: 0, x1: 0, y1: 0 };
    const hist = new Int32Array(nx);
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) hist[ix] = occ[ix * ny + iy] ? 0 : hist[ix] + 1;
      const st: number[] = [];
      for (let ix = 0; ix <= nx; ix++) {
        const cur = ix === nx ? 0 : hist[ix];
        while (st.length && hist[st[st.length - 1]] >= cur) {
          const hh = hist[st.pop()!], left = st.length ? st[st.length - 1] + 1 : 0, width = ix - left;
          if (hh * width > best.area) best = { area: hh * width, x0: left, x1: ix, y0: iy - hh + 1, y1: iy + 1 };
        }
        st.push(ix);
      }
    }
    if ((best.x1 - best.x0) * res < min || (best.y1 - best.y0) * res < min) break;
    out.push([best.x0 * res, best.y0 * res, best.x1 * res, best.y1 * res]);
    for (let ix = best.x0; ix < best.x1; ix++) for (let iy = best.y0; iy < best.y1; iy++) occ[ix * ny + iy] = 1;
  }
  return out;
}

/**
 * Range toutes les plaques sur des planches W × H (mm), `gap` entre pièces et au bord, par rectangles libres (« MaxRects », meilleur
 * ajustement du petit côté) : les plus grandes d'abord, chaque pièce est posée, droite ou tournée d'un quart de tour, dans le rectangle
 * libre où elle laisse le moins de place perdue ; les rectangles libres sont redécoupés autour d'elle. Planche pleine → la suivante.
 * Une pièce plus grande que la planche est posée seule en (gap, gap) et signalée (`used` > 1).
 */
export function nestSheets(s: PlankScene, W: number, H: number, gap = 5, margin = 8): NestSheet[] { // gap = espace entre pièces, margin = marge sur les bords de la planche
  type Free = { x: number; y: number; w: number; h: number };
  const mdf = s.planks.filter((p) => !p.special && p.material === 'mdf').map((p) => ({ ...p, material: undefined })); // le MDF a ses propres planches, rangées après celles du contreplaqué
  const items = s.planks.filter((p) => !p.special && p.material !== 'mdf').map((p) => ({ p, area: p.w * p.h })).sort((a, b) => b.area - a.area || Math.max(b.p.w, b.p.h) - Math.max(a.p.w, a.p.h));
  const sheets: { sheet: NestSheet; free: Free[] }[] = [];
  const g = gap;
  const place = (p: Plank): boolean => {
    for (const S of sheets) {
      let best: { f: Free; rotated: boolean; score: number } | null = null;
      for (const f of S.free) for (const rotated of [false, true]) {
        const w = (rotated ? p.h : p.w) + g, h = (rotated ? p.w : p.h) + g; // la pièce et son espace
        if (w > f.w || h > f.h) continue;
        const score = Math.min(f.w - w, f.h - h) * 10000 + Math.max(f.w - w, f.h - h); // petit côté restant le plus faible
        if (!best || score < best.score) best = { f, rotated, score };
      }
      if (!best) continue;
      const { f, rotated } = best;
      const w = (rotated ? p.h : p.w) + g, h = (rotated ? p.w : p.h) + g;
      const it: NestItem = { plank: p, rotated, ...flat(p, rotated), x: f.x, y: f.y };
      S.sheet.items.push(it);
      S.sheet.used = Math.max(S.sheet.used, (f.y + h) / H);
      // redécoupe : chaque rectangle libre qui touche la pièce est remplacé par ses restes (haut, bas, gauche, droite)
      const used = { x: f.x, y: f.y, w, h };
      const next: Free[] = [];
      for (const r of S.free) {
        if (used.x >= r.x + r.w || used.x + used.w <= r.x || used.y >= r.y + r.h || used.y + used.h <= r.y) { next.push(r); continue; }
        if (used.x > r.x) next.push({ x: r.x, y: r.y, w: used.x - r.x, h: r.h });
        if (used.x + used.w < r.x + r.w) next.push({ x: used.x + used.w, y: r.y, w: r.x + r.w - used.x - used.w, h: r.h });
        if (used.y > r.y) next.push({ x: r.x, y: r.y, w: r.w, h: used.y - r.y });
        if (used.y + used.h < r.y + r.h) next.push({ x: r.x, y: used.y + used.h, w: r.w, h: r.y + r.h - used.y - used.h });
      }
      // les creux de la pièce (U, grands trous) deviennent de nouveaux rectangles libres : on y range d'autres pièces (à `gap` de la matière)
      if (it.w * it.h > 5000) for (const [qx0, qy0, qx1, qy1] of pockets(it.poly, it.holes, it.w, it.h)) {
        const sx = it.x + qx0, sy = it.y + it.h - qy1; // repère de la planche (y vers le bas)
        next.push({ x: sx + g, y: sy + g, w: qx1 - qx0 - g, h: qy1 - qy0 - g });
      }
      // on enlève les rectangles contenus dans un autre
      S.free = next.filter((a, k) => a.w > 0.5 && a.h > 0.5 && !next.some((b, l) => l !== k && b.x <= a.x && b.y <= a.y && b.x + b.w >= a.x + a.w && b.y + b.h >= a.y + a.h && (b.w > a.w || b.h > a.h || l < k)));
      return true;
    }
    return false;
  };
  // pièces à creux (U, grands trous) : rangées d'abord par collision de grilles (4 mm) en les tournant de 0 / 90 / 180 / 270° : elles s'emboîtent les unes dans les autres,
  // puis les creux restants de la planche servent de rectangles libres aux pièces simples
  const RES = 4;
  const rsheets = new Map<NestSheet, { occ: Uint8Array; nx: number; ny: number }>();
  const hollow = items.filter(({ p }) => p.w * p.h >= 15000 && p.w + 2 * g <= W && p.h + 2 * g <= H && (() => { const f = flat(p, false); return pockets(f.poly, f.holes, f.w, f.h).length > 0; })());
  const doneSet = new Set<Plank>();
  const occOf = (poly: Pt[], holes: Pt[][], w: number, h: number) => { // grille de la pièce dans le repère de la planche (y vers le bas), matière dilatée d'une cellule (≥ gap), 1 cellule de marge autour
    const nx = Math.ceil(w / RES) + 2, ny = Math.ceil(h / RES) + 2, cells = new Uint8Array(nx * ny);
    const inside = (pts: Pt[], x: number, y: number) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
    const raw = new Uint8Array(nx * ny);
    for (let ix = 1; ix < nx - 1; ix++) for (let iy = 1; iy < ny - 1; iy++) {
      const x = (ix - 1 + 0.5) * RES, yb = h - (iy - 1 + 0.5) * RES; // y vers le haut dans le contour
      let on = false;
      for (const [dx, dy] of [[0, 0], [-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) if (inside(poly, x + dx, yb + dy) && !holes.some((hh) => inside(hh, x + dx, yb + dy))) { on = true; break; }
      if (on) raw[ix * ny + iy] = 1;
    }
    for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) if (raw[ix * ny + iy]) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const jx = ix + a, jy = iy + b; if (jx >= 0 && jx < nx && jy >= 0 && jy < ny) cells[jx * ny + jy] = 1; }
    return { nx, ny, cells };
  };
  const NXS = Math.ceil(W / RES), NYS = Math.ceil(H / RES);
  const fitAt = (R: { occ: Uint8Array }, pc: { nx: number; ny: number; cells: Uint8Array }) => { // première position (rangée par rangée) sans collision
    const c0 = Math.max(0, Math.ceil(margin / RES) - 1); // marge sur les bords de la planche aussi pour la phase de rangement serré
    for (let cy = c0; cy + pc.ny <= NYS - c0; cy++) for (let cx = c0; cx + pc.nx <= NXS - c0; cx++) {
      let hit = false;
      for (let ix = 0; ix < pc.nx && !hit; ix++) for (let iy = 0; iy < pc.ny; iy++) if (pc.cells[ix * pc.ny + iy] && R.occ[(cx + ix) * NYS + cy + iy]) { hit = true; break; }
      if (!hit) return { cx, cy };
    }
    return null;
  };
  for (const { p } of hollow) {
    let best: { R: { occ: Uint8Array; nx: number; ny: number }; S: NestSheet; k: number; cx: number; cy: number; pc: ReturnType<typeof occOf>; f: ReturnType<typeof flatK>; score: number } | null = null;
    const tryOn = (S: NestSheet, R: { occ: Uint8Array; nx: number; ny: number }) => {
      for (let k = 0; k < 4; k++) {
        const f = flatK(p, k), pc = occOf(f.poly, f.holes, f.w, f.h), pos = fitAt(R, pc);
        if (!pos) continue;
        const score = (pos.cy + pc.ny) * 1000 + pos.cx + k * 0.01; // le plus haut possible, puis le plus à gauche
        if (!best || score < best.score) best = { R, S, k, cx: pos.cx, cy: pos.cy, pc, f, score };
      }
    };
    for (const [S, R] of rsheets) { tryOn(S, R); if (best) break; }
    if (!best) {
      const S: NestSheet = { items: [], used: 0 }, R = { occ: new Uint8Array(NXS * NYS), nx: NXS, ny: NYS };
      sheets.push({ sheet: S, free: [] }); rsheets.set(S, R);
      tryOn(S, R);
    }
    if (!best) continue; // ne rentre pas : traitée comme une pièce simple
    const b = best as { R: { occ: Uint8Array }; S: NestSheet; k: number; cx: number; cy: number; pc: ReturnType<typeof occOf>; f: ReturnType<typeof flatK> };
    const x = (b.cx + 1) * RES, y = (b.cy + 1) * RES; // la grille de la pièce a 1 cellule de marge
    b.S.items.push({ plank: p, rotated: b.k % 2 === 1, poly: b.f.poly, holes: b.f.holes, w: b.f.w, h: b.f.h, x, y });
    b.S.used = Math.max(b.S.used, (y + b.f.h) / H);
    for (let ix = 0; ix < b.pc.nx; ix++) for (let iy = 0; iy < b.pc.ny; iy++) if (b.pc.cells[ix * b.pc.ny + iy]) b.R.occ[(b.cx + ix) * NYS + b.cy + iy] = 1;
    doneSet.add(p);
  }
  for (const [S, R] of rsheets) { // les creux restants de ces planches deviennent des rectangles libres
    const sheetOcc = R.occ.slice(), free: Free[] = [];
    for (const [x0, y0, x1, y1] of emptyRects(sheetOcc, NXS, NYS, RES, 16, 40)) { const fx = Math.max(x0, margin), fy = Math.max(y0, margin), fw = Math.min(x1, W - margin + g) - fx, fh = Math.min(y1, H - margin + g) - fy; if (fw > 0 && fh > 0) free.push({ x: fx, y: fy, w: fw, h: fh }); } // les creux aussi respectent la marge
    const slot = sheets.find((s) => s.sheet === S);
    if (slot) slot.free = free;
  }
  for (const { p } of items) {
    if (doneSet.has(p)) continue;
    if (place(p)) continue;
    sheets.push({ sheet: { items: [], used: 0 }, free: [{ x: margin, y: margin, w: W - 2 * margin + g, h: H - 2 * margin + g }] }); // la place libre commence à la marge ; une pièce occupe (taille + g), d'où le + g
    if (!place(p)) { // plus grande que la planche : posée seule, signalée
      const S = sheets[sheets.length - 1];
      const it: NestItem = { plank: p, rotated: false, ...flat(p, false), x: margin, y: margin };
      S.sheet.items.push(it);
      S.sheet.used = Math.max(1.01, (g + p.h + g) / H);
      S.free = [];
    }
  }
  const ply = sheets.map((S) => S.sheet);
  return mdf.length ? [...ply, ...nestSheets({ ...s, planks: mdf }, W, H, gap, margin).map((sh): NestSheet => ({ ...sh, material: 'mdf' }))] : ply;
}

/** Libellé d'une planche de découpe : « Planche 3 » pour le contreplaqué, « Planche MDF 1 » pour le MDF (numérotée à part). */
export function sheetLabel(sheets: NestSheet[], i: number): string {
  if (sheets[i]?.material !== 'mdf') return `Planche ${i + 1}`;
  return `Planche MDF ${sheets.slice(0, i + 1).filter((x) => x.material === 'mdf').length}`;
}

/** SVG d'une planche pour la machine : cadre de la planche en gris (repère, à ne pas couper), noir 0,1 mm = coupe, bleu = nom à graver. 1 unité = 1 mm, origine en haut à gauche. */
export function sheetSvg(sheet: NestSheet, W: number, H: number, index: number): string {
  const f = (n: number) => +n.toFixed(2);
  const parts = sheet.items.map(({ plank, poly, holes, x, y, h }) => {
    const px = (a: number) => f(x + a), py = (b: number) => f(y + h - b); // y vers le bas
    const pg = (pts: Pt[]) => `<polygon points="${pts.map(([a, b]) => `${px(a)},${py(b)}`).join(' ')}" fill="none" stroke="#000" stroke-width="0.1"/>`;
    return pg(poly) + holes.map(pg).join('') + `<text x="${f(x + 4)}" y="${f(y + 6)}" font-size="4" fill="#00f" font-family="sans-serif">${plank.name}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}"><rect x="0.05" y="0.05" width="${W - 0.1}" height="${H - 0.1}" fill="none" stroke="#bbb" stroke-width="0.1" stroke-dasharray="2 2"/><text x="${W - 3}" y="${H - 3}" font-size="4" text-anchor="end" fill="#999" font-family="sans-serif">planche ${index + 1}</text>${parts.join('')}</svg>`;
}

/** Aperçu : toutes les planches empilées, avec un fond clair pour chacune. */
export function sheetsPreviewSvg(sheets: NestSheet[], W: number, H: number, gap = 12): string {
  const total = sheets.length * (H + gap) - gap;
  const inner = sheets.map((sh, i) => `<g transform="translate(0 ${i * (H + gap)})"><rect width="${W}" height="${H}" fill="#fffdf7" stroke="#d6d3d1" stroke-width="0.3"/>${sheetSvg(sh, W, H, i).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${total}mm" viewBox="0 0 ${W} ${total}"><style>polygon{stroke-width:0.6}text{font-size:6px}</style>${inner}</svg>`; // traits épaissis pour l'écran seulement
}
