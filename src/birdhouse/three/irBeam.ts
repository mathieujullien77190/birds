import { AdditiveBlending, BufferGeometry, CanvasTexture, Color, ConeGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Quaternion, SpotLight, Sprite, SpriteMaterial, Vector3, type Object3D } from 'three';

/** Les deux cartes de LED infrarouges du nichoir : celle du nid (compartiment de la caméra) et celle de l'extérieur (près de la caméra 2). */
export type IrKind = 'nid' | 'ext';

/** Réglages des faisceaux : ce qu'on voit quand les LED sont allumées, comme si l'œil voyait l'infrarouge. Longueurs en mm. */
export const IR_BEAM = {
  color: '#ff4d6d',
  halfAngle: (35 * Math.PI) / 180,
  length: { nid: 180, ext: 250 } as Record<IrKind, number>,
  /** Opacité du cône à l'apex (elle s'atténue jusqu'au bout). */
  opacity: 0.14,
  /** De jour les faisceaux restent visibles mais plus discrets. */
  dayFactor: 0.5,
  glow: { size: 14, opacity: 0.9 },
  /** Lumière réelle sur les surfaces : projecteur de même axe. */
  spot: { intensity: 120, angle: 0.6, penumbra: 0.6, distance: 300, decay: 1, targetDistance: 100 },
  /** Durée du fondu à l'allumage et à l'extinction (s). */
  fade: 0.15,
} as const;

/** Intensité visée : 1 si les LED sont allumées, 0 sinon. */
export const targetIntensity = (on: boolean): 0 | 1 => (on ? 1 : 0);

/** Fondu linéaire de `level` vers `target` (0–1) sur `IR_BEAM.fade` secondes : monotone, ne dépasse jamais la cible, atteint la cible même avec un grand pas de temps. */
export function fadeLevel(level: number, target: number, dt: number): number {
  if (!(dt > 0)) return level;
  const step = dt / IR_BEAM.fade;
  return level < target ? Math.min(target, level + step) : Math.max(target, level - step);
}

/** Facteur d'intensité selon l'ambiance : la nuit pleine intensité, le jour plus discret. */
export const ambientFactor = (night: boolean): number => (night ? 1 : IR_BEAM.dayFactor);

/** Axe du faisceau d'une carte : −z local de la carte (côté LED), comme l'objectif d'une caméra, tourné par l'orientation de la mesh. */
export function beamDirection(q: Quaternion): Vector3 {
  return new Vector3(0, 0, -1).applyQuaternion(q).normalize();
}

/** Pose du cône de longueur `len` dont le sommet est sur la carte : centre du cône et rotation qui envoie son axe (−y local, de l'apex vers la base) sur `dir`. */
export function conePose(origin: Vector3, dir: Vector3, len: number): { position: Vector3; quaternion: Quaternion } {
  return { position: origin.clone().addScaledVector(dir, len / 2), quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), dir) };
}

/** Cône ouvert (apex vers +y), d'un rose-rouge qui s'éteint vers la base : dégradé par couleurs de sommets (fusion additive). */
export function beamGeometry(len: number): BufferGeometry {
  const g = new ConeGeometry(len * Math.tan(IR_BEAM.halfAngle), len, 32, 1, true);
  const pos = g.getAttribute('position'), col = new Float32Array(pos.count * 3), c = new Color(IR_BEAM.color);
  for (let i = 0; i < pos.count; i++) { const k = (pos.getY(i) + len / 2) / len; col[3 * i] = c.r * k; col[3 * i + 1] = c.g * k; col[3 * i + 2] = c.b * k; } // 1 à l'apex, 0 à la base
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

/** Petite lueur ronde (dégradé radial). */
function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  if (x) {
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,120,150,0.7)'); gr.addColorStop(1, 'rgba(255,77,109,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(c);
}

interface Beam { kind: IrKind; cone: Mesh<BufferGeometry, MeshBasicMaterial>; glow: Sprite; spot: SpotLight; board: Object3D | null; target: number; level: number }

/**
 * Les faisceaux infrarouges d'une vue : par carte de LED, un cône translucide, une lueur sur la carte et un projecteur qui éclaire vraiment les surfaces.
 * Les projecteurs restent dans la scène à intensité 0 quand les LED sont éteintes (ajouter ou retirer une lumière fait recompiler tous les matériaux).
 * Rien ici ne se sélectionne ni ne se survole (le cône n'a pas de `raycast`). Possède ses géométries, matériaux, texture et lumières : `dispose()` les libère.
 */
export class IrBeams {
  /** Cônes et lueurs. */
  readonly group = new Group();
  /** Projecteurs et leurs cibles (à ajouter à la scène). */
  readonly lights = new Group();
  private readonly beams: Beam[];
  private readonly glowTex = glowTexture();
  private night = false;
  private suspended = false;

  constructor() {
    this.beams = (['nid', 'ext'] as const).map((kind): Beam => {
      const cone = new Mesh(beamGeometry(IR_BEAM.length[kind]), new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
      cone.raycast = () => { /* ni survol ni sélection */ };
      cone.frustumCulled = false;
      const glow = new Sprite(new SpriteMaterial({ map: this.glowTex, color: IR_BEAM.color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
      glow.scale.setScalar(IR_BEAM.glow.size);
      glow.raycast = () => { /* idem */ };
      const s = IR_BEAM.spot, spot = new SpotLight(IR_BEAM.color, 0, s.distance, s.angle, s.penumbra, s.decay);
      this.group.add(cone, glow);
      this.lights.add(spot, spot.target);
      cone.visible = glow.visible = false;
      return { kind, cone, glow, spot, board: null, target: 0, level: 0 };
    });
  }

  private of(kind: IrKind): Beam { return this.beams[kind === 'nid' ? 0 : 1]; }
  /** La carte de LED (mesh de la scène) dont part le faisceau ; `null` : plus de faisceau. */
  bind(kind: IrKind, board: Object3D | null): void { this.of(kind).board = board; }
  /** LED allumées ou éteintes. */
  set(kind: IrKind, on: boolean): void { this.of(kind).target = targetIntensity(on); }
  setNight(night: boolean): void { this.night = night; }
  /** Intensité courante (0–1) du faisceau d'une carte. */
  levelOf(kind: IrKind): number { return this.of(kind).level; }

  /** Un pas de la boucle de rendu : fondu, pose sur la carte, opacité, lumière. */
  update(dt: number): void {
    const f = ambientFactor(this.night);
    for (const b of this.beams) {
      b.level = fadeLevel(b.level, b.target, dt);
      const on = b.level > 0 && !!b.board && !this.suspended;
      b.cone.visible = b.glow.visible = on;
      if (b.board) {
        b.board.updateMatrixWorld(true);
        const origin = b.board.position, dir = beamDirection(b.board.quaternion), pose = conePose(origin, dir, IR_BEAM.length[b.kind]);
        b.cone.position.copy(pose.position); b.cone.quaternion.copy(pose.quaternion);
        b.glow.position.copy(origin).addScaledVector(dir, -2.4);
        b.spot.position.copy(origin); b.spot.target.position.copy(origin).addScaledVector(dir, IR_BEAM.spot.targetDistance); b.spot.target.updateMatrixWorld(true);
      }
      b.cone.material.opacity = IR_BEAM.opacity * b.level * f;
      b.glow.material.opacity = IR_BEAM.glow.opacity * b.level * f;
      b.spot.intensity = this.suspended || !b.board ? 0 : IR_BEAM.spot.intensity * b.level * f;
    }
  }

  /**
   * Cache cônes et lueurs et éteint les projecteurs (prise de vue d'une caméra : l'éclairage infrarouge y est déjà simulé) ; renvoie de quoi tout remettre.
   * Les projecteurs ne sont pas retirés de la scène : seule leur intensité tombe à 0.
   */
  suspend(): () => void {
    const was = this.beams.map((b) => ({ cone: b.cone.visible, glow: b.glow.visible, i: b.spot.intensity })), prev = this.suspended;
    this.suspended = true;
    this.beams.forEach((b) => { b.cone.visible = b.glow.visible = false; b.spot.intensity = 0; });
    return () => { this.suspended = prev; this.beams.forEach((b, k) => { b.cone.visible = was[k].cone; b.glow.visible = was[k].glow; b.spot.intensity = was[k].i; }); };
  }

  dispose(): void {
    for (const b of this.beams) {
      b.cone.geometry.dispose(); b.cone.material.dispose(); b.glow.material.dispose(); b.spot.dispose();
      this.lights.remove(b.spot, b.spot.target); this.group.remove(b.cone, b.glow);
    }
    this.glowTex.dispose();
  }
}
