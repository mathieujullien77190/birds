import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { loadHistory, saveHistory, type HistoryEntry, type PlankScene } from '../model';

/**
 * Historique « Retour » : états précédents, le plus récent en dernier ; gardé au rechargement (la sauvegarde elle-même est faite par le composant, avec la scène).
 * `onUndo` est appelé après un retour en arrière (pour ajuster la sélection et fermer la fenêtre de trou).
 */
export function useHistory(scRef: MutableRefObject<PlankScene>, setSc: Dispatch<SetStateAction<PlankScene>>, onUndo: (scene: PlankScene) => void) {
  const history = useRef<HistoryEntry[]>(loadHistory());
  const [backLabel, setBackLabel] = useState<string | null>(() => { const h = loadHistory(); return h.length ? h[h.length - 1].label : null; });
  const [histN, setHistN] = useState(0); // change à chaque modification de l'historique, pour redessiner la liste
  const onUndoRef = useRef(onUndo);
  onUndoRef.current = onUndo;

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
  /** Ajoute une entrée « état d'avant » sans rien changer (début d'un glissé dans la 3D). */
  const pushEntry = (label: string) => {
    history.current.push({ label, scene: scRef.current, at: Date.now() });
    setBackLabel(label); setHistN((k) => k + 1);
  };
  /** Revient à l'état d'avant l'action n° `index` de l'historique (elle et les suivantes sont annulées) ; sans index : la dernière. */
  const undoTo = (index = history.current.length - 1) => {
    const e = history.current[index];
    if (!e) return;
    history.current.length = index;
    scRef.current = e.scene;
    setSc(e.scene);
    onUndoRef.current(e.scene);
    setBackLabel(history.current.length ? history.current[history.current.length - 1].label : null);
    setHistN((n) => n + 1);
  };
  const back = () => undoTo();
  /** Vide l'historique (la scène ne change pas) : plus rien à annuler. */
  const clearHistory = () => { history.current = []; saveHistory([]); setBackLabel(null); setHistN((n) => n + 1); };
  return { history, backLabel, histN, commit, pushEntry, undoTo, back, clearHistory };
}
