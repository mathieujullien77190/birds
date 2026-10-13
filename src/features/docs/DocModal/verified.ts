/** Colonne « Vérifié » du tableau des prix : fonctions PURES (aucun DOM, aucun import d'alias : le plugin Vite de `vite.config.ts` les importe par chemin relatif). */

/** Clé localStorage des cases « Vérifié » modifiées dans le navigateur (`{ "groupe\u0000élément": true | false }`) ; recopiée dans `STORAGE.verified`. */
export const VERIFIED_KEY = 'plaques-prix-verifies';
/** Route POST locale du serveur de développement qui réécrit `docs/schema-electronique.md`. */
export const VERIFIED_ROUTE = '/__doc/verified';

export interface VerifiedBody { groupe: string; element: string; verified: boolean }
export type ApplyResult = { ok: true; md: string } | { ok: false; error: 'tableau' | 'introuvable' | 'ambigu' };

const HEADER = '| Groupe | Désignation | Quantité | Prix |';
const CELL = /\[[ xX]\](\s*\|\s*)$/;

/** Texte brut d'une cellule Markdown : liens réduits à leur texte, `*` et `` ` `` retirés, espaces fusionnés. */
export function plain(cell: string): string {
  return cell.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*`]/g, '').replace(/\s+/g, ' ').trim();
}

/** Clé d'une ligne du tableau : groupe + élément (le séparateur NUL ne peut pas apparaître dans un texte). */
export const verifiedKey = (groupe: string, element: string) => `${groupe}\u0000${element}`;

/** Une cellule « Vérifié » est cochée si elle contient `[x]` (majuscule admise). */
export const isChecked = (cell: string | null | undefined) => /\[x\]/i.test(cell ?? '');

/** Corps d'une requête valide ? Types et longueurs stricts, aucune clé en plus ; sinon `null`. */
export function parseVerifiedBody(raw: unknown): VerifiedBody | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 3 || !['groupe', 'element', 'verified'].every((k) => keys.includes(k))) return null;
  const { groupe, element, verified } = o;
  if (typeof groupe !== 'string' || groupe.length < 1 || groupe.length > 200) return null;
  if (typeof element !== 'string' || element.length < 1 || element.length > 2000) return null;
  if (typeof verified !== 'boolean') return null;
  return { groupe, element, verified };
}

/** L'en-tête `Host` désigne-t-il la machine locale (localhost, 127.0.0.1, [::1], avec ou sans port) ? */
export function isLocalHost(host: string | undefined): boolean {
  return !!host && /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i.test(host);
}

/** Réécrit la case « Vérifié » de LA ligne (groupe, élément) du tableau des prix ; les fins de ligne (LF ou CRLF) et tout le reste du fichier sont gardés tels quels. */
export function applyVerified(md: string, groupe: string, element: string, verified: boolean): ApplyResult {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.startsWith(HEADER));
  if (start < 0) return { ok: false, error: 'tableau' };
  const hits: number[] = [];
  for (let i = start + 2; i < lines.length && lines[i].trim() !== ''; i++) {
    const cells = lines[i].replace(/\r$/, '').split('|').slice(1, -1);
    if (cells.length >= 5 && plain(cells[0]) === plain(groupe) && plain(cells[1]) === plain(element)) hits.push(i);
  }
  if (hits.length === 0) return { ok: false, error: 'introuvable' };
  if (hits.length > 1) return { ok: false, error: 'ambigu' };
  const i = hits[0], mark = verified ? '[x]' : '[ ]';
  const cr = lines[i].endsWith('\r') ? '\r' : '', body = lines[i].replace(/\r$/, '');
  if (!CELL.test(body)) return { ok: false, error: 'introuvable' };
  lines[i] = body.replace(CELL, `${mark}$1`) + cr;
  return { ok: true, md: lines.join('\n') };
}

/** Demande la réécriture du fichier au serveur de développement. `true` = fichier réécrit ; `false` = pas de serveur (production), refus ou erreur : on se rabat sur le navigateur. */
export async function persistVerified(body: VerifiedBody, dev: boolean, doFetch: typeof fetch = (...a) => fetch(...a)): Promise<boolean> {
  if (!dev) return false;
  try {
    const r = await doFetch(VERIFIED_ROUTE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.ok;
  } catch { return false; }
}
