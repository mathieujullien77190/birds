/** Clés localStorage de la fonctionnalité (ne pas les changer : ce sont les réglages déjà enregistrés des utilisateurs). */
export const STORAGE = {
  leftOpen: 'plaques-menu-gauche', // panneau de gauche replié ou non
  rightOpen: 'plaques-menu-droit', // panneau de droite replié ou non
  night: 'plaques-nuit', // vue 3D en mode nuit (lune, fond sombre)
  schema: 'plaques-schema', // schéma électrique à côté de la 3D
  cut: 'plaques-coupe', // axe et côté du plan de coupe
  hidden: 'plaques-caches', // pièces cachées dans la 3D
  nest: 'plaques-nichoir-3', // réglages du nichoir
  codes: 'plaques-codes', // codes des plaques (T01…) écrits sur les plaques dans la 3D
} as const;

/** Types de pièces cachées d'office quand on crée un nichoir : isolant, pan de toit en okoumé et ses quatre baguettes (l'œil de « Pièces » les affiche). */
export const HIDDEN_AT_CREATION = [/^Isolant(?! bloc d'hiver)/, /^Toit en okoumé/, /^Baguette couvercle(?!.* [(]rechange)/]; // les pièces fines de rechange (« … (rechange k) ») restent visibles
