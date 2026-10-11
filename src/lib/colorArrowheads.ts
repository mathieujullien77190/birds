/**
 * Mermaid dessine toutes les pointes de flèche en gris (un seul `<marker>` par type, partagé) : seul le trait prend la couleur de `linkStyle`.
 * Cette fonction donne à chaque flèche sa propre copie de pointe, de la couleur de son trait (début et fin, pour les flèches à double sens).
 */
export function colorArrowheads(root: ParentNode): void {
  const svg = root instanceof SVGSVGElement ? root : root.querySelector('svg');
  if (!svg) return;
  const made = new Map<string, string>();
  const recolor = (path: SVGPathElement, attr: 'marker-start' | 'marker-end', color: string) => {
    const ref = path.getAttribute(attr);
    const id = ref && /#([^)"']+)/.exec(ref)?.[1];
    if (!id) return;
    const key = id + color;
    let copy = made.get(key);
    if (!copy) {
      const marker = svg.querySelector(`[id="${id}"]`);
      if (!marker) return;
      const clone = marker.cloneNode(true) as Element;
      copy = `${id}-c${made.size}`;
      clone.setAttribute('id', copy);
      for (const el of Array.from(clone.querySelectorAll<SVGElement>('*'))) { el.style.setProperty('fill', color, 'important'); el.style.setProperty('stroke', color, 'important'); }
      marker.parentNode?.appendChild(clone);
      made.set(key, copy);
    }
    path.setAttribute(attr, `url(#${copy})`);
  };
  for (const path of Array.from(svg.querySelectorAll<SVGPathElement>('path.flowchart-link'))) {
    const color = getComputedStyle(path).stroke;
    if (!color || color === 'none') continue;
    recolor(path, 'marker-start', color);
    recolor(path, 'marker-end', color);
  }
}
