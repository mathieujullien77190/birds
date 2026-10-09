import {
  BufferGeometry, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, MOUSE, Object3D, PerspectiveCamera,
  Raycaster, Scene, Vector2, WebGLRenderer, Box3, Vector3, Float32BufferAttribute, Group, LineSegments, LineBasicMaterial,
  MeshBasicMaterial, SphereGeometry, CylinderGeometry, Quaternion, MathUtils, PlaneGeometry, DoubleSide, Line, Sprite, SpriteMaterial, CanvasTexture,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { simplify } from './simplify';
import { EditMesh } from './meshEdit';
import { sectionContours, type SlicePlane } from './slices';

// Repère : X = droite, Y = profondeur, Z = haut (comme l'éditeur d'oiseaux archivé).
Object3D.DEFAULT_UP.set(0, 0, 1);

export type Vec3 = [number, number, number];

/** Réglages d'un modèle affiché (la géométrie, elle, reste dans la vue). */
export interface ModelState {
  id: string;
  name: string;
  /** Position du centre du modèle (les modèles sont rangés côte à côte). */
  pos: Vec3;
  /** Rotation en degrés (ordre XYZ) autour du centre du modèle. */
  rot: Vec3;
  /** Échelle uniforme (1 = taille d'import : le plus grand côté fait ~2). */
  scale: number;
  color: string;
  /** Triangles affichés (après réduction et édition). */
  triangles: number;
  /** Triangles du fichier d'origine. */
  original: number;
  /** Nombre de triangles visé par la réduction ; 0 = maillage d'origine. */
  target: number;
  /** Largeur (X) à l'import, pour ranger les modèles côte à côte. */
  width: number;
}

export type EditTool = 'vertex' | 'edge' | 'tri' | 'select' | 'plane';
/** Axe autour duquel tournent les plans de « Générer les traits » : X, Y, Z, ou une diagonale du plan courant. */
export type TraceAxis = 'X' | 'Y' | 'Z' | 'D1' | 'D2';

/** Plan de coupe vertical : décalage le long de sa normale (unités du modèle), orientation autour de Z (degrés), côté gardé. */
export interface CutPlane {
  /** Décalage le long de la normale (unités du modèle). */
  offset: number;
  /** Orientation autour de la verticale (degrés). */
  angle: number;
  /** Inclinaison (degrés) : 0 = plan vertical, ±90 = plan horizontal. */
  tilt: number;
  /** Rotations (degrés) autour des deux diagonales du carré, appliquées après l'orientation et l'inclinaison. */
  diag1: number;
  diag2: number;
  keep: 'right' | 'left';
}
/** Couleurs des triangles gardés / supprimés quand le plan de coupe est actif. */
const PLANE_COLORS = ['#9be7a8', '#f49a9a'];

export interface ViewerEvents {
  /** Clic sur un modèle (ou dans le vide : null), hors mode édition. */
  onPick: (id: string | null) => void;
  /** Le maillage a été modifié à la main : nouveau nombre de triangles et sommets (pour l'enregistrer). */
  onEdit: (id: string, triangles: number, positions: Float32Array) => void;
  /** Nombre de triangles sélectionnés au cadre. */
  onSelect: (count: number) => void;
  /** Actions du mode édition annulables, de la plus ancienne à la plus récente. */
  onHistory: (labels: string[]) => void;
  /** Les traits de coupe gardés d'un modèle ont changé (à enregistrer). */
  onTraces: (id: string, traces: Float32Array[]) => void;
  /** Message pour l'utilisateur (opération impossible…). */
  onMessage: (msg: string) => void;
}

type EditTarget = { kind: 'vertex'; v: number } | { kind: 'edge'; a: number; b: number } | { kind: 'tri'; t: number };

/** Taille visée du plus grand côté d'un modèle importé, en unités de la scène. */
const FIT = 2;
const EDIT_HISTORY = 100;

/** Scène Three.js pure : aucune dépendance React. La caméra se manie comme dans l'éditeur archivé. */
export class StlViewer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly meshes = new Map<string, Mesh>();
  /** Géométrie d'origine de chaque modèle (la réduction en dérive, et « Original » y revient). */
  private readonly originals = new Map<string, BufferGeometry>();
  /** Dernière réduction calculée par modèle (pour ne pas la refaire si la cible n'a pas changé). */
  private readonly reduced = new Map<string, { target: number; geo: BufferGeometry }>();
  /** Maillage retouché à la main, valable pour une cible de réduction donnée. */
  private readonly overrides = new Map<string, { target: number; geo: BufferGeometry }>();
  /** Aperçu temporaire (modèle arrondi en bandes) affiché à la place du maillage courant, non enregistré. */
  private readonly previews = new Map<string, BufferGeometry>();
  private readonly raycaster = new Raycaster();
  private readonly ro: ResizeObserver;
  /** Axes généraux (ligne + lettre), affichables ou non. */
  private readonly axisGroups: Record<string, Group> = {};
  /** Plans ⟂ aux axes généraux, par le centre du modèle sélectionné, avec leur ligne de coupe. */
  private readonly worldPlanes: Record<string, { group: Group; trace: LineSegments; dir: Vector3; key: string }> = {};
  private worldPlaneOn: Record<string, boolean> = { X: false, Y: false, Z: false };
  private downAt: { x: number; y: number } | null = null;

  // mode édition
  private edit: { id: string; mesh: EditMesh; history: { mesh: EditMesh; label: string }[]; target: number } | null = null;
  private editTool: EditTool = 'vertex';
  private readonly editGroup = new Group();
  private readonly wire = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: new Color('#1f2937'), transparent: true, opacity: 0.55 }));
  private readonly hoverMat = new MeshBasicMaterial({ color: new Color('#e11d48'), depthTest: false, transparent: true, opacity: 0.9 });
  private readonly hoverSphere = new Mesh(new SphereGeometry(1, 12, 8), this.hoverMat);
  private readonly hoverEdge = new Mesh(new CylinderGeometry(1, 1, 1, 8), this.hoverMat);
  private readonly hoverTri = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ color: new Color('#e11d48'), depthTest: false, transparent: true, opacity: 0.55, side: 2 }));
  // sélection au polygone (outil « select ») : triangles retenus, leur surbrillance, et le tracé en pointillés
  private selection = new Set<number>();
  private readonly selMesh = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ color: new Color('#f97316'), depthTest: false, transparent: true, opacity: 0.6, side: 2 }));
  private readonly lassoSvg: SVGSVGElement;
  private readonly lassoPath: SVGPolylineElement;
  private readonly lassoBand: SVGLineElement;
  private readonly lassoDots: SVGGElement;
  /** Sommets du polygone en cours (coordonnées client). */
  private lasso: Vector2[] = [];
  private selectThrough = false;
  // plan de coupe vertical (outil « plane ») : plan bleu transparent, triangles teintés selon le côté
  private plane: CutPlane = { offset: 0, angle: 90, tilt: 0, diag1: 0, diag2: 0, keep: 'right' };
  /** Traits de coupe gardés par modèle (rouge sombre) : enfants du mesh, visibles en permanence, enregistrés. */
  private readonly traces = new Map<string, LineSegments[]>();
  private readonly planeGroup = new Group();
  private dropCount = 0;
  // trait de coupe : contours fermés de l'intersection plan/modèle (les trous sont pontés par une courbe lissée)
  private traceOn = false;
  private readonly traceLines = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: new Color('#ff2d2d'), depthTest: false }));

  constructor(private readonly container: HTMLElement, private readonly events: ViewerEvents) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';

    this.scene.background = new Color('#e8f0f2');
    this.camera = new PerspectiveCamera(40, 1, 0.01, 200);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(4.3, 2.6, 2.4);

    // clic gauche ou molette (bouton du milieu) = tourner la vue ; clic droit = déplacer ; roulette = zoom
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0.8);
    this.controls.enableDamping = true;
    this.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.PAN };
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 60;

    // axes généraux : X rouge (droite), Y vert (profondeur), Z bleu (hauteur), avec leur lettre ; et un plan ⟂ à chacun, désactivé au départ
    const AX = 3;
    ([['X', '#e8504d', new Vector3(1, 0, 0)], ['Y', '#4fc27a', new Vector3(0, 1, 0)], ['Z', '#4d8ae8', new Vector3(0, 0, 1)]] as const).forEach(([name, color, dir]) => {
      const group = new Group();
      group.add(new Line(new BufferGeometry().setFromPoints([dir.clone().multiplyScalar(-AX), dir.clone().multiplyScalar(AX)]), new LineBasicMaterial({ color: new Color(color), transparent: true, opacity: 0.7 })));
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.font = 'bold 44px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(name === 'Z' ? 'Z ↑' : name, 32, 34);
      const sprite = new Sprite(new SpriteMaterial({ map: new CanvasTexture(canvas), depthTest: false, transparent: true }));
      sprite.position.copy(dir).multiplyScalar(AX + 0.15);
      sprite.scale.setScalar(0.3);
      group.add(sprite);
      this.scene.add(group);
      this.axisGroups[name] = group;
      // plan ⟂ à l'axe : carré transparent + ligne de coupe rouge, placés sur le modèle sélectionné dans sync()
      const plane = new Group();
      const square = new Mesh(new PlaneGeometry(AX * 1.2, AX * 1.2), new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity: 0.15, side: DoubleSide, depthWrite: false }));
      square.lookAt(dir); // PlaneGeometry regarde +Z : on l'oriente selon l'axe
      plane.add(square);
      const trace = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: new Color('#ff2d2d'), depthTest: false }));
      trace.renderOrder = 21;
      plane.add(trace);
      plane.visible = false;
      this.scene.add(plane);
      this.worldPlanes[name] = { group: plane, trace, dir: dir.clone(), key: '' };
    });

    this.scene.add(new HemisphereLight(new Color('#ffffff'), new Color('#b9c4a8'), 1.4));
    const sun = new DirectionalLight(new Color('#fff4dc'), 1.6);
    sun.position.set(3, 2, 6);
    this.scene.add(sun);

    // surbrillance du mode édition : par-dessus tout
    this.wire.renderOrder = 10;
    this.hoverSphere.renderOrder = 20;
    this.hoverEdge.renderOrder = 20;
    this.hoverTri.renderOrder = 20;
    this.hoverSphere.visible = this.hoverEdge.visible = this.hoverTri.visible = false;
    this.selMesh.renderOrder = 15;
    const planeMesh = new Mesh(new PlaneGeometry(FIT * 1.5, FIT * 1.5), new MeshBasicMaterial({ color: new Color('#2563eb'), transparent: true, opacity: 0.22, side: 2, depthWrite: false }));
    planeMesh.rotation.y = Math.PI / 2; // vertical, normale selon X : il coupe en droite / gauche
    planeMesh.renderOrder = 12;
    // deux axes en diagonale sur le carré : on voit le centre et l'orientation du plan
    const h = (FIT * 1.5) / 2;
    const diagonals = new LineSegments(
      new BufferGeometry().setAttribute('position', new Float32BufferAttribute([-h, -h, 0, h, h, 0, -h, h, 0, h, -h, 0], 3)),
      new LineBasicMaterial({ color: new Color('#1e3a8a'), transparent: true, opacity: 0.7, depthTest: false }),
    );
    diagonals.renderOrder = 13;
    planeMesh.add(diagonals); // même repère que le carré
    this.planeGroup.add(planeMesh);
    this.planeGroup.visible = false;
    this.traceLines.renderOrder = 21;
    this.traceLines.visible = false;
    this.editGroup.add(this.wire, this.hoverSphere, this.hoverEdge, this.hoverTri, this.selMesh, this.planeGroup, this.traceLines);
    // polygone de sélection : un calque SVG en pointillés par-dessus la vue
    if (!container.style.position) container.style.position = 'relative';
    const NS = 'http://www.w3.org/2000/svg';
    this.lassoSvg = document.createElementNS(NS, 'svg');
    Object.assign(this.lassoSvg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', display: 'none' });
    this.lassoPath = document.createElementNS(NS, 'polyline');
    this.lassoPath.setAttribute('fill', 'rgba(225,29,72,0.08)');
    this.lassoPath.setAttribute('stroke', '#e11d48');
    this.lassoPath.setAttribute('stroke-width', '1.5');
    this.lassoPath.setAttribute('stroke-dasharray', '6 4');
    this.lassoBand = document.createElementNS(NS, 'line');
    this.lassoBand.setAttribute('stroke', '#e11d48');
    this.lassoBand.setAttribute('stroke-width', '1');
    this.lassoBand.setAttribute('stroke-dasharray', '3 3');
    this.lassoDots = document.createElementNS(NS, 'g');
    this.lassoSvg.append(this.lassoPath, this.lassoBand, this.lassoDots);
    container.appendChild(this.lassoSvg);
    window.addEventListener('keydown', this.onKey, true);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onDown);
    dom.addEventListener('pointermove', this.onMove);
    dom.addEventListener('pointerup', this.onUp);
    dom.addEventListener('dblclick', this.onDblClick);
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  private resize(): void {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private setRay(e: PointerEvent): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
  }

  // un clic (sans glissé) sur un modèle le sélectionne ; dans le vide, désélectionne ; en mode édition, applique l'outil
  private onDown = (e: PointerEvent): void => { this.downAt = { x: e.clientX, y: e.clientY }; };
  private onMove = (e: PointerEvent): void => {
    if (!this.edit) return;
    if (this.editTool === 'select') { this.drawLasso(e); return; }
    if (this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 4) { this.setHover(null); return; } // on tourne la vue
    this.setHover(this.pickEditTarget(e));
  };
  private onUp = (e: PointerEvent): void => {
    const d = this.downAt;
    this.downAt = null;
    if (e.button !== 0 || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
    if (this.edit && this.editTool === 'select') {
      // un clic = un sommet du polygone ; un clic sur le premier sommet le ferme
      const first = this.lasso[0];
      if (first && this.lasso.length >= 3 && Math.hypot(e.clientX - first.x, e.clientY - first.y) < 10) { this.closeLasso(e.shiftKey); return; }
      this.lasso.push(new Vector2(e.clientX, e.clientY));
      this.drawLasso(e);
      return;
    }
    if (this.edit) { this.applyEdit(this.pickEditTarget(e)); return; }
    this.setRay(e);
    const hit = this.raycaster.intersectObjects([...this.meshes.values()], false)[0];
    this.events.onPick(hit ? (hit.object.userData.id as string) : null);
  };

  /** Lit un .stl, le centre sur son pivot et le met à l'échelle. Renvoie ses réglages de départ (centré en x = `x`). */
  load(id: string, name: string, buffer: ArrayBuffer, x: number): ModelState {
    const geo: BufferGeometry = new STLLoader().parse(buffer);
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const size = bb.getSize(new Vector3());
    const centre = bb.getCenter(new Vector3());
    geo.translate(-centre.x, -centre.y, -centre.z);
    const fit = FIT / Math.max(size.x, size.y, size.z, 1e-9);
    geo.scale(fit, fit, fit);
    geo.computeVertexNormals();
    // visible des deux côtés : après une suppression, l'intérieur se lit comme une surface et non comme des arêtes flottantes
    const mesh = new Mesh(geo, new MeshStandardMaterial({ color: '#c9b8a0', roughness: 0.9, flatShading: true, side: DoubleSide }));
    mesh.userData.id = id;
    this.scene.add(mesh);
    this.meshes.set(id, mesh);
    this.originals.set(id, geo);
    const triangles = geo.attributes.position.count / 3;
    return { id, name, pos: [x, 0, (size.z * fit) / 2], rot: [0, 0, 0], scale: 1, color: '#c9b8a0', triangles, original: triangles, target: 0, width: size.x * fit };
  }

  /** Une géométrie est-elle gardée en réserve (original, réduction, retouche) ? Sinon on peut la libérer. */
  private kept(id: string, g: BufferGeometry): boolean {
    return g === this.originals.get(id) || g === this.reduced.get(id)?.geo || g === this.overrides.get(id)?.geo;
  }

  private show(id: string, geo: BufferGeometry): void {
    const mesh = this.meshes.get(id);
    if (!mesh || mesh.geometry === geo) return;
    if (!this.kept(id, mesh.geometry)) {
      if (this.previews.get(id) === mesh.geometry) this.previews.delete(id);
      mesh.geometry.dispose();
    }
    mesh.geometry = geo;
    if (mesh.userData.painted) this.paintPieces(id, null, []); // la peinture par pièces ne vaut plus pour ce nouveau maillage
  }

  /** Recalcule le maillage affiché : réduction à ~`target` triangles (0 = original), puis retouche à la main si elle vaut pour cette cible. Renvoie le nombre de triangles. */
  rebuild(id: string, target: number): number {
    const mesh = this.meshes.get(id), original = this.originals.get(id);
    if (!mesh || !original) return 0;
    let base = this.reduced.get(id);
    if (!base || base.target !== target) {
      if (base && base.geo !== original) base.geo.dispose();
      const geo = target > 0 && target < original.attributes.position.count / 3 ? simplify(original, target) : original;
      base = { target, geo };
      this.reduced.set(id, base);
    }
    const o = this.overrides.get(id);
    const next = o && o.target === target ? o.geo : base.geo;
    this.show(id, next);
    if (this.edit?.id === id && this.edit.target !== target) this.setEdit(null); // la réduction a changé : l'édition en cours ne vaut plus
    return next.attributes.position.count / 3;
  }

  /** Installe (ou retire, avec null) un maillage retouché à la main, enregistré pour cette cible de réduction. */
  setOverride(id: string, target: number, positions: Float32Array | null): void {
    const old = this.overrides.get(id);
    if (old && old.geo !== this.meshes.get(id)?.geometry) old.geo.dispose();
    if (!positions) { this.overrides.delete(id); return; }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    this.overrides.set(id, { target, geo: g });
  }

  // ----- mode édition -----

  /** Entre en mode édition sur un modèle (ou en sort avec null). Le maillage affiché devient éditable sommet par sommet. */
  setEdit(id: string | null, target = 0): void {
    if (this.edit) {
      if (this.meshes.get(this.edit.id)?.userData.painted) this.paintPieces(this.edit.id, null, []);
      this.editGroup.removeFromParent();
      this.setHover(null);
      this.cancelLasso();
      this.edit = null;
    }
    const mesh = id ? this.meshes.get(id) : undefined;
    if (!id || !mesh) return;
    const em = EditMesh.fromGeometry(mesh.geometry);
    this.edit = { id, mesh: em, history: [], target };
    mesh.add(this.editGroup);
    this.planeGroup.visible = this.editTool === 'plane';
    this.refreshEdit(false);
  }

  setEditTool(tool: EditTool): void {
    this.editTool = tool;
    this.setHover(null);
    this.cancelLasso();
    this.setSelection(new Set());
    this.planeGroup.visible = tool === 'plane';
    this.traceLines.visible = false;
    if (tool === 'plane') this.repaintPlane();
    else if (this.edit) this.paintPieces(this.edit.id, null, []);
  }
  /** La sélection au polygone prend-elle aussi les faces cachées (dos, parties masquées) ? */
  setSelectThrough(through: boolean): void { this.selectThrough = through; }

  // ----- plan de coupe vertical -----

  setPlane(p: CutPlane): void { this.plane = p; this.repaintPlane(); }

  /** Affiche (ou cache) le trait de coupe ; il suit ensuite les mouvements du plan. */
  traceSection(on: boolean): void {
    this.traceOn = on;
    if (on) this.updateTrace(); else this.traceLines.visible = false;
  }
  get tracing(): boolean { return this.traceOn; }

  /** Intersection plan/modèle → contours ; les bouts ouverts (trous) sont reliés par une courbe lissée. */
  private updateTrace(): void {
    const ed = this.edit;
    if (!ed || !this.traceOn || this.editTool !== 'plane') { this.traceLines.visible = false; return; }
    const r = this.sectionLines(this.planeNormal(), this.plane.offset);
    if (!r) { this.traceLines.visible = false; this.events.onMessage('Le plan ne coupe pas le modèle.'); return; }
    this.traceLines.geometry.dispose();
    this.traceLines.geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(r.pos, 3));
    this.traceLines.visible = true;
    this.events.onMessage(`Coupe tracée : ${r.contours} contour${r.contours > 1 ? 's' : ''}${r.holes ? `, ${r.holes} trou${r.holes > 1 ? 's' : ''} ponté${r.holes > 1 ? 's' : ''}` : ''}.`);
  }

  /**
   * Génère un trait tous les `stepDeg` degrés, pour des plans tournant autour de l'axe donné (ils passent par le centre).
   * Tous les traits sont gardés sur le modèle et enregistrés.
   */
  generateTraces(axis: TraceAxis, stepDeg: number): void {
    const ed = this.edit;
    if (!ed) return;
    const step = Math.max(1, stepDeg);
    // axe de rotation et point de passage : X / Y / Z par le centre du modèle ; diagonales du plan courant par le centre du plan
    const q = this.planeQuaternion();
    const axisVec = axis === 'X' ? new Vector3(1, 0, 0) : axis === 'Y' ? new Vector3(0, 1, 0) : axis === 'Z' ? new Vector3(0, 0, 1)
      : new Vector3(0, 1, axis === 'D1' ? 1 : -1).normalize().applyQuaternion(q);
    const through = axis === 'D1' || axis === 'D2' ? this.planeNormal().multiplyScalar(this.plane.offset) : new Vector3();
    // deux directions perpendiculaires à l'axe ; pour les diagonales, la première est la normale du plan courant (premier trait = plan actuel)
    const u = axis === 'D1' || axis === 'D2' ? this.planeNormal() : (Math.abs(axisVec.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0)).cross(axisVec).normalize();
    const w = new Vector3().crossVectors(axisVec, u).normalize();
    let made = 0;
    for (let deg = 0; deg < 180; deg += step) {
      const a = MathUtils.degToRad(deg);
      const n = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)); // la normale tourne autour de l'axe
      const r = this.sectionLines(n, n.dot(through));
      if (!r) continue;
      this.addTrace(ed.id, Float32Array.from(r.pos));
      made++;
    }
    this.events.onTraces(ed.id, this.exportTraces(ed.id));
    this.events.onMessage(`${made} trait${made > 1 ? 's' : ''} généré${made > 1 ? 's' : ''} autour de l'axe ${axis}, tous les ${step}°.`);
  }

  /** Contours fermés de l'intersection du plan (n, d) avec le maillage édité : sommets des segments, ou null si rien n'est coupé. */
  private sectionLines(n: Vector3, d: number): { pos: number[]; contours: number; holes: number } | null {
    const ed = this.edit!;
    // segments d'intersection
    const segs: [Vector3, Vector3][] = [];
    for (const t of ed.mesh.tris) {
      const P = t.map((v) => ed.mesh.pts[v]);
      const S = P.map((p) => p.dot(n) - d);
      const pts: Vector3[] = [];
      for (let k = 0; k < 3; k++) {
        const sa = S[k], sb = S[(k + 1) % 3];
        if ((sa < 0) === (sb < 0)) continue;
        pts.push(P[k].clone().lerp(P[(k + 1) % 3], sa / (sa - sb)));
      }
      if (pts.length === 2 && pts[0].distanceToSquared(pts[1]) > 1e-16) segs.push([pts[0], pts[1]]);
    }
    if (!segs.length) return null;
    // graphe des extrémités soudées
    const key = (p: Vector3) => `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)},${Math.round(p.z * 1e5)}`;
    const nodes: Vector3[] = [];
    const ids = new Map<string, number>();
    const idOf = (p: Vector3) => { const k = key(p); let i = ids.get(k); if (i === undefined) { i = nodes.length; ids.set(k, i); nodes.push(p); } return i; };
    const adj = new Map<number, number[]>();
    for (const [p, q] of segs) {
      const i = idOf(p), j = idOf(q);
      if (i === j) continue;
      adj.set(i, [...(adj.get(i) ?? []), j]);
      adj.set(j, [...(adj.get(j) ?? []), i]);
    }
    // on suit les chaînes : d'abord depuis les bouts libres (degré 1), puis les boucles restantes
    const usedEdge = new Set<string>();
    const ek = (i: number, j: number) => (i < j ? `${i}_${j}` : `${j}_${i}`);
    const visitedStart = new Set<number>();
    const chains: number[][] = [];
    const walk = (start: number) => {
      const chain = [start];
      let cur = start;
      for (let guard = 0; guard < nodes.length * 2; guard++) {
        const nxt = (adj.get(cur) ?? []).find((j) => !usedEdge.has(ek(cur, j)));
        if (nxt === undefined) break;
        usedEdge.add(ek(cur, nxt));
        chain.push(nxt);
        cur = nxt;
        if (cur === start) break;
      }
      return chain;
    };
    for (const [i, nb] of adj) if (nb.length === 1 && !visitedStart.has(i)) { const c = walk(i); visitedStart.add(c[c.length - 1]); chains.push(c); }
    for (const [i, nb] of adj) if (nb.some((j) => !usedEdge.has(ek(i, j)))) chains.push(walk(i));
    // contours ouverts : on relie les bouts libres entre eux, les plus proches d'abord, puis on ferme chaque chaîne
    const open = chains.filter((c) => c[0] !== c[c.length - 1]);
    const closed = chains.filter((c) => c[0] === c[c.length - 1]).map((c) => c.map((i) => nodes[i]));
    const polys: Vector3[][] = closed;
    const remaining = open.map((c) => c.map((i) => nodes[i]));
    while (remaining.length) {
      let chain = remaining.shift()!;
      for (let guard = 0; guard < 1000 && remaining.length; guard++) {
        // bout libre le plus proche de la fin de la chaîne courante (début ou fin d'une autre chaîne)
        const end = chain[chain.length - 1];
        let bi = -1, bd = Infinity, flip = false;
        remaining.forEach((o, i) => {
          const d0 = end.distanceTo(o[0]), d1 = end.distanceTo(o[o.length - 1]);
          if (d0 < bd) { bd = d0; bi = i; flip = false; }
          if (d1 < bd) { bd = d1; bi = i; flip = true; }
        });
        if (bi < 0 || bd > chain[0].distanceTo(end)) break; // fermer sur soi-même est plus court
        const other = remaining.splice(bi, 1)[0];
        if (flip) other.reverse();
        chain = chain.concat(bridge(chain, other), other);
      }
      chain = chain.concat(bridge(chain, chain.slice(0, 2)), [chain[0]]);
      polys.push(chain);
    }
    const pos: number[] = [];
    for (const poly of polys) for (let i = 0; i + 1 < poly.length; i++) pos.push(poly[i].x, poly[i].y, poly[i].z, poly[i + 1].x, poly[i + 1].y, poly[i + 1].z);
    return { pos, contours: polys.length, holes: open.length };
  }

  /**
   * Orientation du plan : le carré de base a sa normale selon X et ses diagonales selon (0, 1, ±1)/√2.
   * On tourne autour de Z (orientation), puis de Y (inclinaison), puis autour de chaque diagonale du carré lui-même.
   */
  private planeQuaternion(): Quaternion {
    const d = MathUtils.degToRad;
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), d(this.plane.angle));
    q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -d(this.plane.tilt)));
    q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 1).normalize(), d(this.plane.diag1)));
    q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, -1).normalize(), d(this.plane.diag2)));
    return q;
  }

  private planeNormal(): Vector3 {
    return new Vector3(1, 0, 0).applyQuaternion(this.planeQuaternion());
  }

  /** Le triangle est-il du côté à supprimer ? Décidé par son centre. */
  private dropped(t: [number, number, number]): boolean {
    const ed = this.edit!;
    const n = this.planeNormal();
    const [p, q, r] = t.map((v) => ed.mesh.pts[v]);
    const s = ((p.x + q.x + r.x) / 3) * n.x + ((p.y + q.y + r.y) / 3) * n.y + ((p.z + q.z + r.z) / 3) * n.z - this.plane.offset;
    return this.plane.keep === 'right' ? s < 0 : s >= 0;
  }

  /** Garde le trait de coupe courant (copie en rouge sombre) sur le modèle ; il reste quand le plan bouge, et il est enregistré. */
  keepTrace(): void {
    const ed = this.edit;
    if (!ed) return;
    const pos = this.traceLines.geometry.attributes.position;
    if (!this.traceLines.visible || !pos?.count) { this.events.onMessage('Aucun trait à garder : trace d\'abord la coupe.'); return; }
    this.addTrace(ed.id, Float32Array.from(pos.array as Float32Array));
    this.events.onTraces(ed.id, this.exportTraces(ed.id));
    this.events.onMessage(`Trait gardé (${this.traces.get(ed.id)!.length} sur ce modèle).`);
  }

  private addTrace(id: string, positions: Float32Array): void {
    const mesh = this.meshes.get(id);
    if (!mesh) return;
    const line = new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3)), new LineBasicMaterial({ color: new Color('#991b1b'), depthTest: false }));
    line.renderOrder = 21;
    mesh.add(line);
    this.traces.set(id, [...(this.traces.get(id) ?? []), line]);
  }

  /**
   * Plans des traits gardés d'un modèle (chaque trait est plan) : normale (Newell sur les segments) et point de passage.
   * Les traits non plans ou dégénérés sont ignorés.
   */
  tracePlanes(id: string): { normal: Vector3; point: Vector3 }[] {
    const out: { normal: Vector3; point: Vector3 }[] = [];
    for (const l of this.traces.get(id) ?? []) {
      const p = l.geometry.attributes.position.array as Float32Array;
      const c = new Vector3();
      const m = p.length / 3;
      for (let i = 0; i < m; i++) c.add(new Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]));
      c.divideScalar(Math.max(1, m));
      const n = new Vector3(), a = new Vector3(), b = new Vector3();
      for (let s = 0; s + 5 < p.length; s += 6) {
        a.set(p[s], p[s + 1], p[s + 2]).sub(c);
        b.set(p[s + 3], p[s + 4], p[s + 5]).sub(c);
        n.add(new Vector3().crossVectors(a, b));
      }
      if (n.lengthSq() < 1e-12) continue;
      out.push({ normal: n.normalize(), point: c });
    }
    return out;
  }

  /** Les traits d'un modèle, sous forme de tableaux de sommets (pour l'enregistrement). */
  exportTraces(id: string): Float32Array[] {
    return (this.traces.get(id) ?? []).map((l) => Float32Array.from(l.geometry.attributes.position.array as Float32Array));
  }

  /** Remet des traits enregistrés sur un modèle. */
  setTraces(id: string, list: Float32Array[]): void {
    this.clearTraces(id);
    for (const p of list) this.addTrace(id, p);
  }

  removeTrace(id: string, index: number): void {
    const list = this.traces.get(id) ?? [];
    const line = list[index];
    if (!line) return;
    line.removeFromParent();
    line.geometry.dispose();
    list.splice(index, 1);
    this.events.onTraces(id, this.exportTraces(id));
  }

  clearTraces(id: string, announce = false): void {
    for (const l of this.traces.get(id) ?? []) { l.removeFromParent(); l.geometry.dispose(); }
    this.traces.delete(id);
    if (announce) this.events.onTraces(id, []);
  }

  /** Place le plan et teinte les triangles : vert gardé, rouge supprimé. Annonce le nombre à supprimer. */
  private repaintPlane(): void {
    const ed = this.edit;
    if (!ed || this.editTool !== 'plane') return;
    const n = this.planeNormal();
    this.planeGroup.quaternion.copy(this.planeQuaternion()); // le carré et ses diagonales suivent
    this.planeGroup.position.copy(n).multiplyScalar(this.plane.offset);
    const mask = new Int32Array(ed.mesh.tris.length);
    let drop = 0;
    ed.mesh.tris.forEach((t, i) => { if (this.dropped(t)) { mask[i] = 1; drop++; } });
    this.paintPieces(ed.id, mask, PLANE_COLORS);
    this.dropCount = drop;
    this.events.onSelect(drop);
    if (this.traceOn) this.updateTrace();
  }

  /** Supprime le côté rouge du plan puis recopie le côté vert en miroir : modèle fermé et symétrique. */
  mirrorAcrossPlane(): void {
    const ed = this.edit;
    if (!ed || this.editTool !== 'plane') return;
    this.pushHistory('Symétrie (rouge supprimé, vert copié)');
    ed.mesh.tris = ed.mesh.tris.filter((t) => !this.dropped(t));
    ed.mesh.mirror(this.planeNormal(), this.plane.offset, ed.mesh.medianEdge() * 1.5);
    this.refreshEdit(true);
    this.events.onMessage(`Symétrie faite : ${ed.mesh.tris.length} triangles.`);
  }

  /** Nombre de triangles que `deleteSelection()` retirerait (cadre ou côté rouge du plan). */
  get pendingDelete(): number { return this.editTool === 'plane' ? this.dropCount : this.selection.size; }

  // ----- sélection au polygone -----

  /** Double-clic : ferme le polygone (le second clic du double a ajouté un sommet en trop, on l'enlève). */
  private onDblClick = (e: MouseEvent): void => {
    if (!this.edit || this.editTool !== 'select' || this.lasso.length < 3) return;
    const last = this.lasso[this.lasso.length - 1], prev = this.lasso[this.lasso.length - 2];
    if (last && prev && last.distanceTo(prev) < 4) this.lasso.pop();
    if (this.lasso.length >= 3) this.closeLasso(e.shiftKey);
  };
  /** Entrée ferme le polygone, Échap l'abandonne (prioritaire sur les raccourcis de l'app tant qu'un tracé est en cours). */
  private onKey = (e: KeyboardEvent): void => {
    if (!this.edit || this.editTool !== 'select' || !this.lasso.length) return;
    if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); if (this.lasso.length >= 3) this.closeLasso(e.shiftKey); else this.cancelLasso(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.cancelLasso(); }
  };

  private cancelLasso(): void {
    this.lasso = [];
    this.lassoSvg.style.display = 'none';
  }

  private drawLasso(e?: PointerEvent): void {
    if (!this.lasso.length) { this.lassoSvg.style.display = 'none'; return; }
    const r = this.container.getBoundingClientRect();
    this.lassoSvg.style.display = 'block';
    this.lassoPath.setAttribute('points', this.lasso.map((p) => `${p.x - r.left},${p.y - r.top}`).join(' '));
    const last = this.lasso[this.lasso.length - 1];
    if (e) {
      this.lassoBand.setAttribute('x1', String(last.x - r.left)); this.lassoBand.setAttribute('y1', String(last.y - r.top));
      this.lassoBand.setAttribute('x2', String(e.clientX - r.left)); this.lassoBand.setAttribute('y2', String(e.clientY - r.top));
    }
    this.lassoDots.replaceChildren(...this.lasso.map((p, i) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', String(p.x - r.left)); c.setAttribute('cy', String(p.y - r.top));
      c.setAttribute('r', i === 0 ? '5' : '3'); c.setAttribute('fill', i === 0 ? '#fff' : '#e11d48'); c.setAttribute('stroke', '#e11d48'); c.setAttribute('stroke-width', '1.5');
      return c;
    }));
  }

  private closeLasso(add: boolean): void {
    const poly = this.lasso;
    this.cancelLasso();
    this.selectInPolygon(poly, add);
  }

  /**
   * Triangles dont la projection à l'écran touche le polygone (un sommet ou le centre dedans, ou un sommet du polygone dans le triangle) ;
   * seulement ceux dont le centre est visible, sauf `selectThrough`. La visibilité passe par un tampon de profondeur logiciel
   * (tous les triangles rastérisés une fois) : coût linéaire, même à 100 000 triangles.
   */
  private selectInPolygon(poly: Vector2[], add: boolean): void {
    const ed = this.edit;
    if (!ed || poly.length < 3) return;
    const mesh = this.meshes.get(ed.id)!;
    mesh.updateMatrixWorld();
    const r = this.renderer.domElement.getBoundingClientRect();
    const camPos = this.camera.getWorldPosition(new Vector3());
    const next = add ? new Set(this.selection) : new Set<number>();
    const inPoly = (x: number, y: number): boolean => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
      return inside;
    };
    const inTri = (px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean => {
      const s1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax), s2 = (cx - bx) * (py - by) - (cy - by) * (px - bx), s3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
      return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
    };
    let pMinX = Infinity, pMaxX = -Infinity, pMinY = Infinity, pMaxY = -Infinity;
    for (const p of poly) { pMinX = Math.min(pMinX, p.x); pMaxX = Math.max(pMaxX, p.x); pMinY = Math.min(pMinY, p.y); pMaxY = Math.max(pMaxY, p.y); }
    // projection de tous les sommets : position écran (px) et distance à la caméra
    const n = ed.mesh.pts.length;
    const sx = new Float32Array(n), sy = new Float32Array(n), sd = new Float32Array(n), ok = new Uint8Array(n);
    const w = new Vector3();
    ed.mesh.pts.forEach((pt, i) => {
      mesh.localToWorld(w.copy(pt));
      sd[i] = w.distanceTo(camPos);
      const p = w.project(this.camera);
      if (p.z > 1) return;
      ok[i] = 1;
      sx[i] = r.left + ((p.x + 1) / 2) * r.width;
      sy[i] = r.top + ((1 - p.y) / 2) * r.height;
    });
    // tampon de profondeur : un pixel sur deux de l'écran suffit
    const scale = 0.5, W = Math.ceil(r.width * scale), H = Math.ceil(r.height * scale);
    const zbuf = this.selectThrough ? null : new Float32Array(W * H).fill(Infinity);
    if (zbuf) {
      for (const t of ed.mesh.tris) {
        if (!ok[t[0]] || !ok[t[1]] || !ok[t[2]]) continue;
        const ax = (sx[t[0]] - r.left) * scale, ay = (sy[t[0]] - r.top) * scale, bx = (sx[t[1]] - r.left) * scale, by = (sy[t[1]] - r.top) * scale, cx = (sx[t[2]] - r.left) * scale, cy = (sy[t[2]] - r.top) * scale;
        const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx))), maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
        const minY = Math.max(0, Math.floor(Math.min(ay, by, cy))), maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
        const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
        if (Math.abs(det) < 1e-9) continue;
        const za = sd[t[0]], zb = sd[t[1]], zc = sd[t[2]];
        for (let py = minY; py <= maxY; py++) {
          for (let px = minX; px <= maxX; px++) {
            const qx = px + 0.5, qy = py + 0.5;
            // coordonnées barycentriques du centre du pixel : l1 pour b, l2 pour c
            const l1 = ((qx - ax) * (cy - ay) - (cx - ax) * (qy - ay)) / det;
            const l2 = ((bx - ax) * (qy - ay) - (qx - ax) * (by - ay)) / det;
            const l0 = 1 - l1 - l2;
            if (l0 < -1e-3 || l1 < -1e-3 || l2 < -1e-3) continue;
            const z = l0 * za + l1 * zb + l2 * zc;
            const k = py * W + px;
            if (z < zbuf[k]) zbuf[k] = z;
          }
        }
      }
    }
    ed.mesh.tris.forEach((t, i) => {
      if (!ok[t[0]] || !ok[t[1]] || !ok[t[2]]) return;
      const ax = sx[t[0]], ay = sy[t[0]], bx = sx[t[1]], by = sy[t[1]], cx = sx[t[2]], cy = sy[t[2]];
      if (Math.max(ax, bx, cx) < pMinX || Math.min(ax, bx, cx) > pMaxX || Math.max(ay, by, cy) < pMinY || Math.min(ay, by, cy) > pMaxY) return;
      const hit = inPoly(ax, ay) || inPoly(bx, by) || inPoly(cx, cy) || inPoly((ax + bx + cx) / 3, (ay + by + cy) / 3) || poly.some((p) => inTri(p.x, p.y, ax, ay, bx, by, cx, cy));
      if (!hit) return;
      if (zbuf) {
        // occulté si le tampon est nettement plus proche que le centre du triangle (le matériau est double face : l'intérieur vu par un trou compte comme visible)
        const gx = ((ax + bx + cx) / 3 - r.left) * scale, gy = ((ay + by + cy) / 3 - r.top) * scale;
        const px = Math.min(W - 1, Math.max(0, Math.floor(gx))), py = Math.min(H - 1, Math.max(0, Math.floor(gy)));
        const z = (sd[t[0]] + sd[t[1]] + sd[t[2]]) / 3;
        if (zbuf[py * W + px] < z * (1 - 0.004)) return;
      }
      next.add(i);
    });
    this.setSelection(next);
  }

  private setSelection(sel: Set<number>): void {
    this.selection = sel;
    const ed = this.edit;
    const pos: number[] = [];
    if (ed) for (const i of sel) { const t = ed.mesh.tris[i]; if (t) for (const v of t) pos.push(ed.mesh.pts[v].x, ed.mesh.pts[v].y, ed.mesh.pts[v].z); }
    this.selMesh.geometry.dispose();
    this.selMesh.geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pos, 3));
    this.selMesh.visible = pos.length > 0;
    this.events.onSelect(sel.size);
  }

  get selectionCount(): number { return this.selection.size; }

  /** Supprime les triangles sélectionnés au cadre, ou le côté rouge du plan de coupe. */
  deleteSelection(): void {
    const ed = this.edit;
    if (!ed) return;
    const keep = this.editTool === 'plane' ? ed.mesh.tris.filter((t) => !this.dropped(t)) : ed.mesh.tris.filter((_, i) => !this.selection.has(i));
    const n = ed.mesh.tris.length - keep.length;
    if (!n) return;
    this.pushHistory(this.editTool === 'plane' ? `Côté rouge supprimé (−${n})` : `${n} triangle${n > 1 ? 's' : ''} supprimé${n > 1 ? 's' : ''} au cadre`);
    ed.mesh.tris = keep;
    this.refreshEdit(true);
  }

  get editing(): string | null { return this.edit?.id ?? null; }
  get canUndo(): boolean { return (this.edit?.history.length ?? 0) > 0; }

  /** Profondeur d'historique : chaque étape garde une copie du maillage, on en garde moins quand il est lourd. */
  private historyCap(): number { return (this.edit?.mesh.tris.length ?? 0) > 20000 ? 15 : EDIT_HISTORY; }

  /** Mémorise l'état courant avant une action, sous un libellé pour la liste d'historique. */
  private pushHistory(label: string): void {
    const ed = this.edit;
    if (!ed) return;
    ed.history.push({ mesh: ed.mesh.clone(), label });
    while (ed.history.length > this.historyCap()) ed.history.shift();
  }
  private announceHistory(): void {
    this.events.onHistory(this.edit ? this.edit.history.map((h) => h.label) : []);
  }

  /** Revient juste avant l'action n° `index` de l'historique (elle et les suivantes sont annulées). */
  undoTo(index: number): void {
    const ed = this.edit;
    if (!ed || index < 0 || index >= ed.history.length) return;
    ed.mesh = ed.history[index].mesh;
    ed.history.length = index;
    this.refreshEdit(true);
  }

  /** Après une modification : nouvelle géométrie affichée (gardée comme retouche), fil de fer à jour, événement. */
  private refreshEdit(changed: boolean): void {
    const ed = this.edit;
    if (!ed) return;
    const mesh = this.meshes.get(ed.id)!;
    const geo = ed.mesh.toGeometry();
    const old = this.overrides.get(ed.id);
    this.overrides.set(ed.id, { target: ed.target, geo });
    this.show(ed.id, geo);
    if (old && old.geo !== geo) old.geo.dispose();
    // fil de fer : chaque arête une fois (clé numérique a·N + b)
    const N = ed.mesh.pts.length;
    const seen = new Set<number>();
    const lines = new Float32Array(ed.mesh.tris.length * 18);
    let o = 0;
    for (const t of ed.mesh.tris) {
      for (let k = 0; k < 3; k++) {
        const a = t[k], b = t[(k + 1) % 3];
        const key = a < b ? a * N + b : b * N + a;
        if (seen.has(key)) continue;
        seen.add(key);
        const pa = ed.mesh.pts[a], pb = ed.mesh.pts[b];
        lines[o++] = pa.x; lines[o++] = pa.y; lines[o++] = pa.z; lines[o++] = pb.x; lines[o++] = pb.y; lines[o++] = pb.z;
      }
    }
    this.wire.geometry.dispose();
    this.wire.geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(lines.subarray(0, o), 3));
    this.setHover(null);
    this.setSelection(new Set()); // les indices des triangles ont changé
    this.repaintPlane();
    this.announceHistory();
    void mesh;
    if (changed) this.events.onEdit(ed.id, ed.mesh.tris.length, geo.attributes.position.array as Float32Array);
  }

  /** Ce que l'outil courant viserait sous la souris. */
  private pickEditTarget(e: PointerEvent): EditTarget | null {
    const ed = this.edit;
    if (!ed) return null;
    const mesh = this.meshes.get(ed.id)!;
    this.setRay(e);
    const hit = this.raycaster.intersectObject(mesh, false)[0];
    if (!hit || hit.faceIndex == null) return null;
    const t = hit.faceIndex, tri = ed.mesh.tris[t];
    if (!tri || this.editTool === 'select' || this.editTool === 'plane') return null;
    if (this.editTool === 'tri') return { kind: 'tri', t };
    const p = mesh.worldToLocal(hit.point.clone());
    if (this.editTool === 'vertex') {
      let best = 0, bd = Infinity;
      tri.forEach((v) => { const d = ed.mesh.pts[v].distanceToSquared(p); if (d < bd) { bd = d; best = v; } });
      return { kind: 'vertex', v: best };
    }
    let best: [number, number] = [tri[0], tri[1]], bd = Infinity;
    for (let k = 0; k < 3; k++) {
      const a = ed.mesh.pts[tri[k]], b = ed.mesh.pts[tri[(k + 1) % 3]];
      const ab = b.clone().sub(a), tt = MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
      const d = a.clone().addScaledVector(ab, tt).distanceToSquared(p);
      if (d < bd) { bd = d; best = [tri[k], tri[(k + 1) % 3]]; }
    }
    return { kind: 'edge', a: best[0], b: best[1] };
  }

  private setHover(t: EditTarget | null): void {
    const ed = this.edit;
    this.hoverSphere.visible = this.hoverEdge.visible = this.hoverTri.visible = false;
    this.renderer.domElement.style.cursor = t ? 'pointer' : 'default';
    if (!t || !ed) return;
    const mesh = this.meshes.get(ed.id)!;
    const scale = 1 / Math.max(mesh.scale.x, 1e-6); // les repères gardent une taille constante quelle que soit l'échelle du modèle
    if (t.kind === 'vertex') {
      this.hoverSphere.position.copy(ed.mesh.pts[t.v]);
      this.hoverSphere.scale.setScalar(0.014 * scale);
      this.hoverSphere.visible = true;
    } else if (t.kind === 'edge') {
      const a = ed.mesh.pts[t.a], b = ed.mesh.pts[t.b];
      const dir = b.clone().sub(a), len = dir.length();
      this.hoverEdge.position.copy(a).addScaledVector(dir, 0.5);
      this.hoverEdge.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()));
      this.hoverEdge.scale.set(0.008 * scale, len, 0.008 * scale);
      this.hoverEdge.visible = true;
    } else {
      const tri = ed.mesh.tris[t.t];
      const pos = tri.flatMap((v) => [ed.mesh.pts[v].x, ed.mesh.pts[v].y, ed.mesh.pts[v].z]);
      this.hoverTri.geometry.dispose();
      this.hoverTri.geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pos, 3));
      this.hoverTri.visible = true;
    }
  }

  private applyEdit(t: EditTarget | null): void {
    const ed = this.edit;
    if (!ed || !t) return;
    const before = ed.mesh.clone(), n0 = ed.mesh.tris.length;
    let ok = true;
    if (t.kind === 'vertex') ok = ed.mesh.removeVertex(t.v);
    else if (t.kind === 'edge') ed.mesh.collapseEdge(t.a, t.b);
    else ed.mesh.tris.splice(t.t, 1);
    if (!ok) { this.events.onMessage('Ce sommet est sur un bord ouvert : impossible de refermer le trou. Supprime plutôt ses triangles.'); return; }
    const delta = n0 - ed.mesh.tris.length;
    const label = t.kind === 'vertex' ? `Sommet supprimé (−${delta})` : t.kind === 'edge' ? `Arête fusionnée (−${delta})` : 'Triangle supprimé';
    ed.history.push({ mesh: before, label });
    while (ed.history.length > this.historyCap()) ed.history.shift();
    this.refreshEdit(true);
  }

  /** Annule la dernière modification du mode édition. */
  undoEdit(): void {
    const ed = this.edit;
    const prev = ed?.history.pop();
    if (!ed || !prev) return;
    ed.mesh = prev.mesh;
    this.refreshEdit(true);
  }

  /** Affiche ou cache un axe général. */
  setAxisVisible(axis: 'X' | 'Y' | 'Z', on: boolean): void { const g = this.axisGroups[axis]; if (g) g.visible = on; }

  /** Active ou désactive le plan ⟂ à un axe général (placé sur le modèle sélectionné à la prochaine mise à jour). */
  setWorldPlane(axis: 'X' | 'Y' | 'Z', on: boolean): void {
    this.worldPlaneOn[axis] = on;
    const wp = this.worldPlanes[axis];
    if (wp) { wp.group.visible = on; if (!on) wp.key = ''; }
  }

  /** Place les plans actifs au centre du modèle et recalcule leur ligne de coupe si le modèle a bougé ou changé. */
  private updateWorldPlanes(sel: ModelState | null): void {
    for (const axis of ['X', 'Y', 'Z'] as const) {
      const wp = this.worldPlanes[axis];
      if (!wp || !this.worldPlaneOn[axis]) continue;
      const mesh = sel ? this.meshes.get(sel.id) : undefined;
      if (!mesh) { wp.group.visible = false; continue; }
      wp.group.visible = true;
      wp.group.position.set(0, 0, 0); // le plan reste sur l'axe, à l'origine : c'est le modèle qui le traverse
      const key = `${sel!.id}|${sel!.pos.join(',')}|${sel!.rot.join(',')}|${sel!.scale}|${mesh.geometry.uuid}`;
      if (key === wp.key) continue;
      wp.key = key;
      // le plan fixe (normale = axe, par l'origine) exprimé dans le repère local du modèle
      mesh.updateMatrixWorld();
      const n = wp.dir.clone().applyQuaternion(mesh.quaternion.clone().invert());
      const origin = mesh.worldToLocal(new Vector3());
      const { polys } = sectionContours(mesh.geometry.attributes.position.array, n, n.dot(origin));
      const pos: number[] = [];
      for (const poly of polys) for (let i = 0; i + 1 < poly.length; i++) {
        const a = mesh.localToWorld(poly[i].clone()), b = mesh.localToWorld(poly[i + 1].clone());
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      wp.trace.geometry.dispose();
      wp.trace.geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pos, 3));
    }
  }

  /** Encombrement du modèle (géométrie de travail) une fois tourné comme à l'écran, sans la taille à l'écran : hauteur réelle, etc. */
  rotatedSizeOf(id: string): Vector3 {
    const mesh = this.meshes.get(id), geo = this.sourceGeometryOf(id);
    if (!mesh || !geo) return new Vector3(1, 1, 1);
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const box = new Box3();
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) box.expandByPoint(new Vector3(x, y, z).applyQuaternion(mesh.quaternion));
    return box.getSize(new Vector3());
  }

  /**
   * Plans parallèles « gaufre » : un plan tous les `step` (unités) le long de l'axe X, Y ou Z de l'écran, convertis dans le repère
   * local du modèle (tourné comme à l'écran). `family` distingue les deux directions.
   */
  waffleLocalPlanes(id: string, axes: readonly ('X' | 'Y' | 'Z')[], step: number): SlicePlane[] {
    const mesh = this.meshes.get(id), geo = this.sourceGeometryOf(id);
    if (!mesh || !geo) return [];
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const inv = mesh.quaternion.clone().invert();
    // boîte dans le repère de l'écran : rotation et position du modèle (la taille à l'écran est ignorée)
    const box = new Box3();
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) box.expandByPoint(new Vector3(x, y, z).applyQuaternion(mesh.quaternion).add(mesh.position));
    const planes: SlicePlane[] = [];
    axes.forEach((axis, fam) => {
      const i = axis === 'X' ? 0 : axis === 'Y' ? 1 : 2;
      const e = new Vector3().setComponent(i, 1);
      const normal = e.clone().applyQuaternion(inv); // normale dans le repère local
      // on part du plan de l'axe (par l'origine), puis un plan tous les `step` de chaque côté, tant que le modèle est traversé
      const lo = box.min.getComponent(i), hi = box.max.getComponent(i);
      const offsets: number[] = [];
      for (let c = 0; c > lo + step * 0.25; c -= step) if (c < hi - step * 0.25) offsets.unshift(c);
      for (let c = step; c < hi - step * 0.25; c += step) if (c > lo + step * 0.25) offsets.push(c);
      for (const c of offsets) {
        const worldPoint = e.clone().multiplyScalar(c);
        planes.push({ normal, point: worldPoint.sub(mesh.position).applyQuaternion(inv), family: fam as 0 | 1 });
      }
    });
    return planes;
  }

  /** Géométrie affichée (réduite, retouchée, ou aperçu) d'un modèle, pour le dépliage. */
  geometryOf(id: string): BufferGeometry | null {
    return this.meshes.get(id)?.geometry ?? null;
  }

  /** Géométrie de travail hors aperçu : retouche, sinon réduction, sinon original. */
  sourceGeometryOf(id: string): BufferGeometry | null {
    const o = this.overrides.get(id), r = this.reduced.get(id);
    const target = r ? r.target : 0; // jamais réduit : cible 0 (original)
    return (o && o.target === target ? o.geo : r?.geo) ?? this.originals.get(id) ?? null;
  }

  /** Affiche un aperçu à la place du maillage courant (et le colore par pièce). Il disparaît à la prochaine réduction ou retouche. */
  showPreview(id: string, geo: BufferGeometry, pieceOfTri: Int32Array | null, colors: string[]): void {
    if (!this.meshes.has(id)) return;
    this.clearPreview(id);
    this.previews.set(id, geo);
    this.show(id, geo);
    if (pieceOfTri) this.paintPieces(id, pieceOfTri, colors);
  }

  /** Revient au maillage de travail. */
  clearPreview(id: string): void {
    const prev = this.previews.get(id);
    if (!prev) return;
    const back = this.sourceGeometryOf(id);
    if (back) this.show(id, back); // show() libère l'aperçu et l'oublie
    else { prev.dispose(); this.previews.delete(id); }
  }

  isPreview(id: string): boolean { return this.previews.has(id); }

  /** Colore chaque triangle selon sa pièce du patron (null : couleur unie). */
  paintPieces(id: string, pieceOfTri: Int32Array | null, colors: string[]): void {
    const mesh = this.meshes.get(id);
    if (!mesh) return;
    const mat = mesh.material as MeshStandardMaterial;
    const geo = mesh.geometry;
    if (!pieceOfTri) {
      geo.deleteAttribute('color');
      mat.vertexColors = false;
      mesh.userData.painted = false;
    } else {
      const n = geo.attributes.position.count;
      const col = new Float32Array(n * 3);
      const c = new Color();
      for (let t = 0; t < n / 3; t++) {
        const k = pieceOfTri[t];
        c.set(k < 0 ? '#888888' : colors[k % colors.length]);
        for (let v = 0; v < 3; v++) { col[(t * 3 + v) * 3] = c.r; col[(t * 3 + v) * 3 + 1] = c.g; col[(t * 3 + v) * 3 + 2] = c.b; }
      }
      geo.setAttribute('color', new Float32BufferAttribute(col, 3));
      mat.vertexColors = true;
      mesh.userData.painted = true;
    }
    mat.needsUpdate = true;
  }

  /** Le maillage affiché (réduit, retouché) en STL binaire, dans son repère local. */
  exportStl(id: string, source = false): DataView | null {
    const mesh = this.meshes.get(id);
    if (!mesh) return null;
    const geo = source ? this.sourceGeometryOf(id) ?? mesh.geometry : mesh.geometry; // `source` : le modèle de travail, même si un aperçu est affiché
    const bare = new Mesh(geo); // avec la rotation affichée, sans la position ni la taille à l'écran
    bare.quaternion.copy(mesh.quaternion);
    bare.updateMatrixWorld();
    return new STLExporter().parse(bare, { binary: true }) as DataView;
  }

  /** Reflète la liste des modèles et la sélection dans la scène. */
  sync(models: ModelState[], selectedId: string | null): void {
    const seen = new Set(models.map((m) => m.id));
    for (const [id, mesh] of this.meshes) {
      if (seen.has(id)) continue;
      if (this.edit?.id === id) this.setEdit(null);
      this.clearTraces(id);
      this.scene.remove(mesh);
      if (!this.kept(id, mesh.geometry)) mesh.geometry.dispose();
      this.originals.get(id)?.dispose();
      this.reduced.get(id)?.geo.dispose();
      this.overrides.get(id)?.geo.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      this.meshes.delete(id);
      this.originals.delete(id);
      this.reduced.delete(id);
      this.overrides.delete(id);
    }
    for (const m of models) {
      const mesh = this.meshes.get(m.id);
      if (!mesh) continue;
      mesh.position.set(...m.pos);
      mesh.rotation.set(...((m.rot ?? [0, 0, 0]).map(MathUtils.degToRad) as Vec3));
      mesh.scale.setScalar(m.scale);
      const mat = mesh.material as MeshStandardMaterial;
      mat.color.set(mesh.userData.painted ? '#ffffff' : m.color); // peint par pièces : les couleurs de sommets font tout
      mat.emissive.set(m.id === selectedId ? '#3d6f5a' : '#000000');
      mat.emissiveIntensity = m.id === selectedId ? 0.3 : 0;
    }
    this.updateWorldPlanes(models.find((m) => m.id === selectedId) ?? models[0] ?? null);
  }

  /** Recadre la caméra sur tous les modèles. */
  frame(): void {
    const bb = new Box3();
    for (const m of this.meshes.values()) bb.expandByObject(m);
    if (bb.isEmpty()) return;
    const c = bb.getCenter(new Vector3());
    const r = bb.getSize(new Vector3()).length() / 2;
    this.controls.target.copy(c);
    const dir = this.camera.position.clone().sub(c).normalize();
    this.camera.position.copy(c).addScaledVector(dir, Math.max(2, r / Math.sin(MathUtils.degToRad(20))));
  }

  dispose(): void {
    this.ro.disconnect();
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onDown);
    dom.removeEventListener('pointermove', this.onMove);
    dom.removeEventListener('pointerup', this.onUp);
    this.renderer.setAnimationLoop(null);
    this.controls.dispose();
    for (const [id, m] of this.meshes) if (!this.kept(id, m.geometry)) m.geometry.dispose();
    for (const g of this.originals.values()) g.dispose();
    for (const r of this.reduced.values()) r.geo.dispose();
    for (const o of this.overrides.values()) o.geo.dispose();
    this.meshes.clear();
    this.originals.clear();
    this.reduced.clear();
    this.overrides.clear();
    dom.removeEventListener('dblclick', this.onDblClick);
    window.removeEventListener('keydown', this.onKey, true);
    this.renderer.dispose();
    dom.remove();
    this.lassoSvg.remove();
  }
}

/**
 * Courbe de raccord entre la fin d'une chaîne et le début d'une autre (Hermite cubique) : les tangentes prolongent
 * les derniers segments de chaque côté, le trait passe le trou sans cassure. Renvoie les points intermédiaires.
 */
function bridge(from: Vector3[], to: Vector3[]): Vector3[] {
  const p0 = from[from.length - 1], p1 = to[0];
  const L = p0.distanceTo(p1);
  if (L < 1e-9) return [];
  const t0 = from.length > 1 ? p0.clone().sub(from[from.length - 2]).normalize().multiplyScalar(L) : p1.clone().sub(p0);
  const t1 = to.length > 1 ? to[1].clone().sub(p1).normalize().multiplyScalar(L) : p1.clone().sub(p0);
  const step = from.length > 1 ? from[from.length - 1].distanceTo(from[from.length - 2]) : L;
  const steps = Math.max(4, Math.min(32, Math.round(L / Math.max(step, 1e-6))));
  const out: Vector3[] = [];
  for (let i = 1; i < steps; i++) {
    const s = i / steps, s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    out.push(p0.clone().multiplyScalar(h00).addScaledVector(t0, h10).addScaledVector(p1, h01).addScaledVector(t1, h11));
  }
  return out;
}
