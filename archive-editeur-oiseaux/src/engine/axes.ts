import { CanvasTexture, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, Object3D, Sprite, SpriteMaterial } from 'three';

/** Couleurs des axes : X rouge, Y vert, Z bleu (convention three.js / Blender). */
export const AXIS_COLORS = ['#e8504d', '#4fc27a', '#4d8ae8'] as const;

/**
 * Trois axes qui traversent l'origine : chaque tige va de −L à +L, avec une pointe de flèche du côté +.
 * Chaque axe est construit le long de Y puis orienté ; `resizeAxes` règle la demi-longueur L
 * de chacun sans changer son épaisseur.
 */
export function makeAxes(radius: number, withTips = true, grips = false): Group {
  const g = new Group();
  g.name = 'axes';
  for (let i = 0; i < 3; i++) {
    const mat = new MeshBasicMaterial({ color: AXIS_COLORS[i], toneMapped: false });
    const arrow = new Group();
    const shaft = new Mesh(new CylinderGeometry(radius, radius, 1, 6, 1), mat); // centré : de −0.5 à +0.5 sur Y
    shaft.name = 'shaft';
    const tip = new Mesh(new ConeGeometry(radius * 3.5, radius * 10, 10), mat);
    tip.name = 'tip';
    tip.visible = withTips;
    arrow.add(shaft, tip);
    if (grips) { // poignée : cylindre invisible mais bien plus épais, pour attraper la flèche à la souris
      const grip = new Mesh(new CylinderGeometry(radius * 7, radius * 7, 1, 6, 1), new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      grip.name = 'grip';
      grip.userData.axis = i;
      arrow.add(grip);
    }
    if (i === 0) arrow.rotation.z = -Math.PI / 2; // +Y → +X
    if (i === 2) arrow.rotation.x = Math.PI / 2; // +Y → +Z
    g.add(arrow);
  }
  return g;
}

/** Étiquettes « X », « Y », « Z » posées à la distance `d` sur le côté + de chaque axe du monde. */
export function makeAxisLabels(d: number): Group {
  const g = new Group();
  ['X', 'Y', 'Z'].forEach((t, i) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = AXIS_COLORS[i];
    ctx.fillText(t, 32, 34);
    const sp = new Sprite(new SpriteMaterial({ map: new CanvasTexture(c), transparent: true, depthTest: false, toneMapped: false }));
    sp.scale.setScalar(0.18);
    sp.position.set(i === 0 ? d : 0, i === 1 ? d : 0, i === 2 ? d : 0);
    sp.renderOrder = 40;
    g.add(sp);
  });
  return g;
}

/** Demi-longueur de chaque axe (X, Y, Z) : la tige va de −L à +L, la pointe est à +L. */
export function resizeAxes(axes: Group, half: [number, number, number]): void {
  axes.children.forEach((arrow: Object3D, i) => {
    const shaft = arrow.getObjectByName('shaft')!, tip = arrow.getObjectByName('tip')!;
    const L = Math.max(0.05, half[i]);
    shaft.scale.set(1, 2 * L, 1);
    tip.position.y = L;
    const grip = arrow.getObjectByName('grip');
    if (grip) grip.scale.set(1, 2 * L + 0.1, 1);
  });
}
