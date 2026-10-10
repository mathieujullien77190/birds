import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Part } from '@/engine/types';
import { migrateYUp } from './bird';

/** Un jeu de paramètres enregistré : l'oiseau complet sous un nom. */
export interface SavedBird {
  name: string;
  parts: Part[];
  savedAt: number;
}

interface LibraryState {
  birds: Record<string, SavedBird>;
  save: (name: string, parts: Part[]) => void;
  remove: (name: string) => void;
}

/** Bibliothèque des oiseaux enregistrés, dans le navigateur (clé localStorage 'oiseaux-bibliotheque'). */
export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      birds: {},
      save: (name, parts) =>
        set((s) => ({ birds: { ...s.birds, [name]: { name, parts: structuredClone(parts), savedAt: Date.now() } } })),
      remove: (name) =>
        set((s) => {
          const birds = { ...s.birds };
          delete birds[name];
          return { birds };
        }),
    }),
    {
      name: 'oiseaux-bibliotheque',
      version: 2,
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as { birds?: Record<string, SavedBird> };
        if (version < 2 && p.birds) for (const b of Object.values(p.birds)) b.parts = b.parts.map((q) => migrateYUp(q) as Part);
        return p as never;
      },
    },
  ),
);
