import { Vector2 } from 'three';
import { polysOverlap, type FoldKind, type Island, type Unfolded } from './unfold';
import { A4, type PageSpec } from './slices';

/**
 * Mise en page du patron papier en polygones : pièces à l'échelle réelle (mm), languettes, rangement sur des planches A4, SVG pour
 * la découpe laser. Couleurs des traits (une couche de réglage par couleur dans le logiciel du laser) :
 * noir = coupe, bleu = pli montagne, violet = pli vallée, orange = numéros (à graver ou à ignorer).
 */

interface Tab { poly: Vector2[]; label: number; mid: Vector2 }
interface Piece {
  index: number;
  tris: Vector2[][];
  folds: { a: Vector2; b: Vector2; kind: FoldKind }[];
  cuts: { a: Vector2; b: Vector2; label: number; hasTab: boolean }[];
  tabs: Tab[];
  w: number;
  h: number;
}
export interface Placement { piece: Piece; x: number; y: number }
export interface Pattern {
  pages: Placement[][];
  pieces: Piece[];
  /** Pièces trop grandes pour la page, même tournées. */
  tooBig: number[];
  tabs: number;
  /** Longueur totale à couper et à plier, en mm (pour estimer la découpe). */
  cutMm: number;
  foldMm: number;
}

/** Style des plis : trait continu (rainurage : le laser enlève un peu de papier) ou pointillés (perforation : il coupe 1 mm sur 2). */
export type FoldStyle = 'score' | 'perf';

/** Couleurs douces des pièces (même ordre dans la vue 3D et sur le papier). */
export const PIECE_COLORS = ['#f4c7c3', '#fde2b3', '#fbf2b0', '#cfe8c6', '#c3e4e8', '#c9d4f4', '#e3cdf1', '#f3d1e4', '#d8d2c4', '#cfe0d2', '#f0d9c0', '#d6dfe8'];

const COLORS = { cut: '#000000', mountain: '#2563eb', valley: '#7c3aed', label: '#ea580c' };
const rot90 = (p: Vector2) => new Vector2(-p.y, p.x);

/** Languette trapézoïdale à droite de l'arête a→b (l'extérieur de la pièce), si elle ne mord pas sur la pièce. */
function makeTab(a: Vector2, b: Vector2, tabMm: number, tris: Vector2[][]): Vector2[] | null {
  const L = a.distanceTo(b);
  if (L < 3) return null; // arête trop courte : pas de languette
  const h = Math.min(tabMm, L * 0.45);
  const E = b.clone().sub(a).divideScalar(L);
  const N = new Vector2(E.y, -E.x); // à droite de a→b
  const inset = Math.min(h * 0.9, L * 0.35);
  const poly = [a.clone(), b.clone(), b.clone().addScaledVector(E, -inset).addScaledVector(N, h), a.clone().addScaledVector(E, inset).addScaledVector(N, h)];
  for (const t of tris) if (polysOverlap(poly, t, 0.05)) return null;
  return poly;
}

function buildPiece(island: Island, index: number, mmPerUnit: number, tabMm: number): Piece {
  const s = (p: Vector2) => p.clone().multiplyScalar(mmPerUnit);
  const tris = island.tris.map((t) => t.q.map(s));
  const folds = island.folds.filter((f) => f.kind !== 'flat').map((f) => ({ a: s(f.a), b: s(f.b), kind: f.kind }));
  const cuts = island.cuts.map((c) => ({ a: s(c.a), b: s(c.b), label: c.label, tab: c.tab }));
  const tabs: Tab[] = [];
  const withTab = new Set<number>();
  cuts.forEach((c, i) => {
    if (!c.tab) return;
    const poly = makeTab(c.a, c.b, tabMm, tris);
    if (poly) { tabs.push({ poly, label: c.label, mid: poly.reduce((m, p) => m.add(p), new Vector2()).divideScalar(4) }); withTab.add(i); }
  });
  // la pièce est tournée d'un quart de tour si elle est plus large que haute : les étagères se remplissent mieux
  const all = [...tris.flat(), ...tabs.flatMap((t) => t.poly)];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of all) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const rotate = maxX - minX > maxY - minY;
  const fix = (p: Vector2) => (rotate ? rot90(p) : p);
  minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
  for (const p of all.map(fix)) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const pad = 2; // marge pour les numéros
  const move = (p: Vector2) => { const q = fix(p); return new Vector2(q.x - minX + pad, q.y - minY + pad); };
  return {
    index,
    tris: tris.map((t) => t.map(move)),
    folds: folds.map((f) => ({ a: move(f.a), b: move(f.b), kind: f.kind })),
    cuts: cuts.map((c, i) => ({ a: move(c.a), b: move(c.b), label: c.label, hasTab: withTab.has(i) })),
    tabs: tabs.map((t) => ({ poly: t.poly.map(move), label: t.label, mid: move(t.mid) })),
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2,
  };
}

/** Construit le patron : `mmPerUnit` convertit les unités du modèle en millimètres. */
export function layoutPattern(u: Unfolded, mmPerUnit: number, tabMm: number, page: PageSpec = A4): Pattern {
  const pieces = u.islands.map((isl, i) => buildPiece(isl, i, mmPerUnit, tabMm));
  const innerW = page.w - page.margin * 2, innerH = page.h - page.margin * 2;
  const tooBig = pieces.filter((p) => p.w > innerW || p.h > innerH).map((p) => p.index);
  // rangement en étagères : pièces triées par hauteur décroissante
  const order = pieces.filter((p) => !tooBig.includes(p.index)).sort((a, b) => b.h - a.h);
  const pages: Placement[][] = [];
  let cur: Placement[] = [], x = 0, y = 0, shelfH = 0;
  const gap = 3;
  for (const p of order) {
    if (x + p.w > innerW) { x = 0; y += shelfH + gap; shelfH = 0; }
    if (y + p.h > innerH) { pages.push(cur); cur = []; x = 0; y = 0; shelfH = 0; }
    cur.push({ piece: p, x: page.margin + x, y: page.margin + y });
    x += p.w + gap;
    shelfH = Math.max(shelfH, p.h);
  }
  if (cur.length) pages.push(cur);
  let cutMm = 0, foldMm = 0;
  for (const p of pieces) {
    for (const c of p.cuts) if (!c.hasTab) cutMm += c.a.distanceTo(c.b);
    for (const t of p.tabs) cutMm += t.poly[1].distanceTo(t.poly[2]) + t.poly[2].distanceTo(t.poly[3]) + t.poly[3].distanceTo(t.poly[0]);
    for (const f of p.folds) foldMm += f.a.distanceTo(f.b);
    for (const t of p.tabs) foldMm += t.poly[0].distanceTo(t.poly[1]);
  }
  return { pages, pieces, tooBig, tabs: pieces.reduce((n, p) => n + p.tabs.length, 0), cutMm, foldMm };
}

const f = (v: number) => v.toFixed(2);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const area = (t: Vector2[]) => Math.abs((t[1].x - t[0].x) * (t[2].y - t[0].y) - (t[2].x - t[0].x) * (t[1].y - t[0].y)) / 2;

export interface SvgOptions {
  foldStyle: FoldStyle;
  /** Remplit chaque pièce d'une teinte pastel (aperçu seulement : jamais pour le laser). */
  tint: boolean;
}

/** SVG d'une page (mm). Noir : couper ; bleu / violet : plier (montagne / vallée) ; orange : numéros. */
export function pageSvg(placements: Placement[], page: PageSpec, title: string, opt: SvgOptions): string {
  const dash = opt.foldStyle === 'perf' ? ' stroke-dasharray="1 1"' : '';
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${page.w}mm" height="${page.h}mm" viewBox="0 0 ${page.w} ${page.h}" font-family="system-ui, sans-serif">`);
  out.push(`<text x="${page.margin}" y="${page.margin - 3}" font-size="3" fill="${COLORS.label}">${esc(title)}</text>`);
  for (const { piece, x, y } of placements) {
    const tint = opt.tint ? PIECE_COLORS[piece.index % PIECE_COLORS.length] : 'none';
    out.push(`<g transform="translate(${f(x)} ${f(y)})">`);
    if (opt.tint) for (const t of piece.tris) out.push(`<polygon points="${t.map((p) => `${f(p.x)},${f(p.y)}`).join(' ')}" fill="${tint}" stroke="none"/>`);
    // languettes : les trois côtés libres se coupent, le côté collé à la pièce se plie
    for (const t of piece.tabs) {
      const p = t.poly;
      out.push(`<polyline points="${[p[1], p[2], p[3], p[0]].map((q) => `${f(q.x)},${f(q.y)}`).join(' ')}" fill="${opt.tint ? '#ffffff' : 'none'}" stroke="${COLORS.cut}" stroke-width="0.1" stroke-linejoin="round"/>`);
      out.push(`<line x1="${f(p[0].x)}" y1="${f(p[0].y)}" x2="${f(p[1].x)}" y2="${f(p[1].y)}" stroke="${COLORS.mountain}" stroke-width="0.1"${dash}/>`);
    }
    for (const fl of piece.folds) {
      out.push(`<line x1="${f(fl.a.x)}" y1="${f(fl.a.y)}" x2="${f(fl.b.x)}" y2="${f(fl.b.y)}" stroke="${fl.kind === 'mountain' ? COLORS.mountain : COLORS.valley}" stroke-width="0.1"${dash}/>`);
    }
    for (const c of piece.cuts) {
      if (!c.hasTab) out.push(`<line x1="${f(c.a.x)}" y1="${f(c.a.y)}" x2="${f(c.b.x)}" y2="${f(c.b.y)}" stroke="${COLORS.cut}" stroke-width="0.1"/>`);
      const L = c.a.distanceTo(c.b);
      if (c.label && L >= 3) {
        // numéro juste à l'intérieur de la pièce (à gauche de a→b) ; les arêtes minuscules n'en portent pas (illisible)
        const E = c.b.clone().sub(c.a).divideScalar(L);
        const N = new Vector2(-E.y, E.x);
        const m = c.a.clone().add(c.b).multiplyScalar(0.5).addScaledVector(N, 2.2);
        out.push(`<text x="${f(m.x)}" y="${f(m.y)}" font-size="2.4" text-anchor="middle" dominant-baseline="middle" fill="${COLORS.label}">${c.label}</text>`);
      }
    }
    for (const t of piece.tabs) out.push(`<text x="${f(t.mid.x)}" y="${f(t.mid.y)}" font-size="2.4" text-anchor="middle" dominant-baseline="middle" fill="${COLORS.label}">${t.label}</text>`);
    // nom de la pièce sur son plus grand triangle
    const big = piece.tris.reduce((b, t) => (area(t) > area(b) ? t : b), piece.tris[0]);
    const c = big.reduce((m, p) => m.add(p), new Vector2()).divideScalar(3);
    out.push(`<text x="${f(c.x)}" y="${f(c.y)}" font-size="3.2" font-weight="600" text-anchor="middle" dominant-baseline="middle" fill="${COLORS.label}">P${piece.index + 1}</text>`);
    out.push('</g>');
  }
  out.push('</svg>');
  return out.join('\n');
}

/** Page HTML autonome : toutes les planches (aperçu teinté si demandé), bouton Imprimer, lien SVG laser (sans teinte) par planche. */
export function printHtml(pattern: Pattern, page: PageSpec, name: string, opt: SvgOptions): string {
  const titles = (i: number) => `${name} · planche ${i + 1} / ${pattern.pages.length}`;
  const blocks = pattern.pages.map((pl, i) => {
    const view = pageSvg(pl, page, titles(i), opt);
    const laser = pageSvg(pl, page, titles(i), { ...opt, tint: false });
    return `<div class="page"><a download="${esc(name)}-planche-${i + 1}.svg" href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(laser)}">Télécharger le SVG pour le laser</a>${view}</div>`;
  });
  const foldTxt = opt.foldStyle === 'perf' ? 'pointillés (perforation)' : 'trait continu (rainurage)';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(name)} · patron papier</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  body { margin: 0; background: #e5e5e5; font-family: system-ui, sans-serif; }
  .bar { position: sticky; top: 0; background: #fff; padding: 10px 16px; box-shadow: 0 1px 4px #0002; display: flex; gap: 16px; align-items: center; font-size: 14px; flex-wrap: wrap; }
  .bar button { padding: 6px 14px; font-size: 14px; }
  .page { width: ${page.w}mm; height: ${page.h}mm; background: #fff; margin: 12px auto; box-shadow: 0 2px 8px #0003; page-break-after: always; position: relative; }
  .page a { position: absolute; top: 3mm; right: 6mm; font-size: 12px; }
  svg { display: block; }
  i { display: inline-block; width: 18px; height: 0; border-top: 2px solid; vertical-align: middle; margin-right: 4px; }
  @media print { body { background: none; } .bar, .page a { display: none; } .page { margin: 0; box-shadow: none; } }
</style></head><body>
<div class="bar"><button onclick="window.print()">Imprimer</button>
<span><i style="border-color:${COLORS.cut}"></i>couper</span>
<span><i style="border-color:${COLORS.mountain}"></i>pli montagne (vers l'arrière), ${foldTxt}</span>
<span><i style="border-color:${COLORS.valley}"></i>pli vallée (vers soi)</span>
<span style="color:${COLORS.label}">numéros : la languette N se colle sur le bord N d'une autre pièce</span></div>
${blocks.join('\n')}
</body></html>`;
}
