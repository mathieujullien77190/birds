import { Fragment, useEffect, useRef, useState } from 'react';
import { StlViewer, type CutPlane, type EditTool, type ModelState, type TraceAxis, type Vec3 } from './engine/viewer';
import Slider from './ui/Slider';
import { A4, buildSlices, SLICE_COLORS, slicesGeometry, slicesHtml, type SliceOptions, type SlicePlane, type SlicesResult } from './engine/slices';
import { deleteEdit, deleteFile, getEdit, getFile, getLegacyEdit, getLegacyTraces, getTraces, loadModelPrefs, loadSettings, putEdit, putFile, putTraces, saveModelPrefs, saveSettings } from './store/persist';

/** Au-delà, l'édition à la main (fil de fer, survol, copies d'historique) devient lente : on prévient. */
const EDIT_SLOW_TRIS = 100000;

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

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<StlViewer | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [models, setModels] = useState<ModelState[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // mode édition (sommet / arête / triangle) du modèle sélectionné
  const [editId, setEditId] = useState<string | null>(null);
  const [editTool, setEditTool] = useState<EditTool>('vertex');
  const [canUndo, setCanUndo] = useState(false);
  const [selCount, setSelCount] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [selThrough, setSelThrough] = useState(true); // par défaut on prend tout, devant comme derrière
  const [plane, setPlane] = useState<CutPlane>({ offset: 0, angle: 90, tilt: 0, diag1: 0, diag2: 0, keep: 'right' });
  const [traceOn, setTraceOn] = useState(false); // trait de coupe affiché
  // axes généraux et plans ⟂ à chacun (cases à cocher)
  const [axisOn, setAxisOn] = useState<Record<'X' | 'Y' | 'Z', boolean>>({ X: true, Y: true, Z: true });
  const [worldPlaneOn, setWorldPlaneOn] = useState<Record<'X' | 'Y' | 'Z', boolean>>({ X: false, Y: false, Z: false });
  const [traceCounts, setTraceCounts] = useState<Record<string, number>>({}); // traits gardés par modèle
  const [genAxis, setGenAxis] = useState<TraceAxis>('Z');
  const [genStep, setGenStep] = useState(10);
  // tranches (découpe laser) du modèle sélectionné
  const [paperHeight, setPaperHeight] = useState(10); // hauteur réelle du modèle, cm
  const [thickness, setThickness] = useState(1); // épaisseur du matériau, mm
  const [hollow, setHollow] = useState(true);
  const [wall, setWall] = useState(10); // largeur de paroi des tranches creuses, mm
  // gaufre : deux familles de plans parallèles avec encoches
  const [waffleA, setWaffleA] = useState<'X' | 'Y' | 'Z'>('X');
  const [waffleB, setWaffleB] = useState<'X' | 'Y' | 'Z'>('Y');
  const [waffleStep, setWaffleStep] = useState(20); // mm entre deux plans
  const [preview, setPreview] = useState<{ id: string; triangles: number } | null>(null);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const [slicesRes, setSlicesRes] = useState<{ id: string; key: string; res: SlicesResult; name: string; opts: SliceOptions } | null>(null);
  const [status, setStatus] = useState('');
  const modelsRef = useRef(models);
  modelsRef.current = models;

  const say = (msg: string) => { setStatus(msg); window.setTimeout(() => setStatus(''), 5000); };

  /** Vrai une fois les modèles de la dernière session relus : avant, on ne sauvegarde pas (on écraserait la sauvegarde avec une liste vide). */
  const ready = useRef(false);
  useEffect(() => {
    const v = new StlViewer(host.current!, {
      onPick: setSelectedId,
      onEdit: (id, triangles, positions) => {
        setModels((ms) => ms.map((o) => (o.id === id ? { ...o, triangles } : o)));
        setCanUndo(v.canUndo);
        setSlicesRes(null); // le patron ne correspond plus au maillage
        const cur = modelsRef.current.find((o) => o.id === id);
        if (cur) putEdit(cur.name, { target: cur.target, positions: positions.slice() }).catch(() => say('Retouche non mémorisée.'));
      },
      onSelect: setSelCount,
      onHistory: (labels) => { setHistory(labels); setCanUndo(labels.length > 0); },
      onTraces: (id, traces) => {
        setTraceCounts((c) => ({ ...c, [id]: traces.length }));
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
          const buf = await getFile(m.id);
          if (!buf || cancelled) continue;
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

  // mode édition : suit la sélection, s'arrête si le modèle devient trop lourd ou disparaît
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
  useEffect(() => { viewer.current?.setEditTool(editTool); }, [editTool]);
  useEffect(() => { viewer.current?.setSelectThrough(selThrough); }, [selThrough]);
  useEffect(() => { viewer.current?.setPlane(plane); }, [plane]);
  useEffect(() => { for (const a of ['X', 'Y', 'Z'] as const) viewer.current?.setAxisVisible(a, axisOn[a]); }, [axisOn]);
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    for (const a of ['X', 'Y', 'Z'] as const) v.setWorldPlane(a, worldPlaneOn[a]);
    v.sync(modelsRef.current, selectedId); // place les plans sur le modèle et trace la coupe
  }, [worldPlaneOn, selectedId]);
  useEffect(() => { viewer.current?.traceSection(traceOn); }, [traceOn]);
  useEffect(() => { if (editTool !== 'plane') setTraceOn(false); }, [editTool]);
  // Ctrl+Z annule la dernière retouche ; Suppr efface la sélection au cadre ; Échap quitte le mode édition
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = viewer.current;
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && (e.target as HTMLInputElement).type === 'text';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && v?.editing) { e.preventDefault(); v.undoEdit(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && v?.editing && v.pendingDelete) { e.preventDefault(); v.deleteSelection(); }
      if (e.key === 'Escape') {
        setEditId(null);
        // un aperçu de tranches est affiché : on revient au modèle
        const p = previewRef.current;
        if (p && v) { v.clearPreview(p.id); setPreview(null); setSlicesRes(null); }
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
        applied.current.set(m.id, geoKey(m));
        setModels((ms) => ms.map((o) => (o.id === m.id ? { ...o, triangles: n } : o)));
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
  const leavePreview = (m: ModelState) => { viewer.current?.clearPreview(m.id); setPreview(null); setSlicesRes(null); };
  const openSlices = () => {
    if (!slicesRes) return;
    const html = slicesHtml(slicesRes.res, A4, slicesRes.name, slicesRes.opts);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank');
  };
  const slicesValid = slicesRes && selectedId === slicesRes.id && models.some((m) => m.id === slicesRes.id && geoKey(m) === slicesRes.key);

  /** Télécharge le maillage affiché (réduit ou non) en .stl binaire. */
  const download = (m: ModelState) => {
    const data = viewer.current?.exportStl(m.id);
    if (!data) return;
    const url = URL.createObjectURL(new Blob([data.buffer as ArrayBuffer], { type: 'model/stl' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${m.name}-${m.triangles}tri.stl` });
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Remet sur un modèle tout ce qui a été fait sous son nom : retouches à la main, réduction et traits. Renvoie le nombre de triangles affichés.
   * Les nouveaux réglages sont enregistrés automatiquement (voir les effets plus bas), donc le même fichier redéposé revient où on l'avait laissé.
   */
  const restoreWork = async (v: StlViewer, m: ModelState): Promise<number> => {
    let ed = await getEdit(m.name).catch(() => undefined);
    if (!ed) { ed = await getLegacyEdit(m.id).catch(() => undefined); if (ed) void putEdit(m.name, ed); } // migration de l'ancien format
    if (ed) v.setOverride(m.id, ed.target, ed.positions);
    let tr = await getTraces(m.name).catch(() => undefined);
    if (!tr) { tr = await getLegacyTraces(m.id).catch(() => undefined); if (tr?.length) void putTraces(m.name, tr); }
    if (tr?.length) { v.setTraces(m.id, tr); setTraceCounts((c) => ({ ...c, [m.id]: tr.length })); }
    applied.current.set(m.id, geoKey(m));
    return ed || m.target ? v.rebuild(m.id, m.target) : m.triangles;
  };

  /** Charge des fichiers .stl et les range côte à côte, à droite des modèles déjà là. */
  const addFiles = async (files: FileList | File[]) => {
    const stl = [...files].filter((f) => /\.stl$/i.test(f.name));
    if (!stl.length) { say('Dépose un fichier .stl.'); return; }
    const items: { name: string; buffer: ArrayBuffer }[] = [];
    for (const f of stl) items.push({ name: f.name.replace(/\.stl$/i, ''), buffer: await f.arrayBuffer() });
    await addBuffers(items);
  };
  /** Ajoute des modèles à partir d'octets STL (fichiers déposés ou enregistrements rechargés). */
  const addBuffers = async (items: { name: string; buffer: ArrayBuffer }[]) => {
    const v = viewer.current;
    if (!v) return;
    const first = modelsRef.current.length === 0;
    let edge = modelsRef.current.reduce((m, o) => Math.max(m, o.pos[0] + (o.width * o.scale) / 2), -Infinity);
    const added: ModelState[] = [];
    for (const { name, buffer } of items) {
      try {
        const id = newId();
        const probe = v.load(id, name, buffer, 0);
        putFile(id, buffer).catch(() => say('Fichier non mémorisé : il faudra le redéposer la prochaine fois.'));
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

  const update = (id: string, patch: Partial<ModelState>) => setModels((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const remove = (id: string) => { applied.current.delete(id); void deleteFile(id); setModels((ms) => ms.filter((m) => m.id !== id)); setSelectedId((s) => (s === id ? null : s)); };
  const selected = models.find((m) => m.id === selectedId) ?? null;

  return (
    <div
      className="flex h-full w-full overflow-hidden bg-stone-100 text-stone-800"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files); }}
    >
      <aside className="flex h-full w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-stone-200 bg-stone-50 p-4">
        <header>
          <h1 className="text-base font-semibold text-emerald-900">Visionneuse STL</h1>
          <p className="text-xs text-stone-500">Dépose un ou plusieurs fichiers .stl dans la fenêtre.</p>
        </header>

        <div>
          <button onClick={() => fileRef.current?.click()} className="w-full rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-800">
            Ouvrir un .stl…
          </button>
          <input ref={fileRef} type="file" accept=".stl" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
          {status && <p className="mt-1 text-xs text-stone-600">{status}</p>}
        </div>

        <section>
          <h2 className="mb-2 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">Modèles</h2>
          {models.length === 0 ? (
            <p className="text-xs text-stone-500">Aucun modèle.</p>
          ) : (
            <ul className="space-y-1">
              {models.map((m) => (
                <li key={m.id} className={`flex items-center rounded-md ${m.id === selectedId ? 'bg-emerald-100 text-emerald-900' : 'hover:bg-stone-100'}`}>
                  <button onClick={() => setSelectedId(m.id === selectedId ? null : m.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm">
                    <span className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ background: m.color }} />
                    <span className="flex-1 truncate">{m.name}</span>
                    <span className="text-[10px] text-stone-400">{m.triangles.toLocaleString('fr-FR')} tri</span>
                  </button>
                  <button onClick={() => remove(m.id)} title={`Retirer « ${m.name} »`} className="mr-1 rounded px-1.5 py-0.5 text-sm text-stone-400 hover:bg-rose-100 hover:text-rose-700">×</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {selected && (
          <section className="space-y-3 rounded-lg border border-stone-200 bg-white/60 p-3">
            {preview?.id === selected.id && (
              <button onClick={() => leavePreview(selected)} className="w-full rounded-md bg-amber-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-amber-700" title="L'aperçu des tranches remplace le modèle à l'écran ; ce bouton le retire">
                Annuler l'aperçu des tranches : revenir au modèle (Échap)
              </button>
            )}
            <h2 className="text-[11px] font-semibold tracking-wide text-emerald-800 uppercase">Maillage</h2>
            <p className="text-xs text-stone-600">
              <b className="tabular-nums">{selected.triangles.toLocaleString('fr-FR')}</b> triangles affichés
              {selected.triangles !== selected.original && <> · {selected.original.toLocaleString('fr-FR')} à l'origine</>}
            </p>
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
                <button key={n} onClick={() => update(selected.id, { target: n })} className={`rounded border px-1.5 py-0.5 text-[11px] ${selected.target === n ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-stone-300 bg-white hover:bg-stone-100'}`}>
                  {n.toLocaleString('fr-FR')}
                </button>
              ))}
              <button onClick={() => update(selected.id, { target: 0 })} className={`rounded border px-1.5 py-0.5 text-[11px] ${selected.target === 0 ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-stone-300 bg-white hover:bg-stone-100'}`}>
                Original
              </button>
            </div>
            <button onClick={() => download(selected)} className="w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-xs hover:bg-stone-100" title="Enregistre le maillage tel qu'affiché, en STL binaire">
              Télécharger ce .stl ({selected.triangles.toLocaleString('fr-FR')} triangles)
            </button>

            <h2 className="pt-1 text-[11px] font-semibold tracking-wide text-emerald-800 uppercase">Édition à la main</h2>
            {selected.triangles > EDIT_SLOW_TRIS && (
              <p className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">{selected.triangles.toLocaleString('fr-FR')} triangles : l'édition reste possible mais devient lente (quelques secondes par action).</p>
            )}
            {(
              <>
                <button
                  onClick={() => setEditId(editId === selected.id ? null : selected.id)}
                  className={`w-full rounded-md border px-2 py-1.5 text-xs font-medium ${editId === selected.id ? 'border-rose-500 bg-rose-500 text-white hover:bg-rose-600' : 'border-stone-300 bg-white hover:bg-stone-100'}`}
                >
                  {editId === selected.id ? 'Quitter le mode édition (Échap)' : 'Mode édition'}
                </button>
                {editId === selected.id && (
                  <div className="space-y-2 rounded border border-rose-200 bg-rose-50 p-2">
                    <div className="flex flex-wrap gap-1">
                      {TOOLS.map((t) => (
                        <button key={t.id} onClick={() => setEditTool(t.id)} className={`flex-1 basis-[30%] rounded border px-1.5 py-1 text-[11px] ${editTool === t.id ? 'border-rose-500 bg-white font-semibold text-rose-700' : 'border-rose-200 bg-white/60 hover:bg-white'}`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-stone-600">{TOOLS.find((t) => t.id === editTool)!.help}{editTool !== 'select' && editTool !== 'plane' && ' Ce qui est en rouge sous la souris disparaît au clic.'}</p>
                    {editTool === 'select' && (
                      <>
                        <label className="flex items-center gap-2 text-[11px] text-stone-600">
                          <input type="checkbox" checked={selThrough} onChange={(e) => setSelThrough(e.target.checked)} className="accent-rose-600" />
                          Prendre aussi les faces cachées : tout ce qui est dans le polygone, devant comme derrière (décoché : seulement ce qu'on voit)
                        </label>
                        <button onClick={() => viewer.current?.deleteSelection()} disabled={!selCount} className="w-full rounded-md bg-rose-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-rose-700 disabled:opacity-40">
                          Supprimer la sélection{selCount ? ` (${selCount} triangle${selCount > 1 ? 's' : ''}, Suppr)` : ''}
                        </button>
                      </>
                    )}
                    {editTool === 'plane' && (
                      <>
                        <Slider label="Position du plan (le long de sa normale)" value={Math.round(plane.offset * 100)} min={-120} max={120} step={1} onChange={(v) => setPlane({ ...plane, offset: v / 100 })} />
                        <Slider label="Orientation du plan (autour de la verticale)" value={plane.angle} min={-180} max={180} step={1} unit="°" onChange={(v) => setPlane({ ...plane, angle: v })} />
                        <Slider label="Inclinaison (0 = vertical, ±90 = horizontal)" value={plane.tilt} min={-90} max={90} step={1} unit="°" onChange={(v) => setPlane({ ...plane, tilt: v })} />
                        <Slider label="Rotation autour de la diagonale 1" value={plane.diag1} min={-90} max={90} step={1} unit="°" onChange={(v) => setPlane({ ...plane, diag1: v })} />
                        <Slider label="Rotation autour de la diagonale 2" value={plane.diag2} min={-90} max={90} step={1} unit="°" onChange={(v) => setPlane({ ...plane, diag2: v })} />
                        <button onClick={() => setPlane({ ...plane, angle: 90, tilt: 0, diag1: 0, diag2: 0 })} className="w-full rounded border border-stone-300 bg-white px-1.5 py-1 text-[11px] hover:bg-stone-100">
                          Remettre le plan droit
                        </button>
                        <button onClick={() => setPlane({ ...plane, keep: plane.keep === 'right' ? 'left' : 'right' })} className="w-full rounded border border-stone-300 bg-white px-1.5 py-1 text-[11px] hover:bg-stone-100">
                          Inverser le côté gardé (vert ↔ rouge)
                        </button>
                        <button onClick={() => viewer.current?.deleteSelection()} disabled={!selCount} className="w-full rounded-md bg-rose-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-rose-700 disabled:opacity-40">
                          Supprimer le côté rouge{selCount ? ` (${selCount} triangle${selCount > 1 ? 's' : ''}, Suppr)` : ''}
                        </button>
                        <button onClick={() => { viewer.current?.mirrorAcrossPlane(); setEditTool('vertex'); }} className="w-full rounded-md bg-emerald-700 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-800" title="Supprime le rouge, ramène le bord de coupe sur le plan, puis recopie le vert en miroir de l'autre côté">
                          Symétriser : garder le vert, le copier de l'autre côté
                        </button>
                        <button onClick={() => setTraceOn(!traceOn)} className={`w-full rounded-md border px-2 py-1 text-[11px] ${traceOn ? 'border-red-500 bg-red-50 font-semibold text-red-700' : 'border-stone-300 bg-white hover:bg-stone-100'}`} title="Trait rouge là où le plan coupe le modèle ; les contours sont fermés, les trous pontés par une courbe lissée">
                          {traceOn ? 'Effacer le trait de coupe' : 'Tracer la coupe'}
                        </button>
                        <button onClick={() => viewer.current?.keepTrace()} disabled={!traceOn} className="w-full rounded border border-stone-300 bg-white px-1.5 py-1 text-[11px] hover:bg-stone-100 disabled:opacity-40" title="Copie le trait courant sur le modèle : il reste affiché (même hors édition), il est enregistré, et tu peux en tracer un autre">
                          Garder ce trait
                        </button>
                        <div className="space-y-1 rounded border border-red-200 bg-white/70 p-2">
                          <div className="flex flex-wrap items-center gap-1 text-[11px] text-stone-600">
                            <span>Autour de l'axe</span>
                            {(['X', 'Y', 'Z', 'D1', 'D2'] as const).map((a) => (
                              <button key={a} onClick={() => setGenAxis(a)} className={`rounded border px-2 py-0.5 ${genAxis === a ? 'border-red-500 bg-white font-semibold text-red-700' : 'border-stone-300 bg-white hover:bg-stone-100'}`}>{a === 'D1' ? 'Diag. 1' : a === 'D2' ? 'Diag. 2' : a}</button>
                            ))}
                          </div>
                          <p className="text-[10px] text-stone-400">
                            {genAxis === 'Z' ? 'Vertical, par le centre du modèle.' : genAxis === 'X' ? 'Gauche ↔ droite, par le centre du modèle.' : genAxis === 'Y' ? 'Avant ↔ arrière, par le centre du modèle.' : `Diagonale ${genAxis === 'D1' ? '1' : '2'} du plan courant, par son centre : le premier trait est le plan lui-même.`}
                          </p>
                          <Slider label="Un trait tous les" value={genStep} min={5} max={45} step={5} unit="°" onChange={setGenStep} />
                          <button onClick={() => viewer.current?.generateTraces(genAxis, genStep)} className="w-full rounded-md bg-red-700 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-800" title="Fait tourner un plan autour de l'axe choisi, en gardant un trait de coupe à chaque pas">
                            Générer les traits ({Math.ceil(180 / genStep)} plans)
                          </button>
                          {(traceCounts[selected.id] ?? 0) > 0 && (
                            <button onClick={() => viewer.current?.clearTraces(selected.id, true)} className="w-full rounded border border-stone-300 bg-white px-1.5 py-1 text-[11px] hover:bg-stone-100">
                              Effacer tous les traits ({traceCounts[selected.id]})
                            </button>
                          )}
                        </div>
                        {(traceCounts[selected.id] ?? 0) > 0 && (
                          <ul className="max-h-32 space-y-0.5 overflow-y-auto rounded border border-red-200 bg-white/70 p-1">
                            {Array.from({ length: traceCounts[selected.id] }, (_, i) => (
                              <li key={i} className="flex items-center gap-1 px-1 text-[11px] text-stone-700">
                                <span className="h-2 w-4 shrink-0 border-t-2 border-red-800" />
                                <span className="flex-1">Trait {i + 1}</span>
                                <button onClick={() => viewer.current?.removeTrace(selected.id, i)} className="rounded px-1.5 py-0.5 text-sm text-stone-400 hover:bg-rose-100 hover:text-rose-700" title="Supprimer ce trait">×</button>
                              </li>
                            ))}
                          </ul>
                        )}                      </>
                    )}
                    {history.length > 0 && (
                      <div className="rounded border border-rose-200 bg-white/70">
                        <p className="px-2 pt-1 text-[10px] font-semibold tracking-wide text-rose-700 uppercase">Actions faites</p>
                        <ul className="max-h-40 overflow-y-auto">
                          {history.map((label, i) => (
                            <li key={i} className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-stone-700">
                              <span className="w-5 shrink-0 text-right text-stone-400">{i + 1}.</span>
                              <span className="flex-1 truncate">{label}</span>
                              <button onClick={() => viewer.current?.undoTo(i)} className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[10px] hover:bg-rose-100 hover:text-rose-700" title={i === history.length - 1 ? 'Annule cette action' : 'Annule cette action et toutes celles qui la suivent'}>
                                Annuler
                              </button>
                            </li>
                          )).reverse()}
                        </ul>
                      </div>
                    )}
                    <div className="flex gap-1">
                      <button onClick={() => viewer.current?.undoEdit()} disabled={!canUndo} className="flex-1 rounded border border-stone-300 bg-white px-2 py-1 text-[11px] hover:bg-stone-100 disabled:opacity-40">
                        Annuler la dernière (Ctrl+Z)
                      </button>
                      <button onClick={() => resetEdit(selected)} className="flex-1 rounded border border-stone-300 bg-white px-2 py-1 text-[11px] hover:bg-stone-100" title="Oublie toutes les retouches de ce modèle">
                        Tout rétablir
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            <h2 className="pt-1 text-[11px] font-semibold tracking-wide text-emerald-800 uppercase">Tranches (découpe laser)</h2>
            <p className="text-[11px] text-stone-500">Une tranche par trait gardé : le contour de la coupe à l'échelle réelle, avec une épaisseur. Les tranches peuvent se croiser. Planches SVG à envoyer à la découpeuse.</p>
            <Slider label="Hauteur réelle du modèle" value={paperHeight} min={3} max={100} step={0.5} unit=" cm" onChange={setPaperHeight} />
            <Slider label="Épaisseur du matériau" value={thickness} min={1} max={30} step={0.5} unit=" mm" onChange={setThickness} />
            <label className="flex items-center gap-2 text-xs text-stone-600">
              <input type="checkbox" checked={hollow} onChange={(e) => setHollow(e.target.checked)} className="accent-emerald-700" />
              Tranches creuses (un cadre, l'intérieur est évidé)
            </label>
            {hollow && <Slider label="Largeur de la paroi" value={wall} min={2} max={40} step={0.5} unit=" mm" onChange={setWall} />}
            <button onClick={() => makeSlices(selected)} disabled={!(traceCounts[selected.id] ?? 0)} className="w-full rounded-md bg-emerald-700 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40">
              Générer les tranches{(traceCounts[selected.id] ?? 0) ? ` (${traceCounts[selected.id]} traits)` : ' (aucun trait gardé)'}
            </button>
            <div className="space-y-2 rounded border border-emerald-200 bg-white/70 p-2">
              <p className="text-[11px] font-semibold text-emerald-800">Gaufre automatique</p>
              <p className="text-[11px] text-stone-500">Des coupes parallèles dans deux directions, et à chaque croisement une encoche à mi-bois : les A s'emboîtent par un côté, les B par l'autre. Largeur des encoches = épaisseur du matériau.</p>
              {([['A', waffleA, setWaffleA], ['B', waffleB, setWaffleB]] as const).map(([name, val, set]) => (
                <div key={name} className="flex items-center gap-1 text-[11px] text-stone-600">
                  <span className="w-16">Direction {name}</span>
                  {(['X', 'Y', 'Z'] as const).map((a) => (
                    <button key={a} onClick={() => set(a)} className={`rounded border px-2 py-0.5 ${val === a ? 'border-emerald-600 bg-emerald-50 font-semibold text-emerald-900' : 'border-stone-300 bg-white hover:bg-stone-100'}`}>{a}</button>
                  ))}
                </div>
              ))}
              <Slider label="Un plan tous les" value={waffleStep} min={5} max={100} step={1} unit=" mm" onChange={setWaffleStep} />
              <button onClick={() => makeWaffle(selected)} className="w-full rounded-md bg-emerald-700 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-800">
                Générer la gaufre (encoches comprises)
              </button>
            </div>
            {preview?.id === selected.id && (
              <div className="space-y-1 rounded border border-amber-300 bg-amber-50 p-2">
                <p className="text-[11px] text-amber-900">Aperçu des tranches affiché à la place du modèle ({preview.triangles.toLocaleString('fr-FR')} triangles). Le modèle n'est pas modifié.</p>
                <button onClick={() => leavePreview(selected)} className="w-full rounded-md bg-amber-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-amber-700">
                  Annuler : revenir au modèle (Échap)
                </button>
              </div>
            )}
            {slicesValid && slicesRes && (
              <div className="space-y-1 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
                <p>
                  <b>{slicesRes.res.slices.length}</b> tranches · <b>{slicesRes.res.pages.length}</b> planche{slicesRes.res.pages.length > 1 ? 's' : ''} A4
                  {slicesRes.opts.notches && <> · <b>{slicesRes.res.joints}</b> encoches</>}
                  {slicesRes.res.slices.some((s) => s.bridged) && <> · trous du maillage pontés</>}
                </p>
                {slicesRes.res.tooBig.length > 0 && (
                  <p className="text-amber-800">{slicesRes.res.tooBig.length} tranche{slicesRes.res.tooBig.length > 1 ? 's' : ''} plus grande{slicesRes.res.tooBig.length > 1 ? 's' : ''} qu'une planche A4 (T{slicesRes.res.tooBig.map((i) => i + 1).join(', T')}) : baisse la hauteur réelle, ou découpe-les depuis le SVG à ta taille.</p>
                )}
                <button onClick={openSlices} className="mt-1 w-full rounded-md border border-emerald-600 bg-white px-2 py-1 text-xs hover:bg-emerald-100">
                  Ouvrir les planches (SVG pour le laser)
                </button>
              </div>
            )}

            <h2 className="pt-1 text-[11px] font-semibold tracking-wide text-emerald-800 uppercase">Axes et plans</h2>
            <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 text-xs text-stone-600">
              <span />
              <span className="text-[10px] font-semibold tracking-wide text-stone-500 uppercase">Axe</span>
              <span className="text-[10px] font-semibold tracking-wide text-stone-500 uppercase">Plan</span>
              {(['X', 'Y', 'Z'] as const).map((a) => (
                <Fragment key={a}>
                  <span className="font-semibold" style={{ color: a === 'X' ? '#c73c39' : a === 'Y' ? '#2f8f58' : '#2f66c4' }}>{a}{a === 'Z' ? ' (hauteur)' : a === 'Y' ? ' (profondeur)' : ' (droite)'}</span>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={axisOn[a]} onChange={(e) => setAxisOn({ ...axisOn, [a]: e.target.checked })} className="accent-emerald-700" />
                    afficher
                  </label>
                  <label className="flex items-center gap-1" title={`Plan perpendiculaire à ${a}, par le centre du modèle, qui le coupe entièrement (ligne de coupe en rouge)`}>
                    <input type="checkbox" checked={worldPlaneOn[a]} onChange={(e) => setWorldPlaneOn({ ...worldPlaneOn, [a]: e.target.checked })} className="accent-emerald-700" />
                    activer
                  </label>
                </Fragment>
              ))}
            </div>

            <h2 className="pt-1 text-[11px] font-semibold tracking-wide text-emerald-800 uppercase">Orientation et affichage</h2>
            {(['X', 'Y', 'Z'] as const).map((a, i) => (
              <div key={a} className="space-y-1">
                <Slider label={a === 'X' ? 'Bascule avant / arrière (X)' : a === 'Y' ? 'Penche sur le côté (Y)' : 'Pivote à gauche / droite (Z)'} value={selected.rot[i]} min={-180} max={180} step={1} unit="°" onChange={(v) => { const rot = [...selected.rot] as Vec3; rot[i] = v; update(selected.id, { rot }); }} />
                <div className="flex gap-1">
                  {[-90, 90, 180].map((d) => (
                    <button key={d} onClick={() => { const rot = [...selected.rot] as Vec3; rot[i] = ((((rot[i] + d + 180) % 360) + 360) % 360) - 180; update(selected.id, { rot }); }} className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[11px] hover:bg-stone-100">
                      {d > 0 ? '+' : ''}{d}°
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={() => update(selected.id, { rot: [0, 0, 0] })} className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs hover:bg-stone-100">
              Remettre droit
            </button>
            {(['X', 'Y', 'Z'] as const).map((a, i) => (
              <Slider key={a} label={`Position ${a}${a === 'Z' ? ' (hauteur)' : a === 'Y' ? ' (profondeur)' : ' (droite)'}`} value={Math.round(selected.pos[i] * 100)} min={-500} max={500} step={1} onChange={(v) => { const pos = [...selected.pos] as Vec3; pos[i] = v / 100; update(selected.id, { pos }); }} />
            ))}
            <p className="text-[11px] text-stone-500">Le modèle se tourne et se déplace uniquement par ces curseurs, pas à la souris. La rotation compte pour les tranches, la gaufre, la hauteur réelle et le STL téléchargé. En mode édition, le plan et les axes sont ceux du modèle.</p>
            <Slider label="Taille à l'écran" value={Math.round(selected.scale * 100)} min={10} max={500} step={1} unit=" %" onChange={(v) => update(selected.id, { scale: v / 100 })} />
            <label className="flex items-center justify-between text-xs text-stone-600">
              Couleur
              <input type="color" value={selected.color} onChange={(e) => update(selected.id, { color: e.target.value })} className="h-7 w-12 cursor-pointer rounded border border-stone-200 bg-white" />
            </label>
          </section>
        )}

        <p className="mt-auto text-[11px] leading-snug text-stone-500">
          Clic gauche ou molette : tourner la vue · clic droit : déplacer · roulette : zoom · clic sur un modèle : le choisir.
        </p>
        {models.length > 0 && (
          <button onClick={() => viewer.current?.frame()} className="rounded-md border border-stone-300 px-2 py-1.5 text-xs text-stone-600 hover:bg-stone-100">
            Recadrer la vue
          </button>
        )}
      </aside>

      <main className="relative min-w-0 flex-1">
        <div ref={host} className="h-full w-full" />
        {models.length === 0 && !dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-stone-500">Dépose un fichier .stl ici</div>
        )}
        {dragging && (
          <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-xl border-2 border-dashed border-emerald-600 bg-emerald-50/70 text-base font-medium text-emerald-900">
            Lâche le fichier .stl
          </div>
        )}
      </main>
    </div>
  );
}
