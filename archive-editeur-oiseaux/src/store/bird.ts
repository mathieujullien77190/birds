import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { lockRotation, type Part, type ShapeKind, type Vec3 } from '@/engine/types';
import { MALLARD_MALE, type PartDef } from '@/engine/presets/mallard';
import { clampDetail } from '@/engine/shapes';
import { PYRAMID_DEFAULT_POINTS } from '@/engine/shapes/pyramid';

interface Snapshot { name: string; parts: Part[] }

interface BirdState {
  name: string;
  parts: Part[];
  selectedId: string | null;
  /** Historique : états précédents / suivants (non enregistrés dans le navigateur). */
  past: Snapshot[];
  future: Snapshot[];

  setName: (name: string) => void;
  addPart: (shape: ShapeKind) => void;
  /** Remplace toutes les pièces (modèle prêt à l'emploi ou jeu enregistré). */
  loadParts: (name: string, defs: PartDef[]) => void;
  /** Modification d'une pièce. `tag` regroupe les changements rapprochés (curseur) en une seule étape d'historique. */
  updatePart: (id: string, patch: Partial<Omit<Part, 'id' | 'shape'>>, tag?: string) => void;
  /** Début d'un geste souris (glissé, rotation) : une seule étape d'historique pour tout le geste. */
  beginGesture: () => void;
  movePart: (id: string, pos: Vec3) => void;
  rotatePart: (id: string, rot: Vec3) => void;
  /** Déplace un coin libre (pyramide) pendant un geste souris. */
  movePoint: (id: string, index: number, local: Vec3) => void;
  removePart: (id: string) => void;
  /** Applique un même réglage à toutes les pièces d'un coup (lissage, transparence, axes…). */
  setAll: (patch: Partial<Pick<Part, 'smooth' | 'transparent' | 'showAxes' | 'mirror'>>) => void;
  duplicatePart: (id: string) => void;
  select: (id: string | null) => void;
  clear: () => void;
  undo: () => void;
  redo: () => void;
}

let counter = 0;
const newId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;
const copyDef = (d: PartDef): Part => ({ ...d, id: newId(), detail: clampDetail(d.shape, d.detail), pos: [...d.pos] as Vec3, rot: lockRotation(d.shape, d.rot), scl: [...d.scl] as Vec3, yStretch: [...(d.yStretch ?? [1, 1])] as [number, number], points: d.points ? d.points.map((p) => [...p] as Vec3) : undefined });

/** Réglages de départ de chaque forme ajoutée seule : ceux du colvert (corps à y = 0.55, avant = +Z). */
const EXTRA_DEFAULTS: PartDef[] = [ // formes absentes du colvert
  { shape: 'ball', name: 'Boule', pos: [0, 0, 0.3], rot: [0, 0, 0], scl: [1, 1, 1], yStretch: [1, 1], color: '#c9b8a0', detail: 99, smooth: true, mirror: false, transparent: true, showAxes: true },
  { shape: 'flatTopBall', name: 'Boule aplatie', pos: [0, 0, 0.3], rot: [0, 0, 0], scl: [1, 1, 1], yStretch: [1, 1], color: '#2e7a52', detail: 99, smooth: true, mirror: false, transparent: true, showAxes: true },
  { shape: 'pyramid', name: 'Pyramide', pos: [0, 0, 0.3], rot: [0, 0, 0], scl: [1, 1, 1], yStretch: [1, 1], color: '#f0b429', detail: 1, smooth: false, mirror: false, transparent: true, showAxes: true, points: PYRAMID_DEFAULT_POINTS },
  { shape: 'cone', name: 'Cône', pos: [0, 0, 0.3], rot: [0, 0, 0], scl: [1, 1, 1], yStretch: [1, 1], color: '#c9b8a0', detail: 99, smooth: false, mirror: false, transparent: true, showAxes: true },
  { shape: 'cylinder', name: 'Cylindre', pos: [0, 0, 0.3], rot: [0, 0, 0], scl: [1, 1, 1], yStretch: [1, 1], color: '#c9b8a0', detail: 99, smooth: false, mirror: false, transparent: true, showAxes: true },
  { shape: 'cylinderX', name: 'Cylindre couché', pos: [0, 0, 0.2], rot: [0, 0, 0], scl: [1, 1, 1], yStretch: [1, 1], color: '#c9b8a0', detail: 99, smooth: false, mirror: false, transparent: true, showAxes: true },
  { shape: 'mesh', name: 'Maillage', pos: [0, 0, 0], rot: [0, 0, 0], scl: [1, 1, 1], yStretch: [1, 1], color: '#c9b8a0', detail: 1, smooth: false, mirror: false, transparent: false, showAxes: false },
];
const DEFAULTS = Object.fromEntries([...MALLARD_MALE, ...EXTRA_DEFAULTS].map((d) => [d.shape, d])) as Record<ShapeKind, PartDef>;

/** Une pièce enregistrée par une version précédente peut manquer de champs ou porter un ancien nom de forme. */
const RENAMED: Record<string, ShapeKind> = { rugbyBody: 'body' };
const upgrade = (p: Partial<Part>): Part => {
  const shape = RENAMED[p.shape as string] ?? ((p.shape ?? 'body') as ShapeKind);
  return { ...DEFAULTS[shape], ...p, shape, id: p.id ?? newId() } as Part;
};
/** Sauvegardes d'avant le passage à « Z vertical » (version 1) : la hauteur était en Y, l'avant en Z. */
export const migrateYUp = (p: Partial<Part> & { zStretch?: [number, number] }): Partial<Part> => {
  const q: Partial<Part> & { zStretch?: [number, number] } = { ...p };
  if (q.pos) q.pos = [q.pos[0], q.pos[2], q.pos[1]];
  if (q.scl) q.scl = [q.scl[0], q.scl[2], q.scl[1]];
  if (q.rot) q.rot = [q.rot[0], 0, 0];
  if (q.zStretch) { q.yStretch = q.zStretch; delete q.zStretch; }
  return q;
};

const HISTORY_MAX = 100;
const GROUP_MS = 700; // deux changements de même étiquette à moins de 0,7 s = une seule étape
let lastTag: string | null = null;
let lastAt = 0;

export const useBird = create<BirdState>()(
  persist(
    (set, get) => {
      /** Empile l'état courant avant une modification. */
      const push = (tag: string | null = null) => {
        const now = performance.now();
        if (tag && tag === lastTag && now - lastAt < GROUP_MS) { lastAt = now; return; }
        lastTag = tag; lastAt = now;
        set((s) => ({ past: [...s.past.slice(-(HISTORY_MAX - 1)), { name: s.name, parts: s.parts }], future: [] }));
      };

      return {
        name: 'Canard',
        parts: [],
        selectedId: null,
        past: [],
        future: [],

        setName: (name) => { push('name'); set({ name }); },

        addPart: (shape) => {
          push();
          const part = copyDef(DEFAULTS[shape]);
          // une pièce ajoutée seule arrive centrée sur l'origine (X = Z = 0), horizontale, à sa hauteur par défaut ;
          // le modèle complet (loadParts) garde ses positions et inclinaisons
          part.pos = [0, 0, part.pos[2]]; // X = Y = 0, hauteur par défaut
          part.rot = [0, 0, 0];
          const n = get().parts.filter((p) => p.shape === shape).length;
          if (n) part.name = `${part.name} ${n + 1}`;
          set((s) => ({ parts: [...s.parts, part], selectedId: part.id }));
        },

        loadParts: (name, defs) => { push(); set({ name, parts: defs.map((d) => copyDef(upgrade(d))), selectedId: null }); },

        updatePart: (id, patch, tag) => {
          push(tag ? `${id}:${tag}` : null);
          set((s) => ({
            parts: s.parts.map((p) => {
              if (p.id !== id) return p;
              const next = { ...p, ...patch };
              if (patch.rot) next.rot = lockRotation(p.shape, patch.rot);
              return next;
            }),
          }));
        },

        // le geste pousse une seule étape ; ses mises à jour (étiquette « gesture ») n'en poussent plus tant qu'il dure
        beginGesture: () => { push(); lastTag = 'gesture'; lastAt = Infinity; },

        movePart: (id, pos) => get().updatePart(id, { pos }, 'gesture'),
        rotatePart: (id, rot) => get().updatePart(id, { rot }, 'gesture'),
        movePoint: (id, index, local) => {
          const part = get().parts.find((p) => p.id === id);
          if (!part?.points) return;
          const points = part.points.map((p, i) => (i === index ? local : p));
          get().updatePart(id, { points }, 'gesture');
        },

        setAll: (patch) => {
          push();
          set((s) => ({ parts: s.parts.map((p) => ({ ...p, ...patch })) }));
        },

        removePart: (id) => {
          push();
          set((s) => ({
            parts: s.parts.filter((p) => p.id !== id),
            selectedId: s.selectedId === id ? null : s.selectedId,
          }));
        },

        duplicatePart: (id) => {
          const src = get().parts.find((p) => p.id === id);
          if (!src) return;
          push();
          const copy = copyDef(src);
          copy.name = `${src.name} (copie)`;
          copy.pos[0] += 0.3;
          set((s) => ({ parts: [...s.parts, copy], selectedId: copy.id }));
        },

        select: (id) => set({ selectedId: id }),

        clear: () => { push(); set({ parts: [], selectedId: null }); },

        undo: () => {
          const s = get();
          const prev = s.past[s.past.length - 1];
          if (!prev) return;
          lastTag = null;
          set({
            past: s.past.slice(0, -1),
            future: [{ name: s.name, parts: s.parts }, ...s.future].slice(0, HISTORY_MAX),
            name: prev.name,
            parts: prev.parts,
            selectedId: prev.parts.some((p) => p.id === s.selectedId) ? s.selectedId : null,
          });
        },

        redo: () => {
          const s = get();
          const next = s.future[0];
          if (!next) return;
          lastTag = null;
          set({
            future: s.future.slice(1),
            past: [...s.past, { name: s.name, parts: s.parts }].slice(-HISTORY_MAX),
            name: next.name,
            parts: next.parts,
            selectedId: next.parts.some((p) => p.id === s.selectedId) ? s.selectedId : null,
          });
        },
      };
    },
    {
      name: 'oiseaux-brouillon',
      version: 2,
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as { name?: string; parts?: Partial<Part>[] };
        if (version < 2) p.parts = (p.parts ?? []).map(migrateYUp);
        return p as never;
      },
      partialize: (s) => ({ name: s.name, parts: s.parts }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Pick<BirdState, 'name' | 'parts'>>;
        return { ...current, name: p.name ?? current.name, parts: (p.parts ?? []).map(upgrade) };
      },
    },
  ),
);
