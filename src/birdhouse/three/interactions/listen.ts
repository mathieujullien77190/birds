/** Inscrit un écouteur sur le canvas et renvoie sa désinscription (même référence, même option `capture`). */
export function listen<K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, capture = false): () => void {
  el.addEventListener(type, fn, capture);
  return () => el.removeEventListener(type, fn, capture);
}
