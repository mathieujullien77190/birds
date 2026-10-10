import {
  Clock, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, MOUSE,
  PerspectiveCamera, Plane, Raycaster, Scene, Vector2, Vector3, WebGLRenderer,
  PlaneGeometry, PCFSoftShadowMap, MathUtils, Group, BufferGeometry, Matrix4, GridHelper, LineBasicMaterial, Object3D,
  TorusGeometry, MeshBasicMaterial, SphereGeometry,
} from 'three';
import { makeAxes, makeAxisLabels, resizeAxes } from './axes';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// Convention de l'app : X = droite, Y = avant de l'oiseau, Z = haut (comme Blender).
Object3D.DEFAULT_UP.set(0, 0, 1);
import { ROTATION_AXES, type Part, type Vec3 } from './types';
import { partGeometry, stretchY } from './shapes';
import { finishGeometry } from './finish';
import { AMBIENT } from './palette';

export interface SceneEvents {
  /** Clic sur une pièce (ou sur le vide : null). */
  onSelect: (id: string | null) => void;
  /** Glissé d'une pièce : nouvelle position. */
  onMove: (id: string, pos: Vec3) => void;
  /** Rotation à la souris (anneau) : nouvelle rotation en degrés. */
  onRotate: (id: string, rot: Vec3) => void;
  /** Début d'un geste souris (pour l'historique). */
  onGestureStart: () => void;
  /** Un coin libre (pyramide) tiré à la souris : nouvelle position locale. */
  onPoint: (id: string, index: number, local: Vec3) => void;
}

type Drag =
  | { kind: 'move'; id: string; plane: Plane; offset: Vector3; start: Vector3; vertical: boolean; axis: 0 | 1 | 2 | null }
  | { kind: 'slide'; id: string; dir: Vector3; start: Vector3; t0: number; axis: 0 | 1 | 2 }
  | { kind: 'point'; id: string; index: number; plane: Plane; offset: Vector3 }
  | { kind: 'rotate'; id: string; plane: Plane; center: Vector3; a0: number; rot0: Vec3; axis: 0 | 1 | 2 };

/** Axe de l'anneau de rotation d'une pièce : le premier axe autorisé (Y si tous le sont). */
const ringAxisOf = (part: Part): 0 | 1 | 2 => {
  const allowed = ROTATION_AXES[part.shape];
  if (allowed.length === 3) return 0; // tous libres : anneau rouge, autour de X (bascule avant / arrière) ; Y et Z par les curseurs
  return allowed[0] === 'X' ? 0 : allowed[0] === 'Y' ? 1 : 2;
};
const AXIS_VEC = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
/** Base (u, v) du plan perpendiculaire à l'axe, telle que u × v = axe : l'angle atan2(d·v, d·u) croît dans le sens direct. */
const AXIS_BASIS: [Vector3, Vector3][] = [
  [new Vector3(0, 1, 0), new Vector3(0, 0, 1)], // autour de X : (Y, Z)
  [new Vector3(0, 0, 1), new Vector3(1, 0, 0)], // autour de Y : (Z, X)
  [new Vector3(1, 0, 0), new Vector3(0, 1, 0)], // autour de Z : (X, Y)
];

/**
 * Scène Three.js de l'éditeur. Aucune dépendance React : on lui pousse l'état
 * (`sync`) et elle remonte les gestes souris (`events`).
 */
export class BirdScene {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly birdGroup = new Group();
  private readonly meshes = new Map<string, Mesh>();
  /** Copies symétriques (plan X = 0) des pièces « mirror ». */
  private readonly twins = new Map<string, Mesh>();
  private readonly raycaster = new Raycaster();
  private readonly clock = new Clock();
  private drag: Drag | null = null;
  private selectedId: string | null = null;
  private readonly ro: ResizeObserver;
  /** Axes locaux des pièces qui le demandent (part.showAxes). */
  private readonly axes = new Map<string, Group>();
  /** Anneau de rotation autour de la verticale, affiché autour de la pièce sélectionnée. */
  private readonly ring: Mesh;
  /** Poignées des coins libres de la pièce sélectionnée (pyramide). */
  private readonly handles: Mesh[] = [];
  private readonly handleGeo = new SphereGeometry(1, 12, 8);
  private readonly handleMat = new MeshBasicMaterial({ color: new Color('#ff9a2e'), depthTest: false, transparent: true, opacity: 0.95, toneMapped: false });
  private readonly handleMatHot = new MeshBasicMaterial({ color: new Color('#ffd166'), depthTest: false, toneMapped: false });
  private readonly ringMat = new MeshBasicMaterial({ color: new Color('#4fc27a'), transparent: true, opacity: 0.85, depthTest: false, toneMapped: false });
  private ringAxis: 0 | 1 | 2 = 1;
  private readonly ringMatHot = new MeshBasicMaterial({ color: new Color('#ffb547'), transparent: true, opacity: 1, depthTest: false, toneMapped: false });
  private readonly matNormal = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  private readonly matSelected = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, emissive: new Color(AMBIENT.selectionEmissive), emissiveIntensity: 0.35 });
  // versions semi-transparentes : on voit les axes et les pièces à l'intérieur
  private readonly matNormalT = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, transparent: true, opacity: 0.42, depthWrite: false });
  private readonly matSelectedT = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, emissive: new Color(AMBIENT.selectionEmissive), emissiveIntensity: 0.35, transparent: true, opacity: 0.5, depthWrite: false });

  constructor(private readonly container: HTMLElement, private readonly events: SceneEvents) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';

    this.scene.background = new Color(AMBIENT.sky);
    this.camera = new PerspectiveCamera(40, 1, 0.01, 100);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(4.3, 2.6, 1.4); // trois quarts avant droit, assez bas pour voir le bec

    // clic gauche = sélection / déplacement ; molette = tourner ; clic droit = déplacer la vue
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0.6);
    this.controls.enableDamping = true;
    this.controls.mouseButtons = { LEFT: -1 as unknown as MOUSE, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.PAN };
    this.controls.minDistance = 1;
    this.controls.maxDistance = 20;
    this.controls.maxPolarAngle = Math.PI * 0.49;

    this.buildAmbiance();
    this.scene.add(this.birdGroup);
    this.ring = new Mesh(new TorusGeometry(1, 0.009, 8, 96), this.ringMat);
    this.ring.renderOrder = 30; // orienté dans syncRing() selon l'axe de la pièce
    this.ring.visible = false;
    this.scene.add(this.ring);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    this.renderer.setAnimationLoop(() => {
      this.clock.getDelta();
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  private buildAmbiance(): void {
    const hemi = new HemisphereLight(new Color(AMBIENT.hemiSky), new Color(AMBIENT.hemiGround), 1.4);
    this.scene.add(hemi);
    const sun = new DirectionalLight(new Color(AMBIENT.sun), 1.6);
    sun.position.set(3, 2, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 20;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -4;
    sun.shadow.camera.right = sun.shadow.camera.top = 4;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 4;
    this.scene.add(sun, sun.target);

    // sol : carré pastel de 6 × 6, reçoit l'ombre douce ; grille légère tous les 0.5
    const SIZE = 6;
    const ground = new Mesh(
      new PlaneGeometry(SIZE, SIZE),
      new MeshStandardMaterial({ color: new Color(AMBIENT.ground), roughness: 1, metalness: 0 }),
    );
    ground.receiveShadow = true; // PlaneGeometry est déjà dans le plan X-Y
    this.scene.add(ground);
    const grid = new GridHelper(SIZE, SIZE * 2, new Color(AMBIENT.gridMajor), new Color(AMBIENT.gridMinor));
    grid.rotation.x = Math.PI / 2; // GridHelper est dans X-Z : on le couche dans X-Y
    grid.position.z = 0.003;
    (grid.material as LineBasicMaterial).transparent = true;
    (grid.material as LineBasicMaterial).opacity = 0.9;
    this.scene.add(grid);
    // axes du monde : trois droites « infinies » passant par l'origine, sans flèche : X rouge (droite), Y vert (haut), Z bleu (avant de l'oiseau)
    const world = makeAxes(0.006, false);
    resizeAxes(world, [200, 200, 200]);
    world.children.forEach((a) => a.traverse((o) => { o.frustumCulled = false; }));
    this.scene.add(makeAxisLabels(1.3));
    this.scene.add(world);
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

  /** Reflète l'état (liste de pièces + sélection) dans la scène. */
  sync(parts: Part[], selectedId: string | null): void {
    this.selectedId = selectedId;
    const seen = new Set<string>();
    for (const part of parts) {
      seen.add(part.id);
      let mesh = this.meshes.get(part.id);
      const geoKey = `${part.shape}|${part.detail}|${part.color}|${part.smooth}|${part.yStretch[0]}|${part.yStretch[1]}|${part.points ? JSON.stringify(part.points) : ''}`;
      const meshRef = part.mesh ?? null; // maillage importé : identité de l'objet (immuable dans le store)
      if (!mesh) {
        mesh = new Mesh(new BufferGeometry(), this.matNormal);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.userData.id = part.id;
        this.birdGroup.add(mesh);
        this.meshes.set(part.id, mesh);
      }
      if (mesh.userData.geoKey !== geoKey || mesh.userData.meshRef !== meshRef) {
        mesh.geometry.dispose();
        mesh.geometry = finishGeometry(stretchY(partGeometry(part), part.yStretch[0], part.yStretch[1]), part.color, part.smooth);
        mesh.userData.geoKey = geoKey;
        mesh.userData.meshRef = meshRef;
      }
      mesh.position.set(...part.pos);
      mesh.rotation.set(...(part.rot.map(MathUtils.degToRad) as Vec3));
      mesh.scale.set(...part.scl);
      const sel = part.id === selectedId;
      mesh.material = part.transparent ? (sel ? this.matSelectedT : this.matNormalT) : sel ? this.matSelected : this.matNormal;
      mesh.renderOrder = part.transparent ? 10 : 0; // les transparents se dessinent après les opaques
      mesh.updateMatrix();
      this.syncTwin(part, mesh);
      this.syncAxes(part, mesh);
    }
    for (const [id, mesh] of this.meshes) {
      if (seen.has(id)) continue;
      this.birdGroup.remove(mesh);
      mesh.geometry.dispose();
      this.meshes.delete(id);
      this.removeTwin(id);
      this.removeAxes(id);
    }
    const sel = parts.find((p) => p.id === selectedId) ?? null;
    this.syncRing(sel);
    this.syncHandles(sel);
  }

  /** Une bille orange par coin libre de la pièce sélectionnée, à sa position monde. */
  private syncHandles(part: Part | null): void {
    const mesh = part && this.meshes.get(part.id);
    const pts = part?.points && mesh ? part.points : [];
    while (this.handles.length < pts.length) {
      const h = new Mesh(this.handleGeo, this.handleMat);
      h.renderOrder = 50;
      h.scale.setScalar(0.022);
      this.scene.add(h);
      this.handles.push(h);
    }
    this.handles.forEach((h, i) => {
      h.visible = i < pts.length;
      if (!h.visible || !mesh) return;
      h.userData.index = i;
      mesh.updateMatrixWorld();
      h.position.set(...pts[i]).applyMatrix4(mesh.matrixWorld);
    });
  }

  private handleHit(e: PointerEvent): Mesh | null {
    const vis = this.handles.filter((h) => h.visible);
    if (!vis.length) return null;
    this.setRay(e);
    // billes un peu plus faciles à attraper que leur taille
    const hit = this.raycaster.intersectObjects(vis, false)[0];
    return (hit?.object as Mesh) ?? null;
  }

  /** L'anneau entoure la pièce sélectionnée à hauteur de son centre ; son rayon suit l'encombrement horizontal. */
  private syncRing(part: Part | null): void {
    const mesh = part && this.meshes.get(part.id);
    if (!part || !mesh) { this.ring.visible = false; return; }
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;
    const ext = [(bb.max.x - bb.min.x) * part.scl[0], (bb.max.y - bb.min.y) * part.scl[1], (bb.max.z - bb.min.z) * part.scl[2]];
    const axis = ringAxisOf(part);
    const [i, j] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1]; // les deux axes du plan de l'anneau
    const r = Math.max(0.12, Math.hypot(ext[i], ext[j]) * 0.5 + 0.08);
    this.ringAxis = axis;
    this.ring.rotation.set(0, 0, 0);
    if (axis === 0) this.ring.rotation.y = Math.PI / 2; // tore dans le plan Y-Z : tourne autour de X
    else if (axis === 1) this.ring.rotation.x = Math.PI / 2; // à plat : tourne autour de Y
    this.ring.material = this.ringMat;
    (this.ring.material as MeshBasicMaterial).color.set(['#e8504d', '#4fc27a', '#4d8ae8'][axis]); // couleur de l'axe
    this.ring.position.copy(mesh.position);
    this.ring.scale.setScalar(r);
    this.ring.visible = true;
  }

  /** Flèche d'axe visée : la pièce, l'axe (0 X, 1 Y, 2 Z) et sa direction dans le monde. */
  private gripHit(e: PointerEvent): { id: string; axis: 0 | 1 | 2; dir: Vector3 } | null {
    this.setRay(e);
    const grips: Mesh[] = [];
    for (const ax of this.axes.values()) ax.traverse((o) => { if (o.name === 'grip') grips.push(o as Mesh); });
    const hit = this.raycaster.intersectObjects(grips, false)[0];
    if (!hit) return null;
    const grip = hit.object, axis = grip.userData.axis as 0 | 1 | 2;
    let group: Object3D | null = grip;
    while (group && group.name !== 'axes') group = group.parent;
    if (!group) return null;
    const dir = AXIS_VEC[axis].clone().applyQuaternion(group.quaternion).normalize(); // les axes suivent la rotation de la pièce
    return { id: group.userData.id as string, axis, dir };
  }

  /** Paramètre t du point de la droite O + D·t le plus proche du rayon de la souris. */
  private lineParam(O: Vector3, D: Vector3): number | null {
    const r = this.raycaster.ray, w = O.clone().sub(r.origin);
    const a = D.dot(D), b = D.dot(r.direction), c = r.direction.dot(r.direction), d = D.dot(w), e = r.direction.dot(w);
    const den = a * c - b * b;
    if (Math.abs(den) < 1e-8) return null; // droite parallèle au rayon
    return (b * e - c * d) / den;
  }

  private ringHit(e: PointerEvent): boolean {
    if (!this.ring.visible) return false;
    this.setRay(e);
    return this.raycaster.intersectObject(this.ring, false).length > 0;
  }

  /** Angle (rad) du point visé dans le plan de l'anneau, autour de son centre, positif dans le sens direct de l'axe. */
  private ringAngle(plane: Plane, center: Vector3, axis: 0 | 1 | 2): number | null {
    const hit = new Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return null;
    const d = hit.sub(center), [u, v] = AXIS_BASIS[axis];
    return Math.atan2(d.dot(v), d.dot(u));
  }

  /** Axes locaux au centre de la pièce : suivent sa position et sa rotation, longueur = son encombrement (pas déformés par l'étirement). */
  private syncAxes(part: Part, mesh: Mesh): void {
    if (!part.showAxes) { this.removeAxes(part.id); return; }
    let ax = this.axes.get(part.id);
    if (!ax) {
      ax = makeAxes(0.004, true, true); // fins : on les voit à travers la pièce transparente ; avec poignées pour glisser le long d'une flèche
      ax.userData.id = part.id;
      this.birdGroup.add(ax);
      this.axes.set(part.id, ax);
    }
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;
    const ext = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z];
    resizeAxes(ax, [ext[0] * part.scl[0] * 0.58, ext[1] * part.scl[1] * 0.58, ext[2] * part.scl[2] * 0.58]); // traversent toute la pièce et dépassent un peu
    ax.position.copy(mesh.position);
    ax.quaternion.copy(mesh.quaternion);
  }

  private removeAxes(id: string): void {
    const ax = this.axes.get(id);
    if (!ax) return;
    this.birdGroup.remove(ax);
    this.axes.delete(id);
  }

  private syncTwin(part: Part, mesh: Mesh): void {
    if (!part.mirror) { this.removeTwin(part.id); return; }
    let twin = this.twins.get(part.id);
    if (!twin) {
      twin = new Mesh(mesh.geometry, mesh.material);
      twin.castShadow = true;
      twin.matrixAutoUpdate = false;
      twin.userData.id = part.id;
      this.birdGroup.add(twin);
      this.twins.set(part.id, twin);
    }
    twin.geometry = mesh.geometry;
    twin.material = mesh.material;
    twin.matrix.copy(MIRROR_X).multiply(mesh.matrix); // three.js retourne les faces tout seul (déterminant négatif)
    twin.matrixWorldNeedsUpdate = true;
  }

  private removeTwin(id: string): void {
    const twin = this.twins.get(id);
    if (!twin) return;
    this.birdGroup.remove(twin);
    this.twins.delete(id);
  }

  // ----- souris -----
  private setRay(e: PointerEvent): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  private pick(e: PointerEvent): Mesh | null {
    this.setRay(e);
    const hit = this.raycaster.intersectObjects([...this.meshes.values(), ...this.twins.values()], false)[0];
    if (!hit) return null;
    return this.meshes.get(hit.object.userData.id as string) ?? null; // un clic sur la copie symétrique choisit la pièce d'origine
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    // 0) un coin libre de la pièce sélectionnée : on le tire dans le plan face caméra
    const hm = this.handleHit(e);
    if (hm && this.selectedId) {
      const normal = this.camera.getWorldDirection(new Vector3()).negate();
      const plane = new Plane().setFromNormalAndCoplanarPoint(normal, hm.position);
      const hit = new Vector3();
      if (!this.raycaster.ray.intersectPlane(plane, hit)) return;
      this.drag = { kind: 'point', id: this.selectedId, index: hm.userData.index as number, plane, offset: hm.position.clone().sub(hit) };
      this.events.onGestureStart();
      hm.material = this.handleMatHot;
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }
    // 1) l'anneau de rotation de la pièce sélectionnée
    if (this.selectedId && this.ringHit(e)) {
      const mesh = this.meshes.get(this.selectedId);
      if (!mesh) return;
      const center = mesh.position.clone(), axis = this.ringAxis;
      const plane = new Plane().setFromNormalAndCoplanarPoint(AXIS_VEC[axis], center);
      const a0 = this.ringAngle(plane, center, axis);
      if (a0 === null) return;
      const rot0: Vec3 = [MathUtils.radToDeg(mesh.rotation.x), MathUtils.radToDeg(mesh.rotation.y), MathUtils.radToDeg(mesh.rotation.z)];
      this.drag = { kind: 'rotate', id: this.selectedId, plane, center, a0, rot0, axis };
      this.events.onGestureStart();
      this.ring.material = this.ringMatHot;
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }
    // 2) une flèche d'axe : glissé le long de cet axe seulement
    const g = this.gripHit(e);
    if (g) {
      const mesh = this.meshes.get(g.id);
      if (!mesh) return;
      if (g.id !== this.selectedId) this.events.onSelect(g.id);
      const t0 = this.lineParam(mesh.position, g.dir);
      if (t0 === null) return;
      this.drag = { kind: 'slide', id: g.id, dir: g.dir, start: mesh.position.clone(), t0, axis: g.axis };
      this.events.onGestureStart();
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }
    // 3) une pièce : sélection + glissé
    const mesh = this.pick(e);
    if (!mesh) {
      this.drag = null;
      return;
    }
    const id = mesh.userData.id as string;
    if (id !== this.selectedId) this.events.onSelect(id);
    // glissé dans le plan horizontal passant par le centre de la pièce (Maj : plan vertical face caméra)
    const normal = e.shiftKey ? this.camera.getWorldDirection(new Vector3()).setZ(0).normalize() : new Vector3(0, 0, 1);
    const plane = new Plane().setFromNormalAndCoplanarPoint(normal, mesh.position);
    const hit = new Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return;
    this.drag = { kind: 'move', id, plane, offset: mesh.position.clone().sub(hit), start: mesh.position.clone(), vertical: e.shiftKey, axis: e.shiftKey ? 2 : null };
    this.events.onGestureStart();
    this.controls.enabled = false;
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent): void => {
    const d = this.drag;
    const dom = this.renderer.domElement;
    if (!d) {
      const onHandle = this.handleHit(e);
      this.handles.forEach((h) => { h.material = h === onHandle ? this.handleMatHot : this.handleMat; });
      const onRing = !onHandle && this.ringHit(e);
      this.ring.material = onRing ? this.ringMatHot : this.ringMat;
      dom.style.cursor = onHandle ? 'crosshair' : onRing ? 'ew-resize' : this.gripHit(e) ? 'move' : this.pick(e) ? 'grab' : 'default';
      return;
    }
    this.setRay(e);
    if (d.kind === 'point') {
      const mesh = this.meshes.get(d.id);
      if (!mesh) return;
      const hit = new Vector3();
      if (!this.raycaster.ray.intersectPlane(d.plane, hit)) return;
      hit.add(d.offset);
      const local = mesh.worldToLocal(hit.clone());
      dom.style.cursor = 'crosshair';
      this.events.onPoint(d.id, d.index, [round(local.x), round(local.y), round(local.z)]);
      return;
    }
    if (d.kind === 'slide') {
      const t = this.lineParam(d.start, d.dir);
      if (t === null) return;
      const pos = d.start.clone().addScaledVector(d.dir, t - d.t0);
      pos.z = Math.max(-2, pos.z);
      dom.style.cursor = 'move';
      this.events.onMove(d.id, [round(pos.x), round(pos.y), round(pos.z)]);
      return;
    }
    if (d.kind === 'rotate') {
      const a = this.ringAngle(d.plane, d.center, d.axis);
      if (a === null) return;
      let deg = d.rot0[d.axis] + MathUtils.radToDeg(a - d.a0);
      deg = ((((deg + 180) % 360) + 360) % 360) - 180; // ramené dans −180 … 180
      if (e.shiftKey) deg = Math.round(deg / 15) * 15; // Maj : par pas de 15°
      dom.style.cursor = 'ew-resize';
      const rot: Vec3 = [...d.rot0] as Vec3;
      rot[d.axis] = Math.round(deg);
      this.events.onRotate(d.id, rot);
      return;
    }
    const hit = new Vector3();
    if (!this.raycaster.ray.intersectPlane(d.plane, hit)) return;
    hit.add(d.offset);
    // un seul axe à la fois : la direction dominante des premiers millimètres choisit X ou Y (Maj : Z), puis on y reste
    const delta = hit.clone().sub(d.start);
    if (d.axis === null) {
      if (Math.hypot(delta.x, delta.y) < 0.03) return; // pas encore assez bougé pour trancher
      d.axis = Math.abs(delta.x) >= Math.abs(delta.y) ? 0 : 1;
    }
    const pos = d.start.clone();
    pos.setComponent(d.axis, d.start.getComponent(d.axis) + delta.getComponent(d.axis));
    pos.z = Math.max(-2, pos.z);
    dom.style.cursor = d.axis === 0 ? 'ew-resize' : d.axis === 1 ? 'ns-resize' : 'row-resize';
    this.events.onMove(d.id, [round(pos.x), round(pos.y), round(pos.z)]);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    if (!this.drag) {
      // clic dans le vide : on désélectionne
      if (!this.pick(e)) this.events.onSelect(null);
      return;
    }
    this.drag = null;
    this.controls.enabled = true;
    this.ring.material = this.ringMat;
    this.handles.forEach((h) => { h.material = this.handleMat; });
    this.renderer.domElement.releasePointerCapture(e.pointerId);
    this.renderer.domElement.style.cursor = 'grab';
  };

  dispose(): void {
    this.ro.disconnect();
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointermove', this.onPointerMove);
    dom.removeEventListener('pointerup', this.onPointerUp);
    this.renderer.setAnimationLoop(null);
    this.controls.dispose();
    for (const m of this.meshes.values()) m.geometry.dispose();
    this.meshes.clear();
    this.renderer.dispose();
    dom.remove();
  }
}

const round = (v: number) => Math.round(v * 1000) / 1000;
const MIRROR_X = new Matrix4().makeScale(-1, 1, 1);
