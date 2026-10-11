import { BufferAttribute, BufferGeometry, Float32BufferAttribute } from 'three';

/** Modèle 3D du Raspberry Pi 4 (STEP converti en binaire compact, voir public/models/pi4.bin) : chargé une fois, partagé. */
export let piModel: BufferGeometry | null = null;
let piLoading: Promise<void> | null = null;
export function loadPiModel(): Promise<void> {
  piLoading ??= fetch(`${import.meta.env.BASE_URL}models/pi4.bin`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('pi4.bin')))).then((buf) => {
    const head = new Uint32Array(buf, 0, 2), nV = head[0], nI = head[1];
    const pos = new Float32Array(buf, 8, nV * 3), col = new Uint8Array(buf, 8 + nV * 12, nV * 3), idx = new Uint32Array(buf.slice(8 + nV * 15, 8 + nV * 15 + nI * 4));
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('color', new Float32BufferAttribute(Float32Array.from(col, (v) => v / 255), 3));
    g.setIndex(new BufferAttribute(idx, 1));
    const flat = g.toNonIndexed(); // ombrage à facettes : les arêtes vives restent nettes
    flat.computeVertexNormals();
    g.dispose();
    piModel = flat;
  }).catch(() => { /* pas de modèle : on garde le dessin simplifié */ });
  return piLoading;
}
