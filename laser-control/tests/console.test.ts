import { describe, expect, it } from 'vitest';
import { consoleCommand } from '../src/components/GrblConsole/helpers';

describe('consoleCommand', () => {
  it('accepte les commandes système', () => {
    for (const c of ['$I', '$$', '$s', '$#', '$G', '$X', '$H', '$32=1', '$Light/Duty=500']) expect(consoleCommand(` ${c} `)).toBe(c);
  });
  it('refuse le G-code, les M-codes, les mouvements et le vide', () => {
    for (const c of ['', '   ', 'G1 X10', 'M3 S1000', 'M4', 'S500', '?', '$J=G91 X10', '$J=G21 G91 Y-5 F100', '$I; M3', '$I\nM3', '$$ G1 X1']) expect(consoleCommand(c)).toBeNull();
  });
});
