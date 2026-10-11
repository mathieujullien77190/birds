/** Petit émetteur d'événements typé. */
export class Emitter<T> {
  private subs = new Set<(v: T) => void>();
  on(cb: (v: T) => void): () => void { this.subs.add(cb); return () => { this.subs.delete(cb); }; }
  emit(v: T): void { for (const cb of [...this.subs]) cb(v); }
  clear(): void { this.subs.clear(); }
}
