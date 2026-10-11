/** Points à cocher avant de lancer une découpe : tous obligatoires. */
export const SAFETY_ITEMS = [
  'Je porte des lunettes de protection adaptées à la longueur d\'onde de la laser (445 nm).',
  'Je reste devant la machine pendant toute la découpe : surveillance permanente, jamais seul(e) hors de la pièce.',
  "L'arrêt d'urgence de la machine est à portée de main (et l'extincteur ou un seau d'eau près de moi).",
  "La planche est posée à plat, fixée, à la bonne hauteur de focale, et l'origine (X0 Y0) est réglée sur son coin bas-gauche.",
  "L'air assist est allumé et le capot / la zone de coupe est dégagée.",
] as const;
