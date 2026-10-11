import type { GrblState, GrblStatus, Vec3 } from './types';

const STATES: GrblState[] = ['Idle', 'Run', 'Hold', 'Jog', 'Alarm', 'Door', 'Check', 'Home', 'Sleep'];

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

function vec(text: string): Vec3 | null {
  const n = text.split(',').map(Number);
  if (n.length < 2 || n.some((v) => !Number.isFinite(v))) return null;
  return { x: n[0], y: n[1], z: n[2] ?? 0 };
}

/**
 * Lit un rapport d'état `<Idle|MPos:1.000,2.000,0.000|FS:500,300|WCO:...>`. `prevWco` = dernier décalage connu
 * (GRBL n'envoie le WCO qu'un rapport sur dix) pour déduire la position de travail depuis la position machine, ou l'inverse.
 * Rend `null` si la ligne n'est pas un rapport valide.
 */
export function parseStatus(line: string, prevWco: Vec3 = ZERO): GrblStatus | null {
  const m = /^<([^>]*)>$/.exec(line.trim());
  if (!m) return null;
  const fields = m[1].split('|');
  const [name, subText] = fields[0].split(':');
  const state = STATES.find((s) => s === name);
  if (!state) return null;
  let mpos: Vec3 | null = null, wpos: Vec3 | null = null, wco = prevWco, feed = 0, spindle = 0;
  for (const f of fields.slice(1)) {
    const i = f.indexOf(':');
    if (i < 0) continue;
    const key = f.slice(0, i), val = f.slice(i + 1);
    if (key === 'MPos') mpos = vec(val);
    else if (key === 'WPos') wpos = vec(val);
    else if (key === 'WCO') wco = vec(val) ?? wco;
    else if (key === 'FS') { const [a, b] = val.split(',').map(Number); feed = a || 0; spindle = b || 0; }
    else if (key === 'F') feed = Number(val) || 0;
  }
  if (!mpos && !wpos) return null;
  if (!mpos && wpos) mpos = { x: wpos.x + wco.x, y: wpos.y + wco.y, z: wpos.z + wco.z };
  if (!wpos && mpos) wpos = { x: mpos.x - wco.x, y: mpos.y - wco.y, z: mpos.z - wco.z };
  return { state, sub: subText !== undefined ? Number(subText) : null, mpos: mpos!, wpos: wpos!, wco, feed, spindle };
}

/** Ligne de réglage `$30=1000` → [30, 1000]. */
export function parseSetting(line: string): [number, number] | null {
  const m = /^\$(\d+)=(-?\d+(?:\.\d+)?)/.exec(line.trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export const isWelcome = (line: string) => /^Grbl\s/i.test(line);

/** Libellé français de l'état de la machine. */
export function stateLabel(s: GrblStatus | null, connected: boolean): string {
  if (!connected) return 'Déconnectée';
  if (!s) return 'En attente…';
  switch (s.state) {
    case 'Idle': return 'Inactive';
    case 'Run': return 'En marche';
    case 'Jog': return 'Déplacement';
    case 'Hold': return 'Pause';
    case 'Alarm': return 'Alarme';
    case 'Door': return 'Porte ouverte';
    case 'Check': return 'Mode test';
    case 'Home': return 'Homing';
    case 'Sleep': return 'Veille';
  }
}
