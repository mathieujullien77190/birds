import { PerspectiveCamera, PointLight, SRGBColorSpace, Vector3, WebGLRenderTarget, type Object3D } from 'three';
import { CAMERA_SHOT } from './constants';
import type { View } from './types';

/** Vue « au niveau de la caméra » : on rend la scène 3D depuis l'objectif d'une carte caméra (`special = 'camera'`), pour servir d'image au flux vidéo simulé du Pi.
 *  Dans le repère de la carte l'objectif est à −z (voir `factories/part/camera.ts`) et le haut de l'image est +y : on lit donc direction et haut dans l'orientation de sa mesh. */
const LENS_TIP = CAMERA_SHOT.lensTip;
const cam = new PerspectiveCamera(CAMERA_SHOT.defaultFov, 4 / 3, CAMERA_SHOT.near, CAMERA_SHOT.far);
let target: WebGLRenderTarget | null = null;

/** Image (data URL JPEG) vue par la caméra dont la carte est la mesh `board`. `gray` : rendu infrarouge (NoIR, LED), en niveaux de gris. */
export function shootCamera(v: View, board: Object3D, label: string, opts: { w?: number; h?: number; fov?: number; gray?: boolean; level?: boolean; ir?: boolean; night?: boolean } = {}): string | null {
  const { w = CAMERA_SHOT.width, h = CAMERA_SHOT.height, fov = CAMERA_SHOT.defaultFov, gray = false, level = false, ir = false, night = false } = opts; // level : horizon redressé (la carte peut être posée de travers, l'image non)
  board.updateMatrixWorld(true);
  const q = board.quaternion;
  const dir = new Vector3(0, 0, -1).applyQuaternion(q), up = new Vector3(0, 1, 0).applyQuaternion(q);
  cam.fov = fov; cam.aspect = w / h; cam.updateProjectionMatrix();
  cam.position.copy(board.position).addScaledVector(dir, LENS_TIP);
  cam.up.copy(level ? new Vector3(0, 0, 1) : up);
  cam.lookAt(cam.position.clone().add(dir));

  if (!target || target.width !== w || target.height !== h) {
    target?.dispose();
    target = new WebGLRenderTarget(w, h);
    target.texture.colorSpace = SRGBColorSpace; // sinon l'image sort sombre (conversion de sortie faite seulement à l'écran)
  }
  const hide = [v.labels, v.handles, v.targets, v.holeMark, v.pullMark, v.cutMark, board]; // ni cotes, ni poignées, ni la carte elle-même
  const was = hide.map((o) => o.visible);
  hide.forEach((o) => { o.visible = false; });
  // vision nocturne : les LED infrarouges de la caméra éclairent la scène (lampe ponctuelle posée à l'objectif, le temps de la prise de vue)
  const lamp = ir ? new PointLight(CAMERA_SHOT.lamp.color, CAMERA_SHOT.lamp.intensity, CAMERA_SHOT.lamp.distance, CAMERA_SHOT.lamp.decay) : null;
  if (lamp) { lamp.position.copy(cam.position); v.scene.add(lamp); }
  const r = v.renderer;
  const prev = r.getRenderTarget();
  r.setRenderTarget(target);
  r.render(v.scene, cam);
  const px = new Uint8Array(w * h * 4);
  r.readRenderTargetPixels(target, 0, 0, w, h, px);
  r.setRenderTarget(prev);
  if (lamp) v.scene.remove(lamp);
  hide.forEach((o, i) => { o.visible = was[i]; });

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // la lecture WebGL est à l'envers
  if (gray) for (let i = 0; i < img.data.length; i += 4) { const g = 0.3 * img.data[i] + 0.59 * img.data[i + 1] + 0.11 * img.data[i + 2]; img.data[i] = g; img.data[i + 1] = g; img.data[i + 2] = g; }
  if (night) for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * (ir ? CAMERA_SHOT.grainIr : CAMERA_SHOT.grain); img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; } // grain du capteur la nuit
  ctx.putImageData(img, 0, 0);
  ctx.font = '11px monospace'; ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, h - 16, w, 16);
  ctx.fillStyle = '#fff'; ctx.fillText(`${label}  ${new Date().toLocaleTimeString('fr-FR')}`, 6, h - 4);
  return c.toDataURL('image/jpeg', CAMERA_SHOT.jpegQuality);
}
