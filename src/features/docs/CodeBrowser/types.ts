/** Nœud de l'arborescence : dossier (avec enfants) ou fichier. */
export type Node = { name: string; path: string; dir: boolean; children: Node[] };
