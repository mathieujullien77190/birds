import { useEffect, useMemo, useRef, useState } from 'react';
import { Hint } from '@/ui';
import { useIsMobile, usePersistentFlag } from '@/hooks';
import { randomId } from '@/lib';
import { DocModal, DOCS } from '@/features/docs';
import { LaserMachineModal, LaserPreview, useLaser } from '@/features/laser';
import { SchemaPanel } from '@/features/schema';
import { makeNest, moveWithGroup, setAirPlug, setWinterCassette, winterState, extents, saveHistory, saveScene, loadScene, type Plank, type PlankScene, type Vec3 } from '@/birdhouse/model';
import { PiSimulator } from '@/birdhouse/PiSimulator';
import { loadPiModel, piModel } from '@/birdhouse/three/piModel';
import type { View } from '@/birdhouse/three/types';
import { ContextMenu, CutPanel, HistoryList, LeftPanel, MobileBar, PartsSheet, PiecesList, PullBar, RightPanel, SelectionBar, UndoBar, ViewToolbar } from '../components';
import { HIDDEN_AT_CREATION, STORAGE } from '../constants';
import { useCutPlane, useDrawer, useHiddenPlanks, useHistory, useKeyboardShortcuts, useDayNight, useNestParams, usePiCameraShot, useSceneSync, useThreeView, useFanSpeed, useIrBeams } from '../hooks';
import type { ContextMenuState, Hover, PullState } from '../types';

/** Écran du nichoir : vue 3D (Three.js), panneaux gauche / droite, schéma, documents, simulateur du Pi. Garde la scène, la sélection et l'historique. */
export default function Planks() {
  const mobile = useIsMobile();
  const firstMobile = useRef(mobile);
  useEffect(() => { if (mobile !== firstMobile.current) window.location.reload(); }, [mobile]); // la vue 3D est liée à son élément : changer de disposition (rotation du téléphone, fenêtre redimensionnée) recharge la page, tout est enregistré
  const [mSettings, setMSettings] = useState(false); // téléphone : feuille des réglages
  const [mParts, setMParts] = useState(false); // téléphone : feuille « Pièces » (afficher / cacher)
  const [sc, setSc] = useState<PlankScene>(() => loadScene());
  const scRef = useRef(sc);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [extra, setExtra] = useState<Set<string>>(new Set()); // sélection multiple (Ctrl + clic) en plus de la plaque principale
  const [hover, setHover] = useState<Hover | null>(null); // survol dans le volet « Pièces » : surbrillance dans la 3D
  const { cutCfg, setCutCfg, cutView, setCutView, sheets, preview, machine } = useLaser(sc);
  const [pull, setPull] = useState<PullState | null>(null); // face double-cliquée, à tirer
  const pullRef = useRef(pull);
  pullRef.current = pull;
  const [leftOpen, setLeftOpen] = usePersistentFlag(STORAGE.leftOpen); // panneau de gauche replié ou non
  const [rightOpen, setRightOpen] = usePersistentFlag(STORAGE.rightOpen); // panneau de droite (« Pièces » / « Historique ») replié ou non
  const [piOpen, setPiOpen] = useState(false); // simulateur de la page web du Pi (Python exécuté dans le navigateur) : fenêtre affichée
  const [piMounted, setPiMounted] = useState(false); // le simulateur reste monté une fois ouvert : fermer la fenêtre ne fait que la cacher, le Python continue (ventilateur, LED, batterie)
  const [night, setNight] = usePersistentFlag(STORAGE.night, false); // vue 3D de nuit (la clé n'est pas ouverte par défaut)
  const [schemaOn, setSchemaOn] = usePersistentFlag(STORAGE.schema); // ouvert par défaut ; schéma électrique à côté de la 3D
  const { cut, setCut, cutRef, midOf } = useCutPlane(scRef);
  const { hidden, setHidden, toggleHidden } = useHiddenPlanks(); // pièces cachées dans la 3D (œil du volet « Pièces »)
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
  const [drawer, setDrawer] = useDrawer(); // volet ouvert à droite
  const [ctx, setCtx] = useState<ContextMenuState | null>(null); // menu du clic droit
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<View | null>(null);
  const shoot = usePiCameraShot(view, scRef, night);
  scRef.current = sc;
  const selRef = useRef(selectedId);
  selRef.current = selectedId;
  const { history, backLabel, histN, commit, pushEntry, undoTo, back, clearHistory } = useHistory(scRef, setSc, (scene) => {
    if (selRef.current && !scene.planks.some((p) => p.id === selRef.current)) setSelectedId(null);
  });
  useEffect(() => { saveScene(sc); saveHistory(history.current); }, [sc]); // eslint-disable-line react-hooks/exhaustive-deps -- `history` est une ref (stable) : la scène et l'historique sont enregistrés ensemble, quand la scène change
  const backRef = useRef(back);
  backRef.current = back;
  const update = (id: string, patch: Partial<Plank>, label = 'Réglage de la plaque') => commit(label, (s) => ({ ...s, planks: s.planks.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const selected = sc.planks.find((p) => p.id === selectedId) ?? null;
  const wState = useMemo(() => winterState(sc), [sc]); // pièces d'hiver : cassette ventilateur / isolante, prise d'air ouverte / bouchée (état déduit des positions)
  const toggleCassette = () => { const w = wState.cassette === 'summer'; commit(w ? 'Cassette isolante posée' : 'Cassette ventilateur posée', (s) => setWinterCassette(s, w)); };
  const togglePlug = () => { const p = wState.plug === 'open'; commit(p ? "Prise d'air bouchée" : "Prise d'air ouverte", (s) => setAirPlug(s, p)); };
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const moveRef = useRef(moveWithGroup);
  moveRef.current = moveWithGroup;
  useKeyboardShortcuts({ back: backRef, commit: commitRef, selectedId: selRef, groupSel: groupSelRef }, {
    clearSelection: () => { setSelectedId(null); setGroupSel(null); },
    escape: () => { setCtx(null); setExtra(new Set()); setPull(null); },
  });

  useThreeView({ host, view, scRef, cutRef, pullRef, pickRef, setSc, setCut, setCtx, setSelectedId, setHover, pushEntry });
  useDayNight(view, night); // après useThreeView : la vue existe au montage
  const [fanPct, setFanPct] = useState(0); // vitesse du ventilateur lue dans le simulateur du Pi (le rotor de la 3D tourne)
  useFanSpeed(view, fanPct);
  const [leds, setLeds] = useState({ nid: false, ext: false }); // LED infrarouges allumées dans le simulateur du Pi (faisceaux visibles dans la 3D)
  useSceneSync(view, { sc, selectedId, extra, hover, groupSel, pull, cut, hidden, piReady });
  useIrBeams(view, sc, leds); // après useSceneSync : les meshes des cartes de LED existent

  // ----- actions -----
  const duplicate = (p: Plank) => { const c: Plank = { ...p, id: randomId(), name: p.name + ' bis', pos: [p.pos[0] + 30, p.pos[1], p.pos[2] + 30], notches: p.notches.map((n) => ({ ...n, id: randomId() })), holes: p.holes.map((h) => ({ ...h, id: randomId() })) }; commit('Plaque dupliquée', (s) => ({ ...s, planks: [...s.planks, c] })); setSelectedId(c.id); };
  const remove = (id: string) => { commit('Plaque supprimée', (s) => ({ ...s, planks: s.planks.filter((p) => p.id !== id) })); if (selectedId === id) setSelectedId(null); };
  const [nest, setNest] = useNestParams();
  const addNest = () => { const b = makeNest(nest, sc.t, sc.fit, sc.planks.length + 1); commit('Nichoir créé', (s) => ({ ...s, planks: [...s.planks, ...b.planks], groupNames: { ...(s.groupNames ?? {}), ...b.groupNames } })); setSelectedId(b.planks[0].id); setGroupSel(b.group); setOpenGroups((g) => new Set([...g, b.group])); setHidden((h) => new Set([...h, ...b.planks.filter((p) => HIDDEN_AT_CREATION.some((re) => re.test(p.name))).map((p) => p.id)])); /* l'isolant, les quatre barres du toit et le pan de toit en chêne sont cachés par défaut (l'œil de « Pièces » les affiche) */ };
  const autoNest = useRef(false);
  useEffect(() => { if (!autoNest.current && sc.planks.length === 0) { autoNest.current = true; addNest(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps -- au montage seulement : un nichoir est créé d'office si la scène chargée est vide
  /** Membres d'un groupe (boîte). */
  const groupMembers = (g: string) => sc.planks.filter((p) => p.group === g);
  /** Copie une boîte entière (nouveau groupe), décalée vers la droite de sa largeur + 20 mm. */
  const duplicateGroup = (g: string) => {
    const ms = groupMembers(g); if (!ms.length) return;
    const ng = randomId(), dx = extents(ms, sc.t)[0] + 20;
    const copies = ms.map((p) => ({ ...p, id: randomId(), group: ng, pos: [p.pos[0] + dx, p.pos[1], p.pos[2]] as Vec3, notches: p.notches.map((n) => ({ ...n, id: randomId() })), holes: p.holes.map((h) => ({ ...h, id: randomId() })) }));
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
    const g = other.group ?? randomId();
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
  }, [sc.groupNames]); // eslint-disable-line react-hooks/exhaustive-deps -- ne se relance que si les noms de groupes changent ; `openGroups` n'est lu que pour savoir s'il manque un groupe à déplier
  /** Lie toutes les plaques sélectionnées (principale + Ctrl + clic) dans un seul groupe (les groupes existants fusionnent). */
  const linkSelection = () => {
    const ids = new Set([selectedId, ...extra].filter(Boolean) as string[]);
    if (ids.size < 2) return;
    const olds = new Set(sc.planks.filter((p) => ids.has(p.id) && p.group).map((p) => p.group as string));
    const g = [...olds][0] ?? randomId();
    commit('Plaques liées', (s) => ({ ...s, planks: s.planks.map((x) => (ids.has(x.id) || (x.group && olds.has(x.group)) ? { ...x, group: g } : x)) }));
    setExtra(new Set());
  };
  const unlinkSelection = () => {
    const ids = new Set([selectedId, ...extra].filter(Boolean) as string[]);
    commit('Plaques déliées', (s) => ({ ...s, planks: s.planks.map((x) => (ids.has(x.id) ? { ...x, group: undefined } : x)) }));
    setExtra(new Set());
  };

  const toggleCut = () => setCut((c) => (c.on ? { ...c, on: false } : { ...c, on: true, pos: midOf(c.axis) }));
  const openPi = () => { setPiMounted(true); setPiOpen(true); };
  const modals = (<>
    {machine.open && <LaserMachineModal m={machine} />}
    {piMounted && <PiSimulator open={piOpen} onClose={() => setPiOpen(false)} shoot={shoot} night={night} onToggleNight={() => setNight((v) => !v)} onFanSpeed={setFanPct} onLeds={(s) => setLeds((o) => (o.nid === s.nid && o.ext === s.ext ? o : s))} />}
    {docOpen && DOCS.find((d) => d.id === docOpen) && <DocModal doc={DOCS.find((d) => d.id === docOpen)!} onClose={() => setDocOpen(null)} />}
  </>);

  if (mobile) { // téléphone : barre en haut, la 3D en grand, réglages et pièces (afficher / cacher) en feuilles qui se ferment
    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-stone-100 text-stone-800">
        <MobileBar settingsOn={mSettings} onSettings={() => { setMSettings((v) => !v); setMParts(false); }} partsOn={mParts} onParts={() => { setMParts((v) => !v); setMSettings(false); }}
          backLabel={backLabel} onBack={back} winter={wState} onToggleCassette={toggleCassette} onTogglePlug={togglePlug}
          cutOn={cut.on} onToggleCut={toggleCut} />
        <main className="relative min-h-0 flex-1">
          <div ref={host} className="h-full w-full touch-none" />
          {cutView && <LaserPreview svg={preview} cutCfg={cutCfg} sheets={sheets} />}
          {cut.on && <CutPanel cut={cut} setCut={setCut} sc={sc} midOf={midOf} />}
          {mSettings && (
            <div className="absolute inset-0 z-20 flex flex-col bg-stone-50 [&>aside]:!w-full [&>aside]:flex-1">
              <LeftPanel open setOpen={(o) => setMSettings(o)} sc={sc} commit={commit} nest={nest} setNest={setNest} addNest={addNest} cutCfg={cutCfg} setCutCfg={setCutCfg} cutView={cutView} setCutView={setCutView} sheets={sheets} machine={machine} hideMachine />
            </div>
          )}
          {mParts && <PartsSheet sc={sc} hidden={hidden} toggleHidden={toggleHidden} setHidden={setHidden} onClose={() => setMParts(false)}
            onPick={(id, g) => { setSelectedId(id); setExtra(new Set()); setGroupSel(g); }} />}
        </main>
        {modals}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-stone-100 text-stone-800">
      <LeftPanel open={leftOpen} setOpen={setLeftOpen} sc={sc} commit={commit} nest={nest} setNest={setNest} addNest={addNest} cutCfg={cutCfg} setCutCfg={setCutCfg} cutView={cutView} setCutView={setCutView} sheets={sheets} machine={machine} />

      <main className="relative min-w-0 flex-1" onClick={() => setCtx(null)}>
        <div ref={host} className="h-full w-full" />
        {cutView && <LaserPreview svg={preview} cutCfg={cutCfg} sheets={sheets} />}
        <UndoBar backLabel={backLabel} onBack={back} />
        <ViewToolbar winter={wState} onToggleCassette={toggleCassette} onTogglePlug={togglePlug} schemaOn={schemaOn} onToggleSchema={() => setSchemaOn((v) => !v)} onOpenPi={openPi} cutOn={cut.on} onToggleCut={() => setCut((c) => (c.on ? { ...c, on: false } : { ...c, on: true, pos: midOf(c.axis) }))} />
        {cut.on && <CutPanel cut={cut} setCut={setCut} sc={sc} midOf={midOf} />}
        {pull && <PullBar cutOn={cut.on} onDone={() => setPull(null)} />}
        {extra.size > 0 && <SelectionBar count={extra.size + (selectedId ? 1 : 0)} onLink={linkSelection} onUnlink={unlinkSelection} onCancel={() => setExtra(new Set())} />}

        {ctx && <ContextMenu ctx={ctx} sc={sc} hidden={hidden} toggleHidden={toggleHidden} close={() => setCtx(null)} />}
      </main>

      {modals}
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
