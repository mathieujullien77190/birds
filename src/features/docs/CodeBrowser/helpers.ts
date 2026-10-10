import type { Node } from './types';

/** Arborescence de fichiers à partir de chemins `a/b/c.ext` : dossiers d'abord, puis ordre alphabétique. */
export function buildTree(paths: string[]): Node {
  const root: Node = { name: '', path: '', dir: true, children: [] };
  for (const p of paths) {
    let cur = root; const parts = p.split('/');
    parts.forEach((name, i) => {
      const path = parts.slice(0, i + 1).join('/'), dir = i < parts.length - 1;
      let n = cur.children.find((c) => c.name === name);
      if (!n) { n = { name, path, dir, children: [] }; cur.children.push(n); }
      cur = n;
    });
  }
  const sort = (n: Node) => { n.children.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1)); n.children.forEach(sort); };
  sort(root);
  return root;
}
