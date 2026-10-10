import { useEffect, useMemo, useRef, useState } from 'react';
import { Btn, Hint } from '@/ui/kit';
import { Sheet2D } from '../ui/Sheet2D';
import { bounds, makeNest, NEST_DEFAULT, type NestParams, nestSheets, sheetsPreviewSvg, moveWithGroup, extents, fitHole, newHole, saveHistory, saveScene, loadScene, type FaceAxis, type Hole, type Plank, type PlankScene, type Vec3 } from './model';
import { DocModal, DOCS } from './DocModal';
import { PiSimulator } from './PiSimulator';
import { shootCamera } from './three/cameraShot';
import { SchemaPanel } from './SchemaPanel';
import { ContextMenu } from './components/ContextMenu';
import { CutPanel } from './components/CutPanel';
import { HistoryList } from './components/HistoryList';
import { HoleWindow } from './components/HoleWindow';
import { LeftPanel, type CutCfg } from './components/LeftPanel';
import { PiecesList } from './components/PiecesList';
import { RightPanel } from './components/RightPanel';
import { useHistory } from './hooks/useHistory';
import { usePersistentFlag } from './hooks/usePersistentFlag';
import { useSceneSync } from './hooks/useSceneSync';
import { useThreeView } from './hooks/useThreeView';
import { loadPiModel, piModel } from './three/piModel';
import { AXIS_I, type Cut, type View } from './three/types';

export default function Planks() {
  const [sc, setSc] = useState<PlankScene>(() => loadScene());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [extra, setExtra] = useState<Set<string>>(new Set()); // sélection multiple (Ctrl + clic) en plus de la plaque principale
  const [hover, setHover] = useState<{ plank?: string; group?: string } | null>(null); // survol dans le volet « Pièces » : surbrillance dans la 3D
  const [cutCfg, setCutCfg] = useState<CutCfg>(() => { try { const d = JSON.parse(localStorage.getItem('plaques-decoupe') ?? ''); if (d && typeof d.W === 'number') return d; } catch { /* rien */ } return { W: 410, H: 400, gap: 5 }; });
  useEffect(() => { try { localStorage.setItem('plaques-decoupe', JSON.stringify(cutCfg)); } catch { /* rien */ } }, [cutCfg]);
  const [cutView, setCutView] = useState(false); // aperçu des planches à la place de la 3D
  const sheets = useMemo(() => nestSheets(sc, cutCfg.W, cutCfg.H, cutCfg.gap), [sc, cutCfg]);
  const preview = useMemo(() => sheetsPreviewSvg(sheets, cutCfg.W, cutCfg.H), [sheets, cutCfg]);
  const [pull, setPull] = useState<{ plankId: string; axis: FaceAxis; sign: 1 | -1 } | null>(null); // face double-cliquée, à tirer
  const pullRef = useRef(pull);
  pullRef.current = pull;
  const [leftOpen, setLeftOpen] = usePersistentFlag('plaques-menu-gauche'); // panneau de gauche replié ou non
  const [rightOpen, setRightOpen] = usePersistentFlag('plaques-menu-droit'); // panneau de droite (« Pièces » / « Historique ») replié ou non
  const [piOpen, setPiOpen] = useState(false); // simulateur de la page web du Pi (Python exécuté dans le navigateur)
  const [schemaOn, setSchemaOn] = usePersistentFlag('plaques-schema'); // ouvert par défaut // schéma électrique à côté de la 3D
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
  const [drawer, setDrawer] = useState<'pieces' | 'history' | null>(() => { try { return (localStorage.getItem('plaques-volet') as 'pieces' | 'history' | null) ?? 'pieces'; } catch { return 'pieces'; } }); // volet ouvert à droite
  useEffect(() => { try { localStorage.setItem('plaques-volet', drawer ?? ''); } catch { /* rien */ } }, [drawer]);
  const [ctx, setCtx] = useState<{ x: number; y: number; plankId: string; local: [number, number] } | null>(null); // menu du clic droit
  const [holeEdit, setHoleEdit] = useState<{ plankId: string; holeId: string; fresh?: boolean } | null>(null); // fenêtre de réglage d'un trou ; `fresh` : trou qui vient d'être créé, ses réglages se fondent dans « Trou ajouté »
  const holeHover = null as { plankId: string; holeId: string } | null; // plus de section « Trous » : plus de trou survolé // trou survolé dans la section « Trous »
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<View | null>(null);
  const scRef = useRef(sc);
  /** Flux vidéo du simulateur du Pi : la scène 3D vue depuis l'objectif de la caméra 1 (dans le nid, en infrarouge) ou 2 (dehors). `null` si la carte n'existe pas. */
  const shoot = (num: number): string | null => {
    const v = view.current;
    const p = scRef.current.planks.find((x) => x.special === 'camera' && (num === 0 ? x.name === 'Caméra' : x.name === 'Caméra 2'));
    const m = p && v?.meshes.get(p.id);
    return v && m ? shootCamera(v, m, num === 0 ? 'CAM1 (nid, IR)' : 'CAM2 (entrée)', { gray: num === 0, fov: num === 0 ? 80 : 66, level: num === 1 }) : null;
  };
  scRef.current = sc;
  const selRef = useRef(selectedId);
  selRef.current = selectedId;
  const { history, backLabel, histN, commit, pushEntry, undoTo, back, clearHistory } = useHistory(scRef, setSc, (scene) => {
    if (selRef.current && !scene.planks.some((p) => p.id === selRef.current)) setSelectedId(null);
    setHoleEdit(null);
  });
  useEffect(() => { saveScene(sc); saveHistory(history.current); }, [sc]); // la scène et l'historique sont enregistrés ensemble
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

  useThreeView({ host, view, scRef, selRef, cutRef, pullRef, pickRef, setSc, setCut, setCtx, setSelectedId, setHover, pushEntry });
  useSceneSync(view, { sc, selectedId, extra, hover, groupSel, holeEdit, holeHover, pull, cut, hidden, piReady });

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
  useEffect(() => { // le groupe « Schéma électronique » est déplié d'office : on voit tout de suite le bouton qui ouvre le document
    const docs = Object.entries(sc.groupNames ?? {}).filter(([, nm]) => nm === 'Schéma électronique').map(([g]) => g);
    if (docs.some((g) => !openGroups.has(g))) setOpenGroups((s) => new Set([...s, ...docs]));
  }, [sc.groupNames]); // eslint-disable-line react-hooks/exhaustive-deps
  const addHole = (plankId: string, local: [number, number], openWindow = true) => { const pl = scRef.current.planks.find((p) => p.id === plankId); const h = pl ? fitHole(pl, newHole(local[0], local[1])) : newHole(local[0], local[1]); commit('Trou ajouté', (s) => ({ ...s, planks: s.planks.map((p) => (p.id === plankId ? { ...p, holes: [...p.holes, h] } : p)) })); if (openWindow) setHoleEdit({ plankId, holeId: h.id, fresh: true }); setCtx(null); };
  const setHole = (p: Plank, id: string, patch: Partial<Hole>) => {
    const fresh = !!holeEdit?.fresh && holeEdit.holeId === id; // un trou tout neuf : un seul Retour l'enlève avec ses réglages
    commit(fresh ? 'Trou ajouté' : 'Réglage du trou', (s) => ({ ...s, planks: s.planks.map((x) => (x.id === p.id ? { ...x, holes: x.holes.map((h) => (h.id === id ? fitHole(x, { ...h, ...patch }) : h)) } : x)) }), fresh);
  };
  /** Bouton magique : perce les fentes partout où la plaque en traverse d'autres. */
  const removeHole = (p: Plank, id: string) => { update(p.id, { holes: p.holes.filter((h) => h.id !== id) }, 'Trou retiré'); setHoleEdit(null); };
  const editingHole = holeEdit ? sc.planks.find((p) => p.id === holeEdit.plankId)?.holes.find((h) => h.id === holeEdit.holeId) : undefined;
  const editingPlank = holeEdit ? sc.planks.find((p) => p.id === holeEdit.plankId) : undefined;
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
  /** Bascule le crénelage d'un bord : on / off ; les crans de ce bord sont régénérés ou retirés. */
  /** Nouveaux réglages (dents, phase) : appliqués aux bords déjà crénelés. */


  return (
    <div className="flex h-full w-full overflow-hidden bg-stone-100 text-stone-800">
      <LeftPanel open={leftOpen} setOpen={setLeftOpen} sc={sc} commit={commit} nest={nest} setNest={setNest} addNest={addNest} cutCfg={cutCfg} setCutCfg={setCutCfg} cutView={cutView} setCutView={setCutView} sheets={sheets} />

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
          <button onClick={() => setPiOpen(true)} title="Page web du Pi simulée : le vrai programme Python tourne dans le navigateur" className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-100">
            <span aria-hidden>🐍</span> Pi
          </button>
          <button onClick={() => setCut((c) => (c.on ? { ...c, on: false } : { ...c, on: true, pos: midOf(c.axis) }))} aria-pressed={cut.on} title="Plan de coupe : l'espace est coupé en deux, un côté devient invisible" className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-colors ${cut.on ? 'bg-sky-100 text-sky-900' : 'text-stone-800 hover:bg-stone-100'}`}>
            <span aria-hidden>✂</span> Coupe
          </button>
        </div>
        {cut.on && <CutPanel cut={cut} setCut={setCut} sc={sc} midOf={midOf} />}
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

        {ctx && <ContextMenu ctx={ctx} sc={sc} hidden={hidden} groupSel={groupSel} addHole={addHole} toggleHidden={toggleHidden} update={update} setGroupSel={setGroupSel} close={() => setCtx(null)} />}
        {editingHole && editingPlank && <HoleWindow plank={editingPlank} hole={editingHole} onChange={(patch) => setHole(editingPlank, editingHole.id, patch)} onClose={() => setHoleEdit(null)} onRemove={() => removeHole(editingPlank, editingHole.id)} />}
      </main>

      {piOpen && <PiSimulator onClose={() => setPiOpen(false)} shoot={shoot} />}
      {docOpen && DOCS.find((d) => d.id === docOpen) && <DocModal doc={DOCS.find((d) => d.id === docOpen)!} onClose={() => setDocOpen(null)} />}
      {schemaOn && <SchemaPanel hover={hover} planks={sc.planks} onHover={(id) => setHover(id ? { plank: id } : null)} />}
      <RightPanel
        open={rightOpen} setOpen={setRightOpen} drawer={drawer} setDrawer={setDrawer}
        piecesCount={sc.planks.length} historyCount={history.current.length}
        pieces={sc.planks.length ? <PiecesList sc={sc} selectedId={selectedId} selected={selected} groupSel={groupSel} extra={extra} hidden={hidden} openGroups={openGroups} setOpenGroups={setOpenGroups} dropOn={dropOn} setDropOn={setDropOn} setHover={setHover} confirmAll={confirmAll} docOpen={docOpen} setDocOpen={setDocOpen} setSelectedId={setSelectedId} setGroupSel={setGroupSel} setExtra={setExtra} pick={pick} update={update} commit={commit} toggleHidden={toggleHidden} duplicate={duplicate} remove={remove} duplicateGroup={duplicateGroup} removeGroup={removeGroup} removeAll={removeAll} dropPlank={dropPlank} /> : <Hint>Aucune plaque.</Hint>}
        history={<HistoryList entries={history.current} histN={histN} undoTo={undoTo} clearHistory={clearHistory} />}
      />
    </div>
  );
}
