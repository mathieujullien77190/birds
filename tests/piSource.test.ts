// Le simulateur assemble les chapitres de pi/nichoir/ dans l'ordre de `CHAPTERS` (pi/nichoir/__init__.py) : même ordre que Python.
import { describe, expect, it } from 'vitest';
import { assembleSource, chapterOrder, nichoirPy, CHAPTER_FILES } from '@/birdhouse/piSource';

describe('piSource : les chapitres du programme du Pi', () => {
  it('lit l\'ordre dans la liste CHAPTERS, sans rien d\'autre', () => {
    expect(chapterOrder('CHAPTERS = [\n  "a",   # un\n  "b",\n]\nautre = ["c"]')).toEqual(['a', 'b']);
    expect(chapterOrder('rien')).toEqual([]);
  });
  it('assemble les chapitres dans l\'ordre, ignore un chapitre absent', () => {
    const f = { 'x/__init__.py': 'CHAPTERS = ["un", "deux", "trois"]', 'x/un.py': 'A', 'x/trois.py': 'C' };
    expect(assembleSource(f, 'x/')).toBe('A\n\nC');
    expect(assembleSource({}, 'x/')).toBe('');
  });
  it('le vrai dossier : chaque fichier est listé, le texte assemblé commence par la configuration et finit par le démarrage', () => {
    const noms = Object.keys(CHAPTER_FILES).map((p) => p.split('/').pop()!.replace('.py', '')).filter((n) => n !== '__init__' && n !== '__main__').sort();
    expect(chapterOrder(CHAPTER_FILES['../../pi/nichoir/__init__.py']).slice().sort()).toEqual(noms);
    expect(nichoirPy.indexOf('def log(')).toBeLessThan(nichoirPy.indexOf('def read_sensors('));
    expect(nichoirPy.indexOf('def read_sensors(')).toBeLessThan(nichoirPy.indexOf('def main('));
  });
});
