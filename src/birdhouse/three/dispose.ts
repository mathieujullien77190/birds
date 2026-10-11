import { Line, Material, Mesh, Points, Sprite, Texture, type Object3D } from 'three';
import { isShared } from './registry/materials';

/** Libère un matériau (et ses textures) — sauf s'il appartient au registre, qui le libère lui-même à la fermeture de la vue. */
function disposeMaterial(m: Material): void {
  if (isShared(m)) return;
  for (const v of Object.values(m)) if (v instanceof Texture && !isShared(v)) v.dispose();
  m.dispose();
}

/**
 * Libère récursivement les ressources GPU d'un objet et de ses enfants : géométries, matériaux non partagés, textures (étiquettes des cotes comprises).
 * Ne touche jamais aux ressources du registre (`registry/materials.ts`). Ne retire pas l'objet de son parent : à faire par l'appelant.
 */
export function disposeObject3D(root: Object3D): void {
  root.traverse((o) => {
    if (o instanceof Sprite) { disposeMaterial(o.material); return; } // la géométrie d'un Sprite est commune à tous : on n'y touche pas
    if (o instanceof Mesh || o instanceof Line || o instanceof Points) {
      o.geometry.dispose();
      const mats: Material | Material[] = o.material;
      for (const m of Array.isArray(mats) ? mats : [mats]) disposeMaterial(m);
    }
  });
}

/** Vide un groupe : chaque enfant est retiré puis libéré. */
export function clearGroup(group: Object3D): void {
  for (const o of [...group.children]) { group.remove(o); disposeObject3D(o); }
}
