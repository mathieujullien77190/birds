import type { Dispatch, SetStateAction } from 'react';
import type { Plank, PlankScene } from '@/birdhouse/model';
import type { Commit, Hover } from '../../types';

export interface PiecesListProps {
  sc: PlankScene;
  selectedId: string | null;
  selected: Plank | null;
  groupSel: string | null;
  extra: Set<string>;
  hidden: Set<string>;
  openGroups: Set<string>;
  setOpenGroups: Dispatch<SetStateAction<Set<string>>>;
  dropOn: string | null;
  setDropOn: Dispatch<SetStateAction<string | null>>;
  setHover: (h: Hover | null) => void;
  confirmAll: boolean;
  docOpen: string | null;
  setDocOpen: (d: string | null) => void;
  setSelectedId: (id: string | null) => void;
  setGroupSel: (g: string | null) => void;
  setExtra: (e: Set<string>) => void;
  pick: (id: string | null, ctrl: boolean) => void;
  update: (id: string, patch: Partial<Plank>, label?: string) => void;
  commit: Commit;
  toggleHidden: (ids: string[]) => void;
  duplicate: (p: Plank) => void;
  remove: (id: string) => void;
  duplicateGroup: (g: string) => void;
  removeGroup: (g: string) => void;
  removeAll: () => void;
  dropPlank: (id: string, target: DropTarget) => void;
}

/** Cible d'un glisser-déposer : une boîte (groupe) ou une autre plaque. */
export type DropTarget = { group?: string; plank?: string };
