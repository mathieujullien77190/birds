import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AmbientLight, BufferGeometry, Color, DirectionalLight, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, GridHelper, LineBasicMaterial, LineSegments, MathUtils, Mesh, MeshStandardMaterial, MOUSE, PerspectiveCamera, Raycaster, Path, Scene, Shape, Vector2, WebGLRenderer, Vector3, CanvasTexture, Sprite, SpriteMaterial, Group, SphereGeometry, MeshBasicMaterial, Plane, Quaternion, Line, LineDashedMaterial, LineLoop } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Slider from '@/ui/Slider';
import { Btn, Chip, Hint, Section } from '@/ui/kit';
import { toolUrl } from '@/tools';
import { saveSvg, Sheet2D } from '../birdhouse/Birdhouse';
import { bounds, castellation, nestSheets, sheetSvg, sheetsPreviewSvg, componentOf, corners, moveWithGroup, movingWith, r2, transformPlanks, EDGES, extents, fitHole, holeOutline, makeBox, recastAll, loadHistory, loadScene, newHole, newPlank, outline, plankSvg, saveHistory, saveScene, type Edge, type Hole, type HistoryEntry, type Plank, type PlankScene, type Vec3 } from './model';

/** Dessus (face +z de la plaque) clair, dessous un peu plus foncé, tranche (épaisseur) marron foncé : on voit tout de suite le sens et l'épaisseur. */
const TOP = new Color('#e2c79a'), BOTTOM = new Color('#c9a874'), SIDE = new Color('#6f4a22');
/** Géométrie d'une plaque : son contour extrudé sur l'épaisseur, centré, percé des trous ; couleur par face (dessus, dessous, tranche) ; arêtes tracées depuis le contour. */
function plankGeometry(p: Plank, t: number): { geo: ExtrudeGeometry; edges: BufferGeometry } {
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

interface View { scene: Scene; camera: PerspectiveCamera; renderer: WebGLRenderer; orbit: OrbitControls; meshes: Map<string, Mesh>; labels: Group; handles: Group; targets: Group; holeMark: Group; dragging: boolean }

const HOLE_MARK = new LineDashedMaterial({ color: '#d97706', dashSize: 2.5, gapSize: 1.5, depthTest: false });

const HANDLE_GEO = new SphereGeometry(3.6, 16, 12);
/** Ronds de coin : vert clair sur la face avant (+z de la plaque, ou z max d'une boîte), vert foncé sur la face arrière — sur une plaque fine les deux se chevauchent, on les distingue à la couleur. */
const HANDLE_FRONT = new MeshBasicMaterial({ color: '#4ade80', depthTest: false });
const HANDLE_BACK = new MeshBasicMaterial({ color: '#166534', depthTest: false });
const TARGET_MAT = new MeshBasicMaterial({ color: '#2563eb', depthTest: false, transparent: true, opacity: 0.5 });
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
/**
 * `blocked` (facultatif) : dit si un point est dans une pièce ; la mesure est alors poussée le long de `tick` jusqu'à sortir
 * (une étiquette à moitié dans le bois serait coupée par le test de profondeur).
 */
function dimension(a: Vector3, b: Vector3, tick: Vector3, off: Vector3, text: string, blocked?: (p: Vector3) => boolean): Group {
  const g = new Group();
  const t = tick.clone().multiplyScalar(4);
  const pos = [a, b, a.clone().sub(t), a.clone().add(t), b.clone().sub(t), b.clone().add(t)].flatMap((p) => [p.x, p.y, p.z]);
  g.add(new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pos, 3)), DIM));
  const ext = [a.clone().sub(off), a, b.clone().sub(off), b].flatMap((p) => [p.x, p.y, p.z]);
  g.add(new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(ext, 3)), EXT));
  const sp = measureSprite(text);
  sp.position.copy(a).add(b).multiplyScalar(0.5).add(tick.clone().multiplyScalar(9));
  if (blocked) for (let k = 0; k < 8 && blocked(sp.position); k++) sp.position.add(tick.clone().multiplyScalar(8)); // on la pousse hors du bois
  g.add(sp);
  return g;
}

export default function Planks() {
  const [sc, setSc] = useState<PlankScene>(() => loadScene());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [extra, setExtra] = useState<Set<string>>(new Set()); // sélection multiple (Ctrl + clic) en plus de la plaque principale
  const [hover, setHover] = useState<{ plank?: string; group?: string } | null>(null); // survol dans le volet « Pièces » : surbrillance dans la 3D
  const [cutCfg, setCutCfg] = useState<{ W: number; H: number; gap: number }>(() => { try { const d = JSON.parse(localStorage.getItem('plaques-decoupe') ?? ''); if (d && typeof d.W === 'number') return d; } catch { /* rien */ } return { W: 410, H: 400, gap: 3 }; });
  useEffect(() => { try { localStorage.setItem('plaques-decoupe', JSON.stringify(cutCfg)); } catch { /* rien */ } }, [cutCfg]);
  const [cutView, setCutView] = useState(false); // aperçu des planches à la place de la 3D
  const sheets = useMemo(() => nestSheets(sc, cutCfg.W, cutCfg.H, cutCfg.gap), [sc, cutCfg]);
  const preview = useMemo(() => sheetsPreviewSvg(sheets, cutCfg.W, cutCfg.H), [sheets, cutCfg]);
  const [groupSel, setGroupSel] = useState<string | null>(null); // la sélection est toute une boîte (groupe) : clic dans la 3D ou sur la ligne du groupe
  const groupSelRef = useRef(groupSel);
  groupSelRef.current = groupSel;
  const extraRef = useRef(extra);
  extraRef.current = extra;
  /** Clic sur une plaque : Ctrl = ajoute / retire de la sélection multiple, sinon la choisit seule. */
  const pick = (id: string | null, ctrl: boolean) => {
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
  const [measures, setMeasures] = useState<boolean>(() => { try { return localStorage.getItem('plaques-mesures') !== '0'; } catch { return true; } }); // mesures affichées dans la 3D (par défaut oui)
  useEffect(() => { try { localStorage.setItem('plaques-mesures', measures ? '1' : '0'); } catch { /* rien */ } }, [measures]);
  const [drawer, setDrawer] = useState<'pieces' | 'history' | null>(() => { try { return (localStorage.getItem('plaques-volet') as 'pieces' | 'history' | null) ?? 'pieces'; } catch { return 'pieces'; } }); // volet ouvert à droite
  useEffect(() => { try { localStorage.setItem('plaques-volet', drawer ?? ''); } catch { /* rien */ } }, [drawer]);
  const [ctx, setCtx] = useState<{ x: number; y: number; plankId: string; local: [number, number] } | null>(null); // menu du clic droit
  const [holeEdit, setHoleEdit] = useState<{ plankId: string; holeId: string; fresh?: boolean } | null>(null); // fenêtre de réglage d'un trou ; `fresh` : trou qui vient d'être créé, ses réglages se fondent dans « Trou ajouté »
  const [holeHover, setHoleHover] = useState<{ plankId: string; holeId: string } | null>(null); // trou survolé dans la section « Trous »
  const [cast, setCast] = useState<{ n: number; phase: 0 | 1 }>({ n: 7, phase: 0 }); // réglages du prochain crénelage
  // dimensions des prochains éléments : gardées d'une fois sur l'autre (on crée souvent les mêmes)
  const [dims, setDims] = useState<{ w: number; h: number; l: number; L: number; H: number; elem: 'plate' | 'box' }>(() => {
    try { const d = JSON.parse(localStorage.getItem('plaques-elements') ?? ''); if (d && typeof d.w === 'number') return d; } catch { /* rien */ }
    return { w: 120, h: 80, l: 120, L: 80, H: 60, elem: 'plate' };
  });
  useEffect(() => { try { localStorage.setItem('plaques-elements', JSON.stringify(dims)); } catch { /* rien */ } }, [dims]);
  const box = dims, elem = dims.elem;
  const setBox = (b: { l: number; L: number; H: number }) => setDims((d) => ({ ...d, ...b }));
  const setElem = (elem: 'plate' | 'box') => setDims((d) => ({ ...d, elem }));
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
      if (e.key === 'Escape') { setCtx(null); setHoleEdit(null); setExtra(new Set()); }
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
    sun.position.set(300, 500, 400);
    scene.add(sun);
    scene.add(new GridHelper(1000, 50, '#9ca3af', '#d6d3d1')); // sol : plan XZ, y vers le haut
    const camera = new PerspectiveCamera(40, 1, 1, 6000);
    camera.up.set(0, 1, 0); // l'outil oiseau règle Object3D.DEFAULT_UP sur Z : ici y est la hauteur
    camera.position.set(380, 320, 520);
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.PAN };
    orbit.target.set(0, 40, 0);
    orbit.enableDamping = true;
    const labels = new Group();
    const handles = new Group(); // ronds aux coins de l'élément choisi : on les tire pour déplacer l'élément par ce coin
    const targets = new Group(); // ronds aux coins des autres pièces (demi-transparents), visibles pendant un tel glissé : le coin tiré s'y aimante
    targets.visible = false;
    scene.add(labels, handles, targets);
    const holeMark = new Group(); // le trou en cours de réglage, en pointillés ambre sur les deux faces de la plaque
    scene.add(holeMark);
    const v: View = { scene, camera, renderer, orbit, meshes: new Map(), labels, handles, targets, holeMark, dragging: false };
    // glissé par un coin
    let cornerDrag: { anchorId: string; start: Vector3; plane: Plane; startPos: Vec3; rot: Vec3 } | null = null;
    const rayAt = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    };
    const onCornerDown = (e: PointerEvent) => {
      if (e.button !== 0 || !handles.visible) return;
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
    for (const p of sc.planks) {
      seen.add(p.id);
      let m = v.meshes.get(p.id);
      const key = JSON.stringify([p.w, p.h, p.notches, p.holes, sc.t]); // tout ce qui change la forme : dimensions, crans, trous, épaisseur
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
      mat.transparent = !!p.transparent;
      mat.opacity = p.transparent ? 0.3 : 1;
      mat.depthWrite = !p.transparent;
      mat.needsUpdate = true;
    }
    for (const [id, m] of v.meshes) if (!seen.has(id)) { v.scene.remove(m); m.geometry.dispose(); v.meshes.delete(id); }
    // ronds de coin : sur l'élément choisi (vert, à tirer) et sur toutes les autres pièces (bleu à 50 %, cibles d'aimantation, visibles pendant le glissé)
    for (const g of [v.handles, v.targets]) for (const o of [...g.children]) g.remove(o);
    const comp = selectedId ? componentOf(sc, selectedId) : [];
    v.handles.visible = comp.length > 0;
    if (comp.length) {
      corners(comp, sc.t).forEach((c, k) => { const m = new Mesh(HANDLE_GEO, k % 2 ? HANDLE_FRONT : HANDLE_BACK); m.position.set(...c); m.renderOrder = 30 + (k % 2); v.handles.add(m); }); // l'ordre de `corners` alterne z min / z max
      const mine = new Set(comp.map((p) => p.id)), done = new Set<string>();
      for (const p of sc.planks) {
        if (mine.has(p.id)) continue;
        const key = p.group ?? p.id;
        if (done.has(key)) continue;
        done.add(key);
        for (const c of corners(componentOf(sc, p.id), sc.t)) { const m = new Mesh(HANDLE_GEO, TARGET_MAT); m.position.set(...c); m.renderOrder = 29; v.targets.add(m); }
      }
    }
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
    // cotes : traits le long des côtés de chaque composant de plus haut niveau (plaque seule : largeur et hauteur dans son plan ; groupe : l, L, H de son encombrement)
    for (const o of [...v.labels.children]) { v.labels.remove(o); o.traverse((c) => { const sp = c as Sprite; if (sp.isSprite) { sp.material.map?.dispose(); sp.material.dispose(); } else (c as Mesh).geometry?.dispose(); }); }
    if (measures) {
      const O = 14; // écart entre l'objet et la cote
      const done = new Set<string>();
      // une étiquette ne doit pas tomber dans une pièce : boîtes englobantes de toutes les plaques, élargies de 6 mm
      const boxes = sc.planks.map((p) => bounds([p], sc.t));
      const blocked = (q: Vector3) => boxes.some((b) => q.x > b.min[0] - 6 && q.x < b.max[0] + 6 && q.y > b.min[1] - 6 && q.y < b.max[1] + 6 && q.z > b.min[2] - 6 && q.z < b.max[2] + 6);
      for (const p of sc.planks) {
        if (p.group) {
          if (done.has(p.group)) continue;
          done.add(p.group);
          const members = sc.planks.filter((x) => x.group === p.group);
          const { min, max } = bounds(members, sc.t);
          const [l, L, H] = extents(members, sc.t);
          const X = new Vector3(1, 0, 0), Yv = new Vector3(0, 1, 0), Zv = new Vector3(0, 0, 1);
          v.labels.add(
            dimension(new Vector3(min[0], min[1], max[2] + O), new Vector3(max[0], min[1], max[2] + O), Zv, Zv.clone().multiplyScalar(O), `${l}`, blocked), // largeur, devant, au sol
            dimension(new Vector3(max[0] + O, min[1], min[2]), new Vector3(max[0] + O, min[1], max[2]), X, X.clone().multiplyScalar(O), `${L}`, blocked), // profondeur, à droite, au sol
            dimension(new Vector3(max[0] + O, min[1], max[2] + O), new Vector3(max[0] + O, max[1], max[2] + O), X, new Vector3(O, 0, O), `${H}`, blocked), // hauteur, sur l'arête avant droite
          );
          void Yv;
        } else { // plaque seule : cotes dans son plan, qui tournent avec elle
          const g = new Group();
          g.position.set(...p.pos);
          g.rotation.set(...(p.rot.map(MathUtils.degToRad) as Vec3));
          g.updateMatrixWorld();
          const blockedLocal = (q: Vector3) => blocked(q.clone().applyMatrix4(g.matrixWorld));
          const X = new Vector3(1, 0, 0), Yv = new Vector3(0, 1, 0);
          g.add(
            dimension(new Vector3(-p.w / 2, -p.h / 2 - O, 0), new Vector3(p.w / 2, -p.h / 2 - O, 0), Yv.clone().negate(), Yv.clone().multiplyScalar(-O), `${p.w}`, blockedLocal), // largeur, sous le bord bas
            dimension(new Vector3(p.w / 2 + O, -p.h / 2, 0), new Vector3(p.w / 2 + O, p.h / 2, 0), X, X.clone().multiplyScalar(O), `${p.h}`, blockedLocal), // hauteur, à droite
          );
          v.labels.add(g);
        }
      }
    }
  }, [sc, selectedId, extra, measures, hover, groupSel, holeEdit, holeHover]);

  // ----- actions -----
  const addPlank = () => { const p = newPlank(sc.planks.length + 1, dims.w, dims.h); commit('Plaque ajoutée', (s) => ({ ...s, planks: [...s.planks, p] })); setSelectedId(p.id); };
  const duplicate = (p: Plank) => { const c: Plank = { ...p, id: Math.random().toString(36).slice(2, 9), name: p.name + ' bis', pos: [p.pos[0] + 30, p.pos[1], p.pos[2] + 30], notches: p.notches.map((n) => ({ ...n, id: Math.random().toString(36).slice(2, 9) })), holes: p.holes.map((h) => ({ ...h, id: Math.random().toString(36).slice(2, 9) })) }; commit('Plaque dupliquée', (s) => ({ ...s, planks: [...s.planks, c] })); setSelectedId(c.id); };
  const remove = (id: string) => { commit('Plaque supprimée', (s) => ({ ...s, planks: s.planks.filter((p) => p.id !== id) })); if (selectedId === id) setSelectedId(null); setHoleEdit(null); };
  const addBox = () => { const b = makeBox(box.l, box.L, box.H, sc.t, sc.fit, sc.planks.length + 1); commit('Boîte créée', (s) => ({ ...s, planks: [...s.planks, ...b.planks], groupNames: { ...(s.groupNames ?? {}), [b.group]: b.name } })); setSelectedId(b.planks[0].id); setOpenGroups((g) => new Set([...g, b.group])); };
  /** Boîte choisie : tourner d'un quart de tour autour de son centre, ou déplacer son centre. */
  const groupMembers = (g: string) => sc.planks.filter((p) => p.group === g);
  const rotateGroup = (g: string, axis: 0 | 1 | 2, deg: number) => {
    const ms = groupMembers(g); if (!ms.length) return;
    const { min, max } = bounds(ms, sc.t);
    const pivot: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const ax = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)][axis];
    commit('Quart de tour de la boîte', (s) => { const ids = new Set([...ms.map((x) => x.id), ...movingWith(s, ms[0]).map((x) => x.id)]); return transformPlanks(s, ids, [0, 0, 0], new Quaternion().setFromAxisAngle(ax, MathUtils.degToRad(deg)), pivot); });
  };
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
  const removeGroup = (g: string) => { commit('Groupe supprimé', (s) => ({ ...s, planks: s.planks.filter((p) => p.group !== g) })); if (selected?.group === g) setSelectedId(null); };
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set()); // groupes dépliés dans le volet « Pièces »
  const toggleTransparent = (id: string) => { const pl = scRef.current.planks.find((p) => p.id === id); if (pl) update(id, { transparent: !pl.transparent }, pl.transparent ? 'Plaque opaque' : 'Plaque transparente'); setCtx(null); };
  const addHole = (plankId: string, local: [number, number], openWindow = true) => { const pl = scRef.current.planks.find((p) => p.id === plankId); const h = pl ? fitHole(pl, newHole(local[0], local[1])) : newHole(local[0], local[1]); commit('Trou ajouté', (s) => ({ ...s, planks: s.planks.map((p) => (p.id === plankId ? { ...p, holes: [...p.holes, h] } : p)) })); if (openWindow) setHoleEdit({ plankId, holeId: h.id, fresh: true }); setCtx(null); };
  const setHole = (p: Plank, id: string, patch: Partial<Hole>) => {
    const fresh = !!holeEdit?.fresh && holeEdit.holeId === id; // un trou tout neuf : un seul Retour l'enlève avec ses réglages
    commit(fresh ? 'Trou ajouté' : 'Réglage du trou', (s) => ({ ...s, planks: s.planks.map((x) => (x.id === p.id ? { ...x, holes: x.holes.map((h) => (h.id === id ? fitHole(x, { ...h, ...patch }) : h)) } : x)) }), fresh);
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
    if (on) delete nextCast[edge]; else nextCast[edge] = { n: cast.n, phase: cast.phase };
    const kept = p.notches.filter((n) => n.edge !== edge);
    update(p.id, { cast: nextCast, notches: on ? kept : [...kept, ...castellation(p, edge, cast.n, cast.phase, sc.t, sc.fit)] }, on ? 'Crénelage retiré' : 'Crénelage');
  };
  /** Nouveaux réglages (dents, phase) : appliqués aux bords déjà crénelés. */
  const recast = (p: Plank, n: number, phase: 0 | 1) => {
    setCast({ n, phase });
    const edges = Object.keys(p.cast ?? {}) as Edge[];
    if (!edges.length) return;
    const nextCast = Object.fromEntries(edges.map((e) => [e, { n, phase }])) as Plank['cast'];
    update(p.id, { cast: nextCast, notches: [...p.notches.filter((x) => !edges.includes(x.edge)), ...edges.flatMap((e) => castellation(p, e, n, phase, sc.t, sc.fit))] }, 'Crénelage');
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-stone-100 text-stone-800">
      <aside className="flex h-full w-[22rem] shrink-0 flex-col gap-3 overflow-y-auto border-r border-stone-200 bg-stone-50 p-3">
        <header className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold text-emerald-900">Plaques</h1>
            <p className="text-[11px] text-stone-500">Des plaques de bois à placer et à cranter. Clic sur une plaque : la choisir ; tire un rond de coin : la bouger.</p>
          </div>
          <a href={toolUrl('menu')} className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium whitespace-nowrap hover:bg-stone-100">← Menu</a>
        </header>

        <Section title="Bois" defaultOpen note={`${sc.t} mm`}>
          <Slider label="Épaisseur de toutes les plaques" value={sc.t} min={1} max={30} step={0.5} unit=" mm" onChange={(t) => commit('Épaisseur', (s) => ({ ...s, t, planks: s.planks.map((p) => recastAll(p, t, s.fit)) }))} />
          <Hint>Les crénelages suivent l'épaisseur : leurs crans font toujours exactement l'épaisseur du bois.</Hint>
        </Section>

        <Section title="Éléments" defaultOpen note={`${sc.planks.length} plaque${sc.planks.length > 1 ? 's' : ''}`}>
          <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
            Créer
            <Chip active={elem === 'plate'} onClick={() => setElem('plate')}>Plaque</Chip>
            <Chip active={elem === 'box'} onClick={() => setElem('box')}>Boîte</Chip>
          </div>
          {elem === 'plate' ? (
            <>
              <Slider label="Largeur" value={dims.w} min={10} max={600} step={1} unit=" mm" onChange={(w) => setDims((d) => ({ ...d, w }))} />
              <Slider label="Hauteur" value={dims.h} min={10} max={600} step={1} unit=" mm" onChange={(h) => setDims((d) => ({ ...d, h }))} />
              <Btn variant="primary" onClick={addPlank}>Ajouter une plaque ({dims.w} × {dims.h})</Btn>
              <Hint>Les dimensions restent d'une fois sur l'autre. La liste des plaques est à droite (volet « Pièces »).</Hint>
            </>
          ) : (
            <>
              <Slider label="Longueur (l, de gauche à droite)" value={box.l} min={30} max={600} step={1} unit=" mm" onChange={(l) => setBox({ ...box, l })} />
              <Slider label="Largeur (L, d'avant en arrière)" value={box.L} min={30} max={600} step={1} unit=" mm" onChange={(L) => setBox({ ...box, L })} />
              <Slider label="Hauteur (H)" value={box.H} min={30} max={600} step={1} unit=" mm" onChange={(H) => setBox({ ...box, H })} />
              <Btn variant="primary" onClick={addBox}>Créer la boîte {box.l} × {box.L} × {box.H}</Btn>
              <Hint>Dimensions extérieures. Six plaques liées, posées en place, crénelées sur tous leurs bords pour s'emboîter (dents ≈ 15 mm, nombre impair). Clic droit sur une plaque → Transparent pour voir dedans.</Hint>
            </>
          )}
        </Section>

        {selected && groupSel && (() => {
          const ms = groupMembers(groupSel);
          const name = (sc.groupNames?.[groupSel] ?? 'Boîte').replace(/ \(.*\)$/, ''); // les anciens noms portaient les dimensions entre parenthèses
          return (
            <Section title="Boîte choisie" defaultOpen note={`${name} · ${extents(ms, sc.t).join(' × ')} mm`}>
              <input value={name} onChange={(e) => commit('Nom de la boîte', (s) => ({ ...s, groupNames: { ...(s.groupNames ?? {}), [groupSel]: e.target.value } }))} className="w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-xs" />
              <Hint>{ms.length} plaques, {extents(ms, sc.t).join(' × ')} mm (largeur × profondeur × hauteur). Seules les plaques liées bougent avec. Pour régler une plaque de la boîte : déplie-la dans « Pièces » et clique dessus.</Hint>
              {(['X', 'Y', 'Z'] as const).map((ax, k) => (
                <div key={ax} className="flex items-center gap-1.5 text-[11px] text-stone-600">
                  <span className="w-24">Tourner autour de {ax}</span>
                  <Btn block={false} onClick={() => rotateGroup(groupSel, k as 0 | 1 | 2, -90)}>−90°</Btn>
                  <Btn block={false} onClick={() => rotateGroup(groupSel, k as 0 | 1 | 2, 90)}>+90°</Btn>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-1.5">
                <Btn onClick={() => duplicateGroup(groupSel)}>Dupliquer</Btn>
                <Btn onClick={() => { commit('Boîte déliée', (s) => ({ ...s, planks: s.planks.map((x) => (x.group === groupSel ? { ...x, group: undefined } : x)) })); setGroupSel(null); }}>Délier les plaques</Btn>
                <Btn variant="danger" onClick={() => removeGroup(groupSel)}>Supprimer la boîte</Btn>
              </div>
            </Section>
          );
        })()}

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
              <Slider label="Dents (nombre impair : les deux bouts pareils)" value={cast.n} min={3} max={25} step={2} onChange={(n) => recast(selected, n, cast.phase)} />
              <div className="flex items-center gap-1.5 text-[11px] text-stone-700">
                Première dent
                <Chip active={cast.phase === 0} onClick={() => recast(selected, cast.n, 0)}>creuse</Chip>
                <Chip active={cast.phase === 1} onClick={() => recast(selected, cast.n, 1)}>pleine</Chip>
              </div>
              <Hint>Un bouton par bord : allumé = crénelé. Une dent sur deux est creusée de l'épaisseur du bois ; la plaque d'en face, crénelée pareil avec la première dent inversée, s'emboîte à fleur.</Hint>
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
          <Hint>Un fichier SVG par planche, à l'échelle réelle (1 unité = 1 mm) : noir 0,1 mm = coupe (contours, crans, trous), bleu = nom à graver, cadre gris pointillé = la planche (ne pas couper). Les plaques sont couchées (grand côté horizontal) et rangées des plus hautes aux plus basses.</Hint>
        </Section>
      </aside>

      <main className="relative min-w-0 flex-1" onClick={() => setCtx(null)}>
        <div ref={host} className="h-full w-full" />
        {cutView && <Sheet2D svg={preview} width={cutCfg.W} height={sheets.length * (cutCfg.H + 12)} />}
        <div className="absolute top-3 left-3 flex items-center gap-1 rounded-lg border border-stone-200 bg-white/90 p-1 shadow-sm backdrop-blur">
          <button onClick={back} disabled={!backLabel} title={backLabel ? `Annuler : ${backLabel} (Ctrl+Z)` : 'Rien à annuler'} className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold text-stone-800 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40">
            <span aria-hidden className="text-sm leading-none">↶</span> Retour
            {backLabel && <span className="max-w-40 truncate text-[10px] font-normal text-stone-500">{backLabel}</span>}
          </button>
          <button onClick={() => setMeasures((m) => !m)} aria-pressed={measures} title={measures ? 'Cacher les mesures' : 'Afficher les mesures'} className={`ml-1 rounded px-2 py-1 text-sm leading-none transition-colors ${measures ? 'bg-emerald-100 text-emerald-900' : 'text-stone-400 hover:bg-stone-100'}`}>📏</button>
        </div>
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
            <button onClick={() => toggleTransparent(ctx.plankId)} className="block w-full px-3 py-1.5 text-left hover:bg-emerald-50">{sc.planks.find((p) => p.id === ctx.plankId)?.transparent ? 'Opaque' : 'Transparent'}</button>
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
        <div className="pointer-events-none absolute bottom-3 left-3 text-[11px] text-stone-500">Clic gauche ou molette : tourner la vue · clic droit + glisser : déplacer la vue · clic droit sur une plaque : menu · roulette : zoom · clic sur une plaque : la choisir · tire un rond de coin : la déplacer · Suppr : supprimer</div>
      </main>

      <aside className="flex h-full w-[16rem] shrink-0 flex-col border-l border-stone-200 bg-stone-50">
        <Drawer title="Pièces" note={`${sc.planks.length}`} open={drawer === 'pieces'} onToggle={() => setDrawer(drawer === 'pieces' ? null : 'pieces')}>
          {(() => {
            if (!sc.planks.length) return <Hint>Aucune plaque.</Hint>;
            const widest = Math.max(...sc.planks.map((p) => p.w + 8));
            const scale = Math.min(1.2, 216 / widest);
            const card = (p: Plank) => (
              <div
                key={p.id}
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
                  <button onClick={(e) => { pick(p.id, e.ctrlKey || e.metaKey); if (!(e.ctrlKey || e.metaKey)) setGroupSel(null); }} className="min-w-0 flex-1 truncate text-left font-semibold text-stone-800">{p.name}</button>
                  <span className="text-stone-500">{p.w} × {p.h}</span>
                  <button onClick={() => duplicate(p)} title="Dupliquer" className="rounded px-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700">⧉</button>
                  <button onClick={() => remove(p.id)} title="Supprimer" className="rounded px-1 text-sm text-stone-400 hover:bg-stone-200 hover:text-stone-700">×</button>
                </div>
                <button onClick={(e) => { pick(p.id, e.ctrlKey || e.metaKey); if (!(e.ctrlKey || e.metaKey)) setGroupSel(null); }} className="flex w-full justify-center" dangerouslySetInnerHTML={{ __html: plankSvg(p, scale) }} />
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
                    <button onClick={() => { setSelectedId(members[0].id); setGroupSel(g); setExtra(new Set()); }} className="min-w-0 flex-1 truncate text-left font-semibold text-stone-800" title="Choisir la boîte entière">⛓ {name}</button>
                    <span className="text-stone-500" title={`${members.length} plaques · largeur × profondeur × hauteur`}>{extents(members, sc.t).join(' × ')}</span>
                    <button onClick={() => duplicateGroup(g)} title="Dupliquer la boîte" className="rounded px-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700">⧉</button>
                    <button onClick={() => removeGroup(g)} title="Supprimer tout le groupe" className="rounded px-1 text-sm text-stone-400 hover:bg-stone-200 hover:text-stone-700">×</button>
                  </div>
                  {open && <div className="space-y-2 border-t border-stone-100 p-2 pl-4">{members.map((m) => card(m))}</div>}
                </div>,
              );
            }
            return rows;
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
          <Hint>La plus récente en haut. On annule dans l'ordre : ↶ seulement sur la dernière. Tout est gardé, même après rechargement.</Hint>
          {history.current.length > 0 && <Btn variant="warn" onClick={clearHistory}>Vider l'historique</Btn>}
        </Drawer>
      </aside>
    </div>
  );
}
