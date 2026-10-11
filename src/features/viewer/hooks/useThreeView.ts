import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import { AmbientLight, Color, DirectionalLight, Group, MOUSE, PerspectiveCamera, Plane, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { pullFace, moveWithGroup, r2, type FaceAxis, type PlankScene, type Vec3 } from '@/birdhouse/model';
import { AXIS_N, SNAP, type Cut, type View } from '@/birdhouse/three/types';

/** Ce que la vue 3D lit ou écrit dans le composant : uniquement des refs et des setters stables (l'effet de création ne tourne qu'une fois). */
export interface ThreeViewDeps {
  host: RefObject<HTMLDivElement | null>;
  view: MutableRefObject<View | null>;
  scRef: MutableRefObject<PlankScene>;
  selRef: MutableRefObject<string | null>;
  cutRef: MutableRefObject<Cut>;
  pullRef: MutableRefObject<{ plankId: string; axis: FaceAxis; sign: 1 | -1 } | null>;
  pickRef: MutableRefObject<(id: string | null, ctrl: boolean) => void>;
  setSc: Dispatch<SetStateAction<PlankScene>>;
  setCut: Dispatch<SetStateAction<Cut>>;
  setCtx: (c: { x: number; y: number; plankId: string; local: [number, number] } | null) => void;
  setSelectedId: (id: string | null) => void;
  setHover: (h: { plank?: string; group?: string } | null) => void;
  pushEntry: (label: string) => void;
}

/** Vue Three.js : scène, caméra, orbite, glissés (face, plan de coupe, coin), clic / clic droit / survol par raycast, redimensionnement, boucle de rendu. */
export function useThreeView({ host, view, scRef, selRef, cutRef, pullRef, pickRef, setSc, setCut, setCtx, setSelectedId, setHover, pushEntry }: ThreeViewDeps) {
  // ----- vue 3D -----
  useEffect(() => {
    const el = host.current!;
    const scene = new Scene();
    scene.background = new Color('#eef2f1');
    const ambient = new AmbientLight('#ffffff', 1.1);
    scene.add(ambient);
    const sun = new DirectionalLight('#ffffff', 1.8);
    sun.position.set(300, -400, 500);
    scene.add(sun);
    const camera = new PerspectiveCamera(40, 1, 1, 6000);
    camera.up.set(0, 0, 1); // Z = hauteur, comme la visionneuse STL
    camera.position.set(-945, -1676, 1548); // vue de départ en 3/4 tournée de 180° (demande de l'utilisateur), assez loin pour voir le nichoir ET le panneau solaire
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.PAN };
    orbit.target.set(330, 0, 100);
    orbit.enableDamping = true;
    const labels = new Group();
    const handles = new Group(); // ronds aux coins de l'élément choisi : on les tire pour déplacer l'élément par ce coin
    const targets = new Group(); // ronds aux coins des autres pièces (demi-transparents), visibles pendant un tel glissé : le coin tiré s'y aimante
    targets.visible = false;
    scene.add(labels, handles, targets);
    const holeMark = new Group(); // le trou en cours de réglage, en pointillés ambre sur les deux faces de la plaque
    renderer.localClippingEnabled = true;
    const cutMark = new Group(); // le plan de coupe (carré bleu transparent), qu'on glisse le long de son axe
    scene.add(cutMark);
    const pullMark = new Group(); // la face double-cliquée, en pointillés bleus : on la tire ou on la pousse
    scene.add(holeMark, pullMark);
    const v: View = { ambient, sun, scene, camera, renderer, orbit, meshes: new Map(), labels, handles, targets, holeMark, pullMark, cutMark, dragging: false };
    // glissé de la face : le long de sa normale
    let pullDrag: { total: number; s0: number; P0: Vector3; N: Vector3 } | null = null;
    const lineParam = (P0: Vector3, N: Vector3): number | null => { // paramètre du point de la droite (P0, N) le plus proche du rayon souris
      const o = ray.ray.origin, r = ray.ray.direction, w0 = o.clone().sub(P0);
      const b = r.dot(N), dd = r.dot(w0), ee = N.dot(w0), den = 1 - b * b;
      if (Math.abs(den) < 1e-4) return null;
      return (ee - b * dd) / den;
    };
    const onPullDown = (e: PointerEvent) => {
      const pl = pullRef.current;
      if (e.button !== 0 || !pl) return;
      rayAt(e);
      const hit = ray.intersectObjects([...v.meshes.values()], false)[0];
      if (!hit || (hit.object.userData.id as string) !== pl.plankId) return;
      const m = v.meshes.get(pl.plankId)!;
      const p = scRef.current.planks.find((x) => x.id === pl.plankId)!;
      const N = new Vector3(pl.axis === 'x' ? 1 : 0, pl.axis === 'y' ? 1 : 0, pl.axis === 'z' ? 1 : 0).multiplyScalar(pl.sign).applyQuaternion(m.quaternion).normalize();
      const half = pl.axis === 'x' ? p.w / 2 : pl.axis === 'y' ? p.h / 2 : scRef.current.t / 2;
      const P0 = m.position.clone().addScaledVector(N, half);
      const s0 = lineParam(P0, N);
      if (s0 === null) return;
      pullDrag = { total: 0, s0, P0, N };
      orbit.enabled = false; v.dragging = true;
      renderer.domElement.setPointerCapture(e.pointerId);
      pushEntry('Face tirée');
      e.stopImmediatePropagation();
    };
    const onPullMove = (e: PointerEvent) => {
      if (!pullDrag) return;
      rayAt(e);
      const sNow = lineParam(pullDrag.P0, pullDrag.N);
      if (sNow === null) return;
      const want = Math.round(sNow - pullDrag.s0); // au millimètre
      const inc = want - pullDrag.total;
      if (!inc) return;
      const pl = pullRef.current!;
      const { scene: n, applied } = pullFace(scRef.current, pl.plankId, pl.axis, pl.sign, inc);
      pullDrag.total += applied;
      if (applied) { scRef.current = n; setSc(n); }
    };
    const onPullUp = () => { if (!pullDrag) return; pullDrag = null; orbit.enabled = true; setTimeout(() => { v.dragging = false; }, 0); };
    // glisser le plan de coupe le long de son axe
    let cutDrag: { s0: number; pos0: number; P0: Vector3; N: Vector3 } | null = null;
    const onCutDown = (e: PointerEvent) => {
      const c = cutRef.current;
      if (e.button !== 0 || !c.on) return;
      rayAt(e);
      const hit = ray.intersectObjects(v.cutMark.children, false)[0];
      if (!hit) return;
      const plankHit = ray.intersectObjects([...v.meshes.values()], false)[0];
      if (plankHit && plankHit.distance < hit.distance - 0.5) return; // une plaque devant le plan : on la laisse
      const N = AXIS_N[c.axis].clone();
      const s0 = lineParam(hit.point.clone(), N);
      if (s0 === null) return;
      cutDrag = { s0, pos0: c.pos, P0: hit.point.clone(), N };
      orbit.enabled = false; v.dragging = true;
      renderer.domElement.setPointerCapture(e.pointerId);
      e.stopImmediatePropagation();
    };
    const onCutMove = (e: PointerEvent) => {
      if (!cutDrag) return;
      rayAt(e);
      const sNow = lineParam(cutDrag.P0, cutDrag.N);
      if (sNow === null) return;
      const pos = Math.round(cutDrag.pos0 + sNow - cutDrag.s0);
      setCut((c) => (c.pos === pos ? c : { ...c, pos }));
    };
    const onCutUp = () => { if (!cutDrag) return; cutDrag = null; orbit.enabled = true; setTimeout(() => { v.dragging = false; }, 0); };
    renderer.domElement.addEventListener('pointerdown', onCutDown, true);
    renderer.domElement.addEventListener('pointermove', onCutMove);
    renderer.domElement.addEventListener('pointerup', onCutUp);
    renderer.domElement.addEventListener('pointerdown', onPullDown, true);
    renderer.domElement.addEventListener('pointermove', onPullMove);
    renderer.domElement.addEventListener('pointerup', onPullUp);
    // glissé par un coin
    let cornerDrag: { anchorId: string; start: Vector3; plane: Plane; startPos: Vec3; rot: Vec3 } | null = null;
    const rayAt = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    };
    const onCornerDown = (e: PointerEvent) => {
      if (e.button !== 0 || !handles.visible || pullRef.current) return;
      rayAt(e);
      const hit = ray.intersectObjects(handles.children, false)[0];
      const id = selRef.current;
      const p = id ? scRef.current.planks.find((x) => x.id === id) : undefined;
      if (!hit || !p) return;
      const start = hit.object.position.clone();
      const n = camera.getWorldDirection(new Vector3());
      cornerDrag = { anchorId: p.id, start, plane: new Plane().setFromNormalAndCoplanarPoint(n, start), startPos: [...p.pos] as Vec3, rot: [...p.rot] as Vec3 };
      orbit.enabled = false; v.dragging = true; targets.visible = true;
      renderer.domElement.setPointerCapture(e.pointerId);
      pushEntry('Déplacement par un coin');
      e.stopImmediatePropagation();
    };
    const onCornerMove = (e: PointerEvent) => {
      if (!cornerDrag) return;
      rayAt(e);
      const P = new Vector3();
      if (!ray.ray.intersectPlane(cornerDrag.plane, P)) return;
      // aimantation à l'écran : si la souris passe sur un coin d'une autre pièce (devant ou derrière, même loin), le coin tiré y saute
      const r = renderer.domElement.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let best: Vector3 | null = null, bd = SNAP;
      for (const tg of targets.children) {
        const q = tg.position.clone().project(camera);
        if (q.z > 1) continue; // derrière la caméra
        const d = Math.hypot(((q.x + 1) / 2) * r.width - mx, ((1 - q.y) / 2) * r.height - my);
        if (d < bd) { bd = d; best = tg.position; }
      }
      if (best) P.copy(best);
      const d = P.clone().sub(cornerDrag.start);
      const pos: Vec3 = [r2(cornerDrag.startPos[0] + d.x), r2(cornerDrag.startPos[1] + d.y), r2(cornerDrag.startPos[2] + d.z)];
      const { anchorId, rot } = cornerDrag;
      setSc((s) => { const n = moveWithGroup(s, anchorId, pos, rot); scRef.current = n; return n; });
    };
    const onCornerUp = () => { if (!cornerDrag) return; cornerDrag = null; orbit.enabled = true; targets.visible = false; setTimeout(() => { v.dragging = false; }, 0); };
    renderer.domElement.addEventListener('pointerdown', onCornerDown, true);
    renderer.domElement.addEventListener('pointermove', onCornerMove);
    renderer.domElement.addEventListener('pointerup', onCornerUp);
    // un clic (sans glissé) choisit une plaque ; dans le vide, désélectionne
    const ray = new Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (cornerDrag) { down = null; return; }
      if (!down || v.dragging || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || (e.button !== 0 && e.button !== 2)) { down = null; return; }
      down = null;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects([...v.meshes.values()], false)[0];
      const id = hit ? (hit.object.userData.id as string) : null;
      if (e.button === 2) { // clic droit sur une plaque : menu, avec le point touché en coordonnées de la plaque
        if (hit && id) { const local = hit.object.worldToLocal(hit.point.clone()); setSelectedId(id); setCtx({ x: e.clientX - r.left, y: e.clientY - r.top, plankId: id, local: [local.x, local.y] }); }
        else setCtx(null);
        return;
      }
      setCtx(null);
      pickRef.current(id, e.ctrlKey || e.metaKey);
    };
    // survol : un composant électronique passe en surbrillance (la même que le survol dans « Pièces »), curseur main
    let hov: string | null = null;
    const onHover = (e: PointerEvent) => {
      let id: string | null = null;
      if (e.buttons === 0 && !v.dragging && !cornerDrag) {
        const r = renderer.domElement.getBoundingClientRect();
        ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
        const h = ray.intersectObjects([...v.meshes.values()].filter((m) => m.visible), false)[0];
        const hid = h ? (h.object.userData.id as string) : null;
        const pl = hid ? scRef.current.planks.find((p) => p.id === hid) : undefined;
        if (pl) id = pl.id; // toute pièce survolée passe en surbrillance
      }
      renderer.domElement.style.cursor = id ? 'pointer' : '';
      if (id !== hov) { hov = id; setHover(id ? { plank: id } : null); }
    };
    renderer.domElement.addEventListener('pointermove', onHover);
    renderer.domElement.addEventListener('pointerleave', () => { if (hov) { hov = null; setHover(null); } });
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let raf = 0;
    const loop = () => {
      orbit.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop);
    };
    loop();
    view.current = v;
    return () => { cancelAnimationFrame(raf); ro.disconnect(); orbit.dispose(); renderer.dispose(); renderer.domElement.remove(); view.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
