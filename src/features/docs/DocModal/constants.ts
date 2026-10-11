import schema from '../../../../docs/schema-electronique.md?raw';
import logiciel from '../../../../docs/logiciel.md?raw';
import laser from '../../../../docs/laser.md?raw';
import architecture3d from '../../../../docs/architecture-3d.md?raw';
import checklist from '../../../../docs/checklist-changements.md?raw';
import type { DocDef } from './types';

/** Documents lisibles dans l'app (fichiers Markdown du dossier docs/). */
export const DOCS: DocDef[] = [{ id: 'schema', title: 'Schéma électronique', md: schema }, { id: 'logiciel', title: 'Logiciel (Pi, page web)', md: logiciel }, { id: 'laser', title: 'Laser (pilotage)', md: laser }, { id: 'archi3d', title: 'Architecture 3D', md: architecture3d }, { id: 'checklist', title: 'Checklist', md: checklist }, { id: 'code', title: 'Code', md: '' }];

export const DOC_CSS = `
.doc-md{font:15px/1.65 system-ui,sans-serif;color:#1c1917}
.doc-md h1{font-size:1.9rem;line-height:1.2;margin:0 0 .6em;color:#064e3b;text-wrap:balance}
.doc-md h2{font-size:1.25rem;margin:2em 0 .6em;padding-bottom:.3em;border-bottom:2px solid #a7f3d0;color:#065f46}
.doc-md h3{font-size:1.02rem;margin:1.6em 0 .5em;color:#292524}
.doc-md p{margin:.7em 0;max-width:70ch}
.doc-md ul{margin:.6em 0;padding-left:1.3em}
.doc-md li{margin:.25em 0}
.doc-md a{color:#0369a1;text-decoration:underline}
.doc-md strong{color:#292524}
.doc-md .tw{overflow-x:auto;margin:.8em 0;border:1px solid #e7e5e4;border-radius:8px}
.doc-md table{border-collapse:collapse;width:100%;font-size:13px}
.doc-md th{background:#ecfdf5;color:#064e3b;text-align:left;font-weight:600}
.doc-md th,.doc-md td{padding:6px 10px;border-bottom:1px solid #e7e5e4;vertical-align:top}
.doc-md tr:last-child td{border-bottom:0}
.doc-md td:first-child{font-weight:500}
.doc-md .doc-price-group td{background:#f0fdf4;border-top:2px solid #a7f3d0}
.doc-md .doc-price-off td{color:#a8a29e;text-decoration:line-through}
.doc-md .doc-price-off td:first-child{text-decoration:none}
.doc-md .doc-price-total td{background:#ecfdf5;border-top:2px solid #10b981;font-size:14px}
.doc-md input[type=checkbox]{accent-color:#059669;cursor:pointer}
.doc-md pre:not(.mermaid){background:#f6f8fa;border:1px solid #e7e5e4;border-radius:8px;padding:12px;overflow-x:auto;margin:1em 0;font:12.5px/1.5 ui-monospace,Consolas,monospace}
.doc-md code{font:12.5px/1.5 ui-monospace,Consolas,monospace}
.doc-md p code,.doc-md li code,.doc-md td code{background:#f5f5f4;border-radius:4px;padding:1px 4px}
.doc-md .cluster-label,.doc-md .cluster-label *{font-size:20px!important;font-weight:700!important;color:#064e3b!important;fill:#064e3b!important}
.doc-md pre.mermaid{background:#fafaf9;border:1px solid #e7e5e4;border-radius:8px;padding:12px;overflow-x:auto;text-align:center;margin:1em 0}
`;
