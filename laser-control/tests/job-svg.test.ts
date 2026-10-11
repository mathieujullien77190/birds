import { describe, expect, it } from 'vitest';
import { classifyStroke, flattenPath, parseSvg, parseTransform } from '../src';

const svg = (inner: string, attrs = 'viewBox="0 0 100 100"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`;
const sq = (extra = '') => `<rect x="10" y="10" width="20" height="20" stroke="#000" ${extra}/>`;

describe('parseTransform', () => {
  it('translate, scale, rotate, matrix, skew', () => {
    expect(parseTransform(undefined)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(parseTransform('')).toEqual([1, 0, 0, 1, 0, 0]);
    expect(parseTransform('translate(5)')).toEqual([1, 0, 0, 1, 5, 0]);
    expect(parseTransform('translate(5, 7)')).toEqual([1, 0, 0, 1, 5, 7]);
    expect(parseTransform('translate()')).toEqual([1, 0, 0, 1, 0, 0]);
    expect(parseTransform('scale(2)')).toEqual([2, 0, 0, 2, 0, 0]);
    expect(parseTransform('scale(2 3)')).toEqual([2, 0, 0, 3, 0, 0]);
    expect(parseTransform('scale()')).toEqual([1, 0, 0, 1, 0, 0]);
    expect(parseTransform('matrix(1 2 3 4 5 6)')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parseTransform('matrix(1 2)')).toEqual([1, 0, 0, 1, 0, 0]);
    expect(parseTransform('foo(1 2)')).toEqual([1, 0, 0, 1, 0, 0]);
    const sx = parseTransform('skewX(45)'), sy = parseTransform('skewY(45)');
    expect(sx[2]).toBeCloseTo(1, 9);
    expect(sy[1]).toBeCloseTo(1, 9);
    expect(parseTransform('skewX()')[2]).toBe(0);
    expect(parseTransform('skewY()')[1]).toBe(0);
  });
  it('rotate autour de l\'origine ou d\'un centre', () => {
    const r = parseTransform('rotate(90)');
    expect(r[0]).toBeCloseTo(0, 9); expect(r[1]).toBeCloseTo(1, 9); expect(r[2]).toBeCloseTo(-1, 9); expect(r[3]).toBeCloseTo(0, 9);
    const c = parseTransform('rotate(90 10 10)'); // (20,10) → (10,20)
    expect(c[0] * 20 + c[2] * 10 + c[4]).toBeCloseTo(10, 9);
    expect(c[1] * 20 + c[3] * 10 + c[5]).toBeCloseTo(20, 9);
    expect(parseTransform('rotate()')[0]).toBe(1);
  });
  it('les transformations se composent de gauche à droite (la dernière s\'applique d\'abord)', () => {
    const m = parseTransform('translate(10 0) scale(2)'); // (1,0) → (2,0) → (12,0)
    expect(m[0] * 1 + m[4]).toBe(12);
  });
});

describe('classifyStroke', () => {
  it.each([
    [undefined, 'none'], ['none', 'none'], ['transparent', 'none'],
    ['#000', 'cut'], ['#000000', 'cut'], ['#111', 'cut'], ['black', 'cut'], ['rgb(0,0,0)', 'cut'], ['BLACK', 'cut'],
    ['#00f', 'engrave'], ['#0000ff', 'engrave'], ['blue', 'engrave'], ['mediumblue', 'engrave'], ['rgb(0, 0, 255)', 'engrave'], ['rgb(0 0 255)', 'engrave'],
    ['#fff', 'none'], ['#bbb', 'none'], ['#bbbbbb', 'none'], ['white', 'none'], ['gray', 'none'], ['rgb(50%,50%,50%)', 'none'],
    ['#f00', 'other'], ['red', 'other'], ['navy', 'other'], ['darkblue', 'other'], ['banana', 'other'], ['#xyz', 'other'], ['rgb(100%,0%,0%)', 'other'], ['green', 'other'],
  ])('%s → %s', (c, expected) => { expect(classifyStroke(c as string | undefined)).toBe(expected); });
  it('seuils : 90 pour le noir, 30 d\'écart pour le gris, bleu ≥ 150 avec R et G ≤ 110', () => {
    expect(classifyStroke('rgb(90,90,90)')).toBe('cut');
    expect(classifyStroke('rgb(91,91,91)')).toBe('none');
    expect(classifyStroke('rgb(150,100,100)')).toBe('other'); // écart 50 : ni gris ni bleu
  });
});

describe('flattenPath', () => {
  const pts = (d: string) => flattenPath(d).map((s) => s.pts);
  it('lignes absolues, H, V, Z', () => {
    const s = flattenPath('M0 0 L10 0 H10 V10 H0 Z');
    expect(s).toHaveLength(1);
    expect(s[0].closed).toBe(true);
    expect(s[0].pts).toEqual([[0, 0], [10, 0], [10, 0], [10, 10], [0, 10]]);
  });
  it('relatif : m l h v z, et coordonnées supplémentaires = lignes implicites', () => {
    expect(pts('m5 5 l10 0 0 10 h-10 v-10 z')[0]).toEqual([[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]]);
    expect(pts('M0 0 10 0 10 10')[0]).toEqual([[0, 0], [10, 0], [10, 10]]);
    expect(pts('M0 0 L10 0 10 10 0 10')[0]).toHaveLength(4);
  });
  it('un L après Z repart du début du sous-chemin ; plusieurs sous-chemins', () => {
    const s = flattenPath('M5 5 L10 5 L10 10 Z L0 0 M20 20 L30 20');
    expect(s).toHaveLength(3);
    expect(s[0].closed).toBe(true);
    expect(s[1]).toEqual({ pts: [[5, 5], [0, 0]], closed: false });
    expect(s[2].pts).toEqual([[20, 20], [30, 20]]);
  });
  it('cubiques C et S : 16 segments, finissent au point demandé, S reflète la poignée précédente', () => {
    const c = pts('M0 0 C0 10 10 10 10 0')[0];
    expect(c).toHaveLength(17);
    expect(c[16]).toEqual([10, 0]);
    expect(c[8][0]).toBeCloseTo(5, 9); expect(c[8][1]).toBeCloseTo(7.5, 9); // milieu d'une Bézier : (0+3·0+3·10+10)/8, (0+30+30+0)/8
    const s = pts('M0 0 C0 10 10 10 10 0 S20 -10 20 0')[0];
    expect(s).toHaveLength(33);
    expect(s[32]).toEqual([20, 0]);
    expect(s[24][1]).toBeCloseTo(-7.5, 9); // poignée 1 = reflet de (10,10) par (10,0) = (10,-10)
    const alone = pts('M0 0 S10 10 10 0')[0]; // sans courbe avant : poignée 1 = point courant
    expect(alone).toHaveLength(17);
    expect(alone[8][0]).toBeCloseTo(5, 9);
    expect(alone[8][1]).toBeCloseTo(3.75, 9);
    const rel = pts('M0 0 c0 10 10 10 10 0')[0];
    expect(rel[16]).toEqual([10, 0]);
  });
  it('quadratiques Q et T : 12 segments, T reflète', () => {
    const q = pts('M0 0 Q5 10 10 0')[0];
    expect(q).toHaveLength(13);
    expect(q[6][1]).toBeCloseTo(5, 9);
    expect(q[12]).toEqual([10, 0]);
    const t = pts('M0 0 Q5 10 10 0 T20 0')[0];
    expect(t).toHaveLength(25);
    expect(t[18][1]).toBeCloseTo(-5, 9);
    const alone = pts('M0 0 T10 0')[0];
    expect(alone[6][0]).toBeCloseTo(2.5, 9);
    expect(alone[6][1]).toBeCloseTo(0, 9);
  });
  it('arcs : demi-cercle selon le sens, rayon trop petit agrandi, drapeaux collés', () => {
    const up = pts('M0 0 A5 5 0 0 1 10 0')[0];
    expect(up[up.length - 1]).toEqual([10, 0]);
    expect(Math.min(...up.map((p) => p[1]))).toBeCloseTo(-5, 6); // sweep=1 : passe par (5,-5)
    for (const p of up.slice(1)) expect(Math.hypot(p[0] - 5, p[1])).toBeCloseTo(5, 6);
    const down = pts('M0 0 A5 5 0 0 0 10 0')[0];
    expect(Math.max(...down.map((p) => p[1]))).toBeCloseTo(5, 6);
    expect(Math.min(...down.map((p) => p[1]))).toBeCloseTo(0, 6);
    const big = pts('M0 0 A1 1 0 0 1 10 0')[0]; // rayon 1 impossible : ramené à 5
    for (const p of big.slice(1)) expect(Math.hypot(p[0] - 5, p[1])).toBeCloseTo(5, 6);
    expect(pts('M0 0 A5 5 0 01 10 0')[0].pop()).toEqual([10, 0]);
    expect(pts('M0 0 A5 5 0 0110 0')[0].pop()).toEqual([10, 0]);
    const rel = pts('M10 0 a5 5 0 0 1 10 0')[0];
    expect(rel[rel.length - 1]).toEqual([20, 0]);
  });
  it('arcs : quatre combinaisons de drapeaux, ellipse tournée, grand arc', () => {
    for (const fa of [0, 1]) for (const fs of [0, 1]) {
      const p = pts(`M10 0 A10 5 30 ${fa} ${fs} 0 10`)[0];
      expect(p[p.length - 1]).toEqual([0, 10]);
      expect(p.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    }
    // grand arc / petit arc : les deux ne passent pas du même côté de la corde
    const small = pts('M0 0 A10 10 0 0 1 10 10')[0], large = pts('M0 0 A10 10 0 1 1 10 10')[0];
    expect(large.length).toBeGreaterThan(small.length);
  });
  it('arcs dégénérés : rayon nul = droite, mêmes extrémités = rien', () => {
    expect(pts('M0 0 A0 5 0 0 1 10 0')[0]).toEqual([[0, 0], [10, 0]]);
    expect(pts('M0 0 A5 0 0 0 1 10 0')[0]).toEqual([[0, 0], [10, 0]]);
    expect(pts('M3 3 A5 5 0 0 1 3 3')[0]).toEqual([[3, 3], [3, 3]]);
  });
  it('s\'arrête sur une commande inconnue, sans argument, ou sans commande', () => {
    expect(pts('M0 0 L1 1 X5 5')[0]).toEqual([[0, 0], [1, 1]]);
    expect(pts('M0 0 L1 1 L')[0]).toEqual([[0, 0], [1, 1]]);
    expect(flattenPath('10 20 30')).toEqual([]);
    expect(flattenPath('')).toEqual([]);
    expect(flattenPath('L5 5')[0].pts).toEqual([[0, 0], [5, 5]]); // pas de M : part de l'origine
    expect(flattenPath('Z')).toEqual([]);
  });
  it('nombres collés et exposants', () => {
    expect(pts('M0,0L1e1-5')[0]).toEqual([[0, 0], [10, -5]]);
    expect(pts('M.5.5L1.5.5')[0]).toEqual([[0.5, 0.5], [1.5, 0.5]]);
  });
});

describe('parseSvg : taille et unités', () => {
  it('viewBox seul : planche = viewBox, Y retourné', () => {
    const { job } = parseSvg(svg(sq(), 'viewBox="0 0 100 50"'));
    expect(job.widthMm).toBe(100);
    expect(job.heightMm).toBe(50);
    expect(job.layers.cut[0]).toEqual([[10, 40], [30, 40], [30, 20], [10, 20]]);
  });
  it('viewBox décalé', () => {
    const { job } = parseSvg(svg('<rect x="10" y="20" width="5" height="5" stroke="#000"/>', 'viewBox="10 20 100 50"'));
    expect(job.layers.cut[0]).toEqual([[0, 50], [5, 50], [5, 45], [0, 45]]);
  });
  it.each([
    ['100mm', '50mm', 100, 50], ['10cm', '5cm', 100, 50], ['2in', '1in', 50.8, 25.4], ['72pt', '36pt', 25.4, 12.7], ['6pc', '3pc', 25.4, 12.7],
    ['100', '50', 100, 50], ['100px', '50px', 100, 50],
  ])('sans viewBox, width=%s height=%s', (w, h, W, H) => {
    const { job } = parseSvg(`<svg width="${w}" height="${h}">${sq()}</svg>`);
    expect(job.widthMm).toBeCloseTo(W, 9);
    expect(job.heightMm).toBeCloseTo(H, 9);
  });
  it('width en mm avec un viewBox d\'une autre échelle : l\'échelle suit width', () => {
    const { job } = parseSvg(svg('<rect x="1" y="1" width="2" height="2" stroke="#000"/>', 'width="100mm" height="50mm" viewBox="0 0 10 5"'));
    expect(job.widthMm).toBe(100);
    expect(job.heightMm).toBe(50);
    expect(job.layers.cut[0][0]).toEqual([10, 40]);
  });
  it('width en px ou en % avec viewBox : échelle 1', () => {
    expect(parseSvg(svg(sq(), 'width="500px" viewBox="0 0 100 100"')).job.widthMm).toBe(100);
    expect(parseSvg(svg(sq(), 'width="100%" height="100%" viewBox="0 0 100 80"')).job.heightMm).toBe(80);
  });
  it('viewBox à 3 nombres ignoré : retombe sur width / height', () => {
    expect(parseSvg(svg(sq(), 'width="40mm" height="30mm" viewBox="0 0 10"')).job.widthMm).toBe(40);
  });
  it('erreurs : pas un SVG, sans taille, taille négative ou nulle', () => {
    expect(() => parseSvg('<html></html>')).toThrow("Ce fichier n'est pas un SVG.");
    expect(() => parseSvg('<svg></svg>')).toThrow('SVG sans taille');
    expect(() => parseSvg('<svg width="10mm"></svg>')).toThrow('SVG sans taille');
    expect(() => parseSvg('<svg width="abc" height="10"></svg>')).toThrow('SVG sans taille');
    expect(() => parseSvg(svg(sq(), 'viewBox="0 0 -10 5"'))).toThrow('SVG sans taille');
    expect(() => parseSvg(svg(sq(), 'viewBox="0 0 0 5"'))).toThrow('SVG sans taille');
  });
});

describe('parseSvg : formes', () => {
  const cut = (inner: string, attrs?: string) => parseSvg(svg(inner, attrs)).job.layers.cut;
  it('rect simple, arrondi (rx seul, ry seul, rx > moitié), w ou h nul', () => {
    expect(cut(sq())).toHaveLength(1);
    expect(cut(sq())[0]).toHaveLength(4);
    const r1 = cut('<rect x="0" y="0" width="20" height="10" rx="2" stroke="#000"/>')[0];
    expect(r1.length).toBeGreaterThan(8);
    const xs = r1.map((p) => p[0]), ys = r1.map((p) => p[1]);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([0, 20, 90, 100]);
    expect(cut('<rect x="0" y="0" width="20" height="10" ry="2" stroke="#000"/>')[0].length).toBeGreaterThan(8);
    const big = cut('<rect x="0" y="0" width="20" height="10" rx="50" stroke="#000"/>')[0];
    expect(big.length).toBeGreaterThan(8); // rx ramené à 10, ry à 5
    expect(cut('<rect x="0" y="0" width="0" height="10" stroke="#000"/>')).toEqual([]);
    expect(cut('<rect x="0" y="0" width="10" height="-3" stroke="#000"/>')).toEqual([]);
  });
  it('cercle : 96 points sur le bon rayon ; rayon nul ignoré ; ellipse', () => {
    const c = cut('<circle cx="50" cy="50" r="10" stroke="#000"/>')[0];
    expect(c).toHaveLength(96);
    for (const [x, y] of c) expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(10, 9);
    expect(cut('<circle cx="50" cy="50" r="0" stroke="#000"/>')).toEqual([]);
    expect(cut('<circle cx="50" cy="50" stroke="#000"/>')).toEqual([]);
    const e = cut('<ellipse cx="50" cy="50" rx="20" ry="10" stroke="#000"/>')[0];
    expect(Math.max(...e.map((p) => p[0])) - Math.min(...e.map((p) => p[0]))).toBeCloseTo(40, 6);
    expect(cut('<ellipse cx="50" cy="50" rx="20" ry="0" stroke="#000"/>')).toEqual([]);
  });
  it('polygon : fermé ; polyline fermée par ses points ou ouverte ; un seul point ; sans points', () => {
    expect(cut('<polygon points="0,0 10,0 10,10" stroke="#000"/>')).toHaveLength(1);
    expect(cut('<polyline points="0,0 10,0 10,10 0,0" stroke="#000"/>')).toHaveLength(1);
    const open = parseSvg(svg('<polyline points="0,0 10,0 10,10" stroke="#000"/>'));
    expect(open.job.layers.cut).toEqual([]);
    expect(open.warnings[0]).toBe('1 trait ouvert ignoré (seuls les contours fermés sont coupés ou gravés).');
    expect(cut('<polygon points="5,5" stroke="#000"/>')).toEqual([]);
    expect(cut('<polygon stroke="#000"/>')).toEqual([]);
    expect(cut('<polygon points="1,2,3" stroke="#000"/>')).toEqual([]);
  });
  it('line et path : ouverts ignorés (pluriel), fermés gardés, fermés par coïncidence', () => {
    const r = parseSvg(svg('<line x1="0" y1="0" x2="10" y2="10" stroke="#000"/><line stroke="#000"/><path d="M0 0 L5 5 L9 1" stroke="#000"/>'));
    expect(r.job.layers.cut).toEqual([]);
    expect(r.warnings[0]).toBe('3 traits ouverts ignorés (seuls les contours fermés sont coupés ou gravés).');
    expect(cut('<path d="M0 0 L10 0 L10 10 L0 0" stroke="#000"/>')).toHaveLength(1);
    expect(cut('<path d="M0 0 L10 0 L10 10 Z" stroke="#000"/>')).toHaveLength(1);
    expect(cut('<path stroke="#000"/>')).toEqual([]);
    expect(parseSvg(svg('<path d="M0 0 L5 5 L0 0" stroke="#000"/>')).job.layers.cut).toEqual([]); // 3 points mais dégénéré
  });
  it('contours dégénérés comptés (singulier / pluriel)', () => {
    const one = parseSvg(svg('<polygon points="0,0 0,0 5,5" stroke="#000"/>' + sq()));
    expect(one.warnings).toEqual(['1 contour dégénéré ignoré.']);
    const two = parseSvg(svg('<polygon points="0,0 0,0 5,5" stroke="#000"/><polygon points="1,1 1,1 2,2" stroke="#000"/>'));
    expect(two.warnings[0]).toBe('2 contours dégénérés ignorés.');
  });
  it('couleurs : noir = coupe, bleu = gravure (couche présente seulement si utilisée), autre = avertissement, gris / sans trait = silence', () => {
    const r = parseSvg(svg(sq() + '<rect x="40" y="40" width="10" height="10" stroke="#00f"/>'));
    expect(r.job.layers.cut).toHaveLength(1);
    expect(r.job.layers.engrave).toHaveLength(1);
    expect(r.warnings).toEqual([]);
    expect('engrave' in parseSvg(svg(sq())).job.layers).toBe(false);
    const o = parseSvg(svg(sq() + '<rect width="5" height="5" stroke="red"/>'));
    expect(o.warnings).toEqual(["1 forme à trait d'une autre couleur ignorée (noir = coupe, bleu = gravure)."]);
    const o2 = parseSvg(svg(sq() + '<rect width="5" height="5" stroke="red"/><circle r="5" stroke="#0f0"/>'));
    expect(o2.warnings).toEqual(["2 formes à trait d'une autre couleur ignorées (noir = coupe, bleu = gravure)."]);
    expect(parseSvg(svg(sq() + '<rect width="5" height="5" stroke="#ccc"/><rect width="5" height="5" fill="red"/>')).warnings).toEqual([]);
  });
  it('rien d\'utilisable : avertissement et planche vide', () => {
    const r = parseSvg(svg('<rect width="5" height="5" fill="red"/>'));
    expect(r.warnings).toEqual(['Aucun contour fermé à trait noir (coupe) ou bleu (gravure) : rien à envoyer.']);
    expect(r.job.layers).toEqual({ cut: [] });
  });
});

describe('parseSvg : structure', () => {
  it('trait hérité du groupe et de la racine, style, apostrophes', () => {
    expect(parseSvg(svg('<g stroke="#000"><rect width="5" height="5"/></g>')).job.layers.cut).toHaveLength(1);
    expect(parseSvg('<svg viewBox="0 0 10 10" stroke="#000"><rect width="5" height="5"/></svg>').job.layers.cut).toHaveLength(1);
    expect(parseSvg(svg('<rect width="5" height="5" style="fill:none; stroke : #000 ; bogus"/>')).job.layers.cut).toHaveLength(1);
    expect(parseSvg(svg("<rect width='5' height='5' stroke='#000'/>")).job.layers.cut).toHaveLength(1);
    expect(parseSvg(svg('<g stroke="#000"><rect width="5" height="5" stroke="none"/></g>')).job.layers.cut).toEqual([]); // l'élément l'emporte sur le groupe
  });
  it('transform sur un groupe et sur la forme, composés', () => {
    const r = parseSvg(svg('<g transform="translate(10 0)"><rect width="5" height="5" stroke="#000" transform="translate(0 20)"/></g>'));
    expect(r.job.layers.cut[0]).toEqual([[10, 80], [15, 80], [15, 75], [10, 75]]);
  });
  it('groupes imbriqués : la fermeture dépile, une fermeture étrangère est ignorée, <a> et éléments inconnus ouvrent un niveau', () => {
    const r = parseSvg(svg('<g transform="translate(50 0)"><a><foo><rect width="5" height="5" stroke="#000"/></foo></a></g><rect width="5" height="5" stroke="#000"/>'));
    expect(r.job.layers.cut.map((p) => p[0][0])).toEqual([50, 0]);
    const odd = parseSvg(svg('</g><g transform="translate(50 0)"><a></g><rect width="5" height="5" stroke="#000"/></a></g><rect width="5" height="5" stroke="#000"/>'));
    expect(odd.job.layers.cut.map((p) => p[0][0])).toEqual([50, 0]); // </g> pendant <a> ignoré : le groupe reste ouvert jusqu'au bout
    const selfG = parseSvg(svg('<g transform="translate(50 0)"/><image href="x"/><rect width="5" height="5" stroke="#000"/>'));
    expect(selfG.job.layers.cut[0][0][0]).toBe(0);
    const nested = parseSvg(svg('<svg stroke="#000"><rect width="5" height="5"/></svg>'));
    expect(nested.job.layers.cut).toHaveLength(1);
  });
  it('<use> ignoré avec avertissement ; commentaires, defs, style, text retirés', () => {
    const r = parseSvg(svg(
      '<!-- <rect width="9" height="9" stroke="#000"/> --><defs><rect width="9" height="9" stroke="#000"/></defs><style>.a{stroke:#000}</style><text x="1" y="1">hello</text><use href="#a"/>' + sq(),
    ));
    expect(r.job.layers.cut).toHaveLength(1);
    expect(r.warnings).toEqual(['Un élément <use> est ignoré.']);
  });
});
