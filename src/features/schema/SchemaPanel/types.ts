/** Nœuds et flèches du schéma ; les flèches sont [de, vers] comme dans la source mermaid. */
export type Keys = { nodes: string[]; edges: [string, string][] };

/** Options présentes dans la scène : seules leurs parties du schéma sont affichées. */
export interface SchemaOptions { cam2: boolean }
