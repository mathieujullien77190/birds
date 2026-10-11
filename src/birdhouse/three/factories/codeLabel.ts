import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, SRGBColorSpace, type BufferGeometry } from 'three';
import { textContours, TEXT_HEIGHT, textWidth, type CodeSpot } from '../../model';
import { geometries, shared } from '../registry/materials';
import { PALETTE } from '../registry/palette';

/** L'étiquette d'un code : un carré texturé. */
export type CodeLabel = Mesh<BufferGeometry, MeshBasicMaterial>;

/** Épaisseur du halo clair autour des traits (pixels). */
const HALO_PX = 7;
/** Pixels par millimètre de la texture d'un code. */
const PX_PER_MM = 24;
/** L'étiquette flotte de 0,08 mm au-dessus de la face (+z) de la plaque : la face qui reste vers le haut sur la planche de découpe, donc celle qui reçoit la gravure. */
const LIFT = 0.08;

/** Texture partagée d'un code : les MÊMES traits que ceux gravés (`textContours`), dessinés sur un canvas transparent. */
function codeMaterial(code: string): MeshBasicMaterial {
  return shared(`code:${code}`, () => {
    const { contours, w, h } = textContours(code, 1);
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w * PX_PER_MM); cv.height = Math.ceil(h * PX_PER_MM);
    const g = cv.getContext('2d')!;
    g.fillStyle = PALETTE.codeEngraving; g.strokeStyle = PALETTE.codeHalo; g.lineWidth = HALO_PX; g.lineJoin = 'round';
    for (const halo of [true, false]) for (const c of contours) { // un halo clair d'abord, puis les traits : lisible sur le bois clair comme sur le bois foncé
      g.beginPath();
      c.forEach(([x, y], i) => { const px = x * PX_PER_MM, py = (h - y) * PX_PER_MM; if (i) g.lineTo(px, py); else g.moveTo(px, py); });
      g.closePath(); if (halo) g.stroke(); else g.fill();
    }
    // matériau partagé par tous les codes identiques ; la texture est libérée avec lui par `disposeAll` (registre)
    const map = shared(`code-map:${code}`, () => { const tx = new CanvasTexture(cv); tx.colorSpace = SRGBColorSpace; return tx; });
    return new MeshBasicMaterial({ map, transparent: true, side: DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  });
}

/**
 * L'étiquette d'un code sur une plaque d'épaisseur `t` : un carré texturé (géométrie et matériau partagés du registre, un seul par code) posé sur sa face +z à l'emplacement
 * gravé (`spot`), couché de 90° si le texte est couché. Jamais sélectionnable : elle ne gêne aucun clic sur la plaque.
 */
export function createCodeLabel(code: string, spot: CodeSpot, t: number): CodeLabel {
  const m = new Mesh(geometries.unitPlane(), codeMaterial(code));
  m.scale.set(textWidth([...code].length, spot.scale), TEXT_HEIGHT * spot.scale, 1);
  m.position.set(spot.x, spot.y, t / 2 + LIFT);
  m.rotation.z = spot.turned ? Math.PI / 2 : 0;
  m.raycast = () => {};
  m.renderOrder = 1;
  return m;
}
