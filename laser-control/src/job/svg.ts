import { simplifyContour } from './geometry';
import type { LaserJob, Polyline } from './types';

/**
 * Import d'un fichier SVG en `LaserJob`, sans DOM (marche aussi dans les tests et en ligne de commande).
 *
 * Convention (celle des SVG exportés par l'application du nichoir) : 1 unité = 1 mm, le `viewBox` est la planche, l'origine du SVG est en HAUT à gauche
 * (le travail est retourné pour que l'origine machine soit en BAS à gauche). Trait noir (ou très sombre) = coupe, trait bleu = gravure.
 * Les autres couleurs (le cadre gris de la planche, par exemple), les remplissages et les textes sont ignorés. Si `width` est donné en mm / cm / pouces
 * et que le `viewBox` a une autre échelle, l'échelle suit `width`.
 * Reconnus : `path` (M L H V C S Q T A Z), `rect`, `circle`, `ellipse`, `polygon`, `polyline`, `line`, et `transform` sur les groupes et les formes.
 * Seuls les contours FERMÉS sont gardés (un trait ouvert ne peut pas être coupé comme une pièce) ; les autres sont comptés dans `warnings`.
 */
export interface SvgImport { job: LaserJob; warnings: string[] }

type Mat = [number, number, number, number, number, number]; // a b c d e f (comme `matrix()` en SVG)
const ID: Mat = [1, 0, 0, 1, 0, 0];
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const nums = (s: string): number[] => (s.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);

/** Valeur de l'attribut `transform` en matrice. */
export function parseTransform(text: string | undefined): Mat {
  let m = ID;
  if (!text) return m;
  for (const t of text.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = nums(t[2]);
    const rad = (d: number) => (d * Math.PI) / 180;
    let n: Mat = ID;
    switch (t[1]) {
      case 'translate': n = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0]; break;
      case 'scale': n = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]; break;
      case 'rotate': {
        const c = Math.cos(rad(a[0] ?? 0)), s = Math.sin(rad(a[0] ?? 0));
        n = [c, s, -s, c, 0, 0];
        if (a.length >= 3) n = mul(mul([1, 0, 0, 1, a[1], a[2]], n), [1, 0, 0, 1, -a[1], -a[2]]);
        break;
      }
      case 'matrix': if (a.length >= 6) n = [a[0], a[1], a[2], a[3], a[4], a[5]]; break;
      case 'skewX': n = [1, 0, Math.tan(rad(a[0] ?? 0)), 1, 0, 0]; break;
      case 'skewY': n = [1, Math.tan(rad(a[0] ?? 0)), 0, 1, 0, 0]; break;
    }
    m = mul(m, n);
  }
  return m;
}

const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0], blue: [0, 0, 255], navy: [0, 0, 128], darkblue: [0, 0, 139], mediumblue: [0, 0, 205], red: [255, 0, 0], green: [0, 128, 0],
  gray: [128, 128, 128], grey: [128, 128, 128], white: [255, 255, 255], lime: [0, 255, 0], darkgray: [169, 169, 169], silver: [192, 192, 192],
};

function parseColor(c: string): [number, number, number] | null {
  const s = c.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16)) as [number, number, number];
  m = /^#([0-9a-f]{6})/.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number];
  m = /^rgb\(\s*([\d.]+)(%?)\s*[, ]\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?/.exec(s);
  if (m) { const k = m[2] ? 2.55 : 1; return [Number(m[1]) * k, Number(m[3]) * k, Number(m[4]) * k]; }
  return NAMED[s] ?? null;
}

/** `cut` (noir ou presque), `engrave` (bleu), `none` (pas de trait, ou gris clair / blanc : repère ignoré sans avertissement), `other` (autre couleur : ignorée avec avertissement). */
export function classifyStroke(c: string | undefined): 'cut' | 'engrave' | 'none' | 'other' {
  if (c === undefined || c === 'none' || c === 'transparent') return 'none';
  const rgb = parseColor(c);
  if (!rgb) return 'other';
  const [r, g, b] = rgb;
  if (Math.max(r, g, b) <= 90) return 'cut';
  if (Math.max(r, g, b) - Math.min(r, g, b) <= 30) return 'none'; // gris clair ou blanc : repère (cadre de la planche), jamais coupé
  if (b >= 150 && r <= 110 && g <= 110) return 'engrave';
  return 'other';
}

type Attrs = Record<string, string>;

function attrsOf(tag: string): Attrs {
  const out: Attrs = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]] = (m[2] ?? m[3])!; // l'une des deux alternatives (guillemets doubles ou simples) a toujours participé
  if (out.style) for (const d of out.style.split(';')) { const i = d.indexOf(':'); if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim(); }
  return out;
}

const length = (s: string | undefined): number | null => {
  if (!s) return null;
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(mm|cm|in|px|pt|pc)?\s*$/.exec(s);
  if (!m) return null;
  const k = { mm: 1, cm: 10, in: 25.4, px: 1, pt: 25.4 / 72, pc: 25.4 / 6 }[m[2] ?? 'px'] as number;
  return Number(m[1]) * k;
};
/** Longueur donnée avec une vraie unité physique (pas en px) : en mm, sinon `null`. */
const physical = (s: string | undefined): number | null => (s && /(mm|cm|in|pt|pc)\s*$/.test(s) ? length(s) : null);

interface Sub { pts: [number, number][]; closed: boolean }

function arcPoints(x1: number, y1: number, rx: number, ry: number, phiDeg: number, fa: number, fs: number, x2: number, y2: number): [number, number][] {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [[x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = (phiDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI;
  if (fs && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 32)));
  const out: [number, number][] = [];
  for (let i = 1; i <= n; i++) {
    const t = t1 + (dt * i) / n;
    out.push([cp * rx * Math.cos(t) - sp * ry * Math.sin(t) + cx, sp * rx * Math.cos(t) + cp * ry * Math.sin(t) + cy]);
  }
  out[out.length - 1] = [x2, y2];
  return out;
}

/** Sous-chemins d'un attribut `d` (courbes aplaties en segments). */
export function flattenPath(d: string): Sub[] {
  const subs: Sub[] = [];
  let cur: Sub | null = null;
  let x = 0, y = 0, sx = 0, sy = 0, cmd = '', lastC: [number, number] | null = null, lastQ: [number, number] | null = null;
  const toks = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  let i = 0;
  const more = () => i < toks.length && !/^[a-zA-Z]$/.test(toks[i]);
  const take = () => Number(toks[i++]);
  const flag = () => { const t = toks[i]; if (t.length > 1 && /^[01]/.test(t)) { toks[i] = t.slice(1); return Number(t[0]); } return Number(toks[i++]); };
  const start = (nx: number, ny: number) => { cur = { pts: [[nx, ny]], closed: false }; subs.push(cur); };
  const push = (nx: number, ny: number) => { if (!cur) start(x, y); cur!.pts.push([nx, ny]); x = nx; y = ny; };
  while (i < toks.length) {
    if (/^[a-zA-Z]$/.test(toks[i])) cmd = toks[i++];
    else if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') {
      if (cur) (cur as Sub).closed = true;
      x = sx; y = sy; cur = null; lastC = lastQ = null;
      continue;
    }
    if (!more()) break;
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'M') {
      const nx = take() + ox, ny = take() + oy;
      x = sx = nx; y = sy = ny; start(nx, ny);
      cmd = rel ? 'l' : 'L'; lastC = lastQ = null;
    } else if (C === 'L') { push(take() + ox, take() + oy); lastC = lastQ = null; }
    else if (C === 'H') { push(take() + ox, y); lastC = lastQ = null; }
    else if (C === 'V') { push(x, take() + oy); lastC = lastQ = null; }
    else if (C === 'C' || C === 'S') {
      let c1: [number, number];
      if (C === 'C') c1 = [take() + ox, take() + oy];
      else c1 = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y];
      const c2: [number, number] = [take() + ox, take() + oy];
      const nx = take() + ox, ny = take() + oy;
      const x0 = x, y0 = y;
      for (let k = 1; k <= 16; k++) {
        const t = k / 16, u = 1 - t;
        push(u * u * u * x0 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * nx, u * u * u * y0 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * ny);
      }
      lastC = c2; lastQ = null;
    } else if (C === 'Q' || C === 'T') {
      let c1: [number, number];
      if (C === 'Q') c1 = [take() + ox, take() + oy];
      else c1 = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y];
      const nx = take() + ox, ny = take() + oy;
      const x0 = x, y0 = y;
      for (let k = 1; k <= 12; k++) {
        const t = k / 12, u = 1 - t;
        push(u * u * x0 + 2 * u * t * c1[0] + t * t * nx, u * u * y0 + 2 * u * t * c1[1] + t * t * ny);
      }
      lastQ = c1; lastC = null;
    } else if (C === 'A') {
      const rx = take(), ry = take(), rot = take(), fa = flag(), fs = flag();
      const nx = take() + ox, ny = take() + oy;
      for (const p of arcPoints(x, y, rx, ry, rot, fa, fs, nx, ny)) push(p[0], p[1]);
      lastC = lastQ = null;
    } else break;
  }
  return subs;
}

function shapeSubs(tag: string, a: Attrs): Sub[] {
  const n = (k: string) => length(a[k]) ?? 0;
  switch (tag) {
    case 'path': return flattenPath(a.d ?? '');
    case 'rect': {
      const x = n('x'), y = n('y'), w = n('width'), h = n('height');
      if (w <= 0 || h <= 0) return [];
      const rx = Math.min(length(a.rx) ?? length(a.ry) ?? 0, w / 2), ry = Math.min(length(a.ry) ?? length(a.rx) ?? 0, h / 2);
      if (rx <= 0 || ry <= 0) return [{ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true }];
      const d = `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
      return flattenPath(d);
    }
    case 'circle': case 'ellipse': {
      const rx = tag === 'circle' ? n('r') : n('rx'), ry = tag === 'circle' ? n('r') : n('ry'), cx = n('cx'), cy = n('cy');
      if (rx <= 0 || ry <= 0) return [];
      const N = 96;
      return [{ pts: Array.from({ length: N }, (_, k): [number, number] => [cx + rx * Math.cos((2 * Math.PI * k) / N), cy + ry * Math.sin((2 * Math.PI * k) / N)]), closed: true }];
    }
    case 'polygon': case 'polyline': {
      const v = nums(a.points ?? '');
      const pts: [number, number][] = [];
      for (let k = 0; k + 1 < v.length; k += 2) pts.push([v[k], v[k + 1]]);
      return pts.length >= 2 ? [{ pts, closed: tag === 'polygon' }] : [];
    }
    default: return [{ pts: [[n('x1'), n('y1')], [n('x2'), n('y2')]], closed: false }]; // 'line', la seule forme restante (voir SHAPES)
  }
}

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line']);

/** Lit un SVG (texte) et rend le travail de découpe / gravure, ou une erreur si ce n'est pas un SVG exploitable. */
export function parseSvg(text: string): SvgImport {
  const warnings: string[] = [];
  const clean = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(defs|style|metadata|title|desc|text|script|clipPath|mask|marker|pattern|symbol)\b[\s\S]*?<\/\1>/gi, '');
  const root = /<svg\b([^>]*)>/i.exec(clean);
  if (!root) throw new Error("Ce fichier n'est pas un SVG.");
  const ra = attrsOf(root[1]);
  const vb = ra.viewBox ? nums(ra.viewBox) : [];
  const wAttr = length(ra.width), hAttr = length(ra.height);
  const vbx = vb.length === 4 ? vb[0] : 0, vby = vb.length === 4 ? vb[1] : 0;
  const vw = vb.length === 4 ? vb[2] : wAttr, vh = vb.length === 4 ? vb[3] : hAttr;
  if (!vw || !vh || vw <= 0 || vh <= 0) throw new Error('SVG sans taille : il faut un viewBox (ou width et height).');
  const pw = physical(ra.width);
  const scale = pw && vb.length === 4 ? pw / vw : 1;
  const widthMm = vw * scale, heightMm = vh * scale;

  const cut: Polyline[] = [], engrave: Polyline[] = [];
  let open = 0, other = 0, tooSmall = 0, used = 0;
  type Frame = { tag: string; m: Mat; stroke?: string };
  const stack: Frame[] = [{ tag: 'svg', m: ID, stroke: ra.stroke }];
  const rest = clean.slice(root.index + root[0].length);
  for (const t of rest.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, tag, body, self] = t;
    const name = tag.toLowerCase();
    if (closing) { if (stack.length > 1 && stack[stack.length - 1].tag === name) stack.pop(); continue; }
    const a = attrsOf(body);
    const parent = stack[stack.length - 1];
    const m = a.transform ? mul(parent.m, parseTransform(a.transform)) : parent.m;
    const stroke = a.stroke ?? parent.stroke;
    if (name === 'g' || name === 'a' || name === 'svg') { if (!self) stack.push({ tag: name, m, stroke }); continue; }
    if (name === 'use') { warnings.push('Un élément <use> est ignoré.'); continue; }
    if (!SHAPES.has(name)) { if (!self) stack.push({ tag: name, m, stroke }); continue; }
    const kind = classifyStroke(stroke);
    if (kind === 'none') continue;
    if (kind === 'other') { other++; continue; }
    for (const sub of shapeSubs(name, a)) {
      let pts = sub.pts;
      let closed = sub.closed;
      if (!closed && pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-3) closed = true;
      if (!closed) { open++; continue; }
      pts = pts.map(([x, y]) => { const [px, py] = apply(m, x, y); return [(px - vbx) * scale, (vby + vh - py) * scale] as [number, number]; });
      const poly = simplifyContour(pts, 1e-4);
      if (poly.length < 3) { tooSmall++; continue; }
      (kind === 'cut' ? cut : engrave).push(poly);
      used++;
    }
  }
  if (open) warnings.push(`${open} trait${open > 1 ? 's' : ''} ouvert${open > 1 ? 's' : ''} ignoré${open > 1 ? 's' : ''} (seuls les contours fermés sont coupés ou gravés).`);
  if (other) warnings.push(`${other} forme${other > 1 ? 's' : ''} à trait d'une autre couleur ignorée${other > 1 ? 's' : ''} (noir = coupe, bleu = gravure).`);
  if (tooSmall) warnings.push(`${tooSmall} contour${tooSmall > 1 ? 's' : ''} dégénéré${tooSmall > 1 ? 's' : ''} ignoré${tooSmall > 1 ? 's' : ''}.`);
  if (!used) warnings.push('Aucun contour fermé à trait noir (coupe) ou bleu (gravure) : rien à envoyer.');
  return { job: { widthMm, heightMm, layers: { cut, ...(engrave.length ? { engrave } : {}) } }, warnings };
}
