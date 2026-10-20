/** Couleurs nommées de la 3D : chaque teinte est déclarée une seule fois ici. */
export const PALETTE = {
  white: '#ffffff',
  black: '#000000',
  // bois contreplaqué
  mdfTop: '#a47c55',
  mdfBottom: '#8f6a46',
  mdfSide: '#5c3f24',
  plywoodTop: '#e8cfa3', // brut (intérieur du nid)
  plywoodBottom: '#cfae7b',
  plywoodSide: '#6f4a22',
  meterLine: '#dc2626', // mètre ruban : trait et points posés
  meterHover: '#0ea5e9', // mètre ruban : point visé
  oiledTop: '#e2bb8a', // huilé (tout le reste) : plus chaud, pastel
  oiledBottom: '#cfa575',
  oiledSide: '#6b4b2a',
  plywoodEdge: '#4a3014',
  woodBlock: '#c8995a',
  woodBar: '#a16207',
  insulation: '#f59e0b',
  // métal et plastique
  aluminium: '#cbd5e1',
  aluminiumFrame: '#c7ccd1',
  silver: '#b8bcc2',
  steel: '#9ca3af',
  lightGray: '#e5e7eb',
  connectorGray: '#e5e5e5',
  coolWhite: '#f8fafc',
  offWhite: '#f5f5f4',
  slate: '#111827',
  slate600: '#374151',
  slate700: '#4b5563',
  gray500: '#6b7280',
  darkNavy: '#0f172a',
  nearBlack: '#18181b',
  lensBase: '#27272a',
  lens: '#09090b',
  gold: '#d4a017',
  // cartes électroniques
  pcbGreen: '#1f7a3d',
  piGreen: '#0f5132',
  driverRed: '#b91c1c',
  irBoard: '#3f1d1d',
  irLed: '#f87171',
  resistorBody: '#d6b98c', // résistance 68 Ω : corps beige, bagues bleu, gris, noir, or
  resistorBlue: '#1d4ed8',
  resistorGrey: '#6b7280',
  resistorBlack: '#111827',
  resistorGold: '#ca8a04',
  solder: '#cbd5e1',
  irAnode: '#dc2626', // patte longue (anode, +) des LED infrarouges
  irCathode: '#111827', // patte courte (cathode, −)
  sensorBlue: '#1d4ed8',
  terminalBlue: '#2563eb',
  terminalGreen: '#16a34a',
  relayBlue: '#1d4ed8',
  ledGreen: '#22c55e',
  // panneau solaire
  // fils, nappe
  conduit: '#1c1917',
  ribbon: '#e08a1e',
  ribbonTip: '#5b8def',
  // repères et cotes
  cutPlane: '#2563eb',
  pullMark: '#0284c7',
  dimLine: '#1c1917',
  /** Texte du code gravé sur une plaque (bleu : la couleur de la gravure dans les SVG). */
  codeEngraving: '#0a2472',
  /** Halo clair autour du texte du code (contraste sur le bois). */
  codeHalo: '#fffbeb',
  dimExt: '#a8a29e',
} as const;
