/** Nature d'une étape de montage. */
export type AssemblyKind = 'placer' | 'emboiter' | 'coller' | 'huiler' | 'peindre' | 'isoler' | 'cabler' | 'installer' | 'tester' | 'attendre';

/** Libellé court de chaque nature d'étape (pastille du panneau de montage). */
export const KIND_LABEL: Record<AssemblyKind, string> = {
  placer: 'Placer', emboiter: 'Emboîter', coller: 'Coller', huiler: 'Huiler', peindre: 'Peindre', isoler: 'Isoler',
  cabler: 'Câbler', installer: 'Installer', tester: 'Tester', attendre: 'Attendre',
};

/** Une étape du montage pas à pas. */
export interface AssemblyStep {
  /** Identifiant stable (même scène → mêmes identifiants, jamais aléatoire). */
  id: string;
  title: string;
  kind: AssemblyKind;
  /** Identifiant du bloc (voir `ASSEMBLY_BLOCKS`). */
  block: string;
  /** Pièces posées par cette étape : chaque pièce de la scène est dans UNE seule étape. */
  pieceIds: string[];
  /** Pièces concernées sans être posées ici (huile avant la pose, module déjà en place…) : affichées et surlignées pendant l'étape. */
  focusIds?: string[];
  /** Pièces déjà posées qu'on cache pendant l'étape (le toit en okoumé est soulevé pour travailler dans le grenier). */
  hideIds?: string[];
  /** Consigne : paragraphes séparés par des retours à la ligne, puces = lignes commençant par « - ». Absent s'il n'y a rien de particulier à dire. */
  text?: string;
}

/** Un bloc du montage (entrée de la liste de saut rapide). */
export interface AssemblyBlock { id: string; title: string }
