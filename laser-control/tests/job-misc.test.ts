import { describe, expect, it } from 'vitest';
import { EXAMPLE_SVG, GCODE_EXT, area, boundsOf, buildGcode, groupPieces, inside, itemFromFile, jobBox, orderContours, parseGcode, simplifyContour, type GcodeImportOptions, type LaserJob, type Polyline } from '../src';
import { ZOOM_MAX, panView, zoomView } from '../src/components/GcodePreview/helpers';

const box = (x: number, y: number, w: number, h: number): Polyline => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

describe('geometry', () => {
  it('area : indépendante du sens, nulle pour un segment', () => {
    expect(area(box(0, 0, 10, 10))).toBe(100);
    expect(area([...box(0, 0, 10, 10)].reverse())).toBe(100);
    expect(area([[0, 0], [10, 0]])).toBe(0);
    expect(area([])).toBe(0);
  });
  it('simplifyContour : doublons, point de fermeture répété, points alignés', () => {
    expect(simplifyContour([[0, 0], [0, 0], [10, 0], [10, 10], [0, 10], [0, 0]])).toEqual(box(0, 0, 10, 10));
    expect(simplifyContour([[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]])).toEqual(box(0, 0, 10, 10));
    expect(simplifyContour([[0, 0], [5, 0.001], [10, 0], [10, 10], [0, 10]])).toHaveLength(4); // sous la tolérance
    expect(simplifyContour([[0, 0], [5, 0.1], [10, 0], [10, 10], [0, 10]])).toHaveLength(5); // au-dessus
    expect(simplifyContour([[0, 0], [5, 0.1], [10, 0], [10, 10], [0, 10]], 0.2)).toHaveLength(4); // tolérance réglable
  });
  it('simplifyContour : une pointe qui revient sur ses pas est gardée ; un triangle n\'est jamais réduit', () => {
    const spike: Polyline = [[0, 0], [10, 0], [5, 0], [5, 5], [0, 5]]; // (10,0) → (5,0) : demi-tour
    expect(simplifyContour(spike)).toHaveLength(5);
    expect(simplifyContour([[0, 0], [5, 0], [10, 0]])).toHaveLength(3);
    expect(simplifyContour([[0, 0], [5, 0], [0, 0], [0, 5]])).toHaveLength(4); // voisins confondus (longueur nulle) : demi-tour, gardé
  });
  it('simplifyContour : cas minuscules', () => {
    expect(simplifyContour([])).toEqual([]);
    expect(simplifyContour([[1, 1]])).toEqual([[1, 1]]);
    expect(simplifyContour([[1, 1], [1, 1]])).toEqual([[1, 1]]);
  });
  it('inside : dedans, dehors, concave', () => {
    const sq = box(0, 0, 10, 10);
    expect(inside([5, 5], sq)).toBe(true);
    expect(inside([15, 5], sq)).toBe(false);
    expect(inside([5, -1], sq)).toBe(false);
    const u: Polyline = [[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10]];
    expect(inside([5, 6], u)).toBe(false); // dans l'échancrure
    expect(inside([1, 6], u)).toBe(true);
    expect(inside([5, 1], u)).toBe(true);
  });
  it('boundsOf', () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([[]])).toBeNull();
    expect(boundsOf([box(2, 3, 4, 5), [[-1, 20]]])).toEqual({ minX: -1, minY: 3, maxX: 6, maxY: 20 });
  });
});

describe('order', () => {
  it('groupPieces : trou dans une pièce, pièce dans un trou = nouvelle pièce, contours dégénérés ignorés', () => {
    const pieces = groupPieces([box(20, 20, 5, 5), box(0, 0, 100, 100), box(10, 10, 80, 80), box(30, 30, 10, 10), [[0, 0], [1, 1]]]);
    // les deux petits carrés sont DANS le trou de 80 (profondeur 2) : ce sont des pièces à part
    expect(pieces.map((p) => p.name)).toEqual(['Pièce 1', 'Pièce 2', 'Pièce 3']);
    expect(pieces.map((p) => p.contours.map(area))).toEqual([[25], [10000, 6400], [100]]);
  });
  it('groupPieces : trois niveaux d\'imbrication, deux pièces côte à côte, rien', () => {
    const p = groupPieces([box(0, 0, 100, 100), box(10, 10, 80, 80), box(20, 20, 60, 60), box(200, 0, 10, 10)]);
    expect(p.map((x) => x.contours.length)).toEqual([2, 1, 1]);
    expect(groupPieces([])).toEqual([]);
  });
  it('orderContours : petites pièces d\'abord, trous (petits d\'abord) avant l\'extérieur, nom de la pièce', () => {
    const job: LaserJob = {
      widthMm: 200, heightMm: 200,
      layers: { cut: [] },
      pieces: [
        { name: 'grande', contours: [box(0, 0, 100, 100), box(10, 10, 30, 30), box(50, 50, 10, 10)] },
        { name: 'petite', contours: [box(120, 0, 20, 20)] },
      ],
    };
    const o = orderContours(job);
    expect(o.map((c) => [c.piece, c.hole, c.area])).toEqual([['petite', false, 400], ['grande', true, 100], ['grande', true, 900], ['grande', false, 10000]]);
  });
  it('orderContours : l\'extérieur est le plus grand contour même s\'il n\'est pas en tête ; trous dégénérés et pièce vide ignorés', () => {
    const job: LaserJob = {
      widthMm: 100, heightMm: 100, layers: { cut: [] },
      pieces: [{ name: 'a', contours: [box(10, 10, 5, 5), box(0, 0, 50, 50), [[1, 1], [2, 2]]] }, { name: 'vide', contours: [] }],
    };
    const o = orderContours(job);
    expect(o.map((c) => [c.piece, c.hole])).toEqual([['a', true], ['a', false]]);
  });
  it('orderContours : sans `pieces`, retombe sur l\'imbrication ; `pieces` vide idem', () => {
    const cut = [box(0, 0, 50, 50), box(10, 10, 5, 5)];
    expect(orderContours({ widthMm: 60, heightMm: 60, layers: { cut } }).map((c) => c.hole)).toEqual([true, false]);
    expect(orderContours({ widthMm: 60, heightMm: 60, layers: { cut }, pieces: [] }).map((c) => c.hole)).toEqual([true, false]);
    expect(orderContours({ widthMm: 60, heightMm: 60, layers: { cut: [] } })).toEqual([]);
  });
  it('jobBox : frame explicite > pièces > contours de coupe > null', () => {
    const frame = { minX: 1, minY: 2, maxX: 3, maxY: 4 };
    expect(jobBox({ widthMm: 1, heightMm: 1, layers: { cut: [box(0, 0, 9, 9)] }, frame })).toBe(frame);
    expect(jobBox({ widthMm: 1, heightMm: 1, layers: { cut: [box(0, 0, 9, 9)] }, pieces: [{ name: 'p', contours: [box(5, 5, 2, 2)] }] })).toEqual({ minX: 5, minY: 5, maxX: 7, maxY: 7 });
    expect(jobBox({ widthMm: 1, heightMm: 1, layers: { cut: [box(0, 0, 9, 9)] } })).toEqual({ minX: 0, minY: 0, maxX: 9, maxY: 9 });
    expect(jobBox({ widthMm: 1, heightMm: 1, layers: { cut: [] } })).toBeNull();
    expect(jobBox({ widthMm: 1, heightMm: 1, layers: { cut: [box(0, 0, 9, 9)] }, pieces: [] })).toEqual({ minX: 0, minY: 0, maxX: 9, maxY: 9 });
  });
});

describe('buildGcode : en-tête, valeurs par défaut, plafonnement', () => {
  const job: LaserJob = { widthMm: 100, heightMm: 100, layers: { cut: [box(10, 10, 20, 20)] } };
  const OPT = { feed: 600, powerPct: 50, passes: 1, passMode: 'all' as const, sMax: 1000, capPct: 80 };
  it('en-tête sans gravure : titre par défaut, planche, passes, avertissement sur les noms', () => {
    const g = buildGcode(job, OPT);
    expect(g.header).toEqual([
      'Découpe laser (Sculpfun E1 Pro 21 W, GRBL 1.1)',
      "Planche 100 x 100 mm ; origine de travail = coin bas-gauche, X à droite, Y vers l'arrière",
      '1 contours, 1 passe(s) (tout le jeu), F600 mm/min, S500/1000',
      'Les noms des pièces ne sont pas gravés.',
    ]);
    expect(g.stats.contours).toBe(1);
    expect(g.stats.clamped).toBe(false);
  });
  it('en-tête avec gravure aux valeurs par défaut (1500 mm/min, 15 %, 1 passe), titre, mode contour', () => {
    const g = buildGcode({ ...job, title: 'Boîte', layers: { cut: job.layers.cut, engrave: [box(40, 40, 10, 10), [[0, 0], [1, 1]]] } }, { ...OPT, passMode: 'contour', passes: 2.4 });
    expect(g.header[0]).toBe('Boîte (Sculpfun E1 Pro 21 W, GRBL 1.1)');
    expect(g.header[2]).toBe('1 contours, 2 passe(s) (contour par contour), F600 mm/min, S500/1000');
    expect(g.header[3]).toBe('1 contours gravés avant la coupe : F1500 mm/min, S150/1000, 1 passe(s)');
    expect(g.stats.contours).toBe(2); // le contour gravé dégénéré (2 points) est écarté
    expect(g.lines.indexOf('G1 X50 Y40 F1500 S150')).toBeGreaterThan(0);
    expect(g.lines.indexOf('G1 X50 Y40 F1500 S150')).toBeLessThan(g.lines.findIndex((l) => l.includes('F600 S500')));
  });
  it('valeurs plancher : vitesse < 1 → 1, passes < 1 → 1', () => {
    const g = buildGcode(job, { ...OPT, feed: 0, passes: 0 });
    expect(g.lines.some((l) => l.includes('F1 S500'))).toBe(true);
    expect(g.header[2]).toContain('1 passe(s)');
  });
  it('« clamped » : puissance de coupe > plafond, > 100, ou puissance de gravure > plafond', () => {
    const eng = { ...job, layers: { cut: job.layers.cut, engrave: [box(40, 40, 10, 10)] } };
    expect(buildGcode(job, { ...OPT, powerPct: 90 }).stats.clamped).toBe(true);
    expect(buildGcode(job, { ...OPT, powerPct: 120, capPct: 200 }).stats.clamped).toBe(true);
    expect(buildGcode(eng, OPT).stats.clamped).toBe(false); // gravure à 15 % par défaut
    expect(buildGcode(eng, { ...OPT, engravePowerPct: 90 }).stats.clamped).toBe(true);
    expect(buildGcode(job, { ...OPT, engravePowerPct: 90 }).stats.clamped).toBe(false); // pas de gravure : sans effet
    const g = buildGcode(eng, { ...OPT, engravePowerPct: 90, engraveFeed: 0, engravePasses: 2.6 });
    expect(g.lines.filter((l) => l.includes('F1 S800'))).toHaveLength(3); // plafond 80 %, vitesse plancher, 3 passes arrondies
  });
  it('rapidFeed personnalisé change la durée estimée', () => {
    const slow = buildGcode(job, { ...OPT, rapidFeed: 600 }).stats.seconds;
    const fast = buildGcode(job, { ...OPT, rapidFeed: 6000 }).stats.seconds;
    expect(slow).toBeGreaterThan(fast);
  });
  it('programme exact d\'un carré : prologue, tracé, épilogue', () => {
    const g = buildGcode(job, OPT);
    expect(g.lines).toEqual(['G21', 'G90', 'G54', 'G94', 'M5', 'M4 S0', 'G0 X10 Y10', 'G1 X30 Y10 F600 S500', 'G1 X30 Y30', 'G1 X10 Y30', 'G1 X10 Y10', 'M5', 'G0 X0 Y0', 'M5']);
    expect(g.stats.cutMm).toBe(80);
    expect(g.stats.maxS).toBe(500);
    expect(g.stats.outOfBounds).toBe(false);
  });
});

describe('importFile', () => {
  it('SVG par extension (majuscules comprises) : titre = nom sans extension, notice avec les compteurs', () => {
    const it1 = itemFromFile('Boîte.SVG', EXAMPLE_SVG);
    expect(it1.label).toBe('Boîte.SVG');
    expect(it1.fileName).toBe('Boîte');
    expect(it1.job!.title).toBe('Boîte');
    expect(it1.gcode).toBeUndefined();
    expect(it1.notice).toBe('Traits noirs = coupe (3), traits bleus = gravure (1) ; le reste est ignoré.');
  });
  it('SVG reconnu au contenu quand l\'extension est inconnue ou absente ; avertissements ajoutés à la notice', () => {
    const noEng = '<svg viewBox="0 0 10 10"><rect width="5" height="5" stroke="#000"/><line x1="0" y1="0" x2="1" y2="1" stroke="#000"/></svg>';
    const a = itemFromFile('plan.dxf', noEng);
    expect(a.job).toBeDefined();
    expect(a.notice).toBe('Traits noirs = coupe (1), traits bleus = gravure (0) ; le reste est ignoré. 1 trait ouvert ignoré (seuls les contours fermés sont coupés ou gravés).');
    expect(itemFromFile('plan', noEng).fileName).toBe('plan');
  });
  it('SVG de gravure seule : accepté', () => {
    const r = itemFromFile('g.svg', '<svg viewBox="0 0 10 10"><rect width="5" height="5" stroke="#00f"/></svg>');
    expect(r.job!.layers.cut).toEqual([]);
    expect(r.notice).toBe('Traits noirs = coupe (0), traits bleus = gravure (1) ; le reste est ignoré.');
  });
  it('SVG sans rien à couper : erreur = dernier avertissement', () => {
    expect(() => itemFromFile('vide.svg', '<svg viewBox="0 0 10 10"></svg>')).toThrow('Aucun contour fermé');
    expect(() => itemFromFile('mauvais.svg', 'pas du svg')).toThrow("Ce fichier n'est pas un SVG.");
  });
  it('G-code par extension ou par contenu ; refus sans commande G / M', () => {
    for (const ext of GCODE_EXT) {
      const r = itemFromFile(`prog.${ext}`, 'G21\nG1 X1 F100');
      expect(r.gcode).toBe('G21\nG1 X1 F100');
      expect(r.job).toBeUndefined();
      expect(r.fileName).toBe('prog');
      expect(r.notice).toContain('G-code importé');
    }
    expect(itemFromFile('x.bin', '  M3 S0').gcode).toBe('  M3 S0');
    expect(itemFromFile('x.bin', '; commentaire\nG0 X1').gcode).toBeDefined();
    expect(() => itemFromFile('x.bin', '$H')).toThrow('ne contient pas de G-code'); // ni G ni M
  });
  it('refus : pas de G-code malgré l\'extension, un .txt contenant un SVG, format inconnu', () => {
    expect(() => itemFromFile('a.gcode', 'bonjour')).toThrow('ne contient pas de G-code');
    expect(() => itemFromFile('a.txt', '<svg viewBox="0 0 1 1"></svg>')).toThrow('ne contient pas de G-code');
    expect(() => itemFromFile('a.dxf', 'bonjour')).toThrow('Format non reconnu');
  });
  it('noms : sans extension, fichier caché, nom vide, plusieurs points', () => {
    expect(itemFromFile('prog', 'G1 X1').fileName).toBe('prog');
    expect(itemFromFile('.gcode', 'G1 X1').fileName).toBe('.gcode');
    expect(itemFromFile('', 'G1 X1').fileName).toBe('fichier');
    expect(itemFromFile('a.b.nc', 'G1 X1').fileName).toBe('a.b');
  });
});

describe('parseGcode', () => {
  const OPT: GcodeImportOptions = { sMax: 1000, capPct: 80 };
  it('aperçu exact d\'un tracé simple', () => {
    const r = parseGcode('G21\nG90\nG0 X10 Y10\nM4 S500\nG1 X20 Y10 F600\nM5', OPT);
    expect(r.warnings).toEqual([]);
    const { stats } = r.job;
    expect(stats.contours).toBe(1);
    expect(stats.lines).toBe(6);
    expect(stats.cutMm).toBe(10);
    expect(stats.rapidMm).toBeCloseTo(Math.hypot(10, 10), 9);
    const naive = (Math.hypot(10, 10) / 36000) * 60 + 1; // longueur / vitesse : le vrai temps y ajoute les accélérations et le ralentissement dans le coin
    expect(stats.seconds).toBeGreaterThan(naive);
    expect(stats.seconds).toBeLessThan(naive + 0.5);
    expect(stats.maxS).toBe(500);
    expect(stats.bounds).toEqual({ minX: 10, minY: 10, maxX: 20, maxY: 10 });
    expect(stats.outOfBounds).toBe(false);
    expect(r.job.segments).toEqual([{ x0: 0, y0: 0, x1: 10, y1: 10, cut: false }, { x0: 10, y0: 10, x1: 20, y1: 10, cut: true }]);
    expect(r.job.lineTimes).toHaveLength(6);
    expect(r.job.header).toEqual(['G-code importé : 6 lignes, X0 Y0 = origine de travail, F600 dernier']);
  });
  it('majuscules, commentaires, S normalisé et plafonné au plafond (pas en dessous)', () => {
    const r = parseGcode('g1 x10 f100 (c) ; fin\nM4 S 1000\nM4 S800\nG1 S 500 X5', OPT);
    expect(r.job.lines).toEqual(['G1 X10 F100', 'M4 S800', 'M4 S800', 'G1 S500 X5', 'M5']);
    expect(r.job.stats.clamped).toBe(true);
    expect(r.warnings).toContain('Valeurs S limitées au plafond de puissance (S800).');
    const none = parseGcode('M4 S800\nM5', OPT);
    expect(none.job.stats.clamped).toBe(false);
    expect(none.warnings.some((w) => w.includes('limitées'))).toBe(false);
  });
  it('commandes $ retirées (singulier / pluriel) même $J=', () => {
    const one = parseGcode('$32=0\nG1 X1 F10\nM5', OPT);
    expect(one.job.lines).toEqual(['G1 X1 F10', 'M5']);
    expect(one.warnings).toContain('1 commande « $… » retirée (les réglages de la machine ne sont pas modifiés par un fichier).');
    const many = parseGcode('$32=0\n$J=G91 X1\n$H\nM5', OPT);
    expect(many.warnings).toContain('3 commandes « $… » retirées (les réglages de la machine ne sont pas modifiés par un fichier).');
  });
  it('lignes de plus de 80 caractères signalées (singulier / pluriel)', () => {
    const long = 'G1 X1 ' + 'Y1 '.repeat(30);
    expect(parseGcode(long + '\nM5', OPT).warnings).toContain('1 ligne de plus de 80 caractères : GRBL les refusera (error:11).');
    expect(parseGcode(long + '\n' + long + '\nM5', OPT).warnings).toContain('2 lignes de plus de 80 caractères : GRBL les refusera (error:11).');
  });
  it('fichier vide : avertissements, rien à ajouter', () => {
    const r = parseGcode('\n  \n; que des commentaires\n(x)', OPT);
    expect(r.job.lines).toEqual([]);
    expect(r.warnings).toEqual(['Le fichier ne contient aucune commande.', 'Aucun trait de coupe trouvé (G1 avec laser allumé).']);
    expect(r.job.stats.bounds).toBeNull();
    expect(r.job.stats.outOfBounds).toBe(false);
  });
  it('M5 ajouté seulement si le programme ne s\'éteint pas lui-même (M5, M2, M30)', () => {
    const add = parseGcode('G1 X1 F10', OPT);
    expect(add.job.lines).toEqual(['G1 X1 F10', 'M5']);
    expect(add.job.lineTimes).toHaveLength(2);
    expect(add.warnings).toContain("« M5 » ajouté à la fin : le programme n'éteignait pas le laser.");
    for (const end of ['M5', 'M2', 'M30']) {
      const r = parseGcode(`G1 X1 F10\n${end}`, OPT);
      expect(r.job.lines[r.job.lines.length - 1]).toBe(end);
      expect(r.job.lines).toHaveLength(2);
    }
  });
  it('pouces : G20 convertit coordonnées et avance, G21 revient', () => {
    const r = parseGcode('G20\nM4 S500\nG1 X1 Y2 F10\nG21\nG1 X2 Y2\nM5', OPT);
    expect(r.job.segments[0]).toMatchObject({ x1: 25.4, y1: 50.8, cut: true });
    expect(r.job.segments[1]).toMatchObject({ x0: 25.4, x1: 2, y1: 2 });
    expect(r.job.header[0]).toContain('F254 dernier');
  });
  it('relatif G91 / absolu G90, un seul axe à la fois', () => {
    const r = parseGcode('G90\nG0 X10 Y10\nG91\nG0 X5\nG0 Y-3\nG90\nG0 X0\nM5', OPT);
    expect(r.job.segments.map((s) => [s.x1, s.y1])).toEqual([[10, 10], [15, 10], [15, 7], [0, 7]]);
  });
  it('seul ce qui coupe compte : G1 laser éteint, G0 laser allumé, S0, F absent', () => {
    const r = parseGcode('G1 X5 F100\nM4 S500\nG0 X10\nG1 X20\nS0\nG1 X30\nM5\nG1 X40', OPT);
    expect(r.job.segments.map((s) => s.cut)).toEqual([false, false, true, false, false]);
    expect(r.job.stats.contours).toBe(1);
    expect(r.job.stats.cutMm).toBe(10);
  });
  it('contours : continuité de la coupe, coupure par M5 puis reprise, ligne sans mouvement qui garde l\'état', () => {
    const r = parseGcode('M4 S100\nG1 X10 F100\nG1 X20\nM3\nG1 X30\nM5\nM4\nG1 X40\nG0 X0\nG1 X5', OPT);
    expect(r.job.stats.contours).toBe(3);
  });
  it('durée : avance à 0 ramenée à 1 mm/min ; G0 au rapide ; G4 ajoute P', () => {
    const slow = parseGcode('M4 S100\nG1 X1\nM5', OPT);
    expect(slow.job.stats.seconds).toBeCloseTo(60, 3); // 1 mm à 1 mm/min (l'accélération y ajoute moins d'un millième de seconde)
    expect(parseGcode('G4 P2\nM5', OPT).job.stats.seconds).toBe(2);
    expect(parseGcode('G4\nM5', OPT).job.stats.seconds).toBe(0);
    expect(parseGcode('G0 X100\nM5', { ...OPT, rapidFeed: 1200 }).job.stats.seconds).toBeCloseTo(5.02, 2); // 100 mm à 20 mm/s : 5 s de palier plus 0,02 s d'accélération et de freinage
  });
  it('G10 / G92 / G53 avec X Y ne déplacent pas la tête', () => {
    const r = parseGcode('G10 L20 P1 X5 Y5\nG92 X0 Y0\nG53 G0 X100\nM5', OPT);
    expect(r.job.segments).toEqual([]);
    expect(r.job.stats.rapidMm).toBe(0);
  });
  it('un déplacement nul ne trace rien', () => {
    expect(parseGcode('G0 X0 Y0\nM5', OPT).job.segments).toEqual([]);
  });
  it('arcs : demi-cercle G3 / G2, cercle complet, petit arc, I ou J seuls, relatif', () => {
    const half = parseGcode('M4 S500\nG0 X0 Y0\nG3 X10 Y0 I5 J0 F600\nM5', OPT).job;
    expect(half.stats.cutMm).toBeCloseTo(5 * Math.PI, 1);
    expect(Math.min(...half.segments.map((s) => s.y1))).toBeCloseTo(-5, 6); // anti-horaire depuis la gauche : passe par le bas
    expect(half.segments[half.segments.length - 1]).toMatchObject({ x1: 10, y1: 0 });
    const cw = parseGcode('M4 S500\nG0 X0 Y0\nG2 X10 Y0 I5 J0 F600\nM5', OPT).job;
    expect(Math.max(...cw.segments.map((s) => s.y1))).toBeCloseTo(5, 6);
    const full = parseGcode('M4 S500\nG0 X10 Y0\nG2 X10 Y0 I-5 J0 F600\nM5', OPT).job;
    expect(full.stats.cutMm).toBeCloseTo(10 * Math.PI, 0);
    expect(parseGcode('M4 S500\nG0 X10 Y0\nG3 X10 Y0 I-5 J0 F600\nM5', OPT).job.stats.cutMm).toBeCloseTo(10 * Math.PI, 0);
    // bruit numérique : arrivée à 1e-12 près du départ = cercle complet, dans le sens demandé
    const noisyCw = parseGcode('M4 S500\nG0 X10 Y0\nG2 X10 Y-0.000000000001 I-5 J0 F600\nM5', OPT).job;
    expect(noisyCw.stats.cutMm).toBeCloseTo(10 * Math.PI, 0);
    expect(noisyCw.segments.find((s) => s.cut)!.y1).toBeLessThan(0); // horaire (y vers le haut) : part vers le bas
    const noisyCcw = parseGcode('M4 S500\nG0 X10 Y0\nG3 X10 Y0.000000000001 I-5 J0 F600\nM5', OPT).job;
    expect(noisyCcw.stats.cutMm).toBeCloseTo(10 * Math.PI, 0);
    expect(noisyCcw.segments.find((s) => s.cut)!.y1).toBeGreaterThan(0);
    const tiny = parseGcode('M4 S500\nG0 X5 Y0\nG3 X5 Y0.2 I-5 J0 F100\nM5', OPT).job;
    expect(tiny.segments.filter((s) => s.cut)).toHaveLength(2);
    // arcs dont l'angle d'arrivée est déjà du bon côté (pas de correction de 2π)
    const q2 = parseGcode('M4 S500\nG0 X5 Y0\nG3 X0 Y5 I-5 J0 F100\nM5', OPT).job;
    expect(q2.stats.cutMm).toBeCloseTo((5 * Math.PI) / 2, 1);
    const q3 = parseGcode('M4 S500\nG0 X0 Y5\nG2 X5 Y0 I0 J-5 F100\nM5', OPT).job;
    expect(q3.stats.cutMm).toBeCloseTo((5 * Math.PI) / 2, 1);
    const jOnly = parseGcode('M4 S500\nG0 X0 Y0\nG3 X0 Y10 J5 F100\nM5', OPT).job;
    expect(Math.max(...jOnly.segments.map((s) => s.x1))).toBeCloseTo(5, 6);
    const rel = parseGcode('G91\nM4 S500\nG0 X10\nG2 X10 I5 F100\nM5', OPT).job;
    expect(rel.segments[rel.segments.length - 1]).toMatchObject({ x1: 20, y1: 0 });
  });
  it('arc en pouces : centre converti', () => {
    const r = parseGcode('G20\nM4 S500\nG0 X0 Y0\nG3 X1 Y0 I0.5 J0 F10\nM5', OPT).job;
    expect(r.segments[r.segments.length - 1]).toMatchObject({ x1: 25.4 });
    expect(r.stats.cutMm).toBeCloseTo((Math.PI * 12.7), 0);
  });
  it('hors zone : chaque bord, et zone personnalisée', () => {
    const run = (code: string, o = OPT) => parseGcode(`M4 S500\n${code}\nM5`, o).job.stats.outOfBounds;
    expect(run('G1 X10 Y10 F100\nG1 X100 Y100')).toBe(false);
    expect(run('G1 X-1 F100')).toBe(true);
    expect(run('G1 Y-1 F100')).toBe(true);
    expect(run('G1 X401 F100')).toBe(true);
    expect(run('G1 Y321 F100')).toBe(true);
    expect(run('G1 X400 Y320 F100')).toBe(false);
    expect(run('G1 X60 F100', { ...OPT, W: 50, H: 50 })).toBe(true);
    expect(run('G1 X40 Y60 F100', { ...OPT, W: 50, H: 50 })).toBe(true);
    expect(run('G1 X40 Y40 F100', { ...OPT, W: 50, H: 50 })).toBe(false);
  });
  it('« Aucun trait de coupe » quand il n\'y a que des déplacements', () => {
    expect(parseGcode('G0 X10\nM5', OPT).warnings).toEqual(['Aucun trait de coupe trouvé (G1 avec laser allumé).']);
  });
});

describe('aperçu du trajet : zoom et déplacement', () => {
  const base = { x: -12, y: -12, w: 424, h: 344 };
  it('le zoom garde sous le curseur le point visé, plafonne à 40 × et revient à la vue d\'ensemble en dézoomant', () => {
    const z = zoomView(base, base, 2, 100, 50);
    expect(z.w).toBeCloseTo(212, 9);
    expect(z.h).toBeCloseTo(172, 9);
    expect((100 - z.x) / z.w).toBeCloseTo((100 - base.x) / base.w, 9); // le point reste à la même place dans la fenêtre
    expect((50 - z.y) / z.h).toBeCloseTo((50 - base.y) / base.h, 9);
    expect(zoomView(base, base, 1e9, 0, 0).w).toBeCloseTo(base.w / ZOOM_MAX, 9);
    expect(zoomView(z, base, 0.1, 100, 50)).toEqual(base); // dézoomer au-delà de l'ensemble : la vue d'ensemble
    expect(zoomView(base, base, 0.5, 10, 10)).toEqual(base);
  });
  it('la fenêtre reste dans la vue d\'ensemble en zoomant près d\'un bord et en se déplaçant', () => {
    const z = zoomView(base, base, 4, 410, 318);
    expect(z.x + z.w).toBeLessThanOrEqual(base.x + base.w + 1e-9);
    expect(z.y + z.h).toBeLessThanOrEqual(base.y + base.h + 1e-9);
    expect(panView(z, base, 1000, 1000)).toMatchObject({ x: base.x + base.w - z.w, y: base.y + base.h - z.h });
    expect(panView(z, base, -1000, -1000)).toMatchObject({ x: base.x, y: base.y });
    expect(panView(z, base, -5, 3)).toMatchObject({ x: z.x - 5, y: z.y + 3, w: z.w, h: z.h });
  });
});
