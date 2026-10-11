import schemaMd from '../../../../docs/schema-electronique.md?raw';
import type { Keys } from './types';

/** Source mermaid du schéma général (premier bloc ```mermaid du document). */
export const MERMAID_SRC = (/```mermaid\n([\s\S]*?)```/.exec(schemaMd)?.[1] ?? 'flowchart TB\n  X["schéma introuvable"]').trim();

/** Options du nichoir dont les blocs disparaissent du schéma quand elles sont absentes. */
export const OPTION_NODES = { cam2: ['CAM2', 'IR2'], solar: ['PV', 'MPPT'] } as const;

/** Pièce (nom) → nœuds et flèches du schéma. Les flèches sont [de, vers] comme dans la source mermaid. */
export const MAP: [RegExp, Keys][] = [
  [/^Raspberry Pi/, { nodes: ['PI'], edges: [] }],
  [/^Caméra 2$/, { nodes: ['CAM2'], edges: [] }],
  [/^Caméra$/, { nodes: ['CAM1'], edges: [] }],
  [/^LED infrarouges extérieures/, { nodes: ['IR2'], edges: [] }],
  [/^LED infrarouges$/, { nodes: ['IR'], edges: [] }],
  [/^Capteur température/, { nodes: ['SENS'], edges: [] }],
  [/^(Ventilateur|Cassette ventilateur|Goulotte ventilateur|Grille ventilateur|Plot caoutchouc|Joint cassette|Poignée cassette|Connecteur ventilateur|Grillage inox maille 5 mm|Bloc isolant d'hiver|Isolant bloc d'hiver|Poignée bloc d'hiver)/, { nodes: ['FAN'], edges: [] }],
  [/^(Module interrupteur 12 V|Cale interrupteur)/, { nodes: ['SWF'], edges: [] }],
  [/^Module 2 MOSFET/, { nodes: ['SW'], edges: [] }],
  [/^Convertisseur/, { nodes: ['BUCK'], edges: [] }],
  [/^Batterie/, { nodes: ['BAT'], edges: [] }],
  [/^Fusible/, { nodes: ['FUSE'], edges: [] }],
  [/^Régulateur/, { nodes: ['MPPT'], edges: [] }],
  [/^Panneau solaire/, { nodes: ['PV'], edges: [] }],
  [/^Câble 12 V/, { nodes: [], edges: [['PV', 'MPPT']] }],
  [/^(Gaine des fils|Fil régulateur → batterie)/, { nodes: [], edges: [['MPPT', 'FUSE']] }],
  [/^Fil fusible → batterie/, { nodes: [], edges: [['FUSE', 'BAT']] }],
  [/^Fil (fusible|batterie −) → convertisseur/, { nodes: [], edges: [['FUSE', 'BUCK']] }],
  [/^Fil (Wago + → interrupteur|masse interrupteur)/, { nodes: [], edges: [['RAIL', 'SWF']] }],
  [/^Fil (cassette +|interrupteur → ventilateur)/, { nodes: [], edges: [['SWF', 'FAN']] }],
  [/^Fil (cassette −|ventilateur −)/, { nodes: [], edges: [['RAIL', 'FAN']] }],
  [/^Fil commande interrupteur/, { nodes: [], edges: [['PI', 'SWF']] }],
  [/^Fil (cassette (PWM|tachymètre)|PWM ventilateur|tachymètre ventilateur|masse commune ventilateur)/, { nodes: [], edges: [['PI', 'FAN']] }],
  [/^Fil rail → convertisseur/, { nodes: [], edges: [['RAIL', 'BUCK']] }],
  [/^Nappe caméra 2/, { nodes: [], edges: [['PI', 'CAM2']] }],
  [/^Nappe caméra$/, { nodes: [], edges: [['PI', 'CAM1']] }],
  [/^Fil 5 V LED extérieures/, { nodes: [], edges: [['PI', 'IR2']] }],
  [/^Fil masse LED extérieures/, { nodes: [], edges: [['SW', 'IR2']] }],
  [/^Fil 5 V \(rouge\)/, { nodes: [], edges: [['PI', 'IR']] }],
  [/^Fil masse \(noir\)/, { nodes: [], edges: [['SW', 'IR'], ['PI', 'SENS']] }], // deux fils portent ce nom : la masse des LED du nid et celle du capteur
  [/^Fil (IN1|IN2|masse module)/, { nodes: [], edges: [['PI', 'SW']] }],
  [/^Fil (3,3 V|SDA|SCL)/, { nodes: [], edges: [['PI', 'SENS']] }],
];
/** Fiches des composants : les sections « ### … » du document (tableaux de paramètres), repérées par le début de leur titre. */
export const FICHES: Record<string, string> = {
  PV: 'Panneau solaire', MPPT: 'Régulateur de charge', BAT: 'Batterie', FUSE: 'Fusible', BUCK: 'Convertisseur', PI: 'Raspberry Pi', FAN: 'Ventilateur', SWF: 'Interrupteur 12 V du ventilateur',
  CAM1: 'Caméras', CAM2: 'Caméras', IR: 'Carte de 4 LED', IR2: 'Carte de 4 LED', SENS: 'Capteur de température', SW: 'Module 2 × MOSFET', RAIL: 'Wago 221',
};
export const SECTIONS = (() => {
  const out: { title: string; md: string }[] = [];
  const params = schemaMd.slice(schemaMd.indexOf('## Paramètres à respecter'));
  for (const part of params.split(/^### /m).slice(1)) { const nl = part.indexOf('\n'); out.push({ title: part.slice(0, nl).trim(), md: '### ' + part.trim() }); }
  return out;
})();

/** Styles propres au panneau du schéma (surbrillance des blocs et des flèches, titres des zones). */
export const CSS = `
.schema-panel svg{max-width:100%;height:auto}
.schema-panel g.node.hl rect,.schema-panel g.node.hl polygon,.schema-panel g.node.hl circle,.schema-panel g.node.hl path{stroke:#f59e0b!important;stroke-width:4px!important} /* le bloc garde sa couleur, seul son contour grossit */
.schema-panel path.hl{stroke-width:7px!important} /* le trait garde la couleur de son fil, il grossit */
.schema-panel g.node,.schema-panel path.flowchart-link{cursor:pointer}
.schema-panel .cluster-label,.schema-panel .cluster-label *{font-size:24px!important;font-weight:700!important;color:#064e3b!important;fill:#064e3b!important;line-height:1.3!important} /* titres des zones : Dehors, grenier, sous le plafond */
.schema-panel .cluster-label foreignObject{overflow:visible}
`;

