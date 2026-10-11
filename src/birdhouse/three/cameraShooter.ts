import { PerspectiveCamera, PointLight, SRGBColorSpace, Vector3, WebGLRenderTarget, type Object3D, type Scene, type WebGLRenderer } from 'three';
import { CAMERA_SHOT } from './constants';

/** Options d'une prise de vue. */
export interface ShotOptions {
  w?: number; h?: number; fov?: number;
  /** Niveaux de gris (rendu infrarouge, NoIR). */
  gray?: boolean;
  /** Horizon redressé (la carte peut être posée de travers, l'image non). */
  level?: boolean;
  /** LED infrarouges allumées : une lampe éclaire la scène depuis l'objectif, le temps de la prise. */
  ir?: boolean;
  /** Nuit : grain du capteur. */
  night?: boolean;
}

/** Ce que la prise de vue demande au renderer (une doublure suffit pour les tests). */
export type ShotRenderer = Pick<WebGLRenderer, 'getRenderTarget' | 'setRenderTarget' | 'render' | 'readRenderTargetPixels'>;

/**
 * Le « haut » de la caméra de la prise de vue. Avec `level` l'horizon est redressé (haut = +z) ; mais quand l'objectif regarde presque à la verticale,
 * +z est parallèle à la direction et `lookAt` dégénère : on prend alors le haut de la carte (toujours perpendiculaire à la direction).
 */
export function shotUp(dir: Vector3, boardUp: Vector3, level: boolean): Vector3 {
  if (!level || Math.abs(dir.z) > 0.9999) return boardUp.clone();
  return new Vector3(0, 0, 1);
}

/**
 * Prises de vue « au niveau de la caméra » : rend la scène 3D depuis l'objectif d'une carte caméra (`special = 'camera'`), pour servir d'image au flux vidéo simulé du Pi.
 * Dans le repère de la carte l'objectif est à −z (voir `factories/part/camera.ts`) et le haut de l'image est +y : on lit donc direction et haut dans l'orientation de sa mesh.
 * Possède sa caméra et son render target (créé à la demande, libéré par `dispose()`), liés à UNE vue.
 */
export class CameraShooter {
  private readonly cam = new PerspectiveCamera(CAMERA_SHOT.defaultFov, 4 / 3, CAMERA_SHOT.near, CAMERA_SHOT.far);
  /** Lampe des LED infrarouges : permanente (ajoutée puis retirée à chaque prise, elle faisait recompiler les shaders), éteinte (intensité 0) hors prise de vue infrarouge. */
  private readonly lamp = new PointLight(CAMERA_SHOT.lamp.color, 0, CAMERA_SHOT.lamp.distance, CAMERA_SHOT.lamp.decay);
  private target: WebGLRenderTarget | null = null;
  /** Faisceaux infrarouges visibles dans la vue : cachés (et projecteurs éteints) le temps d'une prise de vue, la lampe ci-dessus simule déjà cet éclairage. */
  beams?: { suspend(): () => void };

  /** `overlays` : les repères de la vue (cotes, trou, face, coupe), cachés pendant la prise de vue. */
  constructor(private readonly scene: Scene, private readonly renderer: ShotRenderer, private readonly overlays: readonly Object3D[]) {
    scene.add(this.lamp);
  }

  /** Image (data URL JPEG) vue par la caméra dont la carte est la mesh `board`. */
  shoot(board: Object3D, label: string, opts: ShotOptions = {}): string | null {
    const { w = CAMERA_SHOT.width, h = CAMERA_SHOT.height, fov = CAMERA_SHOT.defaultFov, gray = false, level = false, ir = false, night = false } = opts;
    const { scene, renderer: r, cam } = this;
    board.updateMatrixWorld(true);
    const q = board.quaternion;
    const dir = new Vector3(0, 0, -1).applyQuaternion(q), up = new Vector3(0, 1, 0).applyQuaternion(q);
    cam.fov = fov; cam.aspect = w / h; cam.updateProjectionMatrix();
    cam.position.copy(board.position).addScaledVector(dir, CAMERA_SHOT.lensTip);
    cam.up.copy(shotUp(dir, up, level));
    cam.lookAt(cam.position.clone().add(dir));

    const target = this.targetFor(w, h);
    const hide = [...this.overlays, board]; // ni cotes, ni repères, ni la carte elle-même
    const was = hide.map((o) => o.visible);
    // vision nocturne : les LED infrarouges de la caméra éclairent la scène (la lampe est posée à l'objectif et allumée le temps de la prise de vue)
    const lamp = this.lamp;
    const prev = r.getRenderTarget(), px = new Uint8Array(w * h * 4), resumeBeams = this.beams?.suspend();
    try {
      hide.forEach((o) => { o.visible = false; });
      lamp.position.copy(cam.position);
      lamp.intensity = ir ? CAMERA_SHOT.lamp.intensity : 0;
      r.setRenderTarget(target);
      r.render(scene, cam);
      r.readRenderTargetPixels(target, 0, 0, w, h, px);
    } finally { // quoi qu'il arrive : la vue retrouve son état (cible de rendu, lampe, visibilités)
      r.setRenderTarget(prev);
      resumeBeams?.();
      lamp.intensity = 0;
      hide.forEach((o, i) => { o.visible = was[i]; });
    }

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

  /** Libère le render target (à appeler à la fermeture de la vue). */
  dispose(): void {
    this.scene.remove(this.lamp);
    this.lamp.dispose();
    this.target?.dispose();
    this.target = null;
  }

  private targetFor(w: number, h: number): WebGLRenderTarget {
    if (!this.target || this.target.width !== w || this.target.height !== h) {
      this.target?.dispose();
      this.target = new WebGLRenderTarget(w, h);
      this.target.texture.colorSpace = SRGBColorSpace; // sinon l'image sort sombre (conversion de sortie faite seulement à l'écran)
    }
    return this.target;
  }
}
