import { Fragment, useEffect, useRef, useState } from 'react';
import { toolUrl } from './tools';
import { LIGHTING_LABELS, StlViewer, type CutPlane, type EditTool, type LightingPreset, type ModelState, type TraceAxis, type Vec3 } from './engine/viewer';
import Slider from './ui/Slider';
import { Btn, Chip, Hint, Notice, Section, Tabs } from './ui/kit';
import { loftFromPlanes } from './engine/loft';
import { A4, buildSlices, SLICE_COLORS, slicesGeometry, slicesHtml, type SliceOptions, type SlicePlane, type SlicesResult } from './engine/slices';
import { unfold } from './engine/unfold';
import { layoutPattern, PIECE_COLORS, printHtml, type FoldStyle, type Pattern } from './engine/pattern';
import { deleteEdit, deleteSession, dropSnapshot, ensureSession, getEdit, getFile, getLegacyEdit, getLegacyTraces, getSnapshot, getTraces, hasSnapshot, loadModelPrefs, loadSessions, loadSettings, putEdit, putFile, putSnapshot, putTraces, saveModelPrefs, saveSettings, type SessionInfo } from './store/persist';

/** Au-delà, l'édition à la main (fil de fer, survol, copies d'historique) devient lente : on prévient. */
const EDIT_SLOW_TRIS = 100000;
/** Au-delà, un patron papier est déraisonnable à découper et à coller (et le dépliage devient lent). */
const PAPER_MAX_TRIS = 800;

let counter = 0;
const newId = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`;
const GAP = 0.3;
const TOOLS: { id: EditTool; label: string; help: string }[] = [
  { id: 'vertex', label: 'Sommet', help: 'Clic sur un sommet : il disparaît et les triangles autour sont refondus (n triangles → n − 2).' },
  { id: 'edge', label: 'Arête', help: 'Clic sur une arête : ses deux bouts fusionnent au milieu, les deux triangles qui la bordent disparaissent.' },
  { id: 'tri', label: 'Triangle', help: 'Clic sur un triangle : il est supprimé, ce qui laisse un trou.' },
  { id: 'select', label: 'Sélection', help: 'Clique plusieurs points autour de la zone : un polygone en pointillés se dessine. Double-clic, Entrée ou clic sur le premier point pour fermer ; Échap abandonne ; Maj en fermant ajoute à la sélection. Les triangles visibles dedans passent en orange.' },
  { id: 'plane', label: 'Plan', help: 'Un plan transparent coupe le modèle en deux : vert = gardé, rouge = supprimé (un triangle à cheval suit son centre). Place-le, oriente-le, incline-le, puis supprime, symétrise ou trace la coupe en rouge (les traits gardés restent quand le plan bouge).' },
];

type TabId = 'modele' | 'edition' | 'coupes' | 'papier';
const AXIS_LABEL = { X: 'X (droite)', Y: 'Y (profondeur)', Z: 'Z (hauteur)' } as const;
const AXIS_COLOR = { X: '#c73c39', Y: '#2f8f58', Z: '#2f66c4' } as const;

interface BackEntry { label: string; undo: () => boolean; id?: string; keys?: string; at?: number }

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<StlViewer | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [models, setModels] = useState<ModelState[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [tab, setTab] = useState<TabId>('modele');
  // mode édition (sommet / arête / triangle) du modèle sélectionné
  const [editId, setEditId] = useState<string | null>(null);
  const [editTool, setEditTool] = useState<EditTool>('vertex');
  const [canUndo, setCanUndo] = useState(false);
  const [selCount, setSelCount] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [selThrough, setSelThrough] = useState(true); // par défaut on prend tout, devant comme derrière
  const [plane, setPlane] = useState<CutPlane>({ offset: 0, angle: 90, tilt: 0, diag1: 0, diag2: 0, horiz: 0, keep: 'right' });
  const [traceOn, setTraceOn] = useState(false); // trait de coupe affiché
  // axes généraux et plans ⟂ à chacun (cases à cocher)
  const [axisOn, setAxisOn] = useState<Record<'X' | 'Y' | 'Z', boolean>>({ X: true, Y: true, Z: true });
  const [worldPlaneOn, setWorldPlaneOn] = useState<Record<'X' | 'Y' | 'Z', boolean>>({ X: false, Y: false, Z: false });
  const [traceCounts, setTraceCounts] = useState<Record<string, number>>({}); // traits gardés par modèle
  const [genAxis, setGenAxis] = useState<TraceAxis>('Z');
  const [genStep, setGenStep] = useState(10);
  // échelle réelle et découpe laser (tranches, gaufre, papier)
  const [paperHeight, setPaperHeight] = useState(10); // hauteur réelle du modèle, cm
  const [thickness, setThickness] = useState(1); // épaisseur du matériau, mm
  const [hollow, setHollow] = useState(true);
  const [wall, setWall] = useState(10); // largeur de paroi des tranches creuses, mm
  // gaufre : deux familles de plans parallèles avec encoches
  const [waffleA, setWaffleA] = useState<'X' | 'Y' | 'Z'>('X');
  const [waffleB, setWaffleB] = useState<'X' | 'Y' | 'Z'>('Y');
  const [waffleStep, setWaffleStep] = useState(20); // mm entre deux plans
  const [wireCount, setWireCount] = useState(0); // fils de fer annulables sur le modèle sélectionné
  // fil de fer et reconstruction : réglages à eux, indépendants de la gaufre
  const [wireAxes, setWireAxes] = useState<Record<'X' | 'Y' | 'Z', boolean>>({ X: true, Y: true, Z: true });
  const [wireCuts, setWireCuts] = useState(12); // coupes par axe
  const [loftAxis, setLoftAxis] = useState<'X' | 'Y' | 'Z'>('X'); // direction de la reconstruction
  const [loftId, setLoftId] = useState<string | null>(null); // modèle dont l'aperçu affiché est un loft exportable
  const [loftCuts, setLoftCuts] = useState(24); // coupes utilisées pour la reconstruction
  const [loftMsg, setLoftMsg] = useState<{ ok: boolean; text: string } | null>(null); // résultat affiché sous le bouton, sans disparaître
  const [hideModel, setHideModel] = useState(false); // fil de fer seul : la surface est cachée
  const [preview, setPreview] = useState<{ id: string; triangles: number } | null>(null);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const [slicesRes, setSlicesRes] = useState<{ id: string; key: string; res: SlicesResult; name: string; opts: SliceOptions } | null>(null);
  // patron papier en polygones
  const [tabMm, setTabMm] = useState(7); // largeur des languettes de collage
  const [pieceMax, setPieceMax] = useState(60); // triangles au plus par pièce
  const [foldStyle, setFoldStyle] = useState<FoldStyle>('perf');
  const [paperTint, setPaperTint] = useState(true); // teinte des pièces dans la page d'aperçu (jamais dans le SVG du laser)
  const [paperRes, setPaperRes] = useState<{ id: string; key: string; pattern: Pattern; name: string } | null>(null);
  const [paperMsg, setPaperMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [lighting, setLighting] = useState<LightingPreset>(() => { try { const s = localStorage.getItem('visionneuse-stl-eclairage') as LightingPreset | null; return s && s in LIGHTING_LABELS ? s : 'studio'; } catch { return 'studio'; } });
  // sessions : une par fichier, nom généré (fichier1, fichier2…), jamais supprimée ; l'annulation est réversible (« reprendre »)
  const [sessions, setSessions] = useState<SessionInfo[]>(() => loadSessions());
  const [snapNames, setSnapNames] = useState<string[]>(() => loadSessions().filter((s) => hasSnapshot(s.name)).map((s) => s.name));
  const [status, setStatus] = useState('');
  const modelsRef = useRef(models);
  modelsRef.current = models;

  // Retour : une pile d'actions annulables (retouches, réglages du modèle, traits, aperçus), la plus récente en haut
  const backStack = useRef<BackEntry[]>([]);
  const [backLabel, setBackLabel] = useState<string | null>(null);
  const pushBack = (e: BackEntry) => { const s = backStack.current; s.push(e); if (s.length > 200) s.shift(); setBackLabel(e.label); };
  const histLen = useRef(0); // longueur de l'historique du viewer : une retouche l'allonge, une annulation le raccourcit
  const histGrew = useRef(false);
  const lastLabel = useRef('Retouche du maillage');
  const tracesRef = useRef(new Map<string, Float32Array[]>()); // traits connus de chaque modèle, pour pouvoir les remettre

  const say = (msg: string) => { setStatus(msg); window.setTimeout(() => setStatus(''), 5000); };

  /** Vrai une fois les modèles de la dernière session relus : avant, on ne sauvegarde pas (on écraserait la sauvegarde avec une liste vide). */
  const ready = useRef(false);
  useEffect(() => {
    const v = new StlViewer(host.current!, {
      onPick: setSelectedId,
      onEdit: (id, triangles, positions) => {
        setModels((ms) => ms.map((o) => (o.id === id ? { ...o, triangles } : o)));
        setCanUndo(v.canUndo);
        setSlicesRes(null); // les tranches et le patron ne correspondent plus au maillage
        setPaperRes(null);
        if (histGrew.current) pushBack({ label: lastLabel.current, undo: () => { if (v.editing && v.canUndo) { v.undoEdit(); return true; } return false; } });
        const cur = modelsRef.current.find((o) => o.id === id);
        if (cur) putEdit(cur.name, { target: cur.target, positions: positions.slice() }).catch(() => say('Retouche non mémorisée.'));
      },
      onSelect: setSelCount,
      onHistory: (labels) => {
        setHistory(labels); setCanUndo(labels.length > 0);
        histGrew.current = labels.length >= histLen.current;
        histLen.current = labels.length;
        if (labels.length) lastLabel.current = labels[labels.length - 1];
      },
      onTraces: (id, traces) => {
        setTraceCounts((c) => ({ ...c, [id]: traces.length }));
        const prev = tracesRef.current.get(id);
        tracesRef.current.set(id, traces);
        if (prev) {
          pushBack({
            label: traces.length >= prev.length ? 'Trait ajouté' : 'Trait retiré',
            undo: () => {
              v.setTraces(id, prev);
              tracesRef.current.set(id, prev);
              setTraceCounts((c) => ({ ...c, [id]: prev.length }));
              setWireCount(v.wireCount(id));
              const m = modelsRef.current.find((o) => o.id === id);
              if (m) putTraces(m.name, prev).catch(() => say('Traits non mémorisés.'));
              return true;
            },
          });
        }
        const cur = modelsRef.current.find((o) => o.id === id);
        if (cur) putTraces(cur.name, traces).catch(() => say('Traits non mémorisés.'));
      },
      onMessage: say,
    });
    viewer.current = v;
    if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { __viewer: v }); // pour inspecter depuis la console
    let cancelled = false;
    // modèles de la dernière session : réglages dans localStorage, fichiers dans IndexedDB
    (async () => {
      const saved = loadSettings();
      const restored: ModelState[] = [];
      for (const m of saved?.models ?? []) {
        try {
          let buf = await getFile(m.name); // les fichiers sont gardés par nom ; l'ancien format les gardait par identifiant de session
          if (!buf) { buf = await getFile(m.id); if (buf) void putFile(m.name, buf); }
          if (!buf || cancelled) continue;
          setSessions(ensureSession(m.name));
          const fresh = v.load(m.id, m.name, buf, m.pos[0]);
          const merged: ModelState = { ...fresh, ...m, rot: m.rot ?? [0, 0, 0], original: fresh.original, width: fresh.width };
          merged.triangles = await restoreWork(v, merged); // retouches, réduction et traits de ce nom de fichier
          restored.push(merged);
        } catch { /* fichier manquant ou illisible : le modèle est oublié */ }
      }
      if (cancelled) return;
      ready.current = true;
      if (!restored.length) return;
      setModels(restored);
      setSelectedId(saved?.selectedId && restored.some((r) => r.id === saved.selectedId) ? saved.selectedId : null);
      window.setTimeout(() => v.frame(), 50);
      say(`${restored.length} modèle${restored.length > 1 ? 's' : ''} de la dernière session rechargé${restored.length > 1 ? 's' : ''}.`);
    })();
    return () => { cancelled = true; v.dispose(); viewer.current = null; };
  }, []);
  useEffect(() => { if (ready.current) { saveSettings(models, selectedId); saveModelPrefs(models); } }, [models, selectedId]); // tout est gardé automatiquement, par nom de fichier
  useEffect(() => { viewer.current?.sync(models, selectedId); }, [models, selectedId]);

  // mode édition : suit la sélection, s'arrête si le modèle disparaît
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    const m = models.find((o) => o.id === editId);
    if (!m || m.id !== selectedId) {
      if (editId) setEditId(null);
      v.setEdit(null);
      setCanUndo(false);
      return;
    }
    if (v.editing !== m.id) { v.setEdit(m.id, m.target); setCanUndo(false); }
  }, [editId, selectedId, models]);
  useEffect(() => { viewer.current?.setLighting(lighting); try { localStorage.setItem('visionneuse-stl-eclairage', lighting); } catch { /* pas grave */ } }, [lighting]);
  useEffect(() => { viewer.current?.setEditTool(editTool); }, [editTool]);
  useEffect(() => { viewer.current?.setSelectThrough(selThrough); }, [selThrough]);
  useEffect(() => { viewer.current?.setPlane(plane); }, [plane]);
  useEffect(() => { for (const m of modelsRef.current) viewer.current?.setModelHidden(m.id, hideModel && m.id === selectedId); }, [hideModel, selectedId]);
  useEffect(() => { for (const a of ['X', 'Y', 'Z'] as const) viewer.current?.setAxisVisible(a, axisOn[a]); }, [axisOn]);
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    for (const a of ['X', 'Y', 'Z'] as const) v.setWorldPlane(a, worldPlaneOn[a]);
    v.sync(modelsRef.current, selectedId); // place les plans sur le modèle et trace la coupe
  }, [worldPlaneOn, selectedId]);
  useEffect(() => { viewer.current?.traceSection(traceOn); }, [traceOn]);
  useEffect(() => { if (editTool !== 'plane') setTraceOn(false); }, [editTool]);
  // Ctrl+Z annule la dernière retouche ; Suppr efface la sélection au cadre ; Échap quitte le mode édition et ferme un aperçu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = viewer.current;
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && (e.target as HTMLInputElement).type === 'text';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); backRef.current(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && v?.editing && v.pendingDelete) { e.preventDefault(); v.deleteSelection(); }
      if (e.key === 'Escape') {
        setEditId(null);
        // un aperçu (tranches, reconstruction) est affiché : on revient au modèle
        const p = previewRef.current;
        if (p && v) { v.clearPreview(p.id); setPreview(null); setSlicesRes(null); setLoftId(null); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Oublie les retouches à la main : on revient au maillage réduit. */
  const resetEdit = (m: ModelState) => {
    const v = viewer.current;
    if (!v) return;
    v.setEdit(null);
    v.setOverride(m.id, m.target, null);
    void deleteEdit(m.name);
    const n = v.rebuild(m.id, m.target);
    setModels((ms) => ms.map((o) => (o.id === m.id ? { ...o, triangles: n } : o)));
    setCanUndo(false);
    setSlicesRes(null);
    setPaperRes(null);
    if (editId === m.id) v.setEdit(m.id, m.target);
  };

  // réduction : recalculée un court instant après le dernier changement, pour chaque modèle dont la cible a changé
  const geoKey = (m: ModelState) => String(m.target);
  const applied = useRef(new Map<string, string>());
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    const stale = models.filter((m) => applied.current.get(m.id) !== geoKey(m));
    if (!stale.length) return;
    const t = window.setTimeout(() => {
      for (const m of stale) {
        const n = v.rebuild(m.id, m.target);
        const ov = v.overrideState(m.id); // retouché puis réduit : on enregistre le maillage réduit
        if (ov) putEdit(m.name, { target: ov.target, positions: ov.positions.slice() }).catch(() => say('Retouche non mémorisée.'));
        applied.current.set(m.id, geoKey(m));
        setModels((ms) => ms.map((o) => (o.id === m.id ? { ...o, triangles: n } : o)));
        setPaperRes(null); // le patron ne correspond plus au maillage
      }
    }, 150);
    return () => window.clearTimeout(t);
  }, [models]);

  /** Tranches à partir d'une liste de plans : contours à l'échelle réelle, creusés si demandé, encoches si demandé, aperçu 3D et planches SVG. */
  const sliceWith = (m: ModelState, planes: SlicePlane[], notches: boolean) => {
    const v = viewer.current;
    const geo = v?.sourceGeometryOf(m.id);
    if (!v || !geo) return;
    try {
      const t0 = performance.now();
      const size = v.rotatedSizeOf(m.id); // hauteur réelle = hauteur à l'écran, rotation comprise
      const opts: SliceOptions = { mmPerUnit: (paperHeight * 10) / Math.max(size.z, 1e-6), thickness, wall: hollow ? wall : 0, notches, page: A4 };
      const pos = geo.attributes.position.array;
      const res = buildSlices(pos, planes, opts);
      const g = slicesGeometry(pos, planes, opts);
      setLoftId(null);
      setHideModel(false);
      v.setModelHidden(m.id, false);
      v.showPreview(m.id, g.geo, g.sliceOfTri, SLICE_COLORS);
      setPreview({ id: m.id, triangles: g.geo.attributes.position.count / 3 });
      setSlicesRes({ id: m.id, key: geoKey(m), res, name: m.name, opts });
      if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { __slices: { res, opts, html: slicesHtml(res, A4, m.name, opts) } }); // pour inspecter depuis la console
      say(`${res.slices.length} tranche${res.slices.length > 1 ? 's' : ''}, ${res.pages.length} planche${res.pages.length > 1 ? 's' : ''}${notches ? `, ${res.joints} encoches` : ''} (${Math.round(performance.now() - t0)} ms).`);
    } catch (e) {
      say(`Tranches impossibles : ${e instanceof Error ? e.message : e}`);
    }
  };
  /** Une tranche par trait gardé (pas d'encoches : elles peuvent se croiser). */
  const makeSlices = (m: ModelState) => {
    const planes = viewer.current?.tracePlanes(m.id) ?? [];
    if (!planes.length) { say('Aucun trait gardé sur ce modèle : trace-les d\'abord (outil Plan → Tracer la coupe → Garder, ou Générer les traits).'); return; }
    sliceWith(m, planes, false);
  };
  /** Gaufre : deux familles de plans parallèles (directions A et B), un plan tous les `waffleStep` mm, encoches à chaque croisement. */
  const makeWaffle = (m: ModelState) => {
    const v = viewer.current;
    const geo = v?.sourceGeometryOf(m.id);
    if (!v || !geo) return;
    if (waffleA === waffleB) { say('Choisis deux directions différentes.'); return; }
    const size = v.rotatedSizeOf(m.id);
    const mmPerUnit = (paperHeight * 10) / Math.max(size.z, 1e-6);
    // les directions sont celles de l'écran : la rotation du modèle est prise en compte
    const planes = v.waffleLocalPlanes(m.id, [waffleA, waffleB], waffleStep / mmPerUnit);
    if (planes.length > 400) { say(`${planes.length} plans : pas trop petit, augmente-le.`); return; }
    sliceWith(m, planes, true);
  };
  /**
   * Fil de fer : les contours exacts de `wireCuts` coupes par axe choisi, réparties sur toute la longueur du modèle dans chaque direction,
   * tracés en 3D (gardés comme un trait). Réglages propres au fil de fer : indépendants de la gaufre.
   */
  const makeWire = (m: ModelState) => {
    const v = viewer.current;
    if (!v) return;
    const axes = (['X', 'Y', 'Z'] as const).filter((a) => wireAxes[a]);
    if (!axes.length) { say('Coche au moins un axe pour le fil de fer.'); return; }
    const size = v.rotatedSizeOf(m.id);
    const planes = axes.flatMap((a) => v.waffleLocalPlanes(m.id, [a], (a === 'X' ? size.x : a === 'Y' ? size.y : size.z) / wireCuts));
    const n = v.wireFromPlanes(m.id, planes);
    setWireCount(v.wireCount(m.id));
    say(n ? `Fil de fer tracé : ${planes.length} coupes sur ${axes.join(', ')}, ${n.toLocaleString('fr-FR')} segments.` : 'Aucune coupe ne traverse le modèle.');
  };
  /** Annule le dernier fil de fer et réaffiche le modèle. */
  const undoWire = (m: ModelState) => {
    const v = viewer.current;
    if (!v) return;
    v.undoWire(m.id);
    const left = v.wireCount(m.id);
    setWireCount(left);
    if (!left) setHideModel(false);
    say(left ? 'Dernier fil de fer annulé.' : 'Fil de fer annulé : modèle réaffiché.');
  };
  /** Modèle 3D reconstruit depuis le fil de fer : loft des coupes de la première direction. */
  const makeLoft = (m: ModelState) => {
    const v = viewer.current;
    if (!v) return;
    setLoftMsg(null);
    try {
      const geo = v.sourceGeometryOf(m.id);
      if (!geo) throw new Error('modèle introuvable');
      if (!geo.attributes.position.count) throw new Error('le modèle est vide (tous les triangles supprimés ?)');
      // coupes réparties sur toute la longueur du modèle dans la direction A, indépendamment du pas de la gaufre
      const size = v.rotatedSizeOf(m.id);
      const extent = loftAxis === 'X' ? size.x : loftAxis === 'Y' ? size.y : size.z;
      const planes = v.waffleLocalPlanes(m.id, [loftAxis], extent / loftCuts);
      const r = loftFromPlanes(geo.attributes.position.array, planes, 64);
      if (!r) throw new Error(`seulement ${planes.length} coupe(s) traverse(nt) le modèle dans la direction ${loftAxis} : choisis une autre direction ou augmente le nombre de coupes`);
      const tris = r.geo.attributes.position.count / 3;
      if (!Number.isFinite(r.geo.attributes.position.array[0])) throw new Error('le résultat est invalide (coupes dégénérées) : essaie une autre direction A');
      setHideModel(false); // l'aperçu partage le matériau du modèle : s'il est caché, on ne verrait rien
      v.setModelHidden(m.id, false);
      v.showPreview(m.id, r.geo, null, []);
      setPreview({ id: m.id, triangles: tris });
      setLoftId(m.id);
      setSlicesRes(null);
      setLoftMsg({ ok: true, text: `Modèle reconstruit : ${r.rings} coupes reliées${r.dropped ? ` (${r.dropped} sans contour)` : ''}, ${tris.toLocaleString('fr-FR')} triangles. Exporte-le avec le bouton ci-dessous.` });
    } catch (e) {
      setLoftMsg({ ok: false, text: `Reconstruction impossible : ${e instanceof Error ? e.message : String(e)}` });
    }
  };
  const leavePreview = (m: ModelState) => { viewer.current?.clearPreview(m.id); setPreview(null); setSlicesRes(null); setLoftId(null); };
  const openSlices = () => {
    if (!slicesRes) return;
    const html = slicesHtml(slicesRes.res, A4, slicesRes.name, slicesRes.opts);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank');
  };
  const slicesValid = slicesRes && selectedId === slicesRes.id && models.some((m) => m.id === slicesRes.id && geoKey(m) === slicesRes.key);

  /** Patron papier en polygones : déplie le modèle de travail (réduit, retouché) en pièces à plat, colorées aussi sur le modèle 3D. */
  const makePaper = (m: ModelState) => {
    const v = viewer.current;
    if (!v) return;
    setPaperMsg(null);
    try {
      v.clearPreview(m.id); // on travaille sur le vrai maillage, pas sur un aperçu
      setPreview(null); setSlicesRes(null); setLoftId(null);
      const geo = v.sourceGeometryOf(m.id);
      if (!geo || !geo.attributes.position.count) throw new Error('le modèle est vide');
      const tris = geo.attributes.position.count / 3;
      if (tris > PAPER_MAX_TRIS) throw new Error(`${Math.round(tris).toLocaleString('fr-FR')} triangles : c'est trop pour du papier. Réduis le modèle à ${PAPER_MAX_TRIS} triangles ou moins (idéalement 150 à 300).`);
      const t0 = performance.now();
      const size = v.rotatedSizeOf(m.id);
      const mmPerUnit = (paperHeight * 10) / Math.max(size.z, 1e-6);
      // une pièce doit tenir dans la page, languettes et marge comprises
      const room = (mm: number) => (mm - A4.margin * 2 - tabMm * 2 - 6) / mmPerUnit;
      const u = unfold(geo, { maxTris: pieceMax, maxExtent: [room(A4.h), room(A4.w)] });
      const pattern = layoutPattern(u, mmPerUnit, tabMm, A4);
      v.paintPieces(m.id, u.islandOfTri, PIECE_COLORS);
      setPaperRes({ id: m.id, key: geoKey(m), pattern, name: m.name });
      if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { __paper: { u, pattern, mmPerUnit, html: printHtml(pattern, A4, m.name, { foldStyle, tint: paperTint }) } }); // pour inspecter depuis la console
      setPaperMsg({ ok: true, text: `Patron prêt : ${pattern.pieces.length} pièces, ${pattern.pages.length} planche${pattern.pages.length > 1 ? 's' : ''} A4, ${pattern.tabs} languettes (${Math.round(performance.now() - t0)} ms). Les pièces sont colorées sur le modèle.` });
    } catch (e) {
      setPaperMsg({ ok: false, text: `Patron impossible : ${e instanceof Error ? e.message : String(e)}` });
    }
  };
  const openPaper = () => {
    if (!paperRes) return;
    const html = printHtml(paperRes.pattern, A4, paperRes.name, { foldStyle, tint: paperTint });
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank');
  };
  const clearPaperColors = (m: ModelState) => { viewer.current?.paintPieces(m.id, null, []); };
  const paperValid = paperRes && selectedId === paperRes.id && models.some((m) => m.id === paperRes.id && geoKey(m) === paperRes.key);

  /** Télécharge le maillage affiché (réduit ou non) en .stl binaire. */
  const download = (m: ModelState) => {
    const data = viewer.current?.exportStl(m.id);
    if (!data) return;
    const url = URL.createObjectURL(new Blob([data.buffer as ArrayBuffer], { type: 'model/stl' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${m.name}-${m.triangles}tri.stl` });
    a.click();
    URL.revokeObjectURL(url);
  };
  /** Télécharge les triangles sélectionnés au polygone en .stl binaire (le modèle reste intact). */
  const downloadSelection = (m: ModelState) => {
    const data = viewer.current?.exportSelectionStl();
    if (!data) return;
    const tris = (data.byteLength - 84) / 50;
    const url = URL.createObjectURL(new Blob([data.buffer as ArrayBuffer], { type: 'model/stl' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${m.name}-selection-${tris}tri.stl` });
    a.click();
    URL.revokeObjectURL(url);
    say(`Sélection exportée : ${tris.toLocaleString('fr-FR')} triangles.`);
  };
  /** Exporte le modèle reconstruit affiché (loft) en STL binaire, à l'échelle réelle en millimètres (hauteur réelle choisie). */
  const downloadLoft = (m: ModelState) => {
    const v = viewer.current;
    if (!v) return;
    const mmPerUnit = (paperHeight * 10) / Math.max(v.rotatedSizeOf(m.id).z, 1e-6);
    const data = v.exportStl(m.id, false, mmPerUnit);
    if (!data) return;
    const tris = Math.round(data.byteLength > 84 ? (data.byteLength - 84) / 50 : 0);
    const url = URL.createObjectURL(new Blob([data.buffer as ArrayBuffer], { type: 'model/stl' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${m.name}-reconstruit-${paperHeight}cm-${tris}tri.stl` });
    a.click();
    URL.revokeObjectURL(url);
    say(`STL reconstruit exporté : ${tris.toLocaleString('fr-FR')} triangles, hauteur ${paperHeight} cm (unités : mm).`);
  };

  /**
   * Remet sur un modèle tout ce qui a été fait sous son nom : retouches à la main, réduction et traits. Renvoie le nombre de triangles affichés.
   * Les nouveaux réglages sont enregistrés automatiquement (voir les effets plus haut), donc le même fichier redéposé revient où on l'avait laissé.
   */
  const restoreWork = async (v: StlViewer, m: ModelState): Promise<number> => {
    let ed = await getEdit(m.name).catch(() => undefined);
    if (!ed) { ed = await getLegacyEdit(m.id).catch(() => undefined); if (ed) void putEdit(m.name, ed); } // migration de l'ancien format
    if (ed) v.setOverride(m.id, ed.target, ed.positions);
    let tr = await getTraces(m.name).catch(() => undefined);
    if (!tr) { tr = await getLegacyTraces(m.id).catch(() => undefined); if (tr?.length) void putTraces(m.name, tr); }
    if (tr?.length) { v.setTraces(m.id, tr); setTraceCounts((c) => ({ ...c, [m.id]: tr.length })); }
    tracesRef.current.set(m.id, tr ?? []);
    applied.current.set(m.id, geoKey(m));
    return ed || m.target ? v.rebuild(m.id, m.target) : m.triangles;
  };

  /** Charge des fichiers .stl ou .obj et les range côte à côte, à droite des modèles déjà là. */
  const addFiles = async (files: FileList | File[]) => {
    const stl = [...files].filter((f) => /\.(stl|obj)$/i.test(f.name));
    if (!stl.length) { say('Dépose un fichier .stl ou .obj.'); return; }
    const items: { name: string; buffer: ArrayBuffer }[] = [];
    for (const f of stl) items.push({ name: f.name.replace(/\.(stl|obj)$/i, ''), buffer: await f.arrayBuffer() });
    await addBuffers(items);
  };
  /** Ajoute des modèles à partir d'octets STL (fichiers déposés). */
  const addBuffers = async (items: { name: string; buffer: ArrayBuffer }[], remember = true) => {
    const v = viewer.current;
    if (!v) return;
    const first = modelsRef.current.length === 0;
    let edge = modelsRef.current.reduce((m, o) => Math.max(m, o.pos[0] + (o.width * o.scale) / 2), -Infinity);
    const added: ModelState[] = [];
    for (const { name, buffer } of items) {
      try {
        const id = newId();
        const probe = v.load(id, name, buffer, 0);
        if (remember) {
          putFile(name, buffer).catch(() => say('Fichier non mémorisé : il faudra le redéposer la prochaine fois.'));
          setSessions(ensureSession(name)); // chaque fichier chargé a sa session, au nom généré
        }
        probe.pos[0] = Number.isFinite(edge) ? edge + GAP + probe.width / 2 : 0;
        const prefs = loadModelPrefs(name); // déjà travaillé : on reprend là où on s'était arrêté
        if (prefs) Object.assign(probe, { target: prefs.target, rot: prefs.rot ?? [0, 0, 0], pos: prefs.pos, scale: prefs.scale, color: prefs.color });
        probe.triangles = await restoreWork(v, probe);
        edge = probe.pos[0] + probe.width / 2;
        added.push(probe);
      } catch (e) {
        say(`« ${name} » illisible : ${e instanceof Error ? e.message : e}`);
      }
    }
    if (!added.length) return;
    setModels((ms) => [...ms, ...added]);
    setSelectedId(added[added.length - 1].id);
    if (first) window.setTimeout(() => v.frame(), 50);
    say(`${added.length} modèle${added.length > 1 ? 's' : ''} chargé${added.length > 1 ? 's' : ''}.`);
  };

  const PREF_LABELS: Record<string, string> = { rot: 'Orientation', pos: 'Position', scale: "Taille à l'écran", color: 'Couleur', target: 'Réduction' };
  const update = (id: string, patch: Partial<ModelState>) => {
    const cur = modelsRef.current.find((m) => m.id === id);
    if (cur) {
      const keys = Object.keys(patch).sort().join();
      const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, (cur as unknown as Record<string, unknown>)[k]])) as Partial<ModelState>;
      const top = backStack.current[backStack.current.length - 1];
      const now = Date.now();
      if (top && top.id === id && top.keys === keys && now - (top.at ?? 0) < 900) top.at = now; // un curseur qu'on fait glisser = une seule action
      else {
        const work = 'target' in patch ? viewer.current?.workState(id) : undefined; // une réduction se défait avec le maillage tel qu'il était (retouches comprises)
        pushBack({
          label: keys.split(',').map((k) => PREF_LABELS[k] ?? k).join(' + '), id, keys, at: now,
          undo: () => {
            const v = viewer.current;
            if (work && v && prev.target !== undefined) {
              v.restoreWorkState(id, work);
              const n = v.rebuild(id, prev.target);
              applied.current.set(id, String(prev.target));
              setModels((ms) => ms.map((m) => (m.id === id ? { ...m, ...prev, triangles: n } : m)));
              const mm = modelsRef.current.find((m) => m.id === id);
              const ov = v.overrideState(id);
              if (mm && ov) putEdit(mm.name, { target: ov.target, positions: ov.positions.slice() }).catch(() => undefined);
              setPaperRes(null); setSlicesRes(null);
            } else setModels((ms) => ms.map((m) => (m.id === id ? { ...m, ...prev } : m)));
            return true;
          },
        });
      }
    }
    setModels((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  /** Retour : annule la dernière action de la pile, quelle qu'elle soit ; saute celles qui ne valent plus. */
  const back = () => {
    const st = backStack.current;
    while (st.length) {
      const e = st.pop()!;
      if (e.undo()) { setBackLabel(st.length ? st[st.length - 1].label : null); say(`Annulé : ${e.label}.`); return; }
    }
    setBackLabel(null);
    say('Rien à annuler.');
  };
  const backRef = useRef(back);
  backRef.current = back;
  // un aperçu (tranches, reconstruction) s'ajoute à la pile : Retour revient au modèle
  useEffect(() => {
    if (!preview) return;
    const id = preview.id;
    pushBack({ label: 'Aperçu affiché', undo: () => { if (previewRef.current?.id !== id) return false; viewer.current?.clearPreview(id); setPreview(null); setSlicesRes(null); setLoftId(null); return true; } });
  }, [preview?.id, preview?.triangles]);
  /** Ferme le modèle : sa session (fichier, retouches, traits, réglages) reste enregistrée et se rouvre depuis « Sessions fermées ». */
  const remove = (id: string) => { applied.current.delete(id); setModels((ms) => ms.filter((m) => m.id !== id)); setSelectedId((s) => (s === id ? null : s)); };
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  /** Supprime définitivement une session fermée (deux clics : le second confirme). */
  const eraseSession = async (s: SessionInfo) => {
    if (confirmDel !== s.name) { setConfirmDel(s.name); return; }
    setConfirmDel(null);
    setSessions(await deleteSession(s.name));
    setSnapNames((n) => n.filter((x) => x !== s.name));
    say(`${s.label} supprimée.`);
  };
  const labelOf = (name: string) => sessions.find((s) => s.name === name)?.label ?? name;

  /** Annule tout ce qui a été fait sur ce fichier (retouches, traits, réduction, rotation…) : retour au fichier d'origine. L'état d'avant est gardé : « Reprendre » le remet. */
  const cancelSession = async (m: ModelState) => {
    const v = viewer.current;
    if (!v) return;
    const snap = { prefs: { target: m.target, rot: m.rot, pos: m.pos, scale: m.scale, color: m.color }, edit: await getEdit(m.name).catch(() => undefined), traces: await getTraces(m.name).catch(() => undefined) };
    await putSnapshot(m.name, snap);
    setSnapNames((n) => [...new Set([...n, m.name])]);
    leavePreview(m);
    setEditId(null);
    v.setEdit(null);
    v.paintPieces(m.id, null, []);
    v.setOverride(m.id, 0, null);
    void deleteEdit(m.name);
    v.clearTraces(m.id, true); // annonce 0 trait : le travail enregistré est vidé aussi
    setWireCount(0);
    applied.current.set(m.id, '0');
    const n = v.rebuild(m.id, 0);
    setModels((ms) => ms.map((o) => (o.id === m.id ? { ...o, target: 0, rot: [0, 0, 0], scale: 1, color: '#c9b8a0', triangles: n } : o)));
    setPaperRes(null); setPaperMsg(null); setLoftMsg(null); setCanUndo(false); setHistory([]);
    say(`Session ${labelOf(m.name)} annulée : fichier d'origine. « Reprendre » remet ton travail.`);
  };
  /** Reprend la session d'avant l'annulation. */
  const resumeSession = async (m: ModelState) => {
    const v = viewer.current;
    if (!v) return;
    const snap = await getSnapshot(m.name).catch(() => undefined);
    if (!snap) { say('Rien à reprendre.'); return; }
    if (snap.edit) { v.setOverride(m.id, snap.edit.target, snap.edit.positions); void putEdit(m.name, snap.edit); }
    if (snap.traces?.length) { v.setTraces(m.id, snap.traces); setTraceCounts((c) => ({ ...c, [m.id]: snap.traces!.length })); void putTraces(m.name, snap.traces); }
    applied.current.set(m.id, String(snap.prefs.target));
    const n = v.rebuild(m.id, snap.prefs.target);
    setModels((ms) => ms.map((o) => (o.id === m.id ? { ...o, ...snap.prefs, triangles: n } : o)));
    await dropSnapshot(m.name);
    setSnapNames((s) => s.filter((x) => x !== m.name));
    say(`Session ${labelOf(m.name)} reprise là où tu l'avais laissée.`);
  };
  /** Rouvre une session fermée depuis le fichier gardé par son nom ; le travail est restauré. */
  const openSession = async (s: SessionInfo) => {
    const buffer = await getFile(s.name).catch(() => undefined);
    if (!buffer) { say(`Fichier de ${s.label} introuvable : redépose-le, la session sera reprise.`); return; }
    await addBuffers([{ name: s.name, buffer }], false);
  };

  const selected = models.find((m) => m.id === selectedId) ?? null;
  const traces =selected ? traceCounts[selected.id] ?? 0 : 0;
  const editing = !!selected && editId === selected.id;
  const setRot = (m: ModelState, i: number, deg: number) => { const rot = [...m.rot] as Vec3; rot[i] = deg; update(m.id, { rot }); };
  const setPos = (m: ModelState, i: number, v: number) => { const pos = [...m.pos] as Vec3; pos[i] = v; update(m.id, { pos }); };
  const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

  /** Réglage partagé par les découpes laser (tranches, gaufre, papier) : la taille réelle du modèle. */
  const realHeight = <Slider label="Hauteur réelle du modèle" value={paperHeight} min={3} max={100} step={0.5} unit=" cm" onChange={setPaperHeight} />;

  return (
    <div
      className="flex h-full w-full overflow-hidden bg-stone-100 text-stone-800"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files); }}
    >
      <aside className="flex h-full w-[22rem] shrink-0 flex-col gap-3 overflow-y-auto border-r border-stone-200 bg-stone-50 p-3">
        <header className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold text-emerald-900">Visionneuse STL</h1>
            <p className="text-[11px] text-stone-500">Dépose des fichiers .stl ou .obj dans la fenêtre.</p>
          </div>
          <div className="flex items-center gap-1.5">
            <a href={toolUrl('menu')} className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-stone-100" title="Retour au menu des outils">Menu</a>
            <Btn variant="primary" block={false} onClick={() => fileRef.current?.click()}>Ouvrir…</Btn>
            <input ref={fileRef} type="file" accept=".stl,.obj" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
          </div>
        </header>
        {status && <Notice>{status}</Notice>}

        {/* liste des modèles */}
        {models.length === 0 ? (
          <Hint>Aucun modèle. Glisse un fichier .stl ou .obj n'importe où dans la fenêtre.</Hint>
        ) : (
          <ul className="space-y-1">
            {models.map((m) => (
              <li key={m.id} className={`flex items-center rounded-md border ${m.id === selectedId ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-transparent hover:bg-stone-100'}`}>
                <button onClick={() => setSelectedId(m.id === selectedId ? null : m.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm">
                  <span className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ background: m.color }} />
                  <span className="flex-1 truncate" title={m.name}>{labelOf(m.name)}</span>
                  <span className="text-[10px] text-stone-400">{m.triangles.toLocaleString('fr-FR')} tri</span>
                </button>
                <button onClick={() => remove(m.id)} title={`Fermer ${labelOf(m.name)} : la session reste enregistrée et se rouvre depuis « Sessions fermées »`} className="mr-1 rounded px-1.5 py-0.5 text-sm text-stone-400 hover:bg-stone-200 hover:text-stone-700">×</button>
              </li>
            ))}
          </ul>
        )}
        {models.length > 0 && !selected && <Hint>Choisis un modèle pour le voir seul et le travailler : les autres sont cachés tant qu'un modèle est sélectionné.</Hint>}
        {sessions.some((s) => !models.some((m) => m.name === s.name)) && (
          <Section title="Sessions fermées" note={`${sessions.filter((s) => !models.some((m) => m.name === s.name)).length}`}>
            <ul className="space-y-1">
              {sessions.filter((s) => !models.some((m) => m.name === s.name)).map((s) => (
                <li key={s.name} className="flex items-center gap-2 text-xs text-stone-700">
                  <span className="flex-1 truncate" title={s.name}>{s.label}</span>
                  <Chip onClick={() => void openSession(s)}>Ouvrir</Chip>
                  <Chip onClick={() => void eraseSession(s)} className={confirmDel === s.name ? '!border-rose-500 !bg-rose-50 !text-rose-700' : ''}>{confirmDel === s.name ? 'Confirmer ?' : 'Supprimer'}</Chip>
                </li>
              ))}
            </ul>
            <Hint>Une session garde le fichier et tout le travail fait dessus. « Supprimer » l'efface pour de bon (deux clics).</Hint>
          </Section>
        )}

        {selected && preview?.id === selected.id && (
          <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
            <p className="text-[11px] text-amber-900">Un aperçu ({preview.triangles.toLocaleString('fr-FR')} triangles) remplace le modèle à l'écran. Le modèle n'est pas modifié.</p>
            <Btn variant="warn" onClick={() => leavePreview(selected)}>Annuler : revenir au modèle (Échap)</Btn>
          </div>
        )}

        {selected && (
          <>
            <Tabs<TabId>
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'modele', label: 'Modèle' },
                { id: 'edition', label: 'Édition', badge: editing ? 'ON' : undefined },
                { id: 'coupes', label: 'Coupes', badge: traces || undefined },
                { id: 'papier', label: 'Papier' },
              ]}
            />

            {/* ───────── Modèle ───────── */}
            {tab === 'modele' && (
              <div className="space-y-2.5">
                <Section title={`Session ${labelOf(selected.name)}`} defaultOpen note="enregistrée automatiquement">
                  <Hint>Tout ce que tu fais sur ce fichier est enregistré tout seul. Si tu le rouvres, tu reprends exactement là où tu l'as laissé. La session ne se supprime pas.</Hint>
                  <Btn variant="warn" onClick={() => void cancelSession(selected)} title="Retire retouches, traits, réduction, rotation… et revient au fichier d'origine. L'état d'avant est gardé : tu peux le reprendre.">
                    Annuler tout ce que j'ai fait
                  </Btn>
                  {snapNames.includes(selected.name) && (
                    <Btn variant="primary" onClick={() => void resumeSession(selected)}>Reprendre ma session d'avant l'annulation</Btn>
                  )}
                </Section>
                <Section title="Maillage" defaultOpen note={`${selected.triangles.toLocaleString('fr-FR')} triangles`}>
                  <Hint>
                    {selected.triangles !== selected.original ? `${selected.original.toLocaleString('fr-FR')} triangles à l'origine, réduit à ${selected.triangles.toLocaleString('fr-FR')}.` : 'Modèle d\'origine, non réduit.'}
                  </Hint>
                  <Slider
                    label="Triangles visés"
                    value={selected.target || selected.original}
                    min={Math.min(100, selected.original)}
                    max={selected.original}
                    step={selected.original > 20000 ? 100 : 10}
                    onChange={(v) => update(selected.id, { target: v >= selected.original ? 0 : v })}
                  />
                  <div className="flex flex-wrap gap-1">
                    {[1000, 900, 800, 700, 600, 500, 400, 300, 200, 100].filter((n) => n < selected.original).map((n) => (
                      <Chip key={n} active={selected.target === n} onClick={() => update(selected.id, { target: n })}>{n.toLocaleString('fr-FR')}</Chip>
                    ))}
                    <Chip active={selected.target === 0} onClick={() => update(selected.id, { target: 0 })}>Original</Chip>
                  </div>
                  <Btn onClick={() => download(selected)} title="Enregistre le maillage tel qu'affiché, en STL binaire">Télécharger ce .stl</Btn>
                </Section>

                <Section title="Orientation et position" defaultOpen>
                  {(['X', 'Y', 'Z'] as const).map((a, i) => (
                    <div key={a} className="space-y-1">
                      <Slider label={a === 'X' ? 'Bascule avant / arrière (X)' : a === 'Y' ? 'Penche sur le côté (Y)' : 'Pivote à gauche / droite (Z)'} value={selected.rot[i]} min={-180} max={180} step={1} unit="°" onChange={(v) => setRot(selected, i, v)} />
                      <div className="flex gap-1">
                        {[-90, 90, 180].map((d) => (
                          <Chip key={d} onClick={() => setRot(selected, i, wrap180(selected.rot[i] + d))}>{d > 0 ? '+' : ''}{d}°</Chip>
                        ))}
                      </div>
                    </div>
                  ))}
                  <Btn onClick={() => update(selected.id, { rot: [0, 0, 0] })}>Remettre droit</Btn>
                  {(['X', 'Y', 'Z'] as const).map((a, i) => (
                    <Slider key={a} label={`Position ${AXIS_LABEL[a]}`} value={Math.round(selected.pos[i] * 100)} min={-500} max={500} step={1} onChange={(v) => setPos(selected, i, v / 100)} />
                  ))}
                  <Hint>Le modèle se tourne et se déplace uniquement avec ces curseurs, pas à la souris. La rotation compte pour les coupes, le papier et le STL téléchargé.</Hint>
                </Section>

                <Section title="Axes et plans de repère">
                  <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1.5 text-xs text-stone-600">
                    <span />
                    <span className="text-[10px] font-semibold tracking-wide text-stone-500 uppercase">Axe</span>
                    <span className="text-[10px] font-semibold tracking-wide text-stone-500 uppercase">Plan</span>
                    {(['X', 'Y', 'Z'] as const).map((a) => (
                      <Fragment key={a}>
                        <span className="font-semibold" style={{ color: AXIS_COLOR[a] }}>{AXIS_LABEL[a]}</span>
                        <label className="flex items-center gap-1">
                          <input type="checkbox" checked={axisOn[a]} onChange={(e) => setAxisOn({ ...axisOn, [a]: e.target.checked })} className="accent-emerald-700" />
                          afficher
                        </label>
                        <label className="flex items-center gap-1" title={`Plan perpendiculaire à ${a}, fixe à l'origine : le modèle le traverse, la ligne de coupe est en rouge`}>
                          <input type="checkbox" checked={worldPlaneOn[a]} onChange={(e) => setWorldPlaneOn({ ...worldPlaneOn, [a]: e.target.checked })} className="accent-emerald-700" />
                          activer
                        </label>
                      </Fragment>
                    ))}
                  </div>
                  <Hint>Les plans sont fixes à l'origine : déplace le modèle avec les curseurs de position pour le faire traverser. Ce sont des repères, ils ne modifient rien.</Hint>
                </Section>

                <Section title="Affichage">
                  <Slider label="Taille à l'écran" value={Math.round(selected.scale * 100)} min={10} max={500} step={1} unit=" %" onChange={(v) => update(selected.id, { scale: v / 100 })} />
                  <label className="flex items-center justify-between text-xs text-stone-600">
                    Couleur
                    <input type="color" value={selected.color} onChange={(e) => update(selected.id, { color: e.target.value })} className="h-7 w-12 cursor-pointer rounded border border-stone-200 bg-white" />
                  </label>
                </Section>
              </div>
            )}

            {/* ───────── Édition ───────── */}
            {tab === 'edition' && (
              <div className="space-y-2.5">
                {selected.triangles > EDIT_SLOW_TRIS && (
                  <Notice kind="warn">{selected.triangles.toLocaleString('fr-FR')} triangles : l'édition reste possible mais devient lente (quelques secondes par action). Réduis d'abord le maillage si tu peux.</Notice>
                )}
                <Btn variant={editing ? 'danger' : 'primary'} onClick={() => setEditId(editing ? null : selected.id)}>
                  {editing ? 'Quitter le mode édition (Échap)' : 'Entrer en mode édition'}
                </Btn>
                {!editing && <Hint>Le mode édition permet de supprimer des sommets, des arêtes ou des triangles, de sélectionner une zone à l'écran, de couper avec un plan, de symétriser et de tracer des coupes.</Hint>}

                {editing && (
                  <>
                    <div className="grid grid-cols-5 gap-1">
                      {TOOLS.map((t) => (
                        <Chip key={t.id} active={editTool === t.id} onClick={() => setEditTool(t.id)} className="px-1 py-1.5 text-center">{t.label}</Chip>
                      ))}
                    </div>
                    <Hint>{TOOLS.find((t) => t.id === editTool)!.help}{editTool !== 'select' && editTool !== 'plane' && ' Ce qui est en rouge sous la souris disparaît au clic.'}</Hint>

                    {editTool === 'select' && (
                      <div className="space-y-2">
                        <label className="flex items-start gap-2 text-[11px] text-stone-600">
                          <input type="checkbox" checked={selThrough} onChange={(e) => setSelThrough(e.target.checked)} className="mt-0.5 accent-rose-600" />
                          Prendre aussi les faces cachées : tout ce qui est dans le polygone, devant comme derrière
                        </label>
                        <Btn variant="primary" disabled={!selCount} onClick={() => downloadSelection(selected)} title="Enregistre seulement les triangles sélectionnés, en STL binaire ; le modèle n'est pas modifié">
                          Exporter la sélection en STL{selCount ? ` (${selCount.toLocaleString('fr-FR')} triangle${selCount > 1 ? 's' : ''})` : ''}
                        </Btn>
                        <Btn variant="danger" disabled={!selCount} onClick={() => viewer.current?.deleteSelection()}>
                          Supprimer la sélection{selCount ? ` (${selCount.toLocaleString('fr-FR')} triangle${selCount > 1 ? 's' : ''})` : ''}
                        </Btn>
                      </div>
                    )}

                    {editTool === 'plane' && (
                      <div className="space-y-2.5">
                        <Section title="Position du plan" defaultOpen>
                          <Slider label="Le long de sa normale" value={Math.round(plane.offset * 100)} min={-120} max={120} step={1} onChange={(v) => setPlane({ ...plane, offset: v / 100 })} />
                          <Slider label="Orientation (autour de la verticale)" value={plane.angle} min={-180} max={180} step={1} unit="°" onChange={(v) => setPlane({ ...plane, angle: v })} />
                          <Slider label="Inclinaison (0 = vertical, ±90 = horizontal)" value={plane.tilt} min={-90} max={90} step={1} unit="°" onChange={(v) => setPlane({ ...plane, tilt: v })} />
                          <Slider label="Inclinaison autour de l'axe horizontal (X)" value={plane.horiz} min={-180} max={180} step={1} unit="°" onChange={(v) => setPlane({ ...plane, horiz: v })} />
                          <Slider label="Rotation autour de la diagonale 1" value={plane.diag1} min={-90} max={90} step={1} unit="°" onChange={(v) => setPlane({ ...plane, diag1: v })} />
                          <Slider label="Rotation autour de la diagonale 2" value={plane.diag2} min={-90} max={90} step={1} unit="°" onChange={(v) => setPlane({ ...plane, diag2: v })} />
                          <div className="grid grid-cols-2 gap-1.5">
                            <Btn onClick={() => setPlane({ ...plane, angle: 90, tilt: 0, diag1: 0, diag2: 0, horiz: 0 })}>Remettre droit</Btn>
                            <Btn onClick={() => setPlane({ ...plane, keep: plane.keep === 'right' ? 'left' : 'right' })}>Inverser vert / rouge</Btn>
                          </div>
                        </Section>
                        <Section title="Supprimer ou symétriser" defaultOpen>
                          <Btn variant="danger" disabled={!selCount} onClick={() => viewer.current?.deleteSelection()}>
                            Supprimer le côté rouge{selCount ? ` (${selCount.toLocaleString('fr-FR')} triangle${selCount > 1 ? 's' : ''})` : ''}
                          </Btn>
                          <Btn variant="primary" onClick={() => { viewer.current?.mirrorAcrossPlane(); setEditTool('vertex'); }} title="Supprime le rouge, ramène le bord de coupe sur le plan, puis recopie le vert en miroir de l'autre côté">
                            Symétriser : garder le vert, le copier de l'autre côté
                          </Btn>
                        </Section>
                        <Section title="Traits de coupe" note={traces ? `${traces} gardés` : undefined}>
                          <div className="grid grid-cols-2 gap-1.5">
                            <Btn variant={traceOn ? 'warn' : 'secondary'} onClick={() => setTraceOn(!traceOn)} title="Trait rouge là où le plan coupe le modèle ; les contours sont fermés, les trous pontés">
                              {traceOn ? 'Effacer le trait' : 'Tracer la coupe'}
                            </Btn>
                            <Btn disabled={!traceOn} onClick={() => viewer.current?.keepTrace()} title="Copie le trait courant sur le modèle : il reste affiché, enregistré, et tu peux en tracer un autre">Garder ce trait</Btn>
                          </div>
                          <div className="space-y-1.5 rounded-md border border-stone-200 bg-stone-50 p-2">
                            <p className="text-[11px] font-semibold text-stone-600">Générer des traits en série</p>
                            <div className="flex flex-wrap items-center gap-1 text-[11px] text-stone-600">
                              <span>Autour de l'axe</span>
                              {(['X', 'Y', 'Z', 'D1', 'D2'] as const).map((a) => (
                                <Chip key={a} active={genAxis === a} onClick={() => setGenAxis(a)}>{a === 'D1' ? 'Diag. 1' : a === 'D2' ? 'Diag. 2' : a}</Chip>
                              ))}
                            </div>
                            <Hint>
                              {genAxis === 'Z' ? 'Vertical, par le centre du modèle.' : genAxis === 'X' ? 'Gauche ↔ droite, par le centre du modèle.' : genAxis === 'Y' ? 'Avant ↔ arrière, par le centre du modèle.' : `Diagonale ${genAxis === 'D1' ? '1' : '2'} du plan courant : le premier trait est le plan lui-même.`}
                            </Hint>
                            <Slider label="Un trait tous les" value={genStep} min={5} max={45} step={5} unit="°" onChange={setGenStep} />
                            <Btn variant="primary" onClick={() => viewer.current?.generateTraces(genAxis, genStep)}>Générer les traits ({Math.ceil(180 / genStep)} plans)</Btn>
                          </div>
                          {traces > 0 && (
                            <>
                              <ul className="max-h-32 space-y-0.5 overflow-y-auto rounded-md border border-stone-200 bg-white p-1">
                                {Array.from({ length: traces }, (_, i) => (
                                  <li key={i} className="flex items-center gap-1 px-1 text-[11px] text-stone-700">
                                    <span className="h-2 w-4 shrink-0 border-t-2 border-red-800" />
                                    <span className="flex-1">Trait {i + 1}</span>
                                    <button onClick={() => viewer.current?.removeTrace(selected.id, i)} className="rounded px-1.5 py-0.5 text-sm text-stone-400 hover:bg-rose-100 hover:text-rose-700" title="Supprimer ce trait">×</button>
                                  </li>
                                ))}
                              </ul>
                              <Btn onClick={() => viewer.current?.clearTraces(selected.id, true)}>Effacer tous les traits ({traces})</Btn>
                            </>
                          )}
                        </Section>
                      </div>
                    )}

                    <Section title="Actions faites" defaultOpen note={history.length ? `${history.length}` : undefined}>
                      {history.length > 0 ? (
                        <ul className="max-h-44 overflow-y-auto rounded-md border border-stone-200 bg-white">
                          {history.map((label, i) => (
                            <li key={i} className="flex items-center gap-1 px-2 py-1 text-[11px] text-stone-700">
                              <span className="w-5 shrink-0 text-right text-stone-400">{i + 1}.</span>
                              <span className="flex-1 truncate">{label}</span>
                              <Chip onClick={() => viewer.current?.undoTo(i)} title={i === history.length - 1 ? 'Annule cette action' : 'Annule cette action et toutes celles qui la suivent'}>Annuler</Chip>
                            </li>
                          )).reverse()}
                        </ul>
                      ) : (
                        <Hint>Aucune action pour l'instant.</Hint>
                      )}
                      <div className="grid grid-cols-2 gap-1.5">
                        <Btn disabled={!canUndo} onClick={() => viewer.current?.undoEdit()}>Annuler la dernière</Btn>
                        <Btn onClick={() => resetEdit(selected)} title="Oublie toutes les retouches de ce modèle">Tout rétablir</Btn>
                      </div>
                      <Hint>Ctrl+Z annule la dernière action, Suppr supprime la sélection.</Hint>
                    </Section>
                  </>
                )}
              </div>
            )}

            {/* ───────── Coupes (bois, carton, laser) ───────── */}
            {tab === 'coupes' && (
              <div className="space-y-2.5">
                <Section title="Réglages de découpe" defaultOpen>
                  {realHeight}
                  <Slider label="Épaisseur du matériau" value={thickness} min={1} max={30} step={0.5} unit=" mm" onChange={setThickness} />
                  <label className="flex items-center gap-2 text-xs text-stone-600">
                    <input type="checkbox" checked={hollow} onChange={(e) => setHollow(e.target.checked)} className="accent-emerald-700" />
                    Tranches creuses (un cadre, l'intérieur est évidé)
                  </label>
                  {hollow && <Slider label="Largeur de la paroi" value={wall} min={2} max={40} step={0.5} unit=" mm" onChange={setWall} />}
                </Section>

                <Section title="Gaufre automatique" defaultOpen note="2 directions, avec encoches">
                  <Hint>Des coupes parallèles dans deux directions, qui partent du plan de chaque axe. À chaque croisement, une encoche à mi-bois : les A s'emboîtent par un côté, les B par l'autre.</Hint>
                  {([['A', waffleA, setWaffleA], ['B', waffleB, setWaffleB]] as const).map(([name, val, set]) => (
                    <div key={name} className="flex items-center gap-1 text-[11px] text-stone-600">
                      <span className="w-20">Direction {name}</span>
                      {(['X', 'Y', 'Z'] as const).map((a) => <Chip key={a} active={val === a} onClick={() => set(a)}>{a}</Chip>)}
                    </div>
                  ))}
                  <Slider label="Un plan tous les" value={waffleStep} min={5} max={100} step={1} unit=" mm" onChange={setWaffleStep} />
                  <Btn variant="primary" onClick={() => makeWaffle(selected)}>Générer la gaufre</Btn>
                </Section>

                <Section title="Une tranche par trait gardé" note={traces ? `${traces} traits` : 'aucun trait'}>
                  <Hint>Utilise les traits gardés du mode édition (outil Plan). Les tranches peuvent se croiser, sans encoches.</Hint>
                  <Btn variant="primary" disabled={!traces} onClick={() => makeSlices(selected)}>Générer les tranches{traces ? ` (${traces} traits)` : ''}</Btn>
                </Section>

                {slicesValid && slicesRes && (
                  <Notice kind="ok">
                    <b>{slicesRes.res.slices.length}</b> tranches · <b>{slicesRes.res.pages.length}</b> planche{slicesRes.res.pages.length > 1 ? 's' : ''} A4
                    {slicesRes.opts.notches && <> · <b>{slicesRes.res.joints}</b> encoches</>}
                    {slicesRes.res.slices.some((s) => s.bridged) && <> · trous du maillage pontés</>}
                  </Notice>
                )}
                {slicesValid && slicesRes && slicesRes.res.tooBig.length > 0 && (
                  <Notice kind="warn">{slicesRes.res.tooBig.length} tranche{slicesRes.res.tooBig.length > 1 ? 's' : ''} plus grande{slicesRes.res.tooBig.length > 1 ? 's' : ''} qu'une planche A4 (T{slicesRes.res.tooBig.map((i) => i + 1).join(', T')}) : baisse la hauteur réelle.</Notice>
                )}
                {slicesValid && slicesRes && <Btn onClick={openSlices}>Ouvrir les planches (SVG pour le laser)</Btn>}

                <Section title="Fil de fer et reconstruction 3D">
                  <Hint>Les contours exacts de coupes régulières, tracés en 3D. Ces réglages ne dépendent pas de la gaufre.</Hint>
                  <div className="flex items-center gap-1 text-[11px] text-stone-600">
                    <span className="w-20">Axes tracés</span>
                    {(['X', 'Y', 'Z'] as const).map((a) => <Chip key={a} active={wireAxes[a]} onClick={() => setWireAxes({ ...wireAxes, [a]: !wireAxes[a] })}>{a}</Chip>)}
                  </div>
                  <Slider label="Coupes par axe" value={wireCuts} min={3} max={60} step={1} onChange={setWireCuts} />
                  <Btn variant="primary" onClick={() => makeWire(selected)}>Tracer le fil de fer</Btn>
                  {wireCount > 0 && <Btn variant="warn" onClick={() => undoWire(selected)}>Annuler le fil de fer{wireCount > 1 ? ` (${wireCount} tracés)` : ''}</Btn>}
                  <label className="flex items-center gap-2 text-xs text-stone-600">
                    <input type="checkbox" checked={hideModel} onChange={(e) => setHideModel(e.target.checked)} className="accent-emerald-700" />
                    Cacher le modèle (fil de fer seul)
                  </label>
                  <div className="space-y-1.5 border-t border-stone-100 pt-2">
                    <p className="text-[11px] font-semibold text-stone-600">Modèle 3D refait depuis des coupes</p>
                    <div className="flex items-center gap-1 text-[11px] text-stone-600">
                      <span className="w-20">Direction</span>
                      {(['X', 'Y', 'Z'] as const).map((a) => <Chip key={a} active={loftAxis === a} onClick={() => setLoftAxis(a)}>{a}</Chip>)}
                    </div>
                    <Slider label="Coupes pour la reconstruction" value={loftCuts} min={4} max={80} step={1} onChange={setLoftCuts} />
                  </div>
                  <Btn variant="primary" onClick={() => makeLoft(selected)}>Reconstruire le modèle 3D</Btn>
                  {loftId === selected.id && preview?.id === selected.id && (
                    <Btn variant="primary" onClick={() => downloadLoft(selected)} title="Enregistre le modèle reconstruit en STL, à l'échelle réelle (hauteur réelle choisie, en mm)">Exporter le STL reconstruit ({paperHeight} cm)</Btn>
                  )}
                  {loftMsg && <Notice kind={loftMsg.ok ? 'ok' : 'error'}>{loftMsg.text}</Notice>}
                </Section>
              </div>
            )}

            {/* ───────── Papier (polygones) ───────── */}
            {tab === 'papier' && (
              <div className="space-y-2.5">
                <Hint>Patron en polygones : le modèle réduit est déplié en pièces à plat, à découper, plier et coller. Chaque triangle reste une face plate (rien n'est cintré).</Hint>

                <Section title="1. Simplifier le modèle" defaultOpen note={`${selected.triangles.toLocaleString('fr-FR')} triangles`}>
                  {selected.triangles > PAPER_MAX_TRIS ? (
                    <Notice kind="warn">{selected.triangles.toLocaleString('fr-FR')} triangles : trop pour du papier. Réduis à {PAPER_MAX_TRIS} ou moins (150 à 300 donne un bon compromis).</Notice>
                  ) : (
                    <Notice kind="ok">{selected.triangles.toLocaleString('fr-FR')} triangles : c'est utilisable. Moins de triangles = moins de pièces à coller, mais une forme plus anguleuse.</Notice>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {[100, 150, 200, 300, 400, 600].filter((n) => n < selected.original).map((n) => (
                      <Chip key={n} active={selected.target === n} onClick={() => update(selected.id, { target: n })}>{n}</Chip>
                    ))}
                  </div>
                  <Hint>Réduis avant d'éditer à la main : les retouches sont liées au niveau de réduction.</Hint>
                </Section>

                <Section title="2. Réglages du patron" defaultOpen>
                  {realHeight}
                  <Slider label="Largeur des languettes de collage" value={tabMm} min={3} max={15} step={0.5} unit=" mm" onChange={setTabMm} />
                  <Slider label="Triangles au plus par pièce" value={pieceMax} min={10} max={300} step={5} onChange={setPieceMax} />
                  <div className="space-y-1">
                    <p className="text-[11px] text-stone-600">Plis pour le laser</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Chip active={foldStyle === 'perf'} className="py-1.5" onClick={() => setFoldStyle('perf')}>Perforation (pointillés)</Chip>
                      <Chip active={foldStyle === 'score'} className="py-1.5" onClick={() => setFoldStyle('score')}>Rainurage (trait plein)</Chip>
                    </div>
                    <Hint>Perforation : le laser coupe 1 mm sur 2, plus simple à régler. Rainurage : il enlève une fine couche de papier, à calibrer sur une bande de test.</Hint>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-stone-600">
                    <input type="checkbox" checked={paperTint} onChange={(e) => setPaperTint(e.target.checked)} className="accent-emerald-700" />
                    Teinter les pièces dans l'aperçu à imprimer
                  </label>
                </Section>

                <Btn variant="primary" disabled={selected.triangles > PAPER_MAX_TRIS} onClick={() => makePaper(selected)}>Générer le patron en polygones</Btn>
                {paperMsg && <Notice kind={paperMsg.ok ? 'ok' : 'error'}>{paperMsg.text}</Notice>}

                {paperValid && paperRes && (
                  <Section title="3. Résultat" defaultOpen>
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      <div className="rounded-md bg-stone-100 px-1 py-1.5"><p className="text-sm font-semibold text-stone-800">{paperRes.pattern.pieces.length}</p><p className="text-[10px] text-stone-500">pièces</p></div>
                      <div className="rounded-md bg-stone-100 px-1 py-1.5"><p className="text-sm font-semibold text-stone-800">{paperRes.pattern.pages.length}</p><p className="text-[10px] text-stone-500">planches A4</p></div>
                      <div className="rounded-md bg-stone-100 px-1 py-1.5"><p className="text-sm font-semibold text-stone-800">{paperRes.pattern.tabs}</p><p className="text-[10px] text-stone-500">languettes</p></div>
                    </div>
                    <Hint>À couper : {(paperRes.pattern.cutMm / 1000).toFixed(1)} m · à plier : {(paperRes.pattern.foldMm / 1000).toFixed(1)} m.</Hint>
                    {paperRes.pattern.tooBig.length > 0 && (
                      <Notice kind="warn">{paperRes.pattern.tooBig.length} pièce{paperRes.pattern.tooBig.length > 1 ? 's' : ''} trop grande{paperRes.pattern.tooBig.length > 1 ? 's' : ''} pour une page A4 (P{paperRes.pattern.tooBig.map((i) => i + 1).join(', P')}) : baisse la hauteur réelle.</Notice>
                    )}
                    <Btn variant="primary" onClick={openPaper}>Ouvrir les planches (aperçu et SVG pour le laser)</Btn>
                    <Btn onClick={() => clearPaperColors(selected)}>Retirer les couleurs du modèle</Btn>
                    <Hint>Couleurs des traits : noir = couper, bleu = pli montagne, violet = pli vallée, orange = numéros. La languette N se colle sur le bord N d'une autre pièce.</Hint>
                  </Section>
                )}
              </div>
            )}
          </>
        )}

        <div className="mt-auto space-y-1.5 pt-2">
          {models.length > 0 && <Btn onClick={() => viewer.current?.frame()}>Recadrer la vue</Btn>}
          <Hint>Clic gauche ou molette : tourner la vue · clic droit : déplacer · roulette : zoom · clic sur un modèle : le choisir.</Hint>
        </div>
      </aside>

      <main className="relative min-w-0 flex-1">
        <div ref={host} className="h-full w-full" />
        <div className="absolute top-3 left-3 flex items-center gap-1 rounded-lg border border-stone-200 bg-white/90 p-1 shadow-sm backdrop-blur">
          <button
            onClick={back}
            disabled={!backLabel}
            title={backLabel ? `Annuler : ${backLabel} (Ctrl+Z)` : 'Rien à annuler'}
            className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold text-stone-800 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span aria-hidden className="text-sm leading-none">↶</span> Retour
            {backLabel && <span className="max-w-40 truncate text-[10px] font-normal text-stone-500">{backLabel}</span>}
          </button>
        </div>
        <div className="absolute top-3 right-3 flex items-center gap-1 rounded-lg border border-stone-200 bg-white/90 p-1 shadow-sm backdrop-blur" title="Éclairage de la vue 3D">
          <span className="px-1.5 text-[10px] font-semibold tracking-wide text-stone-500 uppercase">Éclairage</span>
          {(Object.keys(LIGHTING_LABELS) as LightingPreset[]).map((k) => (
            <Chip key={k} active={lighting === k} onClick={() => setLighting(k)}>{LIGHTING_LABELS[k]}</Chip>
          ))}
        </div>
        {models.length === 0 && !dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-stone-500">Dépose un fichier .stl ou .obj ici</div>
        )}
        {dragging && (
          <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-xl border-2 border-dashed border-emerald-600 bg-emerald-50/70 text-base font-medium text-emerald-900">
            Lâche le fichier
          </div>
        )}
      </main>
    </div>
  );
}
