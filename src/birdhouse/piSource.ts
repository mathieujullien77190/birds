/** Le programme du Pi est un dossier de « chapitres » (`pi/nichoir/*.py`) exécutés l'un après l'autre dans le même espace de noms (voir `pi/nichoir/__init__.py`) :
 *  le simulateur doit les assembler dans le même ordre que Python. L'ordre est lu dans la liste `CHAPTERS` de `__init__.py` (une seule source de vérité). */
const FILES = import.meta.glob('../../pi/nichoir/*.py', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Noms des chapitres, dans l'ordre de la liste `CHAPTERS = [ "config", "etat", … ]` du texte de `__init__.py`. */
export function chapterOrder(initSource: string): string[] {
  const list = /CHAPTERS\s*=\s*\[([\s\S]*?)\]/.exec(initSource)?.[1] ?? '';
  return [...list.matchAll(/"(\w+)"/g)].map((m) => m[1]);
}

/** Le texte complet du programme : tous les chapitres, mis bout à bout dans l'ordre. Un chapitre listé mais absent est ignoré (le test de cohérence le signale). */
export function assembleSource(files: Record<string, string>, base = '../../pi/nichoir/'): string {
  const init = files[base + '__init__.py'] ?? '';
  return chapterOrder(init).map((n) => files[`${base}${n}.py`] ?? '').join('\n');
}

/** Le programme du Raspberry Pi, assemblé pour Pyodide. */
export const nichoirPy = assembleSource(FILES);
export const CHAPTER_FILES = FILES;
