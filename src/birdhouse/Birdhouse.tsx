import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { AmbientLight, BoxGeometry, BufferGeometry, Color, DirectionalLight, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, MOUSE, Path, PerspectiveCamera, Plane, PlaneGeometry, Scene, Shape, Vector2, Vector3, WebGLRenderer, type Material } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Slider from '@/ui/Slider';
import { Btn, Chip, Hint, Section } from '@/ui/kit';
import { toolUrl } from '@/tools';
import { allHoles, DEFAULTS, LIFT, PRESETS, RIM_INSET, houseSvg, innerHeights, layout, outer, pieceSvg, pieces, type HouseParams, type Piece } from './model';

export const WOOD = '#d9b98a';
const EDGE = '#7a5524';
export const WOOL = '#e0ad3c'; // ocre : se distingue du contreplaqué, même à l'ombre dans le tunnel du trou
export const METAL = '#b4b8bc';

/** Une pièce en 3D : le contour extrudé sur l'épaisseur (vers +z local), trou et fentes compris. */
export function pieceMesh(piece: Piece, t: number, color = WOOD): Mesh {
  const shape = new Shape(piece.poly.map(([x, y]) => new Vector2(x, y)));
  for (const hole of allHoles(piece)) {
    const h = new Path();
    h.absarc(hole.cx, hole.cy, hole.r, 0, Math.PI * 2, true);
    shape.holes.push(h);
  }
  for (const s of piece.slots) shape.holes.push(new Path(s.map(([x, y]) => new Vector2(x, y))));
  const metal = color === METAL;
  const mesh = new Mesh(new ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 32 }), new MeshStandardMaterial({ color, roughness: metal ? 0.35 : 0.85, metalness: metal ? 0.7 : 0, side: DoubleSide }));
  mesh.add(outline(shape, t, metal ? '#6b7280' : EDGE));
  return mesh;
}

/**
 * Arêtes d'une forme extrudée, tracées depuis le contour lui-même (et non depuis les triangles : `EdgesGeometry` dessine
 * des diagonales parasites sur les grandes faces à trous) : contour et trous à z = 0 et z = t, plus les verticales aux angles.
 */
function outline(shape: Shape, t: number, color: string): LineSegments {
  const pos: number[] = [];
  for (const path of [shape, ...shape.holes]) {
    const pts = path.getPoints(32);
    const curved = pts.length > 12; // un cercle : pas de verticales
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      pos.push(a.x, a.y, 0, b.x, b.y, 0, a.x, a.y, t, b.x, b.y, t);
      if (!curved) pos.push(a.x, a.y, 0, a.x, a.y, t);
    }
  }
  return new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pos, 3)), new LineBasicMaterial({ color }));
}

/** Bloc de laine de bois (ou de tôle) : boîte pleine, centrée ; `hole` = tunnel circulaire à travers l'épaisseur (x, y depuis le centre). */
export function block(w: number, h: number, d: number, color: string, opacity = 1, hole?: { x: number; y: number; r: number }): Mesh {
  // double face : coupé par le plan de coupe, le bloc montre sa tranche au lieu de paraître creux
  const mat = new MeshStandardMaterial({ color, roughness: 1, transparent: opacity < 1, opacity, metalness: color === METAL ? 0.7 : 0, side: DoubleSide });
  if (!hole) return new Mesh(new BoxGeometry(w, h, d), mat);
  const shape = new Shape([new Vector2(-w / 2, -h / 2), new Vector2(w / 2, -h / 2), new Vector2(w / 2, h / 2), new Vector2(-w / 2, h / 2)]);
  const hp = new Path();
  hp.absarc(hole.x, hole.y, hole.r, 0, Math.PI * 2, true);
  shape.holes.push(hp);
  const geo = new ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 32 });
  geo.translate(0, 0, -d / 2);
  return new Mesh(geo, mat);
}

/** Assemble le nichoir : x = largeur, y = hauteur, z = profondeur (l'avant est du côté de +z). Boîte extérieure, boîte intérieure rentrée de `off`, laine entre les deux, caisson de toit, tôle. */
function buildHouse(p: HouseParams): Group {
  const { W, D, HF, roofW, roofL, roofH, Wi, off } = outer(p);
  const { base } = innerHeights(p);
  const g = new Group();
  const by = Object.fromEntries(pieces(p).map(({ piece }) => [piece.name, piece]));
  // plancher : contour dans le plan (largeur, distance depuis l'avant), posé à plat sur LIFT (y local → −z, épaisseur → +y)
  const floor = pieceMesh(by['Plancher'], p.t);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(-W / 2, LIFT, D / 2);
  g.add(floor);
  // côtés : contour dans le plan (profondeur depuis l'avant, hauteur) ; x local → −z, épaisseur → +x. Faces : dans le plan (x, y), épaisseur → +z
  const side = (piece: Piece, x: number, y: number, z: number) => { const m = pieceMesh(piece, p.t); m.rotation.y = Math.PI / 2; m.position.set(x, y, z); g.add(m); };
  const wall = (piece: Piece, x: number, y: number, z: number) => { const m = pieceMesh(piece, p.t); m.position.set(x, y, z); g.add(m); };
  for (const x of [-W / 2, W / 2 - p.t]) side(by['Côté extérieur'], x, 0, D / 2);
  wall(by['Face avant extérieure'], -W / 2, 0, D / 2 - p.t);
  wall(by['Face arrière extérieure'], -W / 2, 0, -D / 2);
  // boîte intérieure : posée sur le plancher, rentrée de off = t + isolant
  for (const x of [-Wi / 2, Wi / 2 - p.t]) side(by['Côté intérieur'], x, base, D / 2 - off);
  wall(by['Face avant intérieure'], -Wi / 2, base, D / 2 - off - p.t);
  wall(by['Face arrière intérieure'], -Wi / 2, base, -D / 2 + off);
  // laine de bois entre les parois (hauteur moyenne, le dessus suit grossièrement la pente)
  const hWool = HF + p.rise / 2 - base - 2;
  const yWool = base + hWool / 2;
  const hy = by['Face avant extérieure'].hole!.cy;
  const front = block(W - 2 * p.t, hWool, p.ins, WOOL, 1, { x: 0, y: hy - yWool, r: p.hole / 2 }); front.position.set(0, yWool, D / 2 - p.t - p.ins / 2); // tunnel du trou d'envol dans la laine
  const back = block(W - 2 * p.t, hWool, p.ins, WOOL); back.position.set(0, yWool, -D / 2 + p.t + p.ins / 2);
  const left = block(p.ins, hWool, D - 2 * off, WOOL); left.position.set(-W / 2 + p.t + p.ins / 2, yWool, 0);
  const right = block(p.ins, hWool, D - 2 * off, WOOL); right.position.set(W / 2 - p.t - p.ins / 2, yWool, 0);
  g.add(front, back, left, right);
  // toit : repère couché sur la pente (x en travers, y le long de la pente depuis l'avant, z vers le haut), origine au coin avant gauche du débord
  const dir = new Vector3(0, p.rise, -D).normalize();
  const nrm = new Vector3(0, D, p.rise).normalize();
  const roof = new Group();
  roof.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(1, 0, 0), dir, nrm));
  roof.position.set(-roofW / 2, HF, D / 2).addScaledVector(dir, -p.overhang);
  g.add(roof);
  roof.add(pieceMesh(by['Toit : plaque basse'], p.t));
  const high = pieceMesh(by['Toit : plaque haute'], p.t);
  high.position.z = p.t + p.ins;
  roof.add(high);
  // bords du caisson : bande (x = longueur, y = hauteur) ; l'épaisseur part vers l'intérieur du caisson
  const rim = (piece: Piece, basis: [Vector3, Vector3, Vector3], x: number, y: number) => {
    const m = pieceMesh(piece, p.t);
    m.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(...basis));
    m.position.set(x, y, p.t);
    roof.add(m);
  };
  const ri = RIM_INSET; // le caisson est rentré de RIM_INSET par rapport au bord des plaques
  rim(by['Toit : bord avant / arrière'], [new Vector3(1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, -1, 0)], ri, ri + p.t); // avant : occupe y ∈ [ri, ri + t]
  rim(by['Toit : bord avant / arrière'], [new Vector3(1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, -1, 0)], ri, roofL - ri); // arrière : y ∈ [roofL − ri − t, roofL − ri]
  rim(by['Toit : bord latéral'], [new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0)], ri, ri + p.t); // gauche : x ∈ [ri, ri + t]
  rim(by['Toit : bord latéral'], [new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0)], roofW - ri - p.t, ri + p.t); // droit : x ∈ [roofW − ri − t, roofW − ri]
  const roofWool = block(roofW - 2 * ri - 2 * p.t, roofL - 2 * ri - 2 * p.t, p.ins, WOOL);
  roofWool.position.set(roofW / 2, roofL / 2, p.t + p.ins / 2);
  roof.add(roofWool);
  // tôle pliée par-dessus : plaque + 4 rabats vers le bas
  if (p.metalFold > 0) {
    const mt = p.metalT, fd = p.metalFold;
    const top = block(roofW + 2 * mt, roofL + 2 * mt, mt, METAL); top.position.set(roofW / 2, roofL / 2, roofH + mt / 2);
    const fr = block(roofW + 2 * mt, mt, fd, METAL); fr.position.set(roofW / 2, -mt / 2, roofH + mt - fd / 2);
    const bk = block(roofW + 2 * mt, mt, fd, METAL); bk.position.set(roofW / 2, roofL + mt / 2, roofH + mt - fd / 2);
    const lf = block(mt, roofL, fd, METAL); lf.position.set(-mt / 2, roofL / 2, roofH + mt - fd / 2);
    const rt = block(mt, roofL, fd, METAL); rt.position.set(roofW + mt / 2, roofL / 2, roofH + mt - fd / 2);
    roof.add(top, fr, bk, lf, rt);
  }
  return g;
}

/** Plan de coupe de la vue 3D : perpendiculaire à un axe, à `offset` mm du centre ; `flip` garde l'autre côté. */
export interface Cut { on: boolean; axis: 'x' | 'y' | 'z'; offset: number; flip: boolean }
const AXIS: Record<Cut['axis'], Vector3> = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };

/** Applique (ou retire) le plan de coupe aux matériaux des pièces : seul le nichoir est coupé, pas le plan lui-même. */
export function applyCut(group: Group, planes: Plane[]): void {
  group.traverse((o) => { const m = (o as Mesh).material as Material | undefined; if (m) { m.clippingPlanes = planes; m.needsUpdate = true; } });
}

/** Vue 3D Three.js : `build` construit la scène (reconstruite quand `key` change), `cut` = plan de coupe autour de `centre`. */
export function useThreeView(host: RefObject<HTMLDivElement | null>, build: () => Group, key: unknown, cut: Cut, centre: Vector3, camPos: Vector3) {
  const state = useRef<{ scene: Scene; group: Group | null; planeMesh: Mesh; planes: Plane[] } | null>(null);
  useEffect(() => {
    const el = host.current!;
    const scene = new Scene();
    scene.background = new Color('#eef2f1');
    scene.add(new AmbientLight('#ffffff', 1.1));
    const sun = new DirectionalLight('#ffffff', 2);
    sun.position.set(300, 500, 400);
    scene.add(sun);
    const camera = new PerspectiveCamera(40, 1, 1, 5000);
    camera.up.set(0, 1, 0); // l'outil oiseau règle Object3D.DEFAULT_UP sur Z : ici y est la hauteur
    camera.position.copy(camPos);
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.localClippingEnabled = true; // plan de coupe par matériau
    el.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement); // clic gauche ou molette : tourner, clic droit : déplacer, roulette : zoom
    controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.PAN };
    controls.target.copy(centre);
    controls.enableDamping = true;
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    const group = build();
    // le plan de coupe, dessiné en bleu transparent
    const planeMesh = new Mesh(new PlaneGeometry(460, 480), new MeshBasicMaterial({ color: '#3b82f6', transparent: true, opacity: 0.14, side: DoubleSide, depthWrite: false }));
    planeMesh.visible = false;
    scene.add(group, planeMesh);
    state.current = { scene, group, planeMesh, planes: [] };
    if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { __scene: scene }); // pour inspecter depuis la console
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); state.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    if (s.group) { s.scene.remove(s.group); s.group.traverse((o) => { (o as Mesh).geometry?.dispose(); }); }
    s.group = build();
    applyCut(s.group, s.planes);
    s.scene.add(s.group);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    const n = AXIS[cut.axis].clone();
    const at = centre.clone().addScaledVector(n, cut.offset);
    if (cut.flip) n.negate();
    s.planes = cut.on ? [new Plane(n.clone().negate(), at.dot(n))] : []; // gardé : n·p <= n·at, c'est-à-dire du côté opposé à n
    if (s.group) applyCut(s.group, s.planes);
    s.planeMesh.visible = cut.on;
    s.planeMesh.position.copy(at);
    s.planeMesh.lookAt(at.clone().add(n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cut]);
}

const PX_PER_MM = 96 / 25.4;

/** Planche de découpe à plat : clic droit (ou gauche, ou milieu) + glisser = déplacer, roulette = zoom. */
export function Sheet2D({ svg, width, height }: { svg: string; width: number; height: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 20, y: 20, k: 1 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const fit = () => {
    const el = box.current;
    if (!el) return;
    const k = Math.min((el.clientWidth - 40) / (width * PX_PER_MM), (el.clientHeight - 40) / (height * PX_PER_MM), 4);
    setView({ x: 20, y: 20, k });
  };
  useEffect(fit, [width, Math.round(height / 20)]); // eslint-disable-line react-hooks/exhaustive-deps
  const onWheel = (e: React.WheelEvent) => {
    const r = box.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setView((v) => { const k = Math.min(20, Math.max(0.05, v.k * f)); return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k }; });
  };
  return (
    <div
      ref={box}
      className="absolute inset-0 cursor-grab overflow-hidden bg-stone-200 select-none active:cursor-grabbing"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; (e.currentTarget as Element).setPointerCapture?.(e.pointerId); }}
      onPointerMove={(e) => { const d = drag.current; if (!d) return; setView((v) => ({ ...v, x: v.x + e.clientX - d.x, y: v.y + e.clientY - d.y })); drag.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onWheel={onWheel}
    >
      <div style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: '0 0' }} className="pointer-events-none inline-block bg-white shadow-md" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="absolute bottom-3 left-3 flex items-center gap-2 text-[11px] text-stone-600">
        <button onClick={fit} className="rounded border border-stone-300 bg-white px-2 py-0.5 hover:bg-stone-100">Recadrer</button>
        Clic droit + glisser : déplacer · roulette : zoom
      </div>
    </div>
  );
}

export const saveSvg = (svg: string, name: string) => {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
};

export default function Birdhouse() {
  const [params, setParams] = useState<HouseParams>(DEFAULTS);
  const [preset, setPreset] = useState<string>(PRESETS[0].id);
  const [view2d, setView2d] = useState(false);
  const [cut, setCut] = useState<Cut>({ on: false, axis: 'x', offset: 0, flip: false });
  const host = useRef<HTMLDivElement>(null);
  useThreeView(host, () => buildHouse(params), params, cut, new Vector3(0, 150, 0), new Vector3(680, 520, 860));
  const set = (patch: Partial<HouseParams>) => setParams((p) => ({ ...p, ...patch }));
  const list = useMemo(() => pieces(params), [params]);
  const { height } = useMemo(() => layout(params), [params]);
  const o = outer(params);
  const current = PRESETS.find((x) => x.id === preset);
  const holeOk = params.hole + 10 <= params.w && LIFT + params.t + params.holeHeight + params.hole / 2 + 5 <= o.HF;
  const svg = useMemo(() => houseSvg(params), [params]);
  const metal = list.find((x) => x.piece.material === 'metal')?.piece;
  const tag = `${params.w}x${params.d}x${params.hf}-isolant${params.ins}-trou${params.hole}`;

  return (
    <div className="flex h-full w-full overflow-hidden bg-stone-100 text-stone-800">
      <aside className="flex h-full w-[22rem] shrink-0 flex-col gap-3 overflow-y-auto border-r border-stone-200 bg-stone-50 p-3">
        <header className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold text-emerald-900">Nichoir à mésanges isolé</h1>
            <p className="text-[11px] text-stone-500">Contreplaqué emboîté, laine de bois entre deux parois, toit en caisson sous une tôle. Dimensions en millimètres.</p>
          </div>
          <a href={toolUrl('menu')} className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium whitespace-nowrap hover:bg-stone-100">← Menu</a>
        </header>

        <Section title="Espèce" defaultOpen>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((x) => (
              <Chip key={x.id} active={preset === x.id} onClick={() => { setPreset(x.id); set(x.params); }}>{x.label}</Chip>
            ))}
          </div>
          {current && <Hint>{current.note} Valeurs usuelles : à vérifier pour ta région.</Hint>}
        </Section>

        <Section title="Isolation (laine de bois)" defaultOpen>
          <Slider label="Épaisseur de laine de bois" value={params.ins} min={10} max={60} step={1} unit=" mm" onChange={(v) => set({ ins: v })} />
          <Hint>Même épaisseur dans les parois (vide entre la boîte intérieure et la boîte extérieure) et dans le caisson du toit. Avec {params.ins} mm, la paroi 3 + {params.ins} + 3 isole comme ~{Math.round((2 * params.t / 0.13 + params.ins / 0.04) * 0.13)} mm de bois massif. La laine ne doit jamais être visible de l'intérieur ni prendre l'eau : le caisson du toit la couvre, et la tôle couvre le caisson.</Hint>
        </Section>

        <Section title="Tôle de toit" defaultOpen>
          <Slider label="Rabat replié sur chaque côté (0 = pas de tôle)" value={params.metalFold} min={0} max={30} step={1} unit=" mm" onChange={(v) => set({ metalFold: v })} />
          <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
            Épaisseur
            {[0.5, 0.65, 0.8].map((t) => <Chip key={t} active={params.metalT === t} onClick={() => set({ metalT: t })}>{t} mm</Chip>)}
          </div>
          {metal && (
            <>
              <Hint>Tôle à plat : {Math.round(metal.w)} × {Math.round(metal.h)} mm, coins échancrés, 4 plis (traits bleus) à {params.metalFold} mm du bord ; les rabats descendent le long des bords du caisson. Zinc, alu ou acier galvanisé 0,5 mm ; se plie à la main sur l'arête d'une planche, au maillet.</Hint>
              <Btn onClick={() => saveSvg(houseSvg(params, 'metal'), `nichoir-tole-${tag}.svg`)}>Télécharger le gabarit de la tôle (SVG)</Btn>
            </>
          )}
        </Section>

        <Section title="Dimensions intérieures" defaultOpen>
          <Slider label="Largeur" value={params.w} min={80} max={160} step={1} unit=" mm" onChange={(v) => set({ w: v })} />
          <Slider label="Profondeur" value={params.d} min={80} max={160} step={1} unit=" mm" onChange={(v) => set({ d: v })} />
          <Slider label="Hauteur à l'avant (depuis le plancher)" value={params.hf} min={120} max={300} step={1} unit=" mm" onChange={(v) => set({ hf: v })} />
          <Slider label="Pente du toit (arrière plus haut de)" value={params.rise} min={0} max={100} step={1} unit=" mm" onChange={(v) => set({ rise: v })} />
        </Section>

        <Section title="Trou d'envol" defaultOpen>
          <Slider label="Diamètre" value={params.hole} min={24} max={36} step={1} unit=" mm" onChange={(v) => set({ hole: v })} />
          <Slider label="Hauteur du centre au-dessus du plancher" value={params.holeHeight} min={60} max={260} step={1} unit=" mm" onChange={(v) => set({ holeHeight: v })} />
          {!holeOk && <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">Le trou touche un bord de la face avant : réduis-le ou baisse-le.</p>}
          <Hint>Le trou traverse les deux faces avant : un tunnel de {params.t * 2 + params.ins} mm, qui protège déjà le nid des becs et des pattes.</Hint>
        </Section>

        <Section title="Contreplaqué et emboîtements">
          <Slider label="Épaisseur du contreplaqué" value={params.t} min={2} max={6} step={0.5} unit=" mm" onChange={(v) => set({ t: v })} />
          <Slider label="Jeu des fentes" value={params.fit} min={0} max={0.5} step={0.05} unit=" mm" onChange={(v) => set({ fit: v })} />
          <Slider label="Débord du toit" value={params.overhang} min={0} max={60} step={1} unit=" mm" onChange={(v) => set({ overhang: v })} />
          <Slider label="Largeur de la planche de découpe" value={params.sheet} min={200} max={1200} step={10} unit=" mm" onChange={(v) => set({ sheet: v })} />
          <Hint>Coins verticaux : doigts. Plancher : tenons à travers les parois extérieures, fentes pour les parois intérieures. Toit : caisson à tenons. Fais un essai sur une chute : le trait du laser enlève ~0,1–0,2 mm, ajuste le jeu pour que ça entre à la main.</Hint>
        </Section>

        <Section title="Vue en coupe" defaultOpen={false} note={cut.on ? 'active' : undefined}>
          <label className="flex items-center gap-2 text-xs text-stone-700">
            <input type="checkbox" checked={cut.on} onChange={(e) => setCut({ ...cut, on: e.target.checked })} className="accent-emerald-700" />
            Couper la vue 3D par un plan
          </label>
          <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
            Perpendiculaire à
            {(['x', 'y', 'z'] as const).map((ax) => (
              <Chip key={ax} active={cut.axis === ax} onClick={() => setCut({ ...cut, axis: ax, on: true })}>{{ x: 'X (largeur)', y: 'Y (hauteur)', z: 'Z (profondeur)' }[ax]}</Chip>
            ))}
          </div>
          <Slider label="Position du plan (depuis le centre)" value={cut.offset} min={-250} max={250} step={1} unit=" mm" onChange={(v) => setCut({ ...cut, offset: v, on: true })} />
          <Btn onClick={() => setCut({ ...cut, flip: !cut.flip, on: true })}>Garder l'autre côté</Btn>
          <Hint>Le plan bleu enlève tout ce qui est d'un côté : on voit les deux parois, la laine de bois, le caisson du toit et les emboîtements. Seule la vue est coupée, pas les pièces.</Hint>
        </Section>

        <Section title="Liste de débit" defaultOpen note={`${list.reduce((n, x) => n + x.qty, 0)} pièces`}>
          <table className="w-full text-[11px]">
            <thead><tr className="text-left text-stone-500"><th>Pièce</th><th>Qté</th><th className="text-right">Encombrement</th></tr></thead>
            <tbody>
              {list.map(({ piece, qty }) => (
                <tr key={piece.name} className="border-t border-stone-100"><td>{piece.name}</td><td>{qty}</td><td className="text-right">{Math.round(piece.w)} × {Math.round(piece.h)}</td></tr>
              ))}
            </tbody>
          </table>
          <Hint>Hors tout : {Math.round(o.W)} × {Math.round(o.D)} mm au sol (intérieur utile {params.w} × {params.d}), {Math.round(o.HF)} mm devant, {Math.round(o.HB)} mm derrière ; toit de {Math.round(o.roofW)} × {Math.round(o.roofL)} mm et {Math.round(o.roofH)} mm d'épais, pente {(o.slope * 180 / Math.PI).toFixed(1)}°. Laine de bois à découper : 4 bandes de {params.ins} mm pour les parois (~{Math.round((o.W - 2 * params.t) * 2 + (o.D - 2 * o.off) * 2)} mm de long sur ~{Math.round(o.HF - LIFT - params.t)} de haut) et une plaque de {Math.round(o.roofW - 2 * params.t)} × {Math.round(o.roofL - 2 * params.t)} pour le toit.</Hint>
          <Btn variant="primary" onClick={() => saveSvg(svg, `nichoir-mesange-${tag}-${params.t}mm.svg`)}>Télécharger la planche de contreplaqué (SVG, {params.sheet} × {Math.round(height)} mm)</Btn>
          <Hint>SVG à l'échelle réelle : noir = coupe (contours, trou, fentes), bleu = nom de la pièce. Au montage, perce de petits trous de drainage dans le plancher.</Hint>
        </Section>
      </aside>
      <main className="relative min-w-0 flex-1">
        <div ref={host} className="h-full w-full" />
        {view2d && <Sheet2D svg={svg} width={params.sheet} height={height} />}
        <div className="absolute top-3 right-3 flex items-center gap-1 rounded-lg border border-stone-200 bg-white/90 p-1 shadow-sm backdrop-blur">
          <span className="px-1.5 text-[10px] font-semibold tracking-wide text-stone-500 uppercase">Vue</span>
          <Chip active={!view2d} onClick={() => setView2d(false)}>3D</Chip>
          <Chip active={view2d} onClick={() => setView2d(true)}>Planche à plat (2D)</Chip>
        </div>
        {!view2d && <div className="pointer-events-none absolute bottom-3 left-3 text-[11px] text-stone-500">Clic gauche ou clic molette : tourner · clic droit + glisser : déplacer · roulette : zoom</div>}
      </main>

      {/* à droite : chaque pièce à plat, seule, à la même échelle */}
      <aside className="flex h-full w-[19rem] shrink-0 flex-col gap-2 overflow-y-auto border-l border-stone-200 bg-stone-50 p-3">
        <header>
          <h2 className="text-sm font-semibold text-emerald-900">Pièces à découper</h2>
          <p className="text-[11px] text-stone-500">{list.reduce((n, x) => n + x.qty, 0)} pièces : contreplaqué {params.t} mm{metal ? ` et tôle ${params.metalT} mm` : ''}. Noir = coupe, brun = fentes, bleu pointillé = plis. Même échelle pour toutes.</p>
        </header>
        {(() => {
          const widest = Math.max(...list.map((x) => x.piece.w + 8));
          const scale = Math.min(1.2, 264 / widest); // px par mm : la plus large remplit le panneau
          return list.map(({ piece, qty }) => (
            <div key={piece.name} className="rounded-lg border border-stone-200 bg-white p-2">
              <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
                <span className="font-semibold text-stone-800">{piece.name}{qty > 1 ? ` × ${qty}` : ''}</span>
                <span className="text-stone-500">{Math.round(piece.w)} × {Math.round(piece.h)} mm</span>
              </div>
              <div className="flex justify-center" dangerouslySetInnerHTML={{ __html: pieceSvg(piece, scale) }} />
            </div>
          ));
        })()}
      </aside>
    </div>
  );
}
