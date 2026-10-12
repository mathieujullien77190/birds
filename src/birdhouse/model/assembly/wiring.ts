import type { Plank } from '../types';
import { wireInfo } from '../wires/wireInfo';

/** Nom de chaque broche physique du connecteur de 40 broches du Raspberry Pi (numéro de la broche → fonction). */
export const PIN_NAMES: Record<number, string> = {
  1: '3,3 V', 2: '5 V', 3: 'GPIO2, SDA I²C', 4: '5 V', 5: 'GPIO3, SCL I²C', 6: 'GND (masse)', 7: 'GPIO4, 1-Wire', 8: 'GPIO14', 9: 'GND (masse)', 10: 'GPIO15',
  11: 'GPIO17, tachymètre', 12: 'GPIO18, PWM', 13: 'GPIO27', 14: 'GND (masse)', 15: 'GPIO22', 16: 'GPIO23', 17: '3,3 V', 18: 'GPIO24', 19: 'GPIO10', 20: 'GND (masse)',
  21: 'GPIO9', 22: 'GPIO25', 23: 'GPIO11', 24: 'GPIO8', 25: 'GND (masse)', 26: 'GPIO7', 27: 'GPIO0', 28: 'GPIO1', 29: 'GPIO5', 30: 'GND (masse)',
  31: 'GPIO6', 32: 'GPIO12', 33: 'GPIO13', 34: 'GND (masse)', 35: 'GPIO19', 36: 'GPIO16', 37: 'GPIO26', 38: 'GPIO20', 39: 'GND (masse)', 40: 'GPIO21',
};

/** « broche 12 (GPIO18, PWM) » : la broche physique du Pi avec son nom. */
export const pinLabel = (n: number): string => `broche ${n} (${PIN_NAMES[n] ?? '?'})`;

/** Consigne de branchement d'un ou plusieurs fils : pour chacun, d'où à où, les broches du Pi AVEC LEURS NOMS, et le raccord. Vide si aucune pièce n'est un fil. */
export function wiringText(planks: Plank[], ids: string[]): string {
  const lines: string[] = [];
  for (const id of ids) {
    const p = planks.find((x) => x.id === id), i = p ? wireInfo(p, planks) : null;
    if (!p || !i || !i.known) continue;
    lines.push(`${p.name} : ${i.from} → ${i.to}.`);
    if (i.pins.length) lines.push(`  Broches du Pi : ${i.pins.map(pinLabel).join(', ')}.`);
    if (i.connector) lines.push(`  Raccord : ${i.connector}.`);
  }
  return lines.join('\n');
}
