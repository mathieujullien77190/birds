import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createWeather } from './weather.js';
import { createWalls, WALL_TYPES, bridgeDeckY as walls_bridgeDeckY } from './walls.js';

const $ = (id) => document.getElementById(id);
let statusTimer;
const setStatus = (t) => {
  const el = $('status');
  el.textContent = t;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (el.textContent = ''), 7000); // le message s'efface seul
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- Scène Three.js ----------
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
view.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
camera.position.set(4.4, 2.6, 5.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.1, 0);
controls.enableDamping = true;
// clic molette = tourner, clic droit = déplacer la vue ; le clic gauche sert uniquement à sélectionner / déplacer les objets / peindre
controls.mouseButtons = { LEFT: -1, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
controls.autoRotateSpeed = 1.5;

const hemi = new THREE.HemisphereLight(0xffffff, 0x667755, 1.6);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 1.4);
dir.position.set(3, 5, 2);
dir.shadow.bias = -0.0004;
dir.shadow.normalBias = 0.03;
scene.add(dir, dir.target);
// soleil déplaçable : une boule jaune sur la sphère autour de la scène, reliée au centre par un trait
const sunGizmo = new THREE.Mesh(
  new THREE.SphereGeometry(1, 20, 14),
  new THREE.MeshBasicMaterial({ color: 0xffd966, fog: false, depthTest: false, transparent: true })
);
sunGizmo.renderOrder = 20;
const sunLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]),
  new THREE.LineBasicMaterial({ color: 0xffd966, fog: false, transparent: true, opacity: 0.55, depthTest: false })
);
sunLine.renderOrder = 19;
scene.add(sunGizmo, sunLine);
let sunDist = 5; // distance de la boule au centre
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
let shadowRadius = 3; // rayon (monde) couvert par la carte d'ombre

function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  brushTick(dt); // monte / descend le terrain tant que le pinceau est maintenu
  fishTick(dt, clock.elapsedTime);
  birdsTick(dt, clock.elapsedTime);
  weather.update(dt, clock.elapsedTime);
  controls.autoRotate = $('rotate').checked && !edit;
  controls.update();
  if (edit) editTick();
  if (poseMode) poseTick();
  if (atelier) atelierTick();
  renderer.render(scene, camera);
});

// ---------- Outils ----------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashPos(x, y, z, s) {
  const v = Math.sin(Math.round(x * 1e4) / 1e4 * 12.9898 + Math.round(y * 1e4) / 1e4 * 78.233 + Math.round(z * 1e4) / 1e4 * 37.719 + s * 4.1) * 43758.5453;
  return v - Math.floor(v);
}

// déplace chaque sommet de façon déterministe (sommets confondus = même déplacement)
function jitter(geo, amp, s) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(
      i,
      x + (hashPos(x, y, z, s) - 0.5) * amp,
      y + (hashPos(x, y, z, s + 1) - 0.5) * amp,
      z + (hashPos(x, y, z, s + 2) - 0.5) * amp
    );
  }
}

// non indexé + normales plates + une couleur par face
function finish(geo, colorFn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let t = 0; t < p.count; t += 3) {
    const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3;
    const cy = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
    const cz = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
    const c = colorFn(cx, cy, cz);
    for (let k = 0; k < 3; k++) {
      col[(t + k) * 3] = c.r; col[(t + k) * 3 + 1] = c.g; col[(t + k) * 3 + 2] = c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// comme finish(), mais les normales des sommets confondus sont moyennées (dosage k de 0 à 1) : la boule de feuilles s'éclaire en douceur, comme le sol
function softFinish(geo, colorFn, k) {
  const g = finish(geo, colorFn);
  if (!(k > 0)) return g;
  const p = g.attributes.position, n = g.attributes.normal, sum = new Map();
  const key = (i) => Math.round(p.getX(i) * 1e4) + ',' + Math.round(p.getY(i) * 1e4) + ',' + Math.round(p.getZ(i) * 1e4);
  for (let i = 0; i < p.count; i++) {
    const kk = key(i), a = sum.get(kk) || [0, 0, 0];
    a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i);
    sum.set(kk, a);
  }
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const a = sum.get(key(i)), l = Math.hypot(a[0], a[1], a[2]) || 1;
    v.set(n.getX(i) * (1 - k) + (a[0] / l) * k, n.getY(i) * (1 - k) + (a[1] / l) * k, n.getZ(i) * (1 - k) + (a[2] / l) * k).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

// ---------- Paramètres ----------
const RANGES = ['trunkH', 'trunkW', 'levels', 'kids', 'angle', 'lenR', 'radR', 'curv', 'twist', 'droop', 'irr', 'density', 'leafSize', 'leafVar', 'squash', 'hueVar', 'mix', 'relief', 'hillSize', 'leafPoly', 'fruitDensity', 'leafSoft'];
const num = (id) => parseFloat($(id).value);
const isBroad = (q) => q.type !== 'conifer' && q.type !== 'bamboo'; // seuls les feuillus ont un squelette de branches
const TREE_IDS = [...RANGES.filter((id) => id !== 'relief' && id !== 'hillSize'), 'type', 'leafShape', 'fruit', 'fc', 'fc2', 'tc', 'pot', 'potColor'];

function params() {
  const q = { type: $('type').value };
  RANGES.forEach((id) => (q[id] = num(id)));
  q.alba = $('alba').checked;
  q.ground = $('ground').checked;
  q.leafShape = $('leafShape').value;
  q.fruit = $('fruit').value;
  q.fc = $('fc').value;
  q.fc2 = $('fc2').value;
  q.tc = $('tc').value;
  q.pot = $('pot').value;
  q.potColor = $('potColor').value;
  return q;
}

function showValues() {
  document.querySelectorAll('b[data-for]').forEach((b) => {
    b.textContent = $(b.dataset.for).value;
  });
}

// géométrie unitaire d'une touffe selon la forme choisie, orientée au hasard
// poly : 0 = octaèdre (8 faces), 1 = 20, 2 = 80, 3 = 180 faces
const ball = (poly) => (poly <= 0 ? new THREE.OctahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, poly - 1));
function leafGeometry(shape, tipDir, rng, poly = 2) {
  let g;
  switch (shape) {
    case 'cloud':
      g = ball(poly);
      g.scale(1.3, 0.6, 1.3);
      break;
    case 'crystal':
      g = new THREE.IcosahedronGeometry(1, 0);
      g.scale(0.8, 1.25, 0.8);
      break;
    case 'leaf':
      g = new THREE.OctahedronGeometry(1, 0);
      g.scale(1.4, 0.18, 0.7);
      g.rotateX((rng() - 0.5) * 1.6);
      g.rotateZ((rng() - 0.5) * 1.6);
      break;
    case 'cone':
      g = new THREE.ConeGeometry(0.6, 1.8, 5, 1);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, tipDir.clone().add(new THREE.Vector3((rng() - 0.5) * 0.8, 0, (rng() - 0.5) * 0.8)).normalize()));
      return g;
    case 'cube':
      g = new THREE.BoxGeometry(1.3, 1.3, 1.3);
      g.rotateX(rng() * Math.PI);
      g.rotateZ(rng() * Math.PI);
      break;
    default:
      g = ball(poly);
  }
  g.rotateY(rng() * Math.PI);
  return g;
}

// ---------- Génération de l'arbre ----------
let seed = 1;
const UP = new THREE.Vector3(0, 1, 0);
const _hsl = {};

// ---------- Squelette d'un arbre feuillu ----------
// Un feuillu est décrit par un squelette explicite et sérialisable (JSON), pour pouvoir éditer une branche isolée :
//   { v: 1, grav, nid, b: [branche, …] }   (grav = chute de direction par segment ; nid = prochain identifiant libre)
//   branche = { id, p, at, d, a, len, rad, lv, s }
//     id  : identifiant ; p : id de la branche parente (null pour le tronc) ; les parents précèdent toujours leurs enfants
//     at  : point d'attache sur la branche parente, de 0 (base) à 1 (bout)
//     d   : direction initiale [x, y, z] ; a : axe initial de courbure [x, y, z]
//     len : longueur ; rad : rayon à la base ; lv : niveau (0 = tronc)
//     s   : un [torsion, courbure] (radians) par segment à partir du 2e : tirage aléatoire figé, donc géométrie reproductible
const rnd4 = (v) => Math.round(v * 1e4) / 1e4;
const vec3 = (v) => [rnd4(v.x), rnd4(v.y), rnd4(v.z)];
const perpTo = (d) => new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).normalize();
const sidesOf = (lv) => (lv === 0 ? 7 : lv < 3 ? 6 : 5); // côtés des cylindres selon le niveau

// point à la fraction `at` d'une polyligne de segments de même longueur
function pathPoint(ps, at) {
  const n = ps.length - 1, x = clamp(at, 0, 1) * n, i = Math.min(n - 1, Math.floor(x));
  return ps[i].clone().lerp(ps[i + 1], x - i);
}

// points `ps` (nSeg + 1) et directions `ds` (nSeg) d'une branche qui part de p0 : mêmes règles que l'ancien `grow`
function tracePath(b, p0, grav) {
  const n = b.s.length + 1, segLen = b.len / n;
  const d = new THREE.Vector3(...b.d).normalize(), axis = new THREE.Vector3(...b.a);
  const p = p0.clone(), ps = [p.clone()], ds = [];
  for (let s = 0; s < n; s++) {
    if (s > 0) {
      axis.sub(d.clone().multiplyScalar(axis.dot(d))).normalize();
      axis.applyAxisAngle(d, b.s[s - 1][0]); // torsion : l'axe de courbure tourne
      d.applyAxisAngle(axis, b.s[s - 1][1]); // courbure
      d.y -= grav;                           // gravité
      d.normalize();
    }
    ds.push(d.clone());
    p.addScaledVector(d, segLen);
    ps.push(p.clone());
  }
  return { ps, ds };
}

// trace tout le squelette : Map id -> { b, ps, ds } (la base d'un enfant se déduit du tracé de son parent)
function skelPaths(sk) {
  const paths = new Map();
  for (const b of sk.b) {
    const par = b.p === null ? null : paths.get(b.p);
    const t = tracePath(b, par ? pathPoint(par.ps, b.at) : new THREE.Vector3(), sk.grav);
    t.b = b;
    paths.set(b.id, t);
  }
  return paths;
}

const validSkel = (sk) => !!sk && Array.isArray(sk.b) && sk.b.length > 0 && sk.b[0].p === null && sk.b.every((b) => Array.isArray(b.s) && Array.isArray(b.d) && Array.isArray(b.a));

// tire le squelette d'un feuillu : même logique (et même suite de nombres aléatoires) que l'ancien générateur récursif,
// donc la forme d'un arbre non modifié reste celle d'avant
function genSkeleton(q, seed) {
  const rng = mulberry32(seed);
  const sk = { v: 1, grav: rnd4(q.droop * 0.14), nid: 0, b: [] };
  const paths = new Map();
  const ang = (q.angle * Math.PI) / 180;
  const grow = (parent, at, d0, len, rad, level) => {
    const nSeg = level === 0 ? 4 : 3, sides = sidesOf(level);
    const d = d0.clone().normalize();
    const b = { id: sk.nid++, p: parent, at: rnd4(at), d: vec3(d), a: vec3(perpTo(d)), len: rnd4(len), rad: rnd4(rad), lv: level, s: [] };
    sk.b.push(b);
    for (let s = 0; s < nSeg; s++) {
      if (s > 0) {
        const tw = q.twist * 1.1 + (rng() - 0.5) * q.irr;
        const cv = q.curv * 0.32 * (1 + (rng() - 0.5) * q.irr * 1.6);
        b.s.push([rnd4(tw), rnd4(cv)]);
      }
      // l'ancien générateur consommait ici le tirage du relief du tronc et ceux de la couleur de chaque face du segment
      for (let k = (level === 0 ? 1 : 0) + 4 * sides; k > 0; k--) rng();
    }
    const par = parent === null ? null : paths.get(parent);
    const t = tracePath(b, par ? pathPoint(par.ps, b.at) : new THREE.Vector3(), sk.grav);
    paths.set(b.id, t);
    if (level >= q.levels) return;
    // fourche : `count` enfants autour de l'axe de la branche
    const spawn = (atK, dd, count, angK, lenMul) => {
      const base = perpTo(dd);
      for (let i = 0; i < count; i++) {
        const phi = (i / count) * Math.PI * 2 + level * 0.9 + (rng() - 0.5) * q.irr * 2.2;
        const a = base.clone().applyAxisAngle(dd, phi);
        const cd = dd.clone().applyAxisAngle(a, angK * (0.75 + rng() * 0.5));
        cd.y += 0.12;
        cd.normalize();
        grow(b.id, atK, cd, len * q.lenR * lenMul * (0.85 + rng() * 0.3), rad * q.radR, level + 1);
      }
    };
    spawn(1, t.ds[nSeg - 1], q.kids, q.kids === 1 ? ang * 0.5 : ang, 1);
    // branches latérales plus bas sur le tronc / les grosses branches
    if (level <= 1 && nSeg >= 3) spawn((nSeg - 1) / nSeg, t.ds[nSeg - 1], level === 0 ? 2 : 1, ang * 1.25, 0.8);
  };
  grow(null, 0, UP.clone(), q.trunkH, q.trunkW / 2, 0);
  return sk;
}

// génère la géométrie d'UN arbre (sans sol), centré sur l'origine, à la taille native
// ---------- Fruits des arbres fruitiers ----------
const FRUITS = {
  apple: { colors: ['#d9362b', '#c92a2a', '#e8c53a'], r: 0.05, shape: 'ball' },
  cherry: { colors: ['#a3162a', '#c21f3a'], r: 0.03, shape: 'cherry' },
  pear: { colors: ['#b5c43a', '#d4c94a'], r: 0.042, shape: 'pear' },
  orange: { colors: ['#f08a1c', '#ee7d12'], r: 0.054, shape: 'ball' },
  lemon: { colors: ['#f2d230', '#f6dc4a'], r: 0.044, shape: 'lemon' },
  plum: { colors: ['#6a2c8f', '#5a2580'], r: 0.038, shape: 'ball' },
  walnut: { colors: ['#6f8a3a', '#7a6a3a'], r: 0.044, shape: 'ball' },
};
// géométries d'un fruit centré sur l'origine (rayon r) ; `userData.stem` marque la queue (colorée en vert)
function fruitGeometries(shape, r, rng) {
  const ball = (rx, ry, rz, detail = r > 0.036 ? 1 : 0) => { const g = new THREE.IcosahedronGeometry(1, detail); g.scale(rx, ry, rz); return g; };
  if (shape === 'pear') { // renflée en bas, plus étroite en haut
    const g = ball(r, r * 1.35, r);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = p.getY(i) > 0 ? 0.55 + 0.45 * (1 - p.getY(i) / (r * 1.35)) : 1; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    return [g];
  }
  if (shape === 'lemon') {
    const g = ball(r * 0.85, r * 0.8, r * 1.2, 1);
    g.rotateY(rng() * Math.PI);
    return [g];
  }
  if (shape === 'cherry') { // deux cerises reliées par une queue
    const out = [];
    for (const sx of [-1, 1]) {
      const b = ball(r, r, r, 0);
      b.translate(sx * r * 1.1, -r * 0.4, 0);
      out.push(b);
      const s = new THREE.CylinderGeometry(r * 0.08, r * 0.08, r * 2.4, 3, 1);
      s.rotateZ(sx * 0.35);
      s.translate(sx * r * 0.75, r * 0.7, 0);
      s.userData.stem = true;
      out.push(s);
    }
    return out;
  }
  return [ball(r, r * 0.95, r)]; // pomme, orange, prune, noix : boule
}

// skel : squelette d'un feuillu (sinon tiré de la graine) ; opts.noLeaves : sans feuillage (édition des branches)
// adaptateur : applique d'abord la saison (couleurs / feuillage) aux paramètres, sans modifier ceux de l'utilisateur
function makeTree(q, seed, ...rest) {
  return makeTreeBase(weather.seasonTree(q), seed, ...rest);
}
function makeTreeBase(q, seed, skel = null, opts = {}) {
  let rng = mulberry32(seed);
  const fcol = new THREE.Color(q.fc), fcol2 = new THREE.Color(q.fc2), tcol = new THREE.Color(q.tc);
  const parts = [];
  const tips = [];
  const twigs = []; // segments des dernières branches : support des feuilles plates
  let trunkPath = []; // points du tronc : [{x, y, z, r}]
  let skeleton = null, paths = null;

  // couleur dérivée d'une base ; palette pastel quantifiée en mode Alba
  const tint = (base, dl, dh = 0) => {
    base.getHSL(_hsl, THREE.SRGBColorSpace);
    let h = (_hsl.h + dh + 1) % 1, s = _hsl.s, l = clamp(_hsl.l + dl, 0, 1);
    if (q.alba) {
      s = Math.round(Math.min(1, s * 0.95 + 0.06) * 7) / 7;
      l = Math.round((l * 0.85 + 0.15) * 9) / 9;
    }
    return new THREE.Color().setHSL(h, s, l, THREE.SRGBColorSpace);
  };
  const perp = (d) => new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).normalize();
  let yLo = 0, yHi = 1;
  // base / dh sont choisis une fois par touffe ; la luminosité varie par face
  const leafColor = (cy, base = fcol, dh = 0) =>
    tint(base, clamp((cy - yLo) / Math.max(0.01, yHi - yLo), 0, 1) * 0.24 - 0.12 + (rng() - 0.5) * 0.07, dh);
  const pickLeaf = () => ({
    base: rng() < q.mix / 100 ? fcol2 : fcol,
    dh: (rng() - 0.5) * 2 * q.hueVar,
  });

  if (q.type === 'conifer') buildConifer();
  else if (q.type === 'bamboo') buildBamboo();
  else buildBroad();
  if (q.pot && q.pot !== 'none') addPot();

  // ----- feuillu : branches récursives -----
  function segment(p, d, len, r0, r1, sides, level, sd) {
    const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d));
    g.translate(p.x + (d.x * len) / 2, p.y + (d.y * len) / 2, p.z + (d.z * len) / 2);
    if (level >= q.levels - 1) twigs.push({ p: p.clone(), d: d.clone(), len, r: r0, sd });
    if (level === 0) jitter(g, r0 * 0.3 * q.irr, rng() * 100);
    parts.push(finish(g, () => tint(tcol, -level * 0.012 + (rng() - 0.5) * 0.05)));
  }

  // générateur propre à une branche (et à un usage k) : modifier une branche ne change ni les couleurs ni les feuilles des autres
  function branchRng(id, k) { return mulberry32((Math.imul(seed, 73856093) ^ Math.imul(id, 19349663) ^ Math.imul(k, 83492791)) >>> 0); }

  // construit les cylindres et repère les extrémités à partir du squelette
  function buildBranches() {
    skeleton = validSkel(skel) ? skel : genSkeleton(q, seed);
    paths = skelPaths(skeleton);
    const hasKids = new Set(skeleton.b.map((b) => b.p));
    for (const b of skeleton.b) {
      const { ps, ds } = paths.get(b.id);
      const nSeg = b.s.length + 1, segLen = b.len / nSeg, sides = sidesOf(b.lv);
      rng = branchRng(b.id, 1);
      for (let s = 0; s < nSeg; s++) segment(ps[s], ds[s], segLen, b.rad * (1 - (0.45 * s) / nSeg), b.rad * (1 - (0.45 * (s + 1)) / nSeg), sides, b.lv, 100 + b.id * 8 + s);
      // axe du tronc (points + rayons) : le pic s'y accroche et tourne autour
      if (b.lv === 0 && b.p === null) trunkPath = ps.map((pp, i) => ({ x: pp.x, y: pp.y, z: pp.z, r: b.rad * (1 - (0.45 * i) / nSeg) }));
      // une branche sans enfant porte du feuillage
      if (!hasKids.has(b.id)) tips.push({ p: ps[nSeg].clone(), d: ds[nSeg - 1].clone(), sd: b.id });
    }
  }

  function buildBroad() {
    buildBranches();
    if (!tips.length) return;
    yLo = Math.min(...tips.map((t) => t.p.y));
    yHi = Math.max(...tips.map((t) => t.p.y));
    if (opts.noLeaves) return;
    // touffes de feuilles au bout des dernières branches
    const prob = clamp(q.density / 100, 0, 1);
    if (q.leafShape === 'leaf') { placeLeaves(prob); placeFruits(); return; }
    if (q.leafShape === 'strand') { placeStrands(prob); placeFruits(); return; }
    for (const tip of tips) {
      rng = branchRng(tip.sd, 2);
      if (rng() > prob) continue;
      // les feuilles plates sont petites : il en faut plus par extrémité
      const n = (q.leafShape === 'leaf' ? 4 : 1) + (q.density > 55 ? 1 : 0) + (rng() < 0.35 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const bs = q.leafSize * (1 + (rng() - 0.5) * 2 * q.leafVar * 0.8) * (q.leafShape === 'leaf' ? 0.6 : 1);
        const g = leafGeometry(q.leafShape, tip.d, rng, q.leafPoly);
        jitter(g, (q.leafShape === 'cube' ? 0.15 : 0.3) * q.irr, rng() * 100);
        g.scale(bs, bs * q.squash, bs);
        g.translate(
          tip.p.x + tip.d.x * bs * 0.4 + (rng() - 0.5) * bs * (q.leafShape === 'leaf' ? 2 : 0.8),
          tip.p.y + tip.d.y * bs * 0.4 + (rng() - 0.5) * bs * (q.leafShape === 'leaf' ? 1.6 : 0.6),
          tip.p.z + tip.d.z * bs * 0.4 + (rng() - 0.5) * bs * (q.leafShape === 'leaf' ? 2 : 0.8)
        );
        const { base, dh } = pickLeaf();
        parts.push(softFinish(g, (x, y) => leafColor(y, base, dh), q.leafSoft ?? 0.7));
      }
    }
    placeFruits();
  }

  // fruits : petites formes accrochées autour des touffes de feuilles (q.fruit = pomme, cerise, poire…), plutôt vers le bas
  function placeFruits() {
    const F = FRUITS[q.fruit];
    if (!F || opts.noLeaves) return;
    const prob = clamp(q.fruitDensity ?? 0.6, 0, 1), bs = q.leafShape === 'leaf' ? q.leafSize * 0.9 : q.leafSize;
    const r = 1.5 * F.r * (0.6 + 0.4 * (q.leafSize / 0.24)); // proportionnel à la taille des touffes
    for (const tip of tips) {
      rng = branchRng(tip.sd, 5);
      if (rng() > prob) continue;
      // un fruit (rarement deux) pendu tout au bout de la branche
      const n = rng() < 0.2 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const fr = r * (0.9 + rng() * 0.2);
        const side = new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5).multiplyScalar(fr * 1.2);
        const cen = tip.p.clone().addScaledVector(tip.d, bs * 0.35).add(side);
        cen.y -= bs * q.squash * (0.8 + rng() * 0.25) + fr; // pend sous la touffe de feuilles, au bout de la branche
        const col = new THREE.Color(F.colors[Math.floor(rng() * F.colors.length)]);
        const dl = (rng() - 0.5) * 0.06;
        for (const g of fruitGeometries(F.shape, fr, rng)) {
          g.translate(cen.x, cen.y, cen.z);
          parts.push(finish(g, () => tint(g.userData.stem ? new THREE.Color('#4f7a2f') : col, dl)));
        }
      }
    }
  }

  // fils pendants (saule pleureur) : fines chaînes de prismes qui tombent des rameaux, avec quelques petites feuilles
  function placeStrands(prob) {
    if (prob <= 0) return;
    const nS = 5, sk = clamp(q.leafSize / 0.2, 0.6, 1.6);
    const link = (a, b, r0, r1, cap) => {
      const d = b.clone().sub(a), len = d.length(), g = new THREE.CylinderGeometry(r1, r0, len, 4, 1, !cap);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
      g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      return g;
    };
    const src = [...tips.map((tp) => ({ p: tp.p, d: tp.d, sd: tp.sd })), ...twigs.map((tw) => ({ p: tw.p.clone().addScaledVector(tw.d, tw.len), d: tw.d, sd: tw.sd }))];
    for (const s of src) {
      rng = branchRng(s.sd, 6);
      if (rng() > prob * 0.8) continue;
      const count = 1 + (rng() < 0.35 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const L = q.leafSize * (3.4 + rng() * 2.2), step = L / nS;
        const out = new THREE.Vector3(s.d.x + (rng() - 0.5), 0, s.d.z + (rng() - 0.5)).normalize().multiplyScalar(0.3 + rng() * 0.3);
        const { base, dh } = pickLeaf();
        let a = s.p.clone().add(new THREE.Vector3((rng() - 0.5) * 0.04, 0, (rng() - 0.5) * 0.04));
        for (let k = 0; k < nS; k++) {
          const dir = new THREE.Vector3(0, -1, 0).addScaledVector(out, 1 - k / nS).addScaledVector(new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5), 0.25).normalize();
          const b = a.clone().addScaledVector(dir, step);
          const g = link(a, b, 0.02 * sk * (1 - (k / nS) * 0.5), 0.02 * sk * (1 - ((k + 1) / nS) * 0.5), k === nS - 1); // bout arrondi, pas de pointe
          parts.push(softFinish(g, (x, y) => leafColor(y, base, dh), q.leafSoft ?? 0.7));
          a = b;
        }
      }
    }
  }

  // feuilles plates : losanges dont la pointe part de la branche, le long des rameaux
  function placeLeaves(prob) {
    if (prob <= 0) return;
    const Z = new THREE.Vector3(0, 0, 1);
    const mk = (origin, dirv) => {
      const L = q.leafSize * 1.5 * (1 + (rng() - 0.5) * 2 * q.leafVar * 0.8);
      const g = new THREE.OctahedronGeometry(1, 0);
      g.scale(0.45 * (q.squash / 0.85), 0.07, 1); // losange long et plat
      g.translate(0, 0, 1);                       // pointe de base à l'origine
      g.scale(L, L, L);
      g.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(Z, rng() * Math.PI * 2)); // rotation sur lui-même
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Z, dirv));
      g.translate(origin.x, origin.y, origin.z);
      const { base, dh } = pickLeaf();
      parts.push(softFinish(g, (x, y) => leafColor(y, base, dh), q.leafSoft ?? 0.7));
    };
    for (const tw of twigs) {
      rng = branchRng(tw.sd, 3);
      const n = Math.round(prob * 3 + rng() - 0.3);
      for (let i = 0; i < n; i++) {
        const side = perp(tw.d).applyAxisAngle(tw.d, rng() * Math.PI * 2);
        const origin = tw.p.clone().addScaledVector(tw.d, tw.len * rng()).addScaledVector(side, tw.r * 0.8);
        const dv = tw.d.clone().multiplyScalar(0.5 + rng() * 0.4).addScaledVector(side, 0.7);
        dv.y += 0.12;
        mk(origin, dv.normalize());
      }
    }
    // bouquet au bout des branches
    for (const tip of tips) {
      rng = branchRng(tip.sd, 4);
      const n = Math.round(prob * 4);
      for (let i = 0; i < n; i++) {
        const dv = tip.d.clone().add(new THREE.Vector3(rng() - 0.5, rng() - 0.3, rng() - 0.5).multiplyScalar(1.4));
        mk(tip.p, dv.normalize());
      }
    }
  }

  // ----- conifère : tronc + étages de cônes -----
  function buildConifer() {
    const total = q.trunkH * 2.3, yb = q.trunkH * 0.45, H = total - yb;
    yLo = yb; yHi = total;
    const maxR = H * 0.34 * (q.leafSize / 0.3);
    const R = (t) => maxR * (0.12 + 0.88 * t);

    const rBot = (q.trunkW / 2) * 1.2;
    const trunkLen = total * 0.8;
    const tg = new THREE.CylinderGeometry(rBot * 0.5, rBot, trunkLen, 7, 4);
    tg.translate(0, trunkLen / 2, 0);
    const lean = (rng() - 0.5) * q.curv * 0.5;
    const tp = tg.attributes.position;
    for (let i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) + lean * (tp.getY(i) / trunkLen) ** 2);
    jitter(tg, rBot * 0.25 * q.irr, rng() * 100);
    parts.push(finish(tg, () => tint(tcol, (rng() - 0.5) * 0.06)));

    const L = q.density === 0 ? 0 : 4 + Math.round(q.density / 18);
    const hh = (H / Math.max(L, 1)) * 1.9;
    for (let k = 0; k < L; k++) {
      const coneTop = L > 1 ? total - (k * (H - hh)) / (L - 1) : total;
      const rad = Math.max(0.1, R((k + 0.75) / L) * 1.08);
      const cg = new THREE.ConeGeometry(rad, hh, 8 + Math.floor(rng() * 3), 1);
      jitter(cg, rad * 0.35 * q.irr, rng() * 100);
      cg.rotateY(rng() * Math.PI + k * q.twist * 0.7);
      cg.translate(lean * ((coneTop / trunkLen) ** 2), coneTop - hh / 2, 0);
      parts.push(softFinish(cg, (x, y) => leafColor(y), q.leafSoft ?? 0.7));
    }
    tips.push({ p: new THREE.Vector3(0, total, 0), d: UP });
  }

  // ----- bambou : touffe de chaumes segmentés, penchés vers l'extérieur, avec des bouquets de feuilles en haut -----
  function buildBamboo() {
    const n = 5 + Math.round(q.kids) * 3, H0 = q.trunkH * 2.1, r0 = Math.max(0.012, q.trunkW * 0.16);
    const spread = 0.05 + (q.angle / 85) * 0.2;
    const Z = new THREE.Vector3(0, 0, 1);
    yLo = H0 * 0.35; yHi = H0;
    const link = (a, b, r1, r2, sides) => {
      const d = b.clone().sub(a), len = d.length(), g = new THREE.CylinderGeometry(r2, r1, len, sides, 1);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
      g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      return g;
    };
    for (let i = 0; i < n; i++) {
      const rg = mulberry32((Math.imul(seed, 2654435761) ^ Math.imul(i + 1, 40503)) >>> 0);
      const a = rg() * Math.PI * 2, dd = Math.sqrt(rg()) * spread;
      const bx = Math.cos(a) * dd, bz = Math.sin(a) * dd;
      const h = H0 * (0.6 + 0.5 * rg()), m = Math.max(4, Math.round(h / 0.17));
      const lk = (0.1 + 0.3 * rg()) * q.curv * 2.2, lx = Math.cos(a) * lk, lz = Math.sin(a) * lk;
      const at = (f) => new THREE.Vector3(bx + lx * f * f * h * 0.5, f * h, bz + lz * f * f * h * 0.5);
      const hue = (rg() - 0.5) * 0.08;
      let prev = at(0);
      for (let k = 0; k < m; k++) {
        const f1 = (k + 1) / m, cur = at(f1), rr = r0 * (1 - 0.4 * f1);
        parts.push(finish(link(prev, cur, rr, rr * 0.97, 6), () => tint(tcol, hue + (k % 2 ? 0.015 : -0.015))));
        const ring = link(cur.clone().addScaledVector(UP, -0.008), cur.clone().addScaledVector(UP, 0.008), rr * 1.35, rr * 1.35, 6);
        parts.push(finish(ring, () => tint(tcol, hue - 0.07)));
        // feuilles : branchettes courtes terminées par un bouquet de 3 feuilles lancéolées, surtout dans la moitié haute
        if (f1 > 0.45 && q.density > 0 && rg() < q.density / 100 + 0.15) {
          if (k === m - 1) tips.push({ p: cur.clone(), d: UP.clone(), sd: i });
          for (let b = 0; b < 2; b++) {
            const ba = rg() * Math.PI * 2, bl = (0.1 + rg() * 0.12) * (0.6 + q.leafSize * 2);
            const bd = new THREE.Vector3(Math.cos(ba) * 0.9, 0.35 + rg() * 0.3, Math.sin(ba) * 0.9).normalize();
            const end = cur.clone().addScaledVector(bd, bl);
            const { base, dh } = pickLeaf();
            parts.push(finish(link(cur, end, 0.004, 0.003, 3), () => tint(tcol, hue)));
            for (let L2 = 0; L2 < 3; L2++) {
              const la = (L2 - 1) * 0.55, ld = bd.clone().applyAxisAngle(UP, la);
              ld.y -= 0.35; ld.normalize();
              const ll = q.leafSize * (0.75 + rg() * 0.5) * 1.1;
              const lg = new THREE.OctahedronGeometry(1, 0);
              lg.scale(ll * 0.14, ll * 0.03, ll * 0.5);
              lg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Z, ld));
              lg.translate(end.x + ld.x * ll * 0.45, end.y + ld.y * ll * 0.45, end.z + ld.z * ll * 0.45);
              parts.push(softFinish(lg, (x, y) => leafColor(y, base, dh), q.leafSoft ?? 0.7));
            }
          }
        }
        prev = cur;
      }
    }
    trunkPath = [{ x: 0, y: 0, z: 0, r: r0 * 3 }, { x: 0, y: H0 * 0.5, z: 0, r: r0 * 2.5 }];
  }

  // ----- pot / bac de ville : rond, carré en bois, ou simple grille d'arbre -----
  function addPot() {
    const kind = q.pot, pcol = new THREE.Color(q.potColor || '#b5653f');
    const R0 = Math.max(0.2, q.type === 'bamboo' ? 0.18 : q.trunkW * 1.45);
    const soil = new THREE.Color('#4a3626');
    const add = (g, col, dl = 0) => parts.push(finish(g, () => tint(col, dl)));
    const boxG = (w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); return b; };
    if (kind === 'round') {
      const h = 0.26;
      const body = new THREE.CylinderGeometry(R0, R0 * 0.74, h, 10, 1); body.translate(0, h / 2, 0);
      add(body, pcol);
      const rim = new THREE.CylinderGeometry(R0 * 1.07, R0 * 1.04, 0.04, 10, 1); rim.translate(0, h - 0.02, 0);
      add(rim, pcol, 0.05);
      const foot = new THREE.CylinderGeometry(R0 * 0.7, R0 * 0.7, 0.03, 10, 1); foot.translate(0, 0.015, 0);
      add(foot, pcol, -0.08);
      const s = new THREE.CylinderGeometry(R0 * 0.96, R0 * 0.96, 0.02, 10, 1); s.translate(0, h - 0.015, 0);
      add(s, soil);
    } else if (kind === 'square') {
      const w = R0 * 2.3, h = 0.28;
      add(boxG(w, h, w, 0, h / 2, 0), pcol);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(boxG(0.05, h + 0.03, 0.05, sx * (w / 2 - 0.01), (h + 0.03) / 2, sz * (w / 2 - 0.01)), pcol, -0.1);
      for (const k of [0.33, 0.66]) { // lattes
        add(boxG(w + 0.012, 0.018, w + 0.012, 0, h * k, 0), pcol, -0.06);
      }
      add(boxG(w + 0.03, 0.03, w + 0.03, 0, h, 0), pcol, 0.06);
      add(boxG(w * 0.92, 0.02, w * 0.92, 0, h + 0.003, 0), soil);
    } else if (kind === 'grate') {
      const w = R0 * 2.6, iron = new THREE.Color(q.potColor || '#34383d');
      for (const sx of [-1, 1]) {
        add(boxG(w, 0.03, 0.035, 0, 0.015, sx * (w / 2)), new THREE.Color('#a39b8b'), 0.02); // bordure en pierre
        add(boxG(0.035, 0.03, w, sx * (w / 2), 0.015, 0), new THREE.Color('#a39b8b'), 0.02);
      }
      const ring = new THREE.RingGeometry(Math.max(0.045, q.trunkW * 0.7), R0 * 1.12, 12, 1);
      ring.rotateX(-Math.PI / 2); ring.translate(0, 0.02, 0);
      add(ring, iron);
      for (let i = 0; i < 8; i++) { // rayons de la grille
        const a = (i / 8) * Math.PI * 2, b = boxG(R0 * 1.0, 0.012, 0.014, 0, 0.026, 0);
        b.translate(Math.max(0.05, q.trunkW * 0.7) + R0 * 0.5, 0, 0); b.rotateY(a);
        add(b, iron, 0.06);
      }
      const plate = new THREE.RingGeometry(R0 * 1.12, w / 2 * 0.98, 4, 1); // pourtour carré, tourné de 45°
      plate.rotateZ(Math.PI / 4); plate.rotateX(-Math.PI / 2); plate.translate(0, 0.02, 0);
      add(plate, iron, -0.02);
    }
  }

  // ----- assemblage -----
  const geo = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  geo.computeBoundingBox();
  const bb = geo.boundingBox.clone();
  const radial = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z));
  return { geo, bb, radial, tips: tips.length, trunk: trunkPath, spots: tips.slice(0, 80).map((q) => [q.p.x, q.p.y, q.p.z]), skeleton, paths };
}

// squelettes modifiés (mode « Modification avancée »), par graine d'arbre : ils survivent aux régénérations
// tant que les réglages de FORME ne changent pas (couleurs, feuillage, sol… ne les touchent pas)
const SHAPE_KEYS = ['type', 'trunkH', 'trunkW', 'levels', 'kids', 'angle', 'lenR', 'radR', 'curv', 'twist', 'droop', 'irr'];
const shapeSig = (q) => SHAPE_KEYS.map((k) => q[k]).join(',');
const skelStore = new Map(); // graine -> { sig, skel }
function skelFor(q, sd) {
  const e = skelStore.get(sd);
  if (!e) return null;
  if (e.sig !== shapeSig(q)) { skelStore.delete(sd); return null; } // la forme a changé : on repart du tirage
  return e.skel;
}

// ---------- Terrain ----------
let paintStamps = [];     // coups de pinceau {x, z, r, sand} : survivent à la régénération du terrain
let groundColorFn = null; // fonction de couleur du sol courant
let groundSkirtFrom = -1; // mode lisse : premier indice des sommets de la jupe
const groundStyle = () => ({ mode: $('groundStyle').value, sand: num('sandPct') / 100, seed: seed + 20, smooth: $('smoothGround').checked, poly: $('groundPoly').value });
function noise2(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hashPos(xi, 0, zi, s), b = hashPos(xi + 1, 0, zi, s);
  const c = hashPos(xi, 0, zi + 1, s), d = hashPos(xi + 1, 0, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z, s) => 0.8 * noise2(x, z, s) + 0.2 * noise2(x * 2.3, z * 2.3, s + 1);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// grille de sculpture : décalage de hauteur peint au pinceau, ajouté au relief procédural
// (elle survit à la régénération de l'arbre / de la forêt)
const SKIRT_Y = -2.6; // bas de la jupe du terrain
const SG = 32, SN = 192; // couvre [-SG, SG] en SN x SN cellules
const sculpt = new Float32Array(SN * SN);
const SCELL = (2 * SG) / (SN - 1);
function sculptAt(x, z) {
  const u = (x + SG) / SCELL, v = (z + SG) / SCELL;
  if (u < 0 || v < 0 || u >= SN - 1 || v >= SN - 1) return 0;
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const a = sculpt[j * SN + i], b = sculpt[j * SN + i + 1], c = sculpt[(j + 1) * SN + i], d = sculpt[(j + 1) * SN + i + 1];
  return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
}
// amount > 0 monte, < 0 descend ; mode 'smooth' tire vers la moyenne du voisinage
function applySculpt(x, z, r, amount, mode) {
  const i0 = Math.max(1, Math.floor((x - r + SG) / SCELL)), i1 = Math.min(SN - 2, Math.ceil((x + r + SG) / SCELL));
  const j0 = Math.max(1, Math.floor((z - r + SG) / SCELL)), j1 = Math.min(SN - 2, Math.ceil((z + r + SG) / SCELL));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = i * SCELL - SG - x, dz = j * SCELL - SG - z, d2 = (dx * dx + dz * dz) / (r * r);
      if (d2 >= 1) continue;
      const f = (1 - d2) * (1 - d2), k = j * SN + i;
      if (mode === 'smooth') {
        const avg = (sculpt[k - 1] + sculpt[k + 1] + sculpt[k - SN] + sculpt[k + SN]) / 4;
        sculpt[k] += (avg - sculpt[k]) * Math.min(1, f * Math.abs(amount) * 8);
      } else sculpt[k] = clamp(sculpt[k] + amount * f, -2.2, 4);
    }
  }
}

// fonction de hauteur y = h(x, z) ; flatCenter garde une zone plane au pied d'un arbre seul
function makeHeightFn(relief, size, seedv, flatCenter, gr) {
  const f = 1 / (size * 3);
  return (x, z) => {
    const r = Math.hypot(x, z);
    let m = 1 - smooth(gr * 0.65, gr, r); // le bord du terrain retombe doucement à plat
    if (flatCenter) m *= smooth(0.25, 1.3, r);
    return relief * 1.7 * (fbm(x * f, z * f, seedv) - 0.5) * 2 * m + sculptAt(x, z);
  };
}

// disque de terrain : grille polaire irrégulière, faces plates ; couleur selon altitude et pente
function groundGeo(gr, alba, rng, hf, style) {
  // mode lisse : grille plus fine et régulière, normales et couleurs interpolées (aucune facette visible)
  const sm = !!style.smooth;
  // forme des polygones : triangles irréguliers (défaut) ou réguliers, carrés, gros, petits
  const poly = style.poly || 'tri';
  const fine = poly === 'fine';
  const cell = sm ? 0.28 : poly === 'big' ? 0.9 : fine ? 0.28 : 0.45;
  const jit = sm ? 0 : poly === 'tri' || poly === 'big' ? 0.35 : 0;
  const rings = clamp(Math.round(gr / cell), 6, sm || fine ? 64 : 48);
  const seg = clamp(Math.round((Math.PI * 2 * gr) / cell), 20, sm || fine ? 144 : 96);
  const pos = [0, hf ? hf(0, 0) : 0, 0];
  const idx = [];
  for (let i = 1; i <= rings; i++) {
    const rr = (i / rings) * gr;
    for (let j = 0; j < seg; j++) {
      const inner = i < rings;
      const a = ((j + (inner ? (hashPos(i, j, 0, 5) - 0.5) * jit : 0)) / seg) * Math.PI * 2;
      const r = rr + (inner ? (hashPos(i, j, 0, 6) - 0.5) * (gr / rings) * jit : 0);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      pos.push(x, (hf ? hf(x, z) : 0) + 0.015, z);
    }
  }
  const v = (i, j) => 1 + (i - 1) * seg + (j % seg);
  for (let j = 0; j < seg; j++) idx.push(0, v(1, j + 1), v(1, j));
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      idx.push(v(i, j), v(i, j + 1), v(i + 1, j), v(i, j + 1), v(i + 1, j + 1), v(i + 1, j));
    }
  }
  // jupe : un mur de terre sous le bord du terrain (épaisseur, et cache le plan d'eau vu de côté)
  // (le haut de la jupe a ses propres sommets : en mode lisse, sa couleur / ses normales sont indépendantes du terrain)
  const skirtTop = pos.length / 3;
  for (let j = 0; j < seg; j++) { const k = v(rings, j) * 3; pos.push(pos[k], pos[k + 1], pos[k + 2]); }
  const skirtStart = pos.length / 3;
  for (let j = 0; j < seg; j++) pos.push(pos[v(rings, j) * 3], SKIRT_Y, pos[v(rings, j) * 3 + 2]);
  for (let j = 0; j < seg; j++) {
    const a = skirtTop + j, b = skirtTop + ((j + 1) % seg), c = skirtStart + j, d = skirtStart + ((j + 1) % seg);
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);

  const dirt = new THREE.Color(alba ? '#d2b48a' : '#9a7c55');
  const grass = new THREE.Color(alba ? '#9fd07a' : '#6f9a52');
  const sand = new THREE.Color(alba ? '#ecd9a6' : '#c2ae80');
  const rock = new THREE.Color(alba ? '#a39580' : '#7d7160');
  const c = new THREE.Color();
  // grandes zones : bruit basse fréquence, seuil net pour des plaques bien séparées
  const zf = 1 / clamp(gr * 0.5, 2.2, 6);
  const thr = 0.8 - style.sand * 0.6;
  const bed = new THREE.Color(alba ? '#cdbd8c' : '#9c8e68'); // fond de lac : sable mouillé
  const earth = new THREE.Color(alba ? '#c19a6b' : '#8a6540');
  // saison : herbe / sable / terre prennent la couleur de la saison (neige en hiver)
  const SG = weather.seasonGround();
  if (SG) {
    if (SG.grass) grass.set(SG.grass);
    if (SG.sand) sand.set(SG.sand);
    if (SG.earth) earth.set(SG.earth);
  }
  // matière au point (x, y, z) : part de sable et part de terre (le reste est de l'herbe)
  let mSand = 0, mDirt = 0;
  const material = (x, y, z) => {
    mSand = style.mode === 'grass' || style.mode === 'dirt' ? 0
      : style.mode === 'sand' ? 1
      : smooth(thr - 0.04, thr + 0.04, fbm(x * zf, z * zf, style.seed));
    mDirt = style.mode === 'dirt' ? 1 : 0;
    for (const s of paintStamps) {
      if ((x - s.x) ** 2 + (z - s.z) ** 2 < s.r * s.r) { mSand = s.mat === 'sand' ? 1 : 0; mDirt = s.mat === 'dirt' ? 1 : 0; } // la peinture prime
    }
    if ($('water').checked) mSand = Math.max(mSand, smooth(waterLevel() + 0.18, waterLevel() + 0.03, y) * (1 - mDirt)); // plage autour de l'eau
  };
  groundColorFn = (x, y, z, forceSkirt = false) => {
    let slope = 0;
    if (hf) {
      const e = 0.2;
      slope = Math.hypot((hf(x + e, z) - hf(x - e, z)) / (2 * e), (hf(x, z + e) - hf(x, z - e)) / (2 * e));
    }
    if (forceSkirt || (Math.hypot(x, z) > gr * 0.98 && y < -0.55)) {
      c.copy(dirt).multiplyScalar(0.95 + 0.05 * hashPos(x, y, z, 11)); // jupe
    } else {
      material(x, y, z);
      c.copy(grass).lerp(sand, mSand).lerp(earth, mDirt).lerp(rock, smooth(0.55, 1.1, slope));
      if ($('water').checked) c.lerp(bed, smooth(waterLevel() + 0.02, waterLevel() - 0.12, y));
    }
    c.getHSL(_hsl, THREE.SRGBColorSpace);
    // sol uniforme : quasi pas de variation par face, pas de paliers de luminosité
    // (la différence de teinte vient uniquement de l'éclairage et de la peinture)
    let s = _hsl.s, l = clamp(_hsl.l + (hashPos(x, y, z, 3) - 0.5) * 0.012, 0, 1);
    if (alba) { s = Math.min(1, s * 0.95 + 0.06); l = l * 0.85 + 0.15; }
    return new THREE.Color().setHSL(_hsl.h, s, l, THREE.SRGBColorSpace);
  };
  if (!sm) {
    groundSkirtFrom = -1;
    const fg = finish(g, groundColorFn);
    if (poly === 'quad') { // carrés : les deux triangles d'une maille partagent normale et couleur
      fg.userData.quad = { fan: seg, quads: (rings - 1) * seg };
      quadPass(fg, true, true);
    }
    return fg;
  }
  // lisse : géométrie indexée, normales moyennées, une couleur par sommet
  groundSkirtFrom = skirtTop;
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 3), 3));
  g.userData.smooth = true;
  paintVertexColors(g);
  return g;
}

// mode « carrés » : chaque maille = 2 triangles consécutifs (après l'éventail central) ; on leur donne la même normale
// (moyenne) et la même couleur (prise au centre de la maille) pour qu'elle se lise comme un seul polygone
function quadPass(g, doNormals, doColors) {
  const info = g.userData.quad;
  if (!info) return;
  const p = g.attributes.position, n = g.attributes.normal, col = g.attributes.color;
  for (let q = 0; q < info.quads; q++) {
    const v0 = (info.fan + q * 2) * 3; // premier sommet du premier triangle de la maille
    if (doNormals) {
      let nx = 0, ny = 0, nz = 0;
      for (let k = 0; k < 6; k++) { nx += n.getX(v0 + k); ny += n.getY(v0 + k); nz += n.getZ(v0 + k); }
      const l = Math.hypot(nx, ny, nz) || 1;
      for (let k = 0; k < 6; k++) n.setXYZ(v0 + k, nx / l, ny / l, nz / l);
    }
    if (doColors) {
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 6; k++) { cx += p.getX(v0 + k); cy += p.getY(v0 + k); cz += p.getZ(v0 + k); }
      const c = groundColorFn(cx / 6, cy / 6, cz / 6);
      for (let k = 0; k < 6; k++) col.setXYZ(v0 + k, c.r, c.g, c.b);
    }
  }
  if (doNormals) n.needsUpdate = true;
  if (doColors) col.needsUpdate = true;
}

// couleurs par sommet (mode lisse)
function paintVertexColors(g) {
  const p = g.attributes.position, col = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const c = groundColorFn(p.getX(i), p.getY(i), p.getZ(i), i >= groundSkirtFrom);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

// recalcule les couleurs du sol (après un coup de pinceau) sans reconstruire la géométrie
function recolorGround() {
  if (!groundMesh || !groundColorFn) return;
  const g = groundMesh.geometry, p = g.attributes.position, col = g.attributes.color;
  if (g.userData.smooth) { paintVertexColors(g); return; }
  const qi = g.userData.quad;
  for (let t = 0; t < p.count; t += 3) {
    if (qi && t >= qi.fan * 3 && t < (qi.fan + qi.quads * 2) * 3) continue; // les mailles carrées sont traitées à part
    const c = groundColorFn(
      (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3,
      (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3,
      (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3
    );
    for (let k = 0; k < 3; k++) col.setXYZ(t + k, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
  quadPass(g, false, true);
}

let viewScale = 1;  // éloigne le brouillard pour les grandes scènes
let lastMode = null; // 'tree' | 'forest' : recadre la caméra au changement

// ---------- Monde : un mesh par arbre (sélectionnables / déplaçables) + un mesh de sol ----------
const world = new THREE.Group();
scene.add(world);
const matTree = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: false, roughness: 1, metalness: 0 }); // les normales viennent de finish() : plates partout, adoucies sur le feuillage
const matGround = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: false, roughness: 1, metalness: 0 }); // terrain lisse
const matSel = matTree.clone();
const matFlat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 }); // géométries sans normales fiables (sol facetté, murs tracés)
matSel.emissive = new THREE.Color(0x2a5a90);
matSel.emissiveIntensity = 0.35;

// météo : vent (balancement des arbres / fleurs), pluie, saisons (voir weather.js)
const weather = createWeather({
  world,
  getGroundR: () => groundR,
  groundY: (x, z) => (currentHF ? currentHF(x, z) : 0),
  getProportion: () => proportion(),
  onSeasonChange: () => reskin(),
  onEnvChange: () => applyEnv(),
  // hauteur de la surface de l'eau au point (x, z), ou null s'il n'y a pas d'eau : les feuilles y flottent
  waterSurface: (x, z) => ($('water').checked && currentHF && currentHF(x, z) < waterLevel() ? waterLevel() : null),
  canopyPoint: () => canopyPoint(),   // d'où se détachent les feuilles / pétales de saison
  isEditing: () => edit !== null,      // en modification avancée : pas de vent, pas de météo
});
weather.patchMaterial(matTree);
weather.patchMaterial(matSel);
let groundMesh = null;
let trees = [];
let selected = null;
let currentHF = null; // hauteur du terrain en (x, z), pour poser un arbre déplacé
let groundR = 3;      // rayon du terrain : limite de déplacement

// anneau bleu au pied de l'arbre sélectionné (toujours visible, même derrière le relief)
const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x5aa9ff, depthTest: false, transparent: true, side: THREE.DoubleSide })
);
ring.renderOrder = 10;
ring.visible = false;
world.add(ring);

// poignée posée sur l'anneau : on la glisse sur le plan du sol pour faire pivoter l'arbre
const handle = new THREE.Mesh(
  new THREE.SphereGeometry(1, 14, 10),
  new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true })
);
handle.renderOrder = 11;
handle.visible = false;
world.add(handle);

// libère la géométrie du mesh et celle / les textures de ses enfants (queue de poisson, texte des panneaux)
function disposeMesh(m) {
  m.traverse((c) => {
    if (c === m) return;
    if (c.geometry) c.geometry.dispose();
    if (c.material && c.material !== matTree) { c.material.map?.dispose(); c.material.dispose(); }
  });
  m.geometry.dispose();
}

function clearWorld() {
  select(null);
  clearPaths();
  clearFlyers();
  clearDragons();
  clearInsects();
  trees.forEach((t) => { disposeMesh(t); world.remove(t); });
  trees = [];
  if (groundMesh) { groundMesh.geometry.dispose(); world.remove(groundMesh); groundMesh = null; }
}

function addTree(geo, x, y, z, scale, rotY, radius) {
  const m = new THREE.Mesh(geo, matTree);
  m.position.set(x, y, z);
  m.scale.setScalar(scale);
  m.rotation.y = rotY;
  m.castShadow = m.receiveShadow = $('shadows').checked;
  m.userData = { baseScale: scale, radius };
  world.add(m);
  trees.push(m);
  return m;
}

function setGround(geo) {
  // lisse ou « carrés » : on utilise les normales du maillage (matériau non plat) ; sinon ombrage plat par triangle
  groundMesh = new THREE.Mesh(geo, geo.userData.smooth || geo.userData.quad ? matGround : matFlat);
  groundMesh.receiveShadow = $('shadows').checked;
  world.add(groundMesh);
}

const faceCount = () =>
  [...trees, groundMesh].reduce((a, m) => a + (m ? (((m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3) | 0) : 0), 0);

function placeRing() {
  if (!selected) return;
  ring.position.copy(selected.position);
  ring.position.y += 0.04;
  const R = Math.max(0.4, selected.userData.radius * (selected.scale.x / selected.userData.baseScale)) * 1.1;
  ring.scale.setScalar(R);
  const a = selected.rotation.y; // la poignée indique l'orientation de l'arbre
  handle.position.set(selected.position.x + Math.sin(a) * R, selected.position.y + 0.04, selected.position.z + Math.cos(a) * R);
  handle.scale.setScalar(Math.max(0.07, R * 0.09));
  const rock = selected.userData.rock || selected.userData.tuft || selected.userData.fish?.d || selected.userData.sign || selected.userData.bench || selected.userData.stairs || selected.userData.bridge || selected.userData.heron?.d || selected.userData.frog?.d || selected.userData.wagtail?.d || selected.userData.lily || selected.userData.duck || selected.userData.flower; // garde le descripteur à jour
  if (rock) { rock.x = selected.position.x; rock.z = selected.position.z; rock.rot = selected.rotation.y; rock.scale = selected.scale.x; }
}

function select(m) {
  if (selected) selected.material = matTree;
  selected = m;
  ring.visible = handle.visible = !!m;
  $('selPanel').hidden = !m;
  $('selEdit').hidden = !(m && m.userData.spec && isBroad(m.userData.spec.q)); // modification avancée : feuillus seulement
  $('selPose').hidden = !(m && m.userData.rig); // modification avancée d'un animal articulé
  if (poseMode && m !== poseMode.m) exitPose();
  if (!m) return;
  deselectPathOnly(); // un seul élément sélectionné à la fois : objet OU chemin
  m.material = matSel;
  $('selScale').value = (m.scale.x / m.userData.baseScale).toFixed(2);
  $('selRot').value = Math.round((((m.rotation.y * 180) / Math.PI) % 360 + 360) % 360);
  syncUi(m);
  if (m.userData.spec) fillTreeUi(m.userData.spec.q);
  showValues();
  placeRing();
}

function deleteSelected() {
  if (!selected) return;
  const m = selected;
  select(null);
  if (m.userData.rock) rocksData = rocksData.filter((d) => d !== m.userData.rock);
  if (m.userData.tuft) tuftsData = tuftsData.filter((d) => d !== m.userData.tuft);
  if (m.userData.fish) fishData = fishData.filter((d) => d !== m.userData.fish.d);
  if (m.userData.sign) signsData = signsData.filter((d) => d !== m.userData.sign);
  if (m.userData.bench) benchesData = benchesData.filter((d) => d !== m.userData.bench);
  if (m.userData.stairs) stairsData = stairsData.filter((d) => d !== m.userData.stairs);
  if (m.userData.bridge) bridgesData = bridgesData.filter((d) => d !== m.userData.bridge);
  if (m.userData.heron) heronsData = heronsData.filter((d) => d !== m.userData.heron.d);
  if (m.userData.frog) frogsData = frogsData.filter((d) => d !== m.userData.frog.d);
  if (m.userData.wagtail) wagtailsData = wagtailsData.filter((d) => d !== m.userData.wagtail.d);
  if (m.userData.lily) liliesData = liliesData.filter((d) => d !== m.userData.lily);
  if (m.userData.flower) flowersData = flowersData.filter((d) => d !== m.userData.flower);
  if (m.userData.duck) ducksData = ducksData.filter((d) => d !== m.userData.duck);
  dropPeckersOf(m);
  world.remove(m);
  disposeMesh(m);
  trees = trees.filter((t) => t !== m);
  if (m.userData.spec) rebuildLeaves();
  setStatus(`${trees.length} arbre(s)`);
}

// abscisse de la copie : à côté de l'original, du côté qui reste sur le terrain
const dupX = (s) => {
  const dx = s.userData.radius * 1.2, x = s.position.x + dx;
  return Math.hypot(x, s.position.z) > groundR * 0.97 ? s.position.x - dx : x;
};
function duplicateSelected() {
  if (!selected) return;
  const s = selected;
  if (s.userData.rock) {
    const d = { ...s.userData.rock, x: dupX(s) };
    rocksData.push(d);
    select(addRock(d));
    return;
  }
  if (s.userData.tuft) {
    const d = { ...s.userData.tuft, x: dupX(s) };
    tuftsData.push(d);
    select(addTuft(d));
    return;
  }

  if (s.userData.flower) {
    const d = { ...s.userData.flower, seed: s.userData.flower.seed + 7, x: dupX(s) };
    flowersData.push(d);
    select(addFlower(d));
    return;
  }
  if (s.userData.lily) {
    const d = { ...s.userData.lily, x: dupX(s), phase: Math.random() * 6.28 };
    liliesData.push(d);
    select(addLily(d));
    return;
  }
  if (s.userData.duck) {
    const d = { ...s.userData.duck, x: dupX(s), phase: Math.random() * 6.28 };
    ducksData.push(d);
    select(addDuck(d));
    return;
  }
  if (s.userData.heron) {
    const d = { ...s.userData.heron.d, x: dupX(s), phase: Math.random() * 6.28 };
    if (d.pose) d.pose = JSON.parse(JSON.stringify(d.pose));
    heronsData.push(d);
    select(addHeron(d));
    return;
  }
  if (s.userData.frog) {
    const d = { ...s.userData.frog.d, x: dupX(s), phase: Math.random() * 6.28 };
    frogsData.push(d);
    select(addFrog(d));
    return;
  }
  if (s.userData.wagtail) {
    const d = { ...s.userData.wagtail.d, x: dupX(s), phase: Math.random() * 6.28 };
    wagtailsData.push(d);
    select(addWagtail(d));
    return;
  }
  if (s.userData.bridge) {
    const d = { ...s.userData.bridge, x: dupX(s) };
    bridgesData.push(d);
    select(addBridge(d));
    return;
  }
  if (s.userData.stairs) {
    const d = { ...s.userData.stairs, x: dupX(s) };
    stairsData.push(d);
    select(addStairs(d));
    return;
  }
  if (s.userData.bench) {
    const d = { ...s.userData.bench, x: dupX(s) };
    benchesData.push(d);
    select(addBench(d));
    return;
  }
  if (s.userData.sign) {
    const d = { ...s.userData.sign, x: dupX(s) };
    signsData.push(d);
    select(addSign(d));
    return;
  }
  if (s.userData.fish) {
    const d = { ...s.userData.fish.d, x: dupX(s), phase: Math.random() * 6.28 };
    if (!inWater(d.x, d.z)) { d.x = s.position.x; d.z = s.position.z; }
    fishData.push(d);
    select(addFish(d));
    return;
  }
  const m = addTree(s.geometry.clone(), dupX(s), s.position.y, s.position.z, s.scale.x, s.rotation.y, s.userData.radius);
  m.userData.baseScale = s.userData.baseScale;
  // la copie garde la recette de l'arbre, branches modifiées à la main comprises (squelette indépendant de l'original)
  if (s.userData.spec) Object.assign(m.userData, { spec: JSON.parse(JSON.stringify(s.userData.spec)), trunk: s.userData.trunk, spots: s.userData.spots });
  const p = m.position;
  p.y = currentHF ? currentHF(p.x, p.z) : 0;
  if (m.userData.spec) rebuildLeaves();
  select(m);
  setStatus(`${trees.length} arbre(s)`);
}

function frameCamera(dist) {
  const off = camera.position.clone().sub(controls.target);
  off.setLength(dist);
  camera.position.copy(controls.target).add(off);
}

// scène de départ : un terrain et un chêne
function initDefaultScene() {
  const spec = treeSpecOf(TREE_PRESETS.find((p) => p.id === 'oak'), 5), made = makeTree(spec.q, spec.seed, null), sc = 0.8;
  loadScene({
    format: SCENE_FORMAT, version: 1, seed: 1, mode: 'forest', ui: { ...uiState(), forest: true, ground: true },
    world: { groundR: 7, scale: 1, shadowRadius: 8, viewScale: 1 },
    camera: { position: [6, 4.5, 8], target: [0, 0.8, 0] },
    trees: [{ spec, x: 0, z: 0, scale: sc, rot: 0, radius: made.radial * sc }],
    paint: [], sculpt: { cells: '' },
  });
}
// régénère terrain et contenu à partir de la scène elle-même (diamètre, relief, style du sol…) ; d = nouveau diamètre
let reloadTimer;
const reloadSoon = (d) => { clearTimeout(reloadTimer); reloadTimer = setTimeout(() => reloadWorld(d), 200); };
function reloadWorld(d) {
  if (edit) return;
  const data = sceneData();
  const alba = $('alba').checked;
  data.trees.forEach((tr) => (tr.spec.q.alba = alba));
  data.mode = 'forest';
  if (d) {
    const gr = d / 2, ratio = gr / groundR;
    data.world.groundR = gr;
    data.world.shadowRadius = gr + 1;
    const keep = (o) => o.x === undefined || Math.hypot(o.x, o.z) <= gr - 0.3; // ce qui sort du terrain disparaît
    // pics : ceux dont l'arbre est coupé disparaissent, les autres gardent leur arbre (index recalculé)
    const keptTrunk = trunkTrees().filter((t) => keep({ x: t.position.x, z: t.position.z }));
    data.peckers = peckers.filter((b) => keptTrunk.includes(b.userData.pecker.tree)).map((b) => ({ ...b.userData.pecker.d, tree: keptTrunk.indexOf(b.userData.pecker.tree) }));
    for (const k of ['trees', 'rocks', 'tufts', 'fish', 'signs', 'benches', 'stairs', 'bridges', 'herons', 'frogs', 'wagtails', 'lilies', 'ducks', 'flowers']) data[k] = data[k].filter(keep);
    const tg = data.camera.target;
    data.camera.position = data.camera.position.map((v, i) => tg[i] + (v - tg[i]) * ratio);
  }
  loadScene(data);
}
function applyEnv() {
  const alba = $('alba').checked;
  const shadows = $('shadows').checked;
  // lumière rasante : plus le soleil est bas, plus tout vire au chaud (lever / coucher de soleil)
  const w = smooth(34, 8, num('sunEl')); // 0 en plein jour, 1 soleil à l'horizon
  const sky = new THREE.Color(alba ? 0xcfe8ef : 0x111418).lerp(new THREE.Color(alba ? 0xf5b48c : 0x2b1a22), w);
  scene.background = sky;
  scene.fog = null; // pas de brouillard
  dir.color.set(0xffffff).lerp(new THREE.Color(0xff9a4a), w);
  sunGizmo.material.color.copy(dir.color).lerp(new THREE.Color(0xffd966), 0.5);
  sunLine.material.color.copy(sunGizmo.material.color);
  hemi.color.set(0xffffff).lerp(new THREE.Color(0xffcfa6), w * 0.8);
  hemi.groundColor.set(0x667755).lerp(new THREE.Color(0x7a5a60), w);
  // avec ombres : moins de lumière ambiante, soleil plus fort, pour que les ombres se voient ;
  // au ras de l'horizon on creuse encore le contraste
  hemi.intensity = (shadows ? (alba ? 1.1 : 0.9) : alba ? 2.0 : 1.6) * (1 - 0.12 * w);
  dir.intensity = (shadows ? (alba ? 2.6 : 2.8) : alba ? 1.2 : 1.4) * (1 + 0.2 * w);
  // saison et pluie : teinte du ciel / de la lumière, temps plus sombre quand il pleut
  const env = weather.envTint({ sky: sky.clone(), dirColor: dir.color.clone(), hemiI: hemi.intensity, dirI: dir.intensity });
  scene.background = env.sky;
  dir.color.copy(env.dirColor);
  hemi.intensity = env.hemiI;
  dir.intensity = env.dirI;
  matTree.wireframe = matSel.wireframe = matGround.wireframe = matFlat.wireframe = $('wire').checked;
  if (dir.castShadow !== shadows) matTree.needsUpdate = matSel.needsUpdate = matGround.needsUpdate = true;
  trees.forEach((t) => (t.castShadow = t.receiveShadow = shadows));
  if (groundMesh) groundMesh.receiveShadow = shadows;
  updateWater();
  updateSun(shadows);
}

// changement de saison : couleurs du sol et des arbres régénérées SUR PLACE (rien n'est déplacé ni supprimé)
function reskin() {
  if (groundMesh) {
    const g = groundGeo(groundR, $('alba').checked, mulberry32(seed + 7), currentHF, groundStyle());
    groundMesh.geometry.dispose();
    groundMesh.geometry = g;
    groundMesh.material = g.userData.smooth || g.userData.quad ? matGround : matFlat;
  }
  retintTrees();
  applyEnv();
}
// régénère la géométrie de chaque arbre avec les couleurs de la saison : même graine, mêmes branches (modifiées à la main ou non)
function retintTrees() {
  for (const m of trees) {
    const spec = m.userData.spec;
    if (!spec) continue;
    const sk = isBroad(spec.q) && validSkel(spec.skeleton) ? spec.skeleton : null;
    const made = makeTree(spec.q, spec.seed, sk);
    const old = m.geometry;
    m.geometry = made.geo;
    old.dispose();
    m.userData.trunk = made.trunk;
    m.userData.spots = made.spots;
  }
}

// position du soleil + cadre de la carte d'ombre selon la taille de la scène
function updateSun(shadows) {
  const az = (num('sunAz') * Math.PI) / 180, el = (num('sunEl') * Math.PI) / 180;
  const R = shadowRadius, d = R * 3 + 6;
  dir.target.position.set(0, 0, 0);
  const ux = Math.cos(el) * Math.sin(az), uy = Math.sin(el), uz = Math.cos(el) * Math.cos(az);
  dir.position.set(ux * d, uy * d, uz * d);
  // la boule est plus proche que la vraie lumière (directionnelle) : seule la direction compte
  sunDist = R * 1.4 + 2.2;
  sunGizmo.position.set(ux * sunDist, uy * sunDist, uz * sunDist);
  sunGizmo.scale.setScalar(Math.max(0.18, sunDist * 0.035));
  sunLine.geometry.setFromPoints([new THREE.Vector3(), sunGizmo.position]);
  sunGizmo.visible = sunLine.visible = $('sunShow').checked;
  dir.castShadow = shadows;
  const cam = dir.shadow.camera;
  cam.left = -R * 1.25; cam.right = R * 1.25; cam.top = R * 1.25; cam.bottom = -R * 1.25;
  cam.near = 0.5; cam.far = d * 2 + R * 2;
  cam.updateProjectionMatrix();
  const size = R > 6 ? 4096 : 2048;
  if (dir.shadow.mapSize.x !== size) {
    dir.shadow.mapSize.set(size, size);
    dir.shadow.map?.dispose();
    dir.shadow.map = null;
  }
}

// ---------- Interface ----------
// les nombres affichés à côté des curseurs se mettent à jour pour TOUS les curseurs (avant : seulement ceux qui régénéraient la scène)
document.addEventListener('input', showValues, true);

TREE_IDS.forEach((id) => $(id).addEventListener('input', applyUiToSelected));
['alba', 'ground', 'groundStyle', 'sandPct', 'smoothGround', 'groundPoly', 'relief', 'hillSize'].forEach((id) => $(id).addEventListener('input', () => reloadSoon()));
$('sceneDiam').addEventListener('input', () => reloadSoon(num('sceneDiam')));
['wire', 'shadows', 'sunAz', 'sunEl', 'sunShow'].forEach((id) =>
  $(id).addEventListener('input', () => {
    if (id === 'sunAz' || id === 'sunEl') $('ambiance').value = 'custom';
    showValues();
    applyEnv();
  })
);
// ambiances : (direction, hauteur) du soleil ; la couleur suit automatiquement la hauteur
const AMBIANCES = {
  day: [130, 48],     // plein jour
  golden: [160, 17],  // heure dorée
  sunrise: [110, 6],  // lever de soleil
  sunset: [230, 4],   // coucher de soleil (soleil bas, face à la caméra)
};
$('ambiance').addEventListener('change', () => {
  const a = AMBIANCES[$('ambiance').value];
  if (!a) return;
  $('sunAz').value = a[0];
  $('sunEl').value = a[1];
  showValues();
  applyEnv();
});
$('newvar').addEventListener('click', () => {
  const m = selected;
  if (!m || !m.userData.spec) { setStatus('Clique un arbre dans la vue pour tirer une autre variation.'); return; }
  m.userData.spec.seed = 1 + Math.floor(Math.random() * 90000);
  delete m.userData.spec.skeleton;
  remakeTree(m);
});

// tire les réglages de l'arbre sélectionné au hasard (dans leurs bornes)
$('randomize').addEventListener('click', () => {
  if (!selected || !selected.userData.spec) { setStatus("Clique un arbre dans la vue pour tirer ses réglages au hasard."); return; }
  RANGES.forEach((id) => {
    if (id === 'density' || id === 'relief' || id === 'hillSize') return;
    const el = $(id), min = +el.min, max = +el.max, step = +el.step || 1;
    // bornes un peu resserrées pour garder des arbres crédibles
    const lo = min + (max - min) * 0.1, hi = max - (max - min) * 0.1;
    const v = lo + Math.random() * (hi - lo);
    el.value = (Math.round(v / step) * step).toFixed(3);
  });
  $('density').value = 40 + Math.floor(Math.random() * 60);
  const shapes = [...$('leafShape').options].map((o) => o.value);
  $('leafShape').value = shapes[Math.floor(Math.random() * shapes.length)];
  const autumn = ['#e0821f', '#d9651b', '#f2c038', '#c9561a', '#b8323a'];
  $('fc2').value = autumn[Math.floor(Math.random() * autumn.length)];
  if (Math.random() < 0.5) $('mix').value = 0;
  showValues();
  selected.userData.spec.seed = 1 + Math.floor(Math.random() * 90000);
  applyUiToSelected();
});

// ---------- Pinceau : sculpter le terrain, peindre sable / herbe, creuser l'eau ----------
const BRUSH_COLORS = { raise: 0xf5a25d, lower: 0xb07cf0, smooth: 0xcfd6df, water: 0x4aa8d8, level: 0xe8e8f0, meadow: 0x8fd36a, wall: 0xd8c9a8, quay: 0xc9bfa6, sand: 0xe9c46a, grass: 0x6fcf5a, dirt: 0xa5683c, path: 0xff9a3c };
const brushRing = new THREE.Mesh(
  new THREE.RingGeometry(0.94, 1, 56).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, side: THREE.DoubleSide })
);
brushRing.renderOrder = 12;
brushRing.visible = false;
world.add(brushRing);

// eau : un plan transparent au niveau choisi ; ce qui est creusé en dessous se remplit
const waterMesh = new THREE.Mesh(
  new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.9, roughness: 0.2, metalness: 0, flatShading: true, depthWrite: false })
);
waterMesh.visible = false;
world.add(waterMesh);
const waterLevel = () => num('waterLevel');
function updateWater() {
  trees.forEach((t) => { if (t.userData.lily || t.userData.duck) t.position.y = lilyY(); });
  const on = $('water').checked && !!groundMesh;
  waterMesh.visible = on;
  if (!on) return;
  waterMesh.position.y = waterLevel();
  waterMesh.scale.setScalar(groundR * 0.985); // reste à l'intérieur du bord du terrain
  waterMesh.material.color.set($('alba').checked ? '#8ad6ee' : '#3f9ccc');
  waterMesh.material.opacity = num('waterOpacity');
}

// creuse vers `target` (n'abaisse que les cellules plus hautes)
// niveler : tire le terrain vers une hauteur précise (plateau plat au centre du pinceau, bords adoucis)
function applyLevel(x, z, r, rate, H) {
  const i0 = Math.max(1, Math.floor((x - r + SG) / SCELL)), i1 = Math.min(SN - 2, Math.ceil((x + r + SG) / SCELL));
  const j0 = Math.max(1, Math.floor((z - r + SG) / SCELL)), j1 = Math.min(SN - 2, Math.ceil((z + r + SG) / SCELL));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const cx = i * SCELL - SG, cz = j * SCELL - SG, d2 = ((cx - x) ** 2 + (cz - z) ** 2) / (r * r);
      if (d2 >= 1) continue;
      const k = j * SN + i, base = (currentHF ? currentHF(cx, cz) : 0) - sculpt[k]; // relief naturel sans sculpture
      const f = clamp((1 - d2) * 2.5, 0, 1);
      sculpt[k] = clamp(sculpt[k] + (H - base - sculpt[k]) * Math.min(1, f * rate), -2.2, 4);
    }
  }
}
function applyDig(x, z, r, rate, target) {
  const i0 = Math.max(1, Math.floor((x - r + SG) / SCELL)), i1 = Math.min(SN - 2, Math.ceil((x + r + SG) / SCELL));
  const j0 = Math.max(1, Math.floor((z - r + SG) / SCELL)), j1 = Math.min(SN - 2, Math.ceil((z + r + SG) / SCELL));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const cx = i * SCELL - SG, cz = j * SCELL - SG, d2 = ((cx - x) ** 2 + (cz - z) ** 2) / (r * r);
      if (d2 >= 1) continue;
      const cur = currentHF ? currentHF(cx, cz) : 0;
      if (cur <= target) continue;
      const f = (1 - d2) * (1 - d2), k = j * SN + i;
      sculpt[k] = clamp(sculpt[k] + (target - cur) * Math.min(1, f * rate), -2.2, 4);
    }
  }
}

// remet à jour les sommets du sol près de (cx, cz) après sculpture, puis arbres / pierres / couleurs
function refreshGround(cx, cz, r) {
  if (!groundMesh || !currentHF) return;
  const g = groundMesh.geometry, p = g.attributes.position;
  const r2 = (r + 0.8) ** 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    if (p.getY(i) < SKIRT_Y + 0.2) continue; // bas de la jupe : reste fixe
    if ((x - cx) ** 2 + (z - cz) ** 2 <= r2) p.setY(i, currentHF(x, z) + 0.015);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  quadPass(g, true, false); // mode carrés : normales moyennées par maille
  g.computeBoundingSphere();
  g.computeBoundingBox();
  recolorGround();
  trees.forEach((t) => { if (!t.userData.fish && !t.userData.lily && !t.userData.duck) t.position.y = t.userData.bridge ? bridgeBaseY(t.userData.bridge, t.position.x, t.position.z) : currentHF(t.position.x, t.position.z) + (t.userData.stairs?.dy || 0); }); // arbres, pierres, herbe suivent
  placeRing();
}

// prairie : à chaque coup de pinceau, des touffes d'herbe haute / de fleurs sont semées dans le cercle (pas dans l'eau)
const onLand = (x, z) => !$('water').checked || !currentHF || currentHF(x, z) > waterLevel() + 0.05;
function meadowStroke() {
  const p = drag.point, r = num('brushSize'), l = drag.last;
  if (l && Math.hypot(p.x - l.x, p.z - l.z) < r * 0.3) return;
  drag.last = { x: p.x, z: p.z };
  if (tuftsData.length >= 4000) { setStatus('Prairie : 4000 touffes maximum (efface de l\'herbe pour continuer).'); return; }
  const n = clamp(Math.round(r * r * 6 * num('brushStr') + 3), 3, 28), lim = groundR * 0.97;
  const MEADOWS = {
    flowery: ['tall', 'tall', 'blades', 'short', 'flower', 'daisy', 'daisy', 'clover', 'poppy', 'lavender'], // prairie fleurie
    low: ['daisy', 'daisy', 'daisy', 'clover', 'clover', 'short', 'flower'],                                   // fleurs basses
    tall: ['tall', 'tall', 'tall', 'blades', 'poppy', 'lavender'],                                             // hautes herbes
    marsh: ['tall', 'reed', 'short', 'flower', 'iris', 'cattail'],                                              // marais
  };
  const WET = ['cattail', 'iris', 'reed', 'cattail', 'iris', 'tall'];                                          // plantes aquatiques (eau peu profonde)
  const land = MEADOWS[$('meadowStyle')?.value] || MEADOWS.flowery, pick = (a) => a[Math.floor(Math.random() * a.length)];
  const dom = pick(land); // une espèce domine dans chaque coup de pinceau : des plages de fleurs plutôt qu'un mélange uniforme
  const waterOn = $('water').checked && !!currentHF;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r, x = p.x + Math.cos(a) * rr, z = p.z + Math.sin(a) * rr;
    if (Math.hypot(x, z) > lim) continue;
    const hh = currentHF ? currentHF(x, z) : 0, shallow = waterOn && hh <= waterLevel() + 0.05 && hh > waterLevel() - 0.3;
    if (waterOn && hh <= waterLevel() - 0.3) continue; // eau profonde : rien
    if (shallow && Math.random() < 0.35) continue;      // plantes aquatiques plus clairsemées
    const d = newTuftDesc(x, z);
    d.kind = shallow ? pick(WET) : Math.random() < 0.5 ? dom : pick(land);
    d.flower = FLOWER_COLORS[Math.floor(Math.random() * FLOWER_COLORS.length)];
    d.size *= 0.9 + Math.random() * 0.5;
    tuftsData.push(d);
    addTuft(d);
  }
  setStatus(tuftsData.length + " touffe(s) d'herbe · " + faceCount() + ' faces');
}
function brushStroke() {
  const b = $('brush').value, p = drag.point;
  if (b === 'meadow') { meadowStroke(); return; }
  if (b !== 'sand' && b !== 'grass' && b !== 'dirt') return;
  const r = num('brushSize'), l = drag.last;
  if (l && Math.hypot(p.x - l.x, p.z - l.z) < r * 0.3) return;
  drag.last = { x: p.x, z: p.z };
  paintStamps.push({ x: p.x, z: p.z, r, mat: b });
  if (paintStamps.length > 5000) paintStamps.shift();
  recolorGround();
}

// appelé à chaque image : le terrain continue de monter / descendre tant qu'on maintient le clic
function brushTick(dt) {
  if (!drag || drag.mode !== 'paint') return;
  const b = $('brush').value;
  if (b === 'sand' || b === 'grass' || b === 'dirt' || b === 'meadow') return;
  const r = num('brushSize'), p = drag.point, str = num('brushStr');
  if (b === 'water') {
    $('water').checked = true;
    applyDig(p.x, p.z, r, str * 6 * dt, waterLevel() - 0.4);
    updateWater();
  } else if (b === 'level') {
    applyLevel(p.x, p.z, r, str * 10 * dt, num('levelH'));
  } else {
    const amount = str * 1.6 * dt;
    applySculpt(p.x, p.z, r, b === 'lower' ? -amount : amount, b);
  }
  refreshGround(p.x, p.z, r);
}

// ---------- Pierres ----------
let rocksData = []; // descripteurs : les pierres survivent à la régénération des arbres
let rockCounter = 1;

function newRockDesc(x, z) {
  const rng = mulberry32(1000 + rockCounter++ * 7919);
  const v = num('rockVar');
  return {
    seed: Math.floor(rng() * 1e6),
    size: num('rockSize') * (1 + (rng() - 0.5) * 2 * v * 0.7),
    flat: clamp(num('rockFlat') * (1 + (rng() - 0.5) * v * 0.5), 0.3, 1.4),
    rough: num('rockRough'),
    moss: num('rockMoss') / 100,
    color: $('rockColor').value,
    alba: $('alba').checked,
    x, z, rot: rng() * Math.PI * 2, scale: 1,
  };
}

function makeRock(d) {
  const rng = mulberry32(d.seed);
  const g = new THREE.IcosahedronGeometry(1, 1);
  jitter(g, 0.1 + d.rough * 0.5, rng() * 100);
  g.scale(0.8 + rng() * 0.5, d.flat, 0.8 + rng() * 0.5);
  const p = g.attributes.position, floor = -0.45 * d.flat;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < floor) p.setY(i, floor); // base plate posée au sol
  g.scale(d.size, d.size, d.size);
  g.translate(0, -floor * d.size - 0.02, 0);
  const base = new THREE.Color(d.color), moss = new THREE.Color(d.alba ? '#8fcf6a' : '#5f8f45');
  const top = d.size * d.flat * 0.9;
  const c = new THREE.Color();
  return finish(g, (x, y, z) => {
    const h = y / top;
    c.copy(base).lerp(moss, d.moss * smooth(0.3, 0.85, h + (hashPos(x, y, z, 7) - 0.5) * 0.5));
    c.getHSL(_hsl, THREE.SRGBColorSpace);
    let s = _hsl.s, l = clamp(_hsl.l + (hashPos(x, y, z, 5) - 0.5) * 0.14 + h * 0.05, 0, 1);
    if (d.alba) { s = Math.round(Math.min(1, s * 0.95 + 0.06) * 7) / 7; l = Math.round((l * 0.85 + 0.15) * 9) / 9; }
    return new THREE.Color().setHSL(_hsl.h, s, l, THREE.SRGBColorSpace);
  });
}

function addRock(d) {
  const y = currentHF ? currentHF(d.x, d.z) : 0;
  const m = addTree(makeRock(d), d.x, y, d.z, d.scale, d.rot, d.size * 1.3 * d.scale);
  m.userData.rock = d;
  return m;
}

function restoreRocks() {
  const lim = groundR * 0.97;
  rocksData.forEach((d) => {
    const l = Math.hypot(d.x, d.z);
    if (l > lim) { d.x *= lim / l; d.z *= lim / l; }
    d.alba = $('alba').checked;
    addRock(d);
  });
}

$('rockScatter').addEventListener('click', () => {
  const n = Math.round(num('rockCount')), lim = groundR * 0.92;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * lim;
    const d = newRockDesc(Math.cos(a) * r, Math.sin(a) * r);
    rocksData.push(d);
    addRock(d);
  }
  setStatus(`${rocksData.length} pierre(s) · ${faceCount()} faces`);
});
$('rockOne').addEventListener('click', () => {
  const d = newRockDesc((Math.random() - 0.5) * groundR * 0.5, (Math.random() - 0.5) * groundR * 0.5);
  rocksData.push(d);
  select(addRock(d));
});
$('rockClear').addEventListener('click', () => {
  rocksData = [];
  select(null);
  trees.filter((t) => t.userData.rock).forEach((t) => { world.remove(t); t.geometry.dispose(); });
  trees = trees.filter((t) => !t.userData.rock);
  setStatus('Pierres effacées');
});

// ---------- Touffes d'herbe (bouquets) ----------
let tuftsData = []; // comme les pierres : descripteurs qui survivent à la régénération
let tuftCounter = 1;

function newTuftDesc(x, z) {
  const rng = mulberry32(5000 + tuftCounter++ * 104729);
  const v = num('tuftVar');
  return {
    seed: Math.floor(rng() * 1e6),
    size: num('tuftSize') * (1 + (rng() - 0.5) * 2 * v * 0.6),
    blades: Math.max(3, Math.round(num('tuftBlades') * (1 + (rng() - 0.5) * v * 0.6))),
    bend: num('tuftBend'),
    color: $('tuftColor').value,
    kind: $('tuftKind').value === 'mix' ? TUFT_KINDS[Math.floor(rng() * TUFT_KINDS.length)] : $('tuftKind').value,
    flower: $('tuftKind').value === 'mix' ? FLOWER_COLORS[Math.floor(rng() * FLOWER_COLORS.length)] : $('flowerColor').value,
    alba: $('alba').checked,
    x, z, rot: rng() * Math.PI * 2, scale: 1,
  };
}

// types d'herbe : brins, herbe haute, gazon, fougère, roseaux, fleurs, buisson
const TUFT_KINDS = ['blades', 'tall', 'short', 'fern', 'reed', 'flower', 'bush', 'daisy', 'clover', 'poppy', 'lavender'];
const FLOWERY = new Set(['flower', 'daisy', 'clover', 'poppy', 'lavender', 'iris']); // touffes qui attirent abeilles et papillons
const FLOWER_COLORS = ['#f2b8d8', '#f6e27a', '#ffffff', '#b79cf0', '#f59a7a'];

function makeTuft(d) {
  const rng = mulberry32(d.seed);
  const parts = [];
  const S = d.size;
  const Z = new THREE.Vector3(0, 0, 1);
  const base = new THREE.Color(d.color), flower = new THREE.Color(d.flower || '#f2b8d8'), straw = new THREE.Color('#9a7a4a');
  // couleur par face : un peu plus claire vers le haut ; palette pastel en mode Alba
  const paint = (g, col, dl = 0, dh = 0, top = S) =>
    finish(g, (x, y) => {
      col.getHSL(_hsl, THREE.SRGBColorSpace);
      let s = _hsl.s, l = clamp(_hsl.l + dl + clamp(y / (top * 1.2), 0, 1) * 0.1, 0, 1);
      if (d.alba) { s = Math.round(Math.min(1, s * 0.95 + 0.06) * 7) / 7; l = Math.round((l * 0.85 + 0.15) * 9) / 9; }
      return new THREE.Color().setHSL((_hsl.h + dh + 1) % 1, s, l, THREE.SRGBColorSpace);
    });
  // brin : pointe à 3 faces, penchée vers l'extérieur
  const blade = (h, r, bend, spread) => {
    const g = new THREE.ConeGeometry(r, h, 3, 1);
    g.translate(0, h / 2, 0);
    g.rotateZ(-bend * (0.15 + rng() * 0.55));
    g.rotateY(rng() * Math.PI * 2);
    const sp = spread * Math.sqrt(rng()), a = rng() * Math.PI * 2;
    g.translate(Math.cos(a) * sp, -0.01, Math.sin(a) * sp);
    parts.push(paint(g, base, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.04));
  };
  const n = d.blades;

  switch (d.kind) {
    case 'tall': // herbe haute : brins longs et fins, très penchés
      for (let i = 0; i < Math.max(3, Math.round(n * 0.8)); i++) blade(S * (1.3 + rng() * 1.1), Math.max(0.01, S * 0.05 * (0.7 + rng() * 0.6)), d.bend * 1.3, S * 0.25);
      break;
    case 'short': // gazon : beaucoup de petits brins serrés
      for (let i = 0; i < Math.round(n * 2); i++) blade(S * (0.3 + rng() * 0.35), Math.max(0.008, S * 0.06 * (0.8 + rng() * 0.5)), d.bend * 0.8, S * 0.3);
      break;
    case 'fern': { // fougère : frondes plates en losange en éventail
      const m = Math.max(5, Math.round(n * 0.9));
      for (let i = 0; i < m; i++) {
        const L = S * (0.9 + rng() * 0.7);
        const g = new THREE.OctahedronGeometry(1, 0);
        g.scale(0.17, 0.03, 1);
        g.translate(0, 0, 1);
        g.scale(L, L, L);
        const a = (i / m) * Math.PI * 2 + rng() * 0.5, t = THREE.MathUtils.degToRad(40 + rng() * 35);
        const dv = new THREE.Vector3(Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a));
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Z, dv));
        parts.push(paint(g, base, -0.05 + (rng() - 0.5) * 0.06, 0));
      }
      break;
    }
    case 'reed': { // roseaux : tiges hautes presque droites avec un épi brun au sommet
      const m = Math.max(4, Math.round(n * 0.7));
      for (let i = 0; i < m; i++) {
        const h = S * (2 + rng() * 1.4), r = S * 0.03;
        const st = new THREE.CylinderGeometry(r * 0.7, r, h, 4, 1);
        st.translate(0, h / 2, 0);
        const cap = new THREE.ConeGeometry(S * 0.07, S * 0.45, 4, 1);
        cap.translate(0, h + S * 0.05, 0);
        const lean = (rng() - 0.5) * 0.25 * (0.4 + d.bend), ry = rng() * Math.PI * 2;
        const sp = S * 0.22 * Math.sqrt(rng()), a = rng() * Math.PI * 2;
        const place = (g) => { g.rotateZ(lean); g.rotateY(ry); g.translate(Math.cos(a) * sp, -0.01, Math.sin(a) * sp); return g; };
        parts.push(paint(place(st), base, (rng() - 0.5) * 0.06, 0, h));
        parts.push(paint(place(cap), straw, (rng() - 0.5) * 0.05, 0, h));
      }
      break;
    }
    case 'flower': { // fleurs : fines tiges, tête en cristal colorée, quelques feuilles
      const m = Math.max(2, Math.round(n / 3));
      for (let i = 0; i < m; i++) {
        const h = S * (1 + rng() * 0.9);
        const st = new THREE.CylinderGeometry(S * 0.018, S * 0.025, h, 3, 1);
        st.translate(0, h / 2, 0);
        const head = new THREE.IcosahedronGeometry(1, 0);
        const hr = S * (0.13 + rng() * 0.06);
        head.scale(hr, hr * 0.8, hr);
        head.translate(0, h, 0);
        const lean = (rng() - 0.5) * 0.3 * (0.4 + d.bend), ry = rng() * Math.PI * 2;
        const sp = S * 0.25 * Math.sqrt(rng()), a = rng() * Math.PI * 2;
        const place = (g) => { g.rotateZ(lean); g.rotateY(ry); g.translate(Math.cos(a) * sp, -0.01, Math.sin(a) * sp); return g; };
        parts.push(paint(place(st), base, -0.03, 0, h));
        parts.push(paint(place(head), flower, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.02, h));
      }
      for (let k = 0; k < 3; k++) blade(S * (0.5 + rng() * 0.4), S * 0.07, d.bend, S * 0.2);
      break;
    }
    case 'daisy': { // fleurs basses : pâquerettes, boutons d'or… disque de pétales sur une tige courte
      const pal = [['#ffffff', '#f2c21c'], ['#ffffff', '#f2c21c'], ['#f7e24a', '#d9951c'], ['#f6c6dc', '#f2c21c'], [d.flower || '#ffffff', '#f2c21c']];
      const m = Math.max(3, Math.round(n * 0.7));
      for (let i = 0; i < m; i++) {
        const h = S * (0.3 + rng() * 0.45), [pc, cc] = pal[Math.floor(rng() * pal.length)];
        const st = new THREE.CylinderGeometry(S * 0.012, S * 0.016, h, 3, 1);
        st.translate(0, h / 2, 0);
        const hr = S * (0.1 + rng() * 0.06);
        const petals = new THREE.CylinderGeometry(hr, hr * 0.85, hr * 0.22, 8, 1);
        petals.translate(0, h, 0);
        const core = new THREE.IcosahedronGeometry(hr * 0.42, 0);
        core.scale(1, 0.7, 1);
        core.translate(0, h + hr * 0.14, 0);
        const tilt = 0.25 + rng() * 0.2, lean = (rng() - 0.5) * 0.5, ry = rng() * Math.PI * 2;
        const sp = S * 0.3 * Math.sqrt(rng()), a = rng() * Math.PI * 2;
        const pl = (g) => { g.rotateX(tilt); g.rotateZ(lean); g.rotateY(ry); g.translate(Math.cos(a) * sp, -0.01, Math.sin(a) * sp); return g; };
        parts.push(paint(pl(st), base, -0.03, 0, h));
        parts.push(paint(pl(petals), new THREE.Color(pc), (rng() - 0.5) * 0.03, 0, h));
        parts.push(paint(pl(core), new THREE.Color(cc), 0, 0, h));
      }
      for (let k = 0; k < 5; k++) blade(S * (0.2 + rng() * 0.22), S * 0.08, d.bend * 1.4, S * 0.18);
      break;
    }
    case 'clover': { // trèfle : tapis de petites feuilles rondes, quelques boules roses ou blanches
      const m = Math.max(5, Math.round(n * 1.3));
      for (let i = 0; i < m; i++) {
        const lf = new THREE.IcosahedronGeometry(1, 0);
        const r = S * (0.07 + rng() * 0.05);
        lf.scale(r, r * 0.25, r);
        const sp = S * 0.4 * Math.sqrt(rng()), a = rng() * Math.PI * 2;
        lf.translate(Math.cos(a) * sp, S * (0.05 + rng() * 0.12), Math.sin(a) * sp);
        parts.push(paint(lf, base, (rng() - 0.5) * 0.1, 0.01));
      }
      const hc = [new THREE.Color('#f2a9c9'), new THREE.Color('#ffffff'), new THREE.Color('#e88fb6')];
      for (let i = 0; i < Math.max(2, Math.round(n / 4)); i++) {
        const h = S * (0.25 + rng() * 0.25);
        const st = new THREE.CylinderGeometry(S * 0.01, S * 0.014, h, 3, 1);
        st.translate(0, h / 2, 0);
        const hd = new THREE.IcosahedronGeometry(S * (0.07 + rng() * 0.03), 0);
        hd.translate(0, h, 0);
        const sp = S * 0.3 * Math.sqrt(rng()), a = rng() * Math.PI * 2;
        st.translate(Math.cos(a) * sp, 0, Math.sin(a) * sp);
        hd.translate(Math.cos(a) * sp, 0, Math.sin(a) * sp);
        parts.push(paint(st, base, -0.04, 0, h));
        parts.push(paint(hd, hc[Math.floor(rng() * hc.length)], 0, 0, h));
      }
      break;
    }
    case 'poppy': { // coquelicots : tige fine et haute, coupe rouge au cœur sombre
      const m = Math.max(2, Math.round(n / 3));
      for (let i = 0; i < m; i++) {
        const h = S * (1.1 + rng() * 0.8);
        const st = new THREE.CylinderGeometry(S * 0.012, S * 0.02, h, 3, 1);
        st.translate(0, h / 2, 0);
        const cup = new THREE.IcosahedronGeometry(1, 0);
        const hr = S * (0.12 + rng() * 0.05);
        cup.scale(hr, hr * 0.55, hr);
        cup.translate(0, h, 0);
        const core = new THREE.IcosahedronGeometry(hr * 0.3, 0);
        core.translate(0, h + hr * 0.2, 0);
        const lean = (rng() - 0.5) * 0.35, ry = rng() * Math.PI * 2;
        const sp = S * 0.3 * Math.sqrt(rng()), a = rng() * Math.PI * 2;
        const place = (g) => { g.rotateZ(lean); g.rotateY(ry); g.translate(Math.cos(a) * sp, -0.01, Math.sin(a) * sp); return g; };
        parts.push(paint(place(st), base, -0.03, 0, h));
        parts.push(paint(place(cup), new THREE.Color('#e03a2a'), (rng() - 0.5) * 0.06, 0, h));
        parts.push(paint(place(core), new THREE.Color('#2a2025'), 0, 0, h));
      }
      for (let k = 0; k < 4; k++) blade(S * (0.4 + rng() * 0.4), S * 0.05, d.bend, S * 0.2);
      break;
    }
    case 'lavender': { // lavande : tiges raides terminées par un épi violet
      const m = Math.max(3, Math.round(n * 0.7));
      for (let i = 0; i < m; i++) {
        const h = S * (0.9 + rng() * 0.7);
        const st = new THREE.CylinderGeometry(S * 0.01, S * 0.016, h, 3, 1);
        st.translate(0, h / 2, 0);
        const lean = (rng() - 0.5) * 0.3, ry = rng() * Math.PI * 2;
        const sp = S * 0.28 * Math.sqrt(rng()), a = rng() * Math.PI * 2;
        const place = (g) => { g.rotateZ(lean); g.rotateY(ry); g.translate(Math.cos(a) * sp, -0.01, Math.sin(a) * sp); return g; };
        parts.push(paint(place(st), base, -0.02, 0, h));
        const lc = new THREE.Color(['#8a63d2', '#7a55c4', '#9b78e0'][Math.floor(rng() * 3)]);
        for (let k = 0; k < 3; k++) {
          const sg = new THREE.IcosahedronGeometry(1, 0);
          const r = S * (0.055 - k * 0.008);
          sg.scale(r, r * 1.3, r);
          sg.translate(0, h + k * S * 0.09, 0);
          parts.push(paint(place(sg), lc, (rng() - 0.5) * 0.05 + k * 0.02, 0, h));
        }
      }
      for (let k = 0; k < 4; k++) blade(S * (0.35 + rng() * 0.3), S * 0.04, d.bend, S * 0.2);
      break;
    }
    case 'cattail': { // plante de marais : massettes (épi brun cylindrique) au milieu de longues feuilles
      const m = Math.max(3, Math.round(n * 0.5));
      for (let i = 0; i < m; i++) {
        const h = S * (2 + rng() * 1.3), r = S * 0.025;
        const st = new THREE.CylinderGeometry(r * 0.7, r, h, 4, 1);
        st.translate(0, h / 2, 0);
        const ear = new THREE.CylinderGeometry(S * 0.055, S * 0.05, S * 0.42, 6, 1);
        ear.translate(0, h - S * 0.1, 0);
        const tip = new THREE.ConeGeometry(S * 0.012, S * 0.22, 3, 1);
        tip.translate(0, h + S * 0.22, 0);
        const lean = (rng() - 0.5) * 0.2, ry = rng() * Math.PI * 2;
        const sp = S * 0.25 * Math.sqrt(rng()), a = rng() * Math.PI * 2;
        const place = (g) => { g.rotateZ(lean); g.rotateY(ry); g.translate(Math.cos(a) * sp, -0.01, Math.sin(a) * sp); return g; };
        parts.push(paint(place(st), base, -0.02, 0, h));
        parts.push(paint(place(ear), new THREE.Color('#6b4426'), (rng() - 0.5) * 0.04, 0, h));
        parts.push(paint(place(tip), straw, 0, 0, h));
      }
      for (let k = 0; k < Math.max(4, n); k++) blade(S * (1.4 + rng() * 1.2), S * 0.04, d.bend * 1.2, S * 0.3);
      break;
    }
    case 'iris': { // iris d'eau : feuilles en glaive dressées, fleurs jaunes à trois pétales
      const m = Math.max(4, Math.round(n * 0.8));
      for (let i = 0; i < m; i++) {
        const L = S * (1.1 + rng() * 0.8);
        const g = new THREE.OctahedronGeometry(1, 0);
        g.scale(0.07, 0.015, 1);
        g.translate(0, 0, 1);
        g.scale(L, L, L);
        const a = rng() * Math.PI * 2, t = THREE.MathUtils.degToRad(8 + rng() * 22);
        const dv = new THREE.Vector3(Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a));
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Z, dv));
        parts.push(paint(g, base, -0.04 + (rng() - 0.5) * 0.06, 0, L));
      }
      for (let i = 0; i < 2 + Math.floor(rng() * 2); i++) {
        const h = S * (1.3 + rng() * 0.7);
        const st = new THREE.CylinderGeometry(S * 0.014, S * 0.02, h, 3, 1);
        st.translate(0, h / 2, 0);
        const sp = S * 0.15 * Math.sqrt(rng()), a = rng() * Math.PI * 2, cx = Math.cos(a) * sp, cz = Math.sin(a) * sp;
        st.translate(cx, 0, cz);
        parts.push(paint(st, base, -0.03, 0, h));
        for (let k = 0; k < 3; k++) { // trois pétales évasés
          const pt = new THREE.OctahedronGeometry(1, 0);
          pt.scale(S * 0.06, S * 0.02, S * 0.13);
          pt.translate(0, 0, S * 0.11);
          pt.rotateX(-0.5);
          pt.rotateY((k / 3) * Math.PI * 2 + a);
          pt.translate(cx, h, cz);
          parts.push(paint(pt, new THREE.Color('#f2d13a'), (rng() - 0.5) * 0.05, 0, h));
        }
      }
      break;
    }
    case 'bush': { // buisson : 2 ou 3 touffes facettées
      const m = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < m; i++) {
        const g = new THREE.IcosahedronGeometry(1, 0);
        jitter(g, 0.3, rng() * 100);
        const rr = S * (0.45 + rng() * 0.35);
        g.scale(rr, rr * 0.8, rr);
        g.translate((rng() - 0.5) * S * 0.6, rr * 0.7, (rng() - 0.5) * S * 0.6);
        parts.push(paint(g, base, (rng() - 0.5) * 0.08, 0));
      }
      break;
    }
    default: // brins classiques
      for (let i = 0; i < n; i++) blade(S * (0.55 + rng() * 0.9), Math.max(0.012, S * 0.075 * (0.7 + rng() * 0.6)), d.bend, S * 0.28);
  }
  const geo = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());
  return geo;
}
function addTuft(d) {
  const y = currentHF ? currentHF(d.x, d.z) : 0;
  const m = addTree(makeTuft(d), d.x, y, d.z, d.scale, d.rot, d.size * 0.9 * d.scale);
  m.userData.tuft = d;
  return m;
}

function restoreTufts() {
  const lim = groundR * 0.97;
  tuftsData.forEach((d) => {
    const l = Math.hypot(d.x, d.z);
    if (l > lim) { d.x *= lim / l; d.z *= lim / l; }
    d.alba = $('alba').checked;
    addTuft(d);
  });
}

$('tuftScatter').addEventListener('click', () => {
  const n = Math.round(num('tuftCount')), lim = groundR * 0.92;
  let added = 0;
  for (let i = 0; i < n; i++) {
    let x = 0, z = 0;
    for (let k = 0; k < 8; k++) { // évite de semer dans l'eau
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * lim;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
      if (!$('water').checked || !currentHF || currentHF(x, z) > waterLevel() + 0.05) break;
    }
    const d = newTuftDesc(x, z);
    tuftsData.push(d);
    addTuft(d);
    added++;
  }
  setStatus(`${tuftsData.length} touffe(s) d'herbe · ${faceCount()} faces`);
});
$('tuftOne').addEventListener('click', () => {
  const d = newTuftDesc((Math.random() - 0.5) * groundR * 0.5, (Math.random() - 0.5) * groundR * 0.5);
  tuftsData.push(d);
  select(addTuft(d));
});
$('tuftClear').addEventListener('click', () => {
  tuftsData = [];
  select(null);
  trees.filter((t) => t.userData.tuft).forEach((t) => { world.remove(t); t.geometry.dispose(); });
  trees = trees.filter((t) => !t.userData.tuft);
  setStatus("Herbe effacée");
});

// ---------- Animaux : poissons ----------
let fishData = []; // descripteurs : les poissons survivent à la régénération et gardent leur position
let fishCounter = 1;
const FISH_KINDS = ['gold', 'blue', 'silver', 'clown', 'koi'];
const FISH_COLORS = { gold: '#f59a2a', blue: '#4a8fe0', silver: '#aab9c8', clown: '#f26a1b', koi: '#f4efe6' };

// un point est "dans l'eau" s'il est assez creusé sous le niveau de l'eau
const inWater = (x, z) =>
  $('water').checked && !!currentHF && Math.hypot(x, z) < groundR * 0.95 && currentHF(x, z) < waterLevel() - 0.2;

function findWaterSpot() {
  for (let k = 0; k < 120; k++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * groundR * 0.9;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (inWater(x, z)) return { x, z };
  }
  return null;
}

function newFishDesc(x, z) {
  const rng = mulberry32(9000 + fishCounter++ * 15731);
  return {
    seed: Math.floor(rng() * 1e6),
    kind: 'koi',
    size: num('fishSize') * (0.8 + rng() * 0.45),
    speed: num('fishSpeed') * (0.75 + rng() * 0.5),
    depth: rng() * 0.25,
    phase: rng() * 6.28,
    alba: $('alba').checked,
    x, z, rot: rng() * Math.PI * 2, scale: 1,
  };
}

// poisson low poly : corps effilé, nageoire dorsale, pectorales, yeux ; la queue est un objet à part (elle bat)
function makeFish(d) {
  d = { ...d, kind: 'koi' }; // une seule espèce : la carpe koï (ses couleurs varient avec la graine)
  const S = d.size;
  // trois robes de koï selon la graine : blanc à taches orange, orange à taches blanches, doré
  const ROBES = [{ base: '#f4efe6', patch: '#f26a1b' }, { base: '#f08a2c', patch: '#f4efe6' }, { base: '#e9c04a', patch: '#f26a1b' }];
  const robe = ROBES[d.seed % 3];
  const base = new THREE.Color(robe.base), patch = new THREE.Color(robe.patch);
  const dark = new THREE.Color('#1d2733'), white = new THREE.Color('#ffffff');
  const tone = (c, dl) => {
    c.getHSL(_hsl, THREE.SRGBColorSpace);
    let s = _hsl.s, l = clamp(_hsl.l + dl, 0, 1);
    if (d.alba) { s = Math.min(1, s * 0.95 + 0.06); l = l * 0.85 + 0.15; }
    return new THREE.Color().setHSL(_hsl.h, s, l, THREE.SRGBColorSpace);
  };
  const fin = base.clone().lerp(white, 0.2);

  const bodyGeo = new THREE.IcosahedronGeometry(1, 1);
  bodyGeo.scale(0.32 * S, 0.5 * S, S);
  const p = bodyGeo.attributes.position; // plus étroit vers la queue
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    if (z < 0) { const k = 1 - Math.min(1, -z / S) * 0.55; p.setX(i, p.getX(i) * k); p.setY(i, p.getY(i) * k); }
  }
  const bodyColor = (x, y, z) => {
    const belly = y < -0.15 * S ? 0.1 : 0;
    const n = noise2((x * 3) / S + 7, (z * 3) / S, d.seed % 97); // taches : bruit propre à chaque poisson
    return n > 0.8 ? tone(dark, 0.05) : n > 0.55 ? tone(patch, belly) : tone(base, belly - 0.02);
  };
  const parts = [finish(bodyGeo, bodyColor)];

  const dorsal = new THREE.ConeGeometry(0.1 * S, 0.4 * S, 3, 1);
  dorsal.translate(0, 0.2 * S, 0);
  dorsal.rotateX(-0.6);
  dorsal.translate(0, 0.42 * S, 0.05 * S);
  parts.push(finish(dorsal, () => tone(fin, 0)));

  for (const side of [-1, 1]) {
    const pec = new THREE.OctahedronGeometry(1, 0);
    pec.scale(0.3 * S, 0.03 * S, 0.15 * S);
    pec.rotateZ(side * -0.35);
    pec.translate(side * 0.3 * S, -0.12 * S, 0.3 * S);
    parts.push(finish(pec, () => tone(fin, 0.02)));
    const eye = new THREE.IcosahedronGeometry(1, 0);
    eye.scale(0.07 * S, 0.07 * S, 0.07 * S);
    eye.translate(side * 0.19 * S, 0.12 * S, 0.62 * S);
    parts.push(finish(eye, () => tone(dark, 0)));
  }
  const body = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());

  const tail = new THREE.OctahedronGeometry(1, 0);
  tail.scale(0.04 * S, 0.5 * S, 0.45 * S);
  tail.translate(0, 0, -0.4 * S); // pivot à la base de la queue
  return { body, tail: finish(tail, () => tone(fin, -0.02)) };
}

const fishY = (x, z, d) =>
  clamp(waterLevel() - 0.12 - d.depth, (currentHF ? currentHF(x, z) : 0) + d.size * 0.5, waterLevel() - d.size * 0.4);

function addFish(d) {
  const g = makeFish(d);
  const m = addTree(g.body, d.x, fishY(d.x, d.z, d), d.z, d.scale, d.rot, d.size * 1.1 * d.scale);
  const tail = new THREE.Mesh(g.tail, matTree);
  tail.position.set(0, 0, -0.85 * d.size);
  tail.castShadow = m.castShadow;
  m.add(tail);
  m.userData.fish = { d, tail, turn: 0 };
  return m;
}

function restoreFish() {
  fishData.forEach((d) => {
    if (!inWater(d.x, d.z)) { const s = findWaterSpot(); if (!s) return; d.x = s.x; d.z = s.z; }
    d.alba = $('alba').checked;
    addFish(d);
  });
}

// à chaque image : les poissons nagent au hasard dans l'eau, font demi-tour au bord, et leur queue bat
function fishTick(dt, t) {
  const water = $('water').checked;
  for (const m of trees) {
    const f = m.userData.fish;
    if (!f) continue;
    const d = f.d, p = m.position;
    m.visible = water && inWater(p.x, p.z);
    if (!m.visible || m === selected) continue;
    f.turn = clamp(f.turn + (Math.random() - 0.5) * dt * 3, -1.1, 1.1);
    let h = m.rotation.y + (f.turn + Math.sin(t * 1.3 + d.phase) * 0.35) * dt;
    const sp = d.speed * d.size * 3.2 * m.scale.x; // vitesse proportionnelle à la taille
    const look = d.size * 2.2 * m.scale.x;
    const nx = p.x + Math.sin(h) * sp * dt, nz = p.z + Math.cos(h) * sp * dt;
    if (inWater(nx + Math.sin(h) * look, nz + Math.cos(h) * look)) { p.x = nx; p.z = nz; }
    else { h += (Math.random() < 0.5 ? 1 : -1) * (1.4 + Math.random() * 1.5); f.turn = 0; } // trop près du bord : demi-tour
    m.rotation.y = h;
    p.y = fishY(p.x, p.z, d) + Math.sin(t * 2 + d.phase) * d.size * 0.12;
    f.tail.rotation.y = Math.sin(t * (7 + d.speed * 6) + d.phase) * 0.55; // coup de queue
    d.x = p.x; d.z = p.z; d.rot = h;
  }
}

// un clic = un poisson (la carpe koï) ; plusieurs clics = plusieurs poissons
$('fishAdd').addEventListener('click', () => {
  if (!$('water').checked) { setStatus("Active l'eau (outil Eau) et creuse un lac d'abord."); return; }
  const s = findWaterSpot();
  if (!s) { setStatus("Aucun lac assez profond : creuse avec l'outil Eau."); return; }
  const d = newFishDesc(s.x, s.z);
  fishData.push(d);
  select(addFish(d));
  setStatus(`${fishData.length} carpe(s) koï`);
});
const clearFish = () => {
  fishData = [];
  select(null);
  trees.filter((t) => t.userData.fish).forEach((t) => { world.remove(t); disposeMesh(t); });
  trees = trees.filter((t) => !t.userData.fish);
};

// ---------- Panneaux de direction ----------
let signsData = []; // descripteurs : survivent à la régénération et sont enregistrés dans le JSON
let signCounter = 1;

function newSignDesc(x, z) {
  const rng = mulberry32(13000 + signCounter++ * 7727);
  const n = Math.round(num('signBoards'));
  const labels = $('signText').value.split(',').map((s) => s.trim()).filter(Boolean);
  let angle = rng() * Math.PI * 2;
  const boards = [];
  for (let i = 0; i < n; i++) {
    boards.push({ text: labels.length ? labels[i % labels.length] : '', angle: +angle.toFixed(3), dir: i % 2 ? -1 : 1, len: +(0.9 + rng() * 0.35).toFixed(2) });
    angle += 0.7 + rng() * 0.9;
  }
  return { seed: Math.floor(rng() * 1e6), h: num('signHeight'), boards, wood: $('signWood').value, alba: $('alba').checked, x, z, rot: rng() * Math.PI * 2, scale: 1 };
}

// texte peint sur la planche (texture transparente, réduite pour tenir dans la flèche)
function signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  let px = 78;
  g.font = `bold ${px}px system-ui, sans-serif`;
  const wmax = c.width * 0.92, w = g.measureText(text).width;
  if (w > wmax) { px = Math.floor((px * wmax) / w); g.font = `bold ${px}px system-ui, sans-serif`; }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#3b2a1a';
  g.fillText(text, c.width / 2, c.height / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// poteau + planches en flèche ; le texte est posé dessus recto et verso (objets enfants)
function makeSign(d) {
  const rng = mulberry32(d.seed), H = d.h;
  const wood = new THREE.Color(d.wood);
  const tone = (dl) => {
    wood.getHSL(_hsl, THREE.SRGBColorSpace);
    let s = _hsl.s, l = clamp(_hsl.l + dl, 0, 1);
    if (d.alba) { s = Math.min(1, s * 0.95 + 0.06); l = l * 0.85 + 0.15; }
    return new THREE.Color().setHSL(_hsl.h, s, l, THREE.SRGBColorSpace);
  };
  const parts = [];
  const post = new THREE.CylinderGeometry(0.032 * H, 0.042 * H, H, 5, 1);
  post.translate(0, H / 2, 0);
  parts.push(finish(post, () => tone(-0.1 + (rng() - 0.5) * 0.03)));
  const cap = new THREE.ConeGeometry(0.05 * H, 0.07 * H, 5, 1);
  cap.translate(0, H + 0.03 * H, 0);
  parts.push(finish(cap, () => tone(-0.06)));

  const labels = [];
  const bh = 0.15 * H, t = 0.035 * H; // hauteur et épaisseur d'une planche
  d.boards.forEach((b, i) => {
    const L = 0.62 * H * b.len, s = b.dir;
    const y = H * 0.9 - i * bh * 1.25;
    const tip = bh * 0.55;
    // contour en flèche (pointe du côté `dir`) ; l'arrière de la planche passe derrière le poteau
    const pts = [[-L / 2, -bh / 2], [L / 2 - tip, -bh / 2], [L / 2, 0], [L / 2 - tip, bh / 2], [-L / 2, bh / 2]];
    const shape = new THREE.Shape(pts.map(([px, py]) => new THREE.Vector2(px * s, py)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
    g.translate(0, 0, -t / 2);
    const bx = s * (L / 2 - 0.09 * H);
    g.translate(bx, y, 0);
    g.rotateY(b.angle);
    const dl = (rng() - 0.5) * 0.05;
    parts.push(finish(g, () => tone(0.06 + dl + (rng() - 0.5) * 0.025)));

    if (b.text) {
      const tex = signTexture(b.text);
      const pw = (L - tip * 1.1) * 0.95, ph = bh * 0.74;
      const px0 = bx - s * tip * 0.25;
      const planes = [1, -1].map((side) => {
        const pg = new THREE.PlaneGeometry(pw, ph);
        if (side < 0) pg.rotateY(Math.PI);
        pg.translate(px0, y, side * (t / 2 + 0.003));
        pg.rotateY(b.angle);
        return pg;
      });
      labels.push({ tex, planes });
    }
  });
  const geo = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());
  return { geo, labels };
}

function addSign(d) {
  const g = makeSign(d);
  const y = currentHF ? currentHF(d.x, d.z) : 0;
  const m = addTree(g.geo, d.x, y, d.z, d.scale, d.rot, d.h * 0.6 * d.scale);
  g.labels.forEach((l) =>
    l.planes.forEach((pg) => {
      const pm = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: l.tex, transparent: true, alphaTest: 0.2 }));
      m.add(pm);
    })
  );
  m.userData.sign = d;
  return m;
}

function restoreSigns() {
  const lim = groundR * 0.97;
  signsData.forEach((d) => {
    const l = Math.hypot(d.x, d.z);
    if (l > lim) { d.x *= lim / l; d.z *= lim / l; }
    d.alba = $('alba').checked;
    addSign(d);
  });
}

$('signAdd').addEventListener('click', () => {
  const d = newSignDesc((Math.random() - 0.5) * groundR * 0.7, (Math.random() - 0.5) * groundR * 0.7);
  signsData.push(d);
  select(addSign(d));
});
$('signClear').addEventListener('click', () => {
  signsData = [];
  select(null);
  trees.filter((t) => t.userData.sign).forEach((t) => { disposeMesh(t); world.remove(t); });
  trees = trees.filter((t) => !t.userData.sign);
  setStatus('Panneaux effacés');
});

// ---------- Bancs ----------
let benchesData = []; // survivent à la régénération, enregistrés dans le JSON
let benchCounter = 1;

function newBenchDesc(x, z, kind) {
  const rng = mulberry32(21000 + benchCounter++ * 6007);
  return { kind: kind || 'bench', seed: Math.floor(rng() * 1e6), size: num('benchSize'), back: $('benchBack').checked, wood: $('benchWood').value, alba: $('alba').checked, x, z, rot: rng() * Math.PI * 2, scale: 1 };
}

// banc en planches : assise de 3 lattes, 2 pieds pleins, traverse, dossier incliné en option (face vers +z)
// table de pique-nique : plateau de 4 planches, deux bancs, pieds en A (face longue le long de X)
function makePicnicTable(d) {
  const rng = mulberry32(d.seed), L = d.size * 1.35;
  const base = new THREE.Color(d.wood);
  const tone = (dl) => {
    base.getHSL(_hsl, THREE.SRGBColorSpace);
    let s = _hsl.s, l = clamp(_hsl.l + dl, 0, 1);
    if (d.alba) { s = Math.min(1, s * 0.95 + 0.06); l = l * 0.85 + 0.15; }
    return new THREE.Color().setHSL(_hsl.h, s, l, THREE.SRGBColorSpace);
  };
  const parts = [];
  const add = (g, dl) => parts.push(finish(g, () => tone(dl + (rng() - 0.5) * 0.05)));
  const board = (w, h, p, x, y, z, dl) => { const g = new THREE.BoxGeometry(w, h, p); g.translate(x, y, z); add(g, dl); };
  const beam = (a, b, w, h, dl) => { // poutre entre deux points (axe long = Z de la boîte)
    const dir = b.clone().sub(a), len = dir.length();
    const g = new THREE.BoxGeometry(w, h, len);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    add(g, dl);
  };
  const topY = 0.4 * L, benchY = 0.21 * L, th = 0.03 * L;
  for (let i = 0; i < 4; i++) board(L, th, 0.115 * L, (rng() - 0.5) * 0.01 * L, topY, (i - 1.5) * 0.12 * L, 0.04); // plateau : 4 planches
  for (const sz of [-1, 1]) board(L, th, 0.14 * L, (rng() - 0.5) * 0.01 * L, benchY, sz * 0.38 * L, 0.0);          // bancs
  for (const sx of [-1, 1]) {
    const x = sx * 0.36 * L;
    board(0.04 * L, 0.035 * L, 0.78 * L, x, topY - 0.04 * L, 0, -0.1);                                             // traverse sous le plateau
    for (const sz of [-1, 1]) {
      beam(new THREE.Vector3(x, 0.01 * L, sz * 0.47 * L), new THREE.Vector3(x, topY - 0.03 * L, sz * 0.1 * L), 0.04 * L, 0.04 * L, -0.12); // jambes en A
      board(0.04 * L, 0.025 * L, 0.2 * L, x, benchY - 0.03 * L, sz * 0.38 * L, -0.1);                              // support de banc
    }
  }
  const geo = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());
  return geo;
}

function makeBench(d) {
  if (d.kind === 'table') return makePicnicTable(d);
  const rng = mulberry32(d.seed), L = d.size;
  const base = new THREE.Color(d.wood);
  const tone = (dl) => {
    base.getHSL(_hsl, THREE.SRGBColorSpace);
    let s = _hsl.s, l = clamp(_hsl.l + dl, 0, 1);
    if (d.alba) { s = Math.min(1, s * 0.95 + 0.06); l = l * 0.85 + 0.15; }
    return new THREE.Color().setHSL(_hsl.h, s, l, THREE.SRGBColorSpace);
  };
  const parts = [];
  // boîte w x h x p centrée en (x, y, z) relatif à `pivot`, inclinée de `tilt` autour de X
  const box = (w, h, p, x, y, z, dl, tilt = 0, pivot = [0, 0, 0]) => {
    const g = new THREE.BoxGeometry(w, h, p);
    g.translate(x, y, z);
    if (tilt) g.rotateX(tilt);
    g.translate(pivot[0], pivot[1], pivot[2]);
    parts.push(finish(g, () => tone(dl + (rng() - 0.5) * 0.03)));
  };
  const seatH = 0.26 * L, th = 0.035 * L;
  for (const z of [-0.115 * L, 0, 0.115 * L]) box(L, th, 0.1 * L, 0, seatH + th / 2, z, 0.04);          // assise
  for (const sx of [-1, 1]) box(0.05 * L, seatH, 0.32 * L, sx * 0.42 * L, seatH / 2, 0, -0.08);          // pieds
  box(0.84 * L, 0.03 * L, 0.03 * L, 0, 0.3 * seatH, 0.1 * L, -0.06);                                    // traverse
  if (d.back) {
    const pivot = [0, seatH + th, -0.15 * L];
    for (const sx of [-1, 1]) box(0.04 * L, 0.36 * L, 0.04 * L, sx * 0.42 * L, 0.18 * L, 0, -0.08, -0.2, pivot);
    for (const y of [0.13 * L, 0.26 * L]) box(L, 0.08 * L, 0.025 * L, 0, y, 0.01 * L, 0.04, -0.2, pivot); // lattes du dossier
  }
  const geo = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());
  return geo;
}

function addBench(d) {
  const y = currentHF ? currentHF(d.x, d.z) : 0;
  const m = addTree(makeBench(d), d.x, y, d.z, d.scale, d.rot, d.size * (d.kind === 'table' ? 0.9 : 0.6) * d.scale);
  m.userData.bench = d;
  return m;
}

function restoreBenches() {
  const lim = groundR * 0.97;
  benchesData.forEach((d) => {
    const l = Math.hypot(d.x, d.z);
    if (l > lim) { d.x *= lim / l; d.z *= lim / l; }
    d.alba = $('alba').checked;
    addBench(d);
  });
}

$('tableAdd').addEventListener('click', () => {
  const d = newBenchDesc((Math.random() - 0.5) * groundR * 0.7, (Math.random() - 0.5) * groundR * 0.7, 'table');
  benchesData.push(d);
  select(addBench(d));
});
$('benchAdd').addEventListener('click', () => {
  const d = newBenchDesc((Math.random() - 0.5) * groundR * 0.7, (Math.random() - 0.5) * groundR * 0.7);
  benchesData.push(d);
  select(addBench(d));
});
// ---------- Ponts (passerelle en bois, pont de pierre en dos d'âne, pont de corde) ----------
let bridgesData = [];
let bridgeCounter = 1;
function newBridgeDesc(x, z) {
  const rng = mulberry32(37000 + bridgeCounter++ * 8191);
  return { seed: Math.floor(rng() * 1e6), type: $('bridgeType').value, len: num('bridgeLen'), w: num('bridgeW'), h: num('bridgeH'), rail: $('bridgeRail').checked, color: $('bridgeColor').value, dy: num('bridgeY'), alba: $('alba').checked, x, z, rot: rng() * Math.PI * 2, scale: 1 };
}
// hauteur du dessus du tablier à l'origine du pont : le plus haut des deux bouts (+ réglage) ; le pont enjambe donc l'eau ou le creux
function bridgeBaseY(d, x, z) {
  const hf = currentHF || (() => 0), e = (d.len / 2) * d.scale, sx = Math.sin(d.rot) * e, cz = Math.cos(d.rot) * e;
  return Math.max(hf(x + sx, z + cz), hf(x - sx, z - cz)) + 0.04 + (d.dy || 0);
}
function makeBridge(d, x = 0, z = 0, y = 0) {
  const hf = currentHF, sc = d.scale || 1, sn = Math.sin(d.rot || 0), cs = Math.cos(d.rot || 0);
  const gy = hf ? (lz) => (hf(x + sn * lz * sc, z + cs * lz * sc) - y) / sc : null;
  return walls.buildBridge(d, gy);
}
function addBridge(d) {
  const y = bridgeBaseY(d, d.x, d.z);
  const g = makeBridge(d, d.x, d.z, y);
  const m = addTree(g, d.x, y, d.z, d.scale, d.rot, Math.max(d.len, d.w) * 0.5 * d.scale);
  m.userData.bridge = d;
  return m;
}
function restoreBridges() {
  const lim = groundR * 0.97;
  bridgesData.forEach((d) => {
    const l = Math.hypot(d.x, d.z);
    if (l > lim) { d.x *= lim / l; d.z *= lim / l; }
    d.alba = $('alba').checked;
    addBridge(d);
  });
}
$('bridgeAdd').addEventListener('click', () => {
  const d = newBridgeDesc((Math.random() - 0.5) * groundR * 0.5, (Math.random() - 0.5) * groundR * 0.5);
  bridgesData.push(d);
  select(addBridge(d));
});
$('bridgeClear').addEventListener('click', () => {
  bridgesData = [];
  select(null);
  trees.filter((m) => m.userData.bridge).forEach((m) => { disposeMesh(m); world.remove(m); });
  trees = trees.filter((m) => !m.userData.bridge);
});
// hauteur de marche sur un pont (null si le point n'est pas sur un tablier) : sert au personnage jouable
function bridgeSurfaceY(x, z) {
  let best = null;
  for (const m of trees) {
    const d = m.userData.bridge;
    if (!d) continue;
    const sc = m.scale.x, r = m.rotation.y, dx = x - m.position.x, dz = z - m.position.z;
    const lz = (dx * Math.sin(r) + dz * Math.cos(r)) / sc, lx = (dx * Math.cos(r) - dz * Math.sin(r)) / sc;
    if (Math.abs(lx) <= d.w / 2 && Math.abs(lz) <= d.len / 2) {
      const y = m.position.y + walls_bridgeDeckY(d, lz) * sc;
      if (best === null || y > best) best = y;
    }
  }
  return best;
}

// ---------- Escaliers (pierre, bois avec rampe, marches rondes, colimaçon) ----------
let stairsData = [];
let stairsCounter = 1;
function newStairsDesc(x, z) {
  const rng = mulberry32(31000 + stairsCounter++ * 7907);
  return { seed: Math.floor(rng() * 1e6), type: $('stairsType').value, steps: Math.round(num('stairsSteps')), w: num('stairsW'), sh: num('stairsH'), rail: $('stairsRail').checked, color: $('stairsColor').value, alba: $('alba').checked, dy: num('stairsY'), x, z, rot: rng() * Math.PI * 2, scale: 1 };
}
function makeStairs(d) {
  const g = walls.buildStairs(d);
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  g.translate(-c.x, 0, -c.z); // centré sur son point de pose
  return g;
}
function addStairs(d) {
  const y = (currentHF ? currentHF(d.x, d.z) : 0) + (d.dy || 0);
  const g = makeStairs(d), bb = g.boundingBox;
  const m = addTree(g, d.x, y, d.z, d.scale, d.rot, Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.55 * d.scale);
  m.userData.stairs = d;
  return m;
}
function restoreStairs() {
  const lim = groundR * 0.97;
  stairsData.forEach((d) => {
    const l = Math.hypot(d.x, d.z);
    if (l > lim) { d.x *= lim / l; d.z *= lim / l; }
    d.alba = $('alba').checked;
    addStairs(d);
  });
}
$('stairsAdd').addEventListener('click', () => {
  const d = newStairsDesc((Math.random() - 0.5) * groundR * 0.6, (Math.random() - 0.5) * groundR * 0.6);
  stairsData.push(d);
  select(addStairs(d));
});
$('stairsClear').addEventListener('click', () => {
  stairsData = [];
  select(null);
  trees.filter((m) => m.userData.stairs).forEach((m) => { disposeMesh(m); world.remove(m); });
  trees = trees.filter((m) => !m.userData.stairs);
});
$('benchClear').addEventListener('click', () => {
  benchesData = [];
  select(null);
  trees.filter((t) => t.userData.bench).forEach((t) => { disposeMesh(t); world.remove(t); });
  trees = trees.filter((t) => !t.userData.bench);
  setStatus('Bancs effacés');
});

// ---------- Oiseaux : héron et pic ----------
let heronsData = [];  // hérons : objets du monde (sélectionnables / déplaçables), enregistrés dans le JSON
let peckersData = []; // pics : attachés à un arbre, enregistrés avec l'index de l'arbre
let peckers = [];     // meshes des pics (enfants de leur arbre)
let birdCounter = 1;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// tronçon de cylindre entre deux points
function limb(a, b, r0, r1, sides = 5) {
  const dir = b.clone().sub(a), len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
// couleur d'oiseau : pastel en mode Alba
function birdTone(hex, dl, alba) {
  const c = new THREE.Color(hex);
  c.getHSL(_hsl, THREE.SRGBColorSpace);
  let s = _hsl.s, l = clamp(_hsl.l + dl, 0, 1);
  if (alba) { s = Math.min(1, s * 0.95 + 0.06); l = l * 0.85 + 0.15; }
  return new THREE.Color().setHSL(_hsl.h, s, l, THREE.SRGBColorSpace);
}

// Articulations des échassiers (héron, flamant, ibis) : chaque morceau de géométrie est rangé dans le groupe de son articulation
// (RS.set(nom)) ; build() fabrique ensuite un morceau par articulation, centré sur son pivot.
const RIG_ORDER = ['body', 'hipL', 'hipR', 'kneeL', 'kneeR', 'wingL', 'wingR', 'neck1', 'neck2', 'neck3', 'head'];
const RIG_PARENT = { body: null, hipL: 'body', hipR: 'body', kneeL: 'hipL', kneeR: 'hipR', wingL: 'body', wingR: 'body', neck1: 'body', neck2: 'neck1', neck3: 'neck2', head: 'neck3' };
const JOINT_NAMES = { neck1: 'Base du cou', neck2: 'Milieu du cou', neck3: 'Haut du cou', head: 'Tête', wingL: 'Aile gauche', wingR: 'Aile droite', hipL: 'Hanche gauche', hipR: 'Hanche droite', kneeL: 'Genou gauche', kneeR: 'Genou droit' };
function rigSink() {
  const abs = new Map(), loc = new Map(); // abs : repère du corps ; loc : repère du cou (décalé du point d'attache à la construction)
  let cur = 'body';
  const mk = (map) => {
    const arr = [];
    arr.push = function (g) { Array.prototype.push.call(this, g); (map.get(cur) || map.set(cur, []).get(cur)).push(g); return this.length; };
    return arr;
  };
  const parts = mk(abs), np = mk(loc);
  return {
    parts, np, set(n) { cur = n; },
    build(P0, J) {
      const piv = {
        body: V3(0, 0, 0), hipL: J.hipL, hipR: J.hipR, kneeL: J.kneeL, kneeR: J.kneeR, wingL: J.wingL, wingR: J.wingR,
        neck1: P0.clone(), neck2: P0.clone().add(J.neck[1]), neck3: P0.clone().add(J.neck[2]), head: P0.clone().add(J.head),
      };
      const joints = RIG_ORDER.map((name) => {
        const gs = [...(abs.get(name) || []).map((g) => g.clone()), ...(loc.get(name) || []).map((g) => g.clone().translate(P0.x, P0.y, P0.z))];
        let geo = null;
        if (gs.length) { geo = gs.length > 1 ? mergeGeometries(gs) : gs[0]; geo.translate(-piv[name].x, -piv[name].y, -piv[name].z); }
        return { name, parent: RIG_PARENT[name], pivot: piv[name], geo };
      });
      return { joints };
    },
  };
}
// monte les articulations sous le maillage du corps ; la pose enregistrée (quaternions) est réappliquée
function attachRig(m, rig, d) {
  const J = {};
  let neckAnim = null;
  for (const j of rig.joints) {
    if (!j.parent) { J[j.name] = { obj: m, host: m, pivot: j.pivot }; continue; }
    const par = J[j.parent], obj = new THREE.Group();
    obj.position.copy(j.pivot).sub(par.pivot);
    obj.userData.joint = j.name;
    par.host.add(obj);
    let host = obj;
    if (j.name === 'neck1') { // l'animation (balancement, coup de bec) tourne ce maillon ; la pose passe par le groupe parent
      neckAnim = new THREE.Mesh(j.geo, matTree);
      neckAnim.rotation.order = 'YXZ';
      neckAnim.castShadow = m.castShadow;
      obj.add(neckAnim);
      host = neckAnim;
    } else if (j.geo) {
      const mesh = new THREE.Mesh(j.geo, matTree);
      mesh.castShadow = m.castShadow;
      obj.add(mesh);
    }
    J[j.name] = { obj, host, pivot: j.pivot };
  }
  for (const [k, q] of Object.entries(d.pose || {})) if (J[k] && k !== 'body') J[k].obj.quaternion.fromArray(q);
  m.userData.rig = J;
  return neckAnim;
}

// ----- héron : corps + pattes ; le cou (avec la tête et le bec) est un objet à part qui pivote -----
function makeHeron(d) {
  if (d.kind === 'flamingo') return makeFlamingo(d);
  if (d.kind === 'ibis') return makeIbis(d);
  if (d.kind === 'egret') return makeEgret(d);
  const u = d.size, A = d.alba;
  const tone = (hex, dl = 0) => birdTone(hex, dl, A);
  const RS = rigSink(), parts = RS.parts;
  for (const sx of [-1, 1]) {
    RS.set(sx < 0 ? 'hipL' : 'hipR');
    parts.push(finish(limb(V3(sx * 0.07 * u, 0.97 * u, 0.02 * u), V3(sx * 0.07 * u, 0.6 * u, 0.03 * u), 0.03 * u, 0.022 * u), () => tone('#e9e6dc'))); // cuisse emplumée
    RS.set(sx < 0 ? 'kneeL' : 'kneeR');
    const knee = new THREE.IcosahedronGeometry(1, 0);
    knee.scale(0.026 * u, 0.03 * u, 0.026 * u);
    knee.translate(sx * 0.07 * u, 0.6 * u, 0.03 * u);
    parts.push(finish(knee, () => tone('#d6c04e')));
    parts.push(finish(limb(V3(sx * 0.07 * u, 0.6 * u, 0.03 * u), V3(sx * 0.07 * u, 0.02 * u, 0.03 * u), 0.018 * u, 0.012 * u), () => tone('#dcc548'))); // tarse jaune
    const foot = new THREE.ConeGeometry(0.03 * u, 0.17 * u, 3, 1);
    foot.rotateX(Math.PI / 2);
    foot.translate(sx * 0.07 * u, 0.015 * u, 0.1 * u);
    parts.push(finish(foot, () => tone('#c9ae3c')));
  }
  RS.set('body');
  const body = new THREE.IcosahedronGeometry(1, 1);
  body.scale(0.17 * u, 0.2 * u, 0.4 * u);
  body.rotateX(-0.3); // l'avant du corps est plus haut
  body.translate(0, 1.05 * u, 0);
  parts.push(finish(body, (x, y, z) => (y < 1.04 * u ? (z > 0.12 * u && Math.abs(x) < 0.05 * u && hashPos(x, y, z, 7) > 0.6 ? tone('#3a424c') : tone('#f4f4f2', -0.04)) : tone('#a3adb5', (hashPos(x, y, z, 4) - 0.5) * 0.03))));
  for (const sx of [-1, 1]) { // épaule noire
    const sh = new THREE.IcosahedronGeometry(1, 0);
    sh.scale(0.03 * u, 0.045 * u, 0.1 * u);
    sh.translate(sx * 0.165 * u, 1.17 * u, 0.2 * u);
    parts.push(finish(sh, () => tone('#20262e')));
  }
  for (const sx of [-1, 1]) {
    RS.set(sx < 0 ? 'wingL' : 'wingR');
    const wing = new THREE.IcosahedronGeometry(1, 0);
    wing.scale(0.05 * u, 0.18 * u, 0.42 * u);
    wing.rotateZ(sx * 0.12);
    wing.translate(sx * 0.165 * u, 1.04 * u, -0.08 * u);
    parts.push(finish(wing, (x, y, z) => (z < -0.3 * u || y < 0.9 * u ? tone('#46505c') : tone('#9aa5ae'))));  // pointes des rémiges sombres
  }
  RS.set('body');
  const tail = new THREE.OctahedronGeometry(1, 0);
  tail.scale(0.05 * u, 0.03 * u, 0.2 * u);
  tail.translate(0, 1.0 * u, -0.42 * u);
  parts.push(finish(tail, () => tone('#5c6b7c')));
  const bodyGeo = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());

  // cou en S + tête + huppe noire + bec jaune (repère local = point d'attache du cou)
  const n = [V3(0, 0, 0), V3(0, 0.18 * u, 0.08 * u), V3(0, 0.36 * u, -0.02 * u), V3(0, 0.52 * u, 0.1 * u)];
  const np = RS.np;
  RS.set('neck1'); np.push(finish(limb(n[0], n[1], 0.045 * u, 0.035 * u), () => tone('#f4f4f2')));
  RS.set('neck2'); np.push(finish(limb(n[1], n[2], 0.035 * u, 0.03 * u), () => tone('#f4f4f2', -0.02)));
  RS.set('neck3'); np.push(finish(limb(n[2], n[3], 0.03 * u, 0.03 * u), () => tone('#f4f4f2')));
  RS.set('head');
  const head = new THREE.IcosahedronGeometry(1, 0);
  head.scale(0.044 * u, 0.042 * u, 0.08 * u);
  head.translate(0, 0.55 * u, 0.12 * u);
  np.push(finish(head, () => tone('#f4f4f2')));
  for (const sx of [-1, 1]) { // bandeau noir de l'œil jusqu'à la nuque, prolongé par une longue aigrette
    const band = new THREE.IcosahedronGeometry(1, 0);
    band.scale(0.008 * u, 0.014 * u, 0.085 * u);
    band.translate(sx * 0.038 * u, 0.575 * u, 0.09 * u);
    np.push(finish(band, () => tone('#171c24')));
    const plume = new THREE.ConeGeometry(0.007 * u, 0.3 * u, 3, 1);
    plume.rotateX(-Math.PI / 2);   // pointe vers l'arrière
    plume.rotateX(-0.28);          // retombe derrière la nuque
    plume.translate(sx * 0.012 * u, 0.585 * u, 0.0 * u);
    np.push(finish(plume, () => tone('#171c24')));
  }
  const beak = new THREE.ConeGeometry(0.026 * u, 0.32 * u, 4, 1);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.55 * u, 0.34 * u);
  np.push(finish(beak, (x, y, z) => (z > 0.46 * u ? tone('#d9a428') : tone('#f2c233')))); // bec poignard jaune, pointe plus foncée
  for (const sx of [-1, 1]) {
    const ring = new THREE.IcosahedronGeometry(1, 0);
    ring.scale(0.011 * u, 0.016 * u, 0.016 * u);
    ring.translate(sx * 0.04 * u, 0.565 * u, 0.15 * u);
    np.push(finish(ring, () => tone('#e8c63a')));
    const eye = new THREE.IcosahedronGeometry(1, 0);
    eye.scale(0.012 * u, 0.012 * u, 0.012 * u);
    eye.translate(sx * 0.047 * u, 0.565 * u, 0.152 * u);
    np.push(finish(eye, () => tone('#111111')));
  }
  RS.set('neck2');
  for (let i = 0; i < 6; i++) { // traits noirs sur le devant du cou
    const f = 0.12 + i * 0.11, y = n[0].y + (n[3].y - n[0].y) * f;
    const seg = f < 0.34 ? [n[0], n[1], f / 0.34] : f < 0.67 ? [n[1], n[2], (f - 0.34) / 0.33] : [n[2], n[3], (f - 0.67) / 0.33];
    const cz = seg[0].z + (seg[1].z - seg[0].z) * seg[2], cy = seg[0].y + (seg[1].y - seg[0].y) * seg[2];
    const dash = new THREE.IcosahedronGeometry(1, 0);
    dash.scale(0.006 * u, 0.022 * u, 0.008 * u);
    dash.translate(0, cy, cz + 0.032 * u);
    np.push(finish(dash, () => tone('#2a313b')));
  }
  const neckGeo = mergeGeometries(np);
  np.forEach((q) => q.dispose());
  const P0 = V3(0, 1.14 * u, 0.3 * u);
  const rig = RS.build(P0, {
    hipL: V3(-0.07 * u, 0.97 * u, 0.02 * u), hipR: V3(0.07 * u, 0.97 * u, 0.02 * u), kneeL: V3(-0.07 * u, 0.6 * u, 0.03 * u), kneeR: V3(0.07 * u, 0.6 * u, 0.03 * u),
    wingL: V3(-0.165 * u, 1.12 * u, 0.12 * u), wingR: V3(0.165 * u, 1.12 * u, 0.12 * u), neck: n, head: n[3],
  });
  return { body: bodyGeo, neck: neckGeo, pivot: P0, rig };
}

// ----- flamant rose : mêmes articulations que le héron (corps + cou pivotant), pattes roses très longues, bec coudé -----
function makeFlamingo(d) {
  const u = d.size, A = d.alba;
  const tone = (hex, dl = 0) => birdTone(hex, dl, A);
  const RS = rigSink(), parts = RS.parts;
  for (const sx of [-1, 1]) {
    RS.set(sx < 0 ? 'hipL' : 'hipR');
    const hip = V3(sx * 0.05 * u, 0.98 * u, 0), knee = V3(sx * 0.05 * u, 0.5 * u, -0.05 * u), foot = V3(sx * 0.05 * u, 0.02 * u, 0.04 * u);
    parts.push(finish(limb(hip, knee, 0.016 * u, 0.012 * u), () => tone('#ea5a74')));
    RS.set(sx < 0 ? 'kneeL' : 'kneeR');
    const kj = new THREE.IcosahedronGeometry(1, 0);
    kj.scale(0.022 * u, 0.026 * u, 0.022 * u);
    kj.translate(knee.x, knee.y, knee.z);
    parts.push(finish(kj, () => tone('#d9425e')));
    parts.push(finish(limb(knee, foot, 0.012 * u, 0.009 * u), () => tone('#ea5a74')));
    const web = new THREE.ConeGeometry(0.035 * u, 0.12 * u, 3, 1); // pied palmé
    web.rotateX(Math.PI / 2);
    web.scale(1.3, 0.2, 1);
    web.translate(sx * 0.05 * u, 0.012 * u, 0.1 * u);
    parts.push(finish(web, () => tone('#ea5a74')));
  }
  RS.set('body');
  const body = new THREE.IcosahedronGeometry(1, 1);
  body.scale(0.14 * u, 0.16 * u, 0.3 * u);
  body.rotateX(-0.12);
  body.translate(0, 1.08 * u, 0);
  parts.push(finish(body, (x, y) => (y < 1.02 * u ? tone('#f9dde2') : tone('#f7cdd6'))));
  for (const sx of [-1, 1]) {
    RS.set(sx < 0 ? 'wingL' : 'wingR');
    const wing = new THREE.IcosahedronGeometry(1, 0); // aile repliée : rose soutenu, bord de fuite noir et rouge
    wing.scale(0.035 * u, 0.12 * u, 0.28 * u);
    wing.rotateZ(sx * 0.12);
    wing.translate(sx * 0.13 * u, 1.08 * u, -0.04 * u);
    parts.push(finish(wing, (x, y, z) => (y < 1.0 * u ? tone('#1e1b20') : z < -0.12 * u ? tone('#d2364e') : tone('#f1a0b3'))));
  }
  RS.set('body');
  const tail = new THREE.OctahedronGeometry(1, 0);
  tail.scale(0.05 * u, 0.025 * u, 0.15 * u);
  tail.translate(0, 1.05 * u, -0.32 * u);
  parts.push(finish(tail, () => tone('#f4bcc8')));
  const bodyGeo = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());

  // cou fin en S, petite tête, bec coudé (base rose, pointe noire vers le bas)
  const n = [V3(0, 0, 0), V3(0, 0.2 * u, -0.07 * u), V3(0, 0.42 * u, 0.07 * u), V3(0, 0.62 * u, -0.01 * u), V3(0, 0.74 * u, 0.06 * u)];
  const np = RS.np;
  for (let i = 0; i < 4; i++) { RS.set(i === 0 ? 'neck1' : i === 1 ? 'neck2' : 'neck3'); np.push(finish(limb(n[i], n[i + 1], (0.034 - i * 0.003) * u, (0.031 - i * 0.003) * u), () => tone('#fbe2e7', -0.01 * i))); }
  RS.set('head');
  const head = new THREE.IcosahedronGeometry(1, 1);
  head.scale(0.04 * u, 0.04 * u, 0.055 * u);
  head.translate(0, 0.77 * u, 0.07 * u);
  np.push(finish(head, () => tone('#fbe2e7')));
  const bb = new THREE.ConeGeometry(0.03 * u, 0.12 * u, 4, 1);
  bb.rotateX(Math.PI / 2);
  bb.scale(1, 0.9, 1);
  bb.translate(0, 0.765 * u, 0.17 * u);
  np.push(finish(bb, () => tone('#f1a0b0')));
  const tip = new THREE.ConeGeometry(0.026 * u, 0.1 * u, 4, 1); // pointe noire, courbée vers le bas
  tip.rotateX(Math.PI / 2 + 0.7);
  tip.translate(0, 0.725 * u, 0.245 * u);
  np.push(finish(tip, () => tone('#1d1b20')));
  for (const sx of [-1, 1]) {
    const eye = new THREE.IcosahedronGeometry(1, 0);
    eye.scale(0.011 * u, 0.011 * u, 0.011 * u);
    eye.translate(sx * 0.036 * u, 0.785 * u, 0.09 * u);
    np.push(finish(eye, () => tone('#101010')));
  }
  const neckGeo = mergeGeometries(np);
  np.forEach((q) => q.dispose());
  const P0 = V3(0, 1.15 * u, 0.22 * u);
  const rig = RS.build(P0, {
    hipL: V3(-0.05 * u, 0.98 * u, 0), hipR: V3(0.05 * u, 0.98 * u, 0), kneeL: V3(-0.05 * u, 0.5 * u, -0.05 * u), kneeR: V3(0.05 * u, 0.5 * u, -0.05 * u),
    wingL: V3(-0.13 * u, 1.14 * u, 0.08 * u), wingR: V3(0.13 * u, 1.14 * u, 0.08 * u), neck: n, head: n[4],
  });
  return { body: bodyGeo, neck: neckGeo, pivot: P0, rig };
}

// ----- ibis falcinelle : plumage roux, ailes vert bronze, long bec courbé vers le bas, joues bleu-lilas -----
function makeIbis(d) {
  const u = d.size, A = d.alba;
  const tone = (hex, dl = 0) => birdTone(hex, dl, A);
  const sf = (g, fn) => softFinish(g, fn, 0.9); // normales adoucies : plus de facettes plates, pièces arrondies
  const RS = rigSink(), parts = RS.parts;
  for (const sx of [-1, 1]) {
    RS.set(sx < 0 ? 'hipL' : 'hipR');
    const hip = V3(sx * 0.05 * u, 0.64 * u, 0), knee = V3(sx * 0.05 * u, 0.36 * u, -0.03 * u), foot = V3(sx * 0.05 * u, 0.015 * u, 0.03 * u);
    parts.push(sf(limb(hip, knee, 0.017 * u, 0.013 * u, 8), () => tone('#e9c2c8')));
    RS.set(sx < 0 ? 'kneeL' : 'kneeR');
    const kj = new THREE.IcosahedronGeometry(1, 2);
    kj.scale(0.02 * u, 0.024 * u, 0.02 * u);
    kj.translate(knee.x, knee.y, knee.z);
    parts.push(sf(kj, () => tone('#d9a8b0')));
    parts.push(sf(limb(knee, foot, 0.013 * u, 0.009 * u, 8), () => tone('#e9c2c8')));
    const toes = new THREE.ConeGeometry(0.02 * u, 0.13 * u, 7, 1);
    toes.rotateX(Math.PI / 2);
    toes.scale(1, 0.25, 1);
    toes.translate(sx * 0.05 * u, 0.01 * u, 0.1 * u);
    parts.push(sf(toes, () => tone('#e0b4bc')));
  }
  RS.set('body');
  const body = new THREE.IcosahedronGeometry(1, 3);
  body.scale(0.115 * u, 0.135 * u, 0.28 * u);
  body.rotateX(-0.25);
  body.translate(0, 0.74 * u, 0);
  parts.push(sf(body, (x, y, z) => tone('#93361f', (hashPos(x, y, z, 6) - 0.5) * 0.04)));
  for (const sx of [-1, 1]) {
    RS.set(sx < 0 ? 'wingL' : 'wingR');
    const wing = new THREE.IcosahedronGeometry(1, 3);
    wing.scale(0.024 * u, 0.09 * u, 0.26 * u);
    wing.rotateZ(sx * 0.06);
    wing.translate(sx * 0.098 * u, 0.78 * u, -0.07 * u);
    parts.push(sf(wing, (x, y, z) => (z < -0.17 * u ? tone('#2b3f80') : z < -0.06 * u ? tone('#24504f') : tone('#1f5c46')))); // vert bronze virant au bleu
  }
  RS.set('body');
  const tail = new THREE.IcosahedronGeometry(1, 2);
  tail.scale(0.05 * u, 0.025 * u, 0.15 * u);
  tail.translate(0, 0.7 * u, -0.34 * u);
  parts.push(sf(tail, () => tone('#2b3f80')));
  const bodyGeo = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());

  const n = [V3(0, 0, 0), V3(0, 0.12 * u, 0.07 * u), V3(0, 0.25 * u, -0.01 * u), V3(0, 0.37 * u, 0.07 * u)];
  const np = RS.np;
  RS.set('neck1'); np.push(sf(limb(n[0], n[1], 0.05 * u, 0.04 * u, 12), () => tone('#9a3b24')));
  RS.set('neck2'); np.push(sf(limb(n[1], n[2], 0.04 * u, 0.034 * u, 12), () => tone('#963821', -0.01)));
  RS.set('neck3'); np.push(sf(limb(n[2], n[3], 0.034 * u, 0.034 * u, 12), () => tone('#9a3b24')));
  RS.set('head');
  const head = new THREE.IcosahedronGeometry(1, 3);
  head.scale(0.05 * u, 0.05 * u, 0.075 * u);
  head.translate(0, 0.4 * u, 0.1 * u);
  np.push(sf(head, (x, y, z) => (Math.abs(x) > 0.032 * u && z > 0.08 * u && z < 0.16 * u && y > 0.385 * u ? tone('#cfcbec') : tone('#9a3b24')))); // peau du visage bleu-lilas
  const bpts = [V3(0, 0.4 * u, 0.15 * u), V3(0, 0.395 * u, 0.25 * u), V3(0, 0.365 * u, 0.34 * u), V3(0, 0.32 * u, 0.42 * u), V3(0, 0.255 * u, 0.48 * u)];
  for (let i = 0; i < 4; i++) np.push(sf(limb(bpts[i], bpts[i + 1], (0.022 - i * 0.004) * u, (0.018 - i * 0.004) * u, 9), () => tone('#eed7d7')));
  for (const sx of [-1, 1]) {
    const ring = new THREE.IcosahedronGeometry(1, 2);
    ring.scale(0.012 * u, 0.016 * u, 0.016 * u);
    ring.translate(sx * 0.047 * u, 0.41 * u, 0.12 * u);
    np.push(sf(ring, () => tone('#f4f1fa')));
    const eye = new THREE.IcosahedronGeometry(1, 2);
    eye.scale(0.011 * u, 0.011 * u, 0.011 * u);
    eye.translate(sx * 0.053 * u, 0.41 * u, 0.122 * u);
    np.push(sf(eye, () => tone('#101010')));
  }
  const neckGeo = mergeGeometries(np);
  np.forEach((q) => q.dispose());
  const P0 = V3(0, 0.84 * u, 0.2 * u);
  const rig = RS.build(P0, {
    hipL: V3(-0.05 * u, 0.64 * u, 0), hipR: V3(0.05 * u, 0.64 * u, 0), kneeL: V3(-0.05 * u, 0.36 * u, -0.03 * u), kneeR: V3(0.05 * u, 0.36 * u, -0.03 * u),
    wingL: V3(-0.115 * u, 0.8 * u, 0.1 * u), wingR: V3(0.115 * u, 0.8 * u, 0.1 * u), neck: n, head: n[3],
  });
  return { body: bodyGeo, neck: neckGeo, pivot: P0, rig };
}

// ----- héron garde-bœufs : petit héron trapu, tout blanc, aigrettes roux-doré sur la tête, la poitrine et le dos, bec jaune épais -----
function makeEgret(d) {
  const u = d.size, A = d.alba;
  const tone = (hex, dl = 0) => birdTone(hex, dl, A);
  const sf = (g, fn) => softFinish(g, fn, 0.9);
  const RS = rigSink(), parts = RS.parts;
  const ext = (p, q, e) => p.clone().addScaledVector(q.clone().sub(p).normalize(), -e); // recule p d'une longueur e (le tube déborde sur le maillon d'avant)
  const ball = (p, r, hex, dl = 0) => { const g = new THREE.IcosahedronGeometry(1, 2); g.scale(r, r, r); g.translate(p.x, p.y, p.z); return sf(g, () => tone(hex, dl)); };
  const WHITE = '#f8f7f2', BUFF = '#e8b46a';
  for (const sx of [-1, 1]) {
    RS.set(sx < 0 ? 'hipL' : 'hipR');
    const hip = V3(sx * 0.055 * u, 0.58 * u, 0), knee = V3(sx * 0.055 * u, 0.33 * u, -0.02 * u), foot = V3(sx * 0.055 * u, 0.012 * u, 0.03 * u);
    parts.push(ball(hip, 0.02 * u, '#e8e2c8'));
    parts.push(sf(limb(ext(hip, knee, 0.012 * u), knee, 0.015 * u, 0.011 * u, 8), () => tone('#e8e2c8')));  // cuisse emplumée
    RS.set(sx < 0 ? 'kneeL' : 'kneeR');
    const kj = new THREE.IcosahedronGeometry(1, 2);
    kj.scale(0.017 * u, 0.019 * u, 0.017 * u);
    kj.translate(knee.x, knee.y, knee.z);
    parts.push(sf(kj, () => tone('#e8902f')));
    parts.push(sf(limb(ext(knee, foot, 0.02 * u), foot, 0.009 * u, 0.0065 * u, 8), () => tone('#ea8a2c')));    // tarse vert-jaune sombre
    const toes = new THREE.ConeGeometry(0.016 * u, 0.12 * u, 7, 1);
    toes.rotateX(Math.PI / 2);
    toes.scale(1, 0.25, 1);
    toes.translate(sx * 0.055 * u, 0.01 * u, 0.09 * u);
    parts.push(sf(toes, () => tone('#ea8a2c')));
  }
  RS.set('body');
  const body = new THREE.IcosahedronGeometry(1, 3);
  body.scale(0.125 * u, 0.145 * u, 0.27 * u);
  body.rotateX(-0.28);
  body.translate(0, 0.68 * u, 0);
  parts.push(sf(body, (x, y, z) => (y > 0.72 * u && z < 0.1 * u && z > -0.14 * u ? tone(BUFF, (hashPos(x, y, z, 8) - 0.5) * 0.05) : tone(WHITE, (hashPos(x, y, z, 6) - 0.5) * 0.02)))); // dos roux
  const chest = new THREE.IcosahedronGeometry(1, 2); // plumes de la poitrine
  chest.scale(0.085 * u, 0.1 * u, 0.1 * u);
  chest.translate(0, 0.7 * u, 0.2 * u);
  parts.push(sf(chest, () => tone(BUFF, 0.02)));
  for (const sx of [-1, 1]) {
    RS.set(sx < 0 ? 'wingL' : 'wingR');
    const wing = new THREE.IcosahedronGeometry(1, 3);
    wing.scale(0.022 * u, 0.085 * u, 0.21 * u);
    wing.rotateZ(sx * 0.06);
    wing.translate(sx * 0.098 * u, 0.7 * u, -0.07 * u);
    parts.push(sf(wing, () => tone(WHITE, -0.03)));
  }
  RS.set('body');
  const tail = new THREE.IcosahedronGeometry(1, 2);
  tail.scale(0.05 * u, 0.025 * u, 0.14 * u);
  tail.translate(0, 0.66 * u, -0.3 * u);
  parts.push(sf(tail, () => tone(WHITE, -0.02)));
  const bodyGeo = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());

  // cou court et épais, rentré en S ; tête ronde, crête roux-doré, gros bec jaune
  const n = [V3(0, 0, 0), V3(0, 0.1 * u, 0.06 * u), V3(0, 0.2 * u, -0.01 * u), V3(0, 0.29 * u, 0.06 * u)];
  const np = RS.np;
  RS.set('neck1'); np.push(ball(n[0], 0.036 * u, WHITE)); np.push(sf(limb(n[0], n[1], 0.038 * u, 0.032 * u, 12), () => tone(WHITE)));
  RS.set('neck2'); np.push(ball(n[1], 0.032 * u, WHITE, -0.01)); np.push(sf(limb(ext(n[1], n[2], 0.02 * u), n[2], 0.032 * u, 0.028 * u, 12), () => tone(WHITE, -0.02)));
  RS.set('neck3'); np.push(ball(n[2], 0.029 * u, WHITE)); np.push(sf(limb(ext(n[2], n[3], 0.02 * u), n[3], 0.029 * u, 0.027 * u, 12), (x, y) => tone(y > 0.25 * u ? BUFF : WHITE))); // le haut du cou est roux
  RS.set('head');
  np.push(ball(n[3], 0.027 * u, BUFF)); // la tête s'emboîte sur le cou
  const head = new THREE.IcosahedronGeometry(1, 3);
  head.scale(0.052 * u, 0.05 * u, 0.07 * u);
  head.translate(0, 0.32 * u, 0.09 * u);
  np.push(sf(head, (x, y) => tone(y > 0.325 * u ? BUFF : WHITE, y > 0.325 * u ? 0.02 : 0)));
  // dix plumes jaunes, plates et pointues, plantées un peu partout sur la tête et dirigées vers l'arrière (la grosse boule de la crête est supprimée)
  const hc = V3(0, 0.32 * u, 0.09 * u), hr = V3(0.052 * u, 0.05 * u, 0.07 * u), Zax = V3(0, 0, 1);
  for (let i = 0; i < 10; i++) {
    const r1 = hashPos(i, 1, 7, 11), r2 = hashPos(i, 2, 7, 11), r3 = hashPos(i, 3, 7, 11);
    const az = (r1 - 0.5) * Math.PI * 1.7, el = 0.15 + r2 * 1.1;                    // azimut autour de la tête, élévation (dessus et côtés, pas dessous)
    const dir = V3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el) * 0.6 + 0.2).normalize();
    const pos = hc.clone().add(V3(dir.x * hr.x, dir.y * hr.y, dir.z * hr.z));
    const L = (0.06 + r3 * 0.05) * u;
    const fe = new THREE.OctahedronGeometry(1, 0);
    fe.scale(0.011 * u, 0.0032 * u, L / 2);     // lame plate, pointue aux deux bouts
    fe.translate(0, 0, L / 2);
    const f = V3(0, 0, -1).multiplyScalar(0.85).addScaledVector(dir, 0.35).normalize(); // vers l'arrière, un peu écartée de la tête
    fe.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Zax, f));
    fe.translate(pos.x, pos.y, pos.z);
    np.push(sf(fe, () => tone('#f4c630', (r3 - 0.5) * 0.1)));
  }
  const bill = new THREE.ConeGeometry(0.034 * u, 0.17 * u, 9, 1);
  bill.rotateX(Math.PI / 2);
  bill.scale(0.9, 1, 1);
  bill.translate(0, 0.315 * u, 0.2 * u);
  np.push(sf(bill, (x, y, z) => tone('#ee7f26').lerp(tone('#f6d035'), clamp((z - 0.13 * u) / (0.14 * u), 0, 1)))); // orangé à la base, jaune vers la pointe
  for (const sx of [-1, 1]) {
    const ring = new THREE.IcosahedronGeometry(1, 2);
    ring.scale(0.011 * u, 0.016 * u, 0.016 * u);
    ring.translate(sx * 0.046 * u, 0.33 * u, 0.12 * u);
    np.push(sf(ring, () => tone('#e8d040')));
    const eye = new THREE.IcosahedronGeometry(1, 2);
    eye.scale(0.011 * u, 0.011 * u, 0.011 * u);
    eye.translate(sx * 0.051 * u, 0.33 * u, 0.122 * u);
    np.push(sf(eye, () => tone('#101010')));
  }
  const neckGeo = mergeGeometries(np);
  np.forEach((q) => q.dispose());
  const P0 = V3(0, 0.78 * u, 0.21 * u);
  const rig = RS.build(P0, {
    hipL: V3(-0.055 * u, 0.58 * u, 0), hipR: V3(0.055 * u, 0.58 * u, 0), kneeL: V3(-0.055 * u, 0.33 * u, -0.02 * u), kneeR: V3(0.055 * u, 0.33 * u, -0.02 * u),
    wingL: V3(-0.115 * u, 0.74 * u, 0.1 * u), wingR: V3(0.115 * u, 0.74 * u, 0.1 * u), neck: n, head: n[3],
  });
  return { body: bodyGeo, neck: neckGeo, pivot: P0, rig };
}

function newHeronDesc(x, z) {
  const rng = mulberry32(31000 + birdCounter++ * 9973);
  return { seed: Math.floor(rng() * 1e6), size: num('heronSize'), alba: $('alba').checked, phase: rng() * 6.28, x, z, rot: rng() * Math.PI * 2, scale: 1 };
}

// le héron se tient dans les bas-fonds : ni sur terre trop haute, ni dans l'eau profonde
const heronOk = (x, z) =>
  Math.hypot(x, z) < groundR * 0.95 && (!$('water').checked || !currentHF || currentHF(x, z) > waterLevel() - 0.3);
function findHeronSpot() {
  const water = $('water').checked && currentHF;
  for (let k = 0; k < 250; k++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * groundR * 0.9;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!heronOk(x, z)) continue;
    if (water && k < 200) { const h = currentHF(x, z); if (h > waterLevel() + 0.15 || h < waterLevel() - 0.28) continue; } // d'abord les rives et bas-fonds
    return { x, z };
  }
  return null;
}

function addHeron(d) {
  const g = makeHeron(d);
  const y = currentHF ? currentHF(d.x, d.z) : 0;
  const m = addTree(g.rig ? g.rig.joints[0].geo : g.body, d.x, y, d.z, d.scale, d.rot, d.size * 0.55 * d.scale);
  let neck;
  if (g.rig) neck = attachRig(m, g.rig, d); // squelette : pattes, ailes, cou en trois maillons, tête
  else {
    neck = new THREE.Mesh(g.neck, matTree);
    neck.position.copy(g.pivot);
    neck.rotation.order = 'YXZ';
    neck.castShadow = m.castShadow;
    m.add(neck);
  }
  m.userData.heron = { d, neck, mode: 'idle', timer: 1 + Math.random() * 3, strikeT: 0, turn: 0 };
  return m;
}
function restoreHerons() {
  heronsData.forEach((d) => {
    if (!heronOk(d.x, d.z)) { const s = findHeronSpot(); if (!s) return; d.x = s.x; d.z = s.z; }
    d.alba = $('alba').checked;
    addHeron(d);
  });
}

// ----- pic : s'accroche au tronc et tourne autour en montant / descendant -----
const PECKER_K = 4; // le curseur « taille » est multiplié : sinon l'oiseau est minuscule face à un arbre
function makeWoodpecker(d) {
  const u = d.size * PECKER_K, A = d.alba, rng = mulberry32(d.seed);
  const tone = (hex, dl = 0) => birdTone(hex, dl, A);
  const parts = [];
  const body = new THREE.IcosahedronGeometry(1, 1);
  body.scale(0.09 * u, 0.1 * u, 0.24 * u);
  parts.push(finish(body, (x, y, z) => {
    if (y <= 0) return z < -0.12 * u ? tone('#d6342c') : tone('#e8dcc4'); // ventre crème, sous-caudale rouge
    return hashPos(x, y, z, 21) > 0.82 ? tone('#f3efe6') : tone('#262b33', rng() * 0.02); // dos noir tacheté de blanc
  }));
  const tail = new THREE.ConeGeometry(0.05 * u, 0.26 * u, 4, 1);
  tail.rotateX(-Math.PI / 2); // pointe vers l'arrière
  tail.translate(0, -0.05 * u, -0.3 * u);
  parts.push(finish(tail, () => tone('#262b33', 0.02)));
  for (const sx of [-1, 1]) for (const dz of [0.02, 0.08]) { // pattes accrochées au tronc (côté ventre, -Y)
    const claw = new THREE.ConeGeometry(0.014 * u, 0.09 * u, 3, 1);
    claw.rotateX(Math.PI);
    claw.translate(sx * 0.045 * u, -0.1 * u, dz * u);
    parts.push(finish(claw, () => tone('#3b3b3b')));
  }
  const bodyGeo = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());

  const hp = [];
  const head = new THREE.IcosahedronGeometry(1, 1);
  head.scale(0.07 * u, 0.07 * u, 0.085 * u);
  head.translate(0, 0.02 * u, 0.05 * u);
  hp.push(finish(head, (x, y) => (y > 0.045 * u ? tone('#d6342c') : tone('#f3efe6')))); // calotte rouge, joues blanches
  const beak = new THREE.ConeGeometry(0.022 * u, 0.17 * u, 4, 1);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.015 * u, 0.17 * u);
  hp.push(finish(beak, () => tone('#5a6068')));
  for (const sx of [-1, 1]) {
    const eye = new THREE.IcosahedronGeometry(1, 0);
    eye.scale(0.011 * u, 0.011 * u, 0.011 * u);
    eye.translate(sx * 0.06 * u, 0.04 * u, 0.07 * u);
    hp.push(finish(eye, () => tone('#111111')));
  }
  const headGeo = mergeGeometries(hp);
  hp.forEach((q) => q.dispose());
  return { body: bodyGeo, head: headGeo, pivot: V3(0, 0.03 * u, 0.2 * u) };
}

const trunkTrees = () => trees.filter((t) => t.userData.trunk && t.userData.trunk.length > 1);

function addWoodpecker(d) {
  const list = trunkTrees();
  if (!list.length) return null;
  const tree = list[((d.tree % list.length) + list.length) % list.length];
  const g = makeWoodpecker(d);
  const bird = new THREE.Mesh(g.body, matTree);
  bird.castShadow = tree.castShadow;
  const head = new THREE.Mesh(g.head, matTree);
  head.position.copy(g.pivot);
  head.castShadow = tree.castShadow;
  bird.add(head);
  tree.add(bird); // enfant de l'arbre : suit ses déplacements, sa rotation et sa taille
  bird.userData.pecker = { d, head, tree };
  peckers.push(bird);
  return bird;
}
// un arbre supprimé emporte ses pics (sinon ils continuent d'être animés et sauvegardés avec un mauvais arbre)
function dropPeckersOf(tree) {
  peckers = peckers.filter((b) => {
    if (b.userData.pecker.tree !== tree) return true;
    peckersData = peckersData.filter((d) => d !== b.userData.pecker.d);
    b.parent?.remove(b);
    disposeMesh(b);
    return false;
  });
}
// l'index d'arbre de chaque pic suit l'ordre actuel des arbres (il change quand on ajoute / supprime des arbres)
function syncPeckers() {
  const list = trunkTrees();
  peckers.forEach((b) => { const i = list.indexOf(b.userData.pecker.tree); if (i >= 0) b.userData.pecker.d.tree = i; });
}
function restorePeckers() {
  peckers = [];
  peckersData.forEach((d) => addWoodpecker(d));
}

// point, tangente et rayon du tronc à la fraction f (0 = pied, 1 = sommet)
const _tp = { p: V3(0, 0, 0), t: V3(0, 1, 0), r: 0.1 };
function trunkAt(path, f) {
  const n = path.length - 1, x = clamp(f, 0, 1) * n, i = Math.min(n - 1, Math.floor(x)), k = x - i;
  const a = path[i], b = path[i + 1];
  _tp.p.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
  _tp.t.set(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
  _tp.r = a.r + (b.r - a.r) * k;
  return _tp;
}

const _bx = V3(0, 0, 0), _by = V3(0, 0, 0), _bz = V3(0, 0, 0), _bu = V3(0, 0, 0), _bv = V3(0, 0, 0);
const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion();
function peckerTick(bird, t, dt) {
  const { d, head, tree } = bird.userData.pecker;
  if (!tree.parent) { bird.visible = false; return; }
  bird.visible = true;
  const path = tree.userData.trunk;
  // toujours le même rond autour du tronc, à vitesse constante ; la hauteur ondule un peu (2 montées / descentes par tour)
  // -> la trajectoire est une courbe fermée qui se répète à l'identique
  const th = t * 0.9 * d.speed + d.phase * 3;
  const f = 0.45 + 0.09 * Math.sin(2 * th);
  const tp = trunkAt(path, f);
  // repère autour du tronc : U, V perpendiculaires à la tangente
  _bu.set(1, 0, 0).addScaledVector(tp.t, -tp.t.x).normalize();
  _bv.crossVectors(tp.t, _bu);
  _by.copy(_bu).multiplyScalar(Math.cos(th)).addScaledVector(_bv, Math.sin(th)); // normale sortante = dos de l'oiseau
  bird.position.copy(tp.p).addScaledVector(_by, tp.r + 0.05 * d.size * PECKER_K);
  _bz.copy(tp.t);                                                                  // tête toujours vers le haut
  _bx.crossVectors(_by, _bz);
  _bq.setFromRotationMatrix(_bm.makeBasis(_bx, _by, _bz));
  bird.quaternion.slerp(_bq, Math.min(1, dt * 9));  // coups de bec par rafales
  const burst = Math.max(0, Math.sin(t * 0.7 + d.phase * 2)) ** 2;
  head.rotation.x = 0.5 + burst * Math.abs(Math.sin(t * 20)) * 0.7; // bec orienté vers le tronc (presque perpendiculaire en frappant)
}
function heronTick(m, dt, t) {
  if (poseMode && poseMode.m === m) return; // en modification de pose : l'animal est figé
  const h = m.userData.heron, d = h.d;
  const sel = m === selected;
  h.timer -= dt;
  if (h.timer <= 0) { // prochain comportement
    const r = Math.random();
    h.mode = r < 0.4 ? 'idle' : r < 0.7 ? 'look' : 'strike';
    h.timer = h.mode === 'look' ? 3 + Math.random() * 3 : h.mode === 'strike' ? 1.5 : 2 + Math.random() * 4;
    h.strikeT = 0;
  }
  const p = m.position; // planté sur place : seuls le cou et la tête bougent
  if (!sel) p.y = currentHF ? currentHF(p.x, p.z) : 0;
  // cou : léger balancement, regard qui tourne (plus ample quand il observe), et coup de bec vers l'eau pendant la pêche
  let dip = Math.sin(t * 0.9 + d.phase) * 0.06;
  const look = Math.sin(t * (h.mode === 'look' ? 0.9 : 0.5) + d.phase * 2) * (h.mode === 'look' ? 0.9 : 0.4);
  if (h.mode === 'strike') { h.strikeT += dt; dip += Math.sin(Math.min(1, h.strikeT / 1.5) * Math.PI) * 1.55; }
  h.neck.rotation.set(dip, look, 0);
}

function birdsTick(dt, t) {
  for (const m of trees) {
    if (m.userData.heron) heronTick(m, dt, t);
    else if (m.userData.frog) frogTick(m, dt, t);
    else if (m.userData.wagtail) wagtailTick(m, dt, t);
    else if (m.userData.lily || m.userData.duck) floatTick(m, t);
  }
  peckers.forEach((b) => peckerTick(b, t, dt));
  flyers.forEach((f) => flyerTick(f, dt, t));
  dragons.forEach((f) => dragonTick(f, dt, t));
  insects.forEach((f) => insectTick(f, dt, t));
  leavesTick(dt, t);
}

$('heronAdd').addEventListener('click', () => {
  const s = findHeronSpot();
  if (!s) { setStatus('Aucun endroit pour poser un héron.'); return; }
  const d = newHeronDesc(s.x, s.z);
  heronsData.push(d);
  select(addHeron(d));
});
$('egretAdd').addEventListener('click', () => {
  const s = findHeronSpot();
  if (!s) { setStatus('Aucun endroit pour poser un héron garde-bœufs.'); return; }
  const d = { ...newHeronDesc(s.x, s.z), kind: 'egret', size: num('egretSize') * (0.92 + Math.random() * 0.16) };
  heronsData.push(d);
  select(addHeron(d));
});
$('ibisAdd').addEventListener('click', () => {
  const s = findHeronSpot();
  if (!s) { setStatus('Aucun endroit pour poser un ibis.'); return; }
  const d = { ...newHeronDesc(s.x, s.z), kind: 'ibis', size: num('ibisSize') * (0.92 + Math.random() * 0.16) };
  heronsData.push(d);
  select(addHeron(d));
});
$('flamingoAdd').addEventListener('click', () => {
  const s = findHeronSpot();
  if (!s) { setStatus('Aucun endroit pour poser un flamant.'); return; }
  const d = { ...newHeronDesc(s.x, s.z), kind: 'flamingo', size: num('flamingoSize') * (0.92 + Math.random() * 0.16) };
  heronsData.push(d);
  select(addHeron(d));
});
$('peckerAdd').addEventListener('click', () => {
  const list = trunkTrees();
  if (!list.length) { setStatus("Il faut un arbre pour y accrocher un pic."); return; }
  // arbre sélectionné s'il y en a un, sinon au hasard
  const idx = selected && list.includes(selected) ? list.indexOf(selected) : Math.floor(Math.random() * list.length);
  const rng = mulberry32(41000 + birdCounter++ * 7907);
  const d = { seed: Math.floor(rng() * 1e6), tree: idx, size: num('peckerSize'), speed: num('peckerSpeed'), phase: rng() * 6.28, alba: $('alba').checked };
  peckersData.push(d);
  addWoodpecker(d);
  setStatus(`${peckersData.length} pic(s) sur les arbres`);
});
const clearBirds = () => {
  heronsData = [];
  peckersData = [];
  select(null);
  peckers.forEach((b) => { b.parent?.remove(b); disposeMesh(b); });
  peckers = [];
  trees.filter((t) => t.userData.heron).forEach((t) => { world.remove(t); disposeMesh(t); });
  trees = trees.filter((t) => !t.userData.heron);
};

// ---------- Grenouille ----------
let frogsData = []; // objets du monde, enregistrés dans le JSON

function makeFrog(d) {
  const S = d.size, A = d.alba;
  const tone = (hex, dl = 0) => birdTone(hex, dl, A);
  const parts = [];
  const body = new THREE.IcosahedronGeometry(1, 1);
  body.scale(0.42 * S, 0.3 * S, 0.55 * S);
  body.translate(0, 0.3 * S, 0);
  parts.push(finish(body, (x, y, z) => {
    if (y < 0.24 * S) return tone('#dfe9ae', -0.02);                                 // ventre clair
    return hashPos(x, y, z, 17) > 0.8 ? tone('#4f8a3a', -0.05) : tone('#6fb04f', (hashPos(x, y, z, 5) - 0.5) * 0.04); // dos vert tacheté
  }));
  const head = new THREE.IcosahedronGeometry(1, 1);
  head.scale(0.34 * S, 0.22 * S, 0.3 * S);
  head.translate(0, 0.36 * S, 0.46 * S);
  parts.push(finish(head, (x, y) => (y < 0.33 * S ? tone('#cfe09a') : tone('#74b552'))));
  for (const sx of [-1, 1]) {
    const eye = new THREE.IcosahedronGeometry(1, 0);
    eye.scale(0.11 * S, 0.11 * S, 0.11 * S);
    eye.translate(sx * 0.2 * S, 0.56 * S, 0.5 * S);
    parts.push(finish(eye, () => tone('#e8c547')));
    const pupil = new THREE.IcosahedronGeometry(1, 0);
    pupil.scale(0.05 * S, 0.06 * S, 0.04 * S);
    pupil.translate(sx * 0.215 * S, 0.57 * S, 0.585 * S);
    parts.push(finish(pupil, () => tone('#111111')));
    // pattes arrière repliées : cuisse + pied à plat vers l'avant
    const thigh = new THREE.IcosahedronGeometry(1, 0);
    thigh.scale(0.14 * S, 0.24 * S, 0.3 * S);
    thigh.rotateX(-0.35);
    thigh.translate(sx * 0.44 * S, 0.24 * S, -0.16 * S);
    parts.push(finish(thigh, () => tone('#5fa443')));
    const foot = new THREE.OctahedronGeometry(1, 0);
    foot.scale(0.12 * S, 0.03 * S, 0.3 * S);
    foot.translate(sx * 0.46 * S, 0.03 * S, 0.06 * S);
    parts.push(finish(foot, () => tone('#8cc468')));
    // pattes avant
    const arm = new THREE.CylinderGeometry(0.035 * S, 0.045 * S, 0.24 * S, 4, 1);
    arm.translate(sx * 0.2 * S, 0.12 * S, 0.5 * S);
    parts.push(finish(arm, () => tone('#6fb04f', -0.03)));
    const hand = new THREE.OctahedronGeometry(1, 0);
    hand.scale(0.07 * S, 0.02 * S, 0.1 * S);
    hand.translate(sx * 0.2 * S, 0.01 * S, 0.57 * S);
    parts.push(finish(hand, () => tone('#8cc468')));
  }
  const bodyGeo = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());
  // gorge qui gonfle (objet à part)
  const th = new THREE.IcosahedronGeometry(1, 0);
  th.scale(0.2 * S, 0.12 * S, 0.17 * S);
  return { body: bodyGeo, throat: finish(th, () => tone('#e9f1b8')), pivot: V3(0, 0.2 * S, 0.6 * S) };
}

function newFrogDesc(x, z) {
  const rng = mulberry32(51000 + birdCounter++ * 8191);
  return { seed: Math.floor(rng() * 1e6), size: num('frogSize') * (0.85 + rng() * 0.3), alba: $('alba').checked, phase: rng() * 6.28, x, z, rot: rng() * Math.PI * 2, scale: 1 };
}

// elle vit près de l'eau : jamais en eau profonde
const frogOk = (x, z) => Math.hypot(x, z) < groundR * 0.95 && (!$('water').checked || !currentHF || currentHF(x, z) > waterLevel() - 0.1);
function findFrogSpot() {
  const water = $('water').checked && currentHF;
  for (let k = 0; k < 250; k++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * groundR * 0.9;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!frogOk(x, z)) continue;
    if (water && k < 200) { const h = currentHF(x, z); if (h > waterLevel() + 0.5 || h < waterLevel() - 0.05) continue; } // d'abord la rive
    return { x, z };
  }
  return null;
}

function addFrog(d) {
  const g = makeFrog(d);
  const m = addTree(g.body, d.x, currentHF ? currentHF(d.x, d.z) : 0, d.z, d.scale, d.rot, d.size * 0.9 * d.scale);
  const throat = new THREE.Mesh(g.throat, matTree);
  throat.position.copy(g.pivot);
  throat.castShadow = m.castShadow;
  m.add(throat);
  m.userData.frog = { d, throat, timer: 0.8 + Math.random() * 2.5, hop: null };
  return m;
}
function restoreFrogs() {
  frogsData.forEach((d) => {
    if (!frogOk(d.x, d.z)) { const s = findFrogSpot(); if (!s) return; d.x = s.x; d.z = s.z; }
    d.alba = $('alba').checked;
    addFrog(d);
  });
}

// immobile (la gorge bat) puis saute par petits bonds vers un point voisin, en arc, face à sa direction
function frogTick(m, dt, t) {
  const f = m.userData.frog, d = f.d, p = m.position;
  f.throat.scale.setScalar(1 + 0.22 * (0.5 + 0.5 * Math.sin(t * 5 + d.phase)));
  if (m === selected) { f.hop = null; return; }
  const ground = (x, z) => (currentHF ? currentHF(x, z) : 0);
  if (f.hop) {
    const h = f.hop;
    h.k = Math.min(1, h.k + dt / h.dur);
    p.x = h.x0 + (h.x1 - h.x0) * h.k;
    p.z = h.z0 + (h.z1 - h.z0) * h.k;
    p.y = ground(p.x, p.z) + 4 * h.height * h.k * (1 - h.k) * m.scale.x;
    if (h.k >= 1) { f.hop = null; f.timer = 0.8 + Math.random() * 3; }
    d.x = p.x; d.z = p.z;
  } else {
    p.y = ground(p.x, p.z);
    f.timer -= dt;
    if (f.timer <= 0) {
      const a = Math.random() * Math.PI * 2, dist = d.size * (2 + Math.random() * 2.5) * m.scale.x;
      const tx = p.x + Math.sin(a) * dist, tz = p.z + Math.cos(a) * dist;
      if (frogOk(tx, tz)) {
        m.rotation.y = a; // regarde dans la direction du saut
        d.rot = a;
        f.hop = { k: 0, dur: 0.5 + Math.random() * 0.15, x0: p.x, z0: p.z, x1: tx, z1: tz, height: d.size * 0.6 };
      } else f.timer = 0.4;
    }
  }
}

$('frogAdd').addEventListener('click', () => {
  const s = findFrogSpot();
  if (!s) { setStatus('Aucun endroit pour poser une grenouille.'); return; }
  const d = newFrogDesc(s.x, s.z);
  frogsData.push(d);
  select(addFrog(d));
});
const clearFrogs = () => {
  frogsData = [];
  select(null);
  trees.filter((t) => t.userData.frog).forEach((t) => { world.remove(t); disposeMesh(t); });
  trees = trees.filter((t) => !t.userData.frog);
};

// ---------- Bergeronnette grise : trottine au sol et hoche la queue ----------
let wagtailsData = []; // objets du monde, enregistrés dans le JSON

// ----- sarcelle d'hiver : tête rousse à bandeau vert liseré de jaune, corps gris, ventre clair, arrière noir et crème -----
function makeTeal(d) {
  const u = d.size, A = d.alba, SH = d.kind === 'shoveler'; // canard souchet : tête verte, énorme bec, flancs roux
  const tone = (hex, dl = 0) => birdTone(hex, dl, A);
  const parts = [], hp = []; // hp : cou + tête + bec, objet à part qui pivote
  const HP = V3(0, 0.55 * u, 0.24 * u);
  const body = new THREE.IcosahedronGeometry(1, 1);
  body.scale(0.17 * u, 0.17 * u, 0.36 * u);
  body.translate(0, 0.44 * u, 0);
  parts.push(finish(body, (x, y, z) => {
    if (SH) {
      if (z < -0.3 * u) return tone('#1d1e22');                                                          // croupe noire
      if (y > 0.53 * u && z < 0.16 * u) return tone('#1f4d3d', (hashPos(x, y, z, 9) - 0.5) * 0.04);     // dos vert sombre
      if (y < 0.44 * u && z > -0.2 * u && z < 0.1 * u) return tone('#d9643a', (hashPos(x, y, z, 6) - 0.5) * 0.04); // plaque rousse sous le flanc
      return tone('#f6f4ee');                                                                            // poitrail et flancs blancs
    }
    if (z > 0.22 * u && y > 0.4 * u) return hashPos(x, y, z, 17) > 0.9 ? tone('#8b5a40') : tone('#e8dccb'); // poitrine crème tachetée
    if (y < 0.4 * u) return z < -0.3 * u ? tone('#1d1e22') : tone('#f3f2ee');                                 // ventre blanc, dessous de queue noir
    return z < -0.3 * u ? tone('#1d1e22') : tone('#a7aeb2', (hashPos(x, y, z, 9) - 0.5) * 0.04);              // flancs et dos gris
  }));
  for (const sx of [-1, 1]) {
    const wing = new THREE.IcosahedronGeometry(1, 1); // aile repliée : pointes effilées vers l'arrière, relevées
    wing.scale(0.04 * u, 0.09 * u, 0.3 * u);
    wing.rotateX(0.22);
    wing.translate(sx * 0.135 * u, 0.5 * u, -0.1 * u);
    parts.push(finish(wing, (x, y, z) => (SH ? tone('#1d4a3a', (hashPos(x, y, z, 3) - 0.5) * 0.04) : y < 0.44 * u ? tone('#1f5c3a') : tone('#98a0a6')))); // miroir vert en bas
    if (SH) { // scapulaires : fines rayures blanches obliques sur le dos
      for (let k = 0; k < 4; k++) {
        const st = new THREE.IcosahedronGeometry(1, 0);
        st.scale(0.008 * u, 0.006 * u, 0.075 * u);
        st.rotateY(sx * 0.35);
        st.translate(sx * (0.1 - k * 0.006) * u, 0.585 * u, (0.08 - k * 0.075) * u);
        parts.push(finish(st, () => tone('#fbfaf5')));
      }
    }
    const line = new THREE.IcosahedronGeometry(1, 0); // trait noir le long du flanc
    line.scale(0.012 * u, 0.012 * u, 0.2 * u);
    line.translate(sx * 0.165 * u, 0.5 * u, -0.02 * u);
    parts.push(finish(line, () => tone('#17181b')));
  }
  const neck = new THREE.IcosahedronGeometry(1, 1);
  neck.scale(0.085 * u, 0.12 * u, 0.09 * u);
  neck.translate(0, 0.57 * u - HP.y, 0.25 * u - HP.z);
  hp.push(finish(neck, (x, y, z) => (SH ? (y + HP.y < 0.5 * u ? tone('#f4f2ec') : tone('#1f6a4e')) : y + HP.y < 0.5 * u ? tone('#e8dccb') : tone('#ad4a1f'))));
  const head = new THREE.IcosahedronGeometry(1, 2);
  head.scale(SH ? 0.112 * u : 0.1 * u, SH ? 0.11 * u : 0.098 * u, SH ? 0.122 * u : 0.125 * u);
  head.translate(0, 0.66 * u - HP.y, 0.3 * u - HP.z);
  hp.push(finish(head, (x, yy, zz) => {
    const y = yy + HP.y, z = zz + HP.z; // repère du corps (la tête est recentrée sur son pivot)
    if (SH) return tone('#1b5a3e', (hashPos(x, y, z, 5) - 0.5) * 0.04); // tête vert sombre à reflets
    const side = Math.abs(x) > 0.045 * u;
    if (side && z < 0.34 * u && y > 0.625 * u && y < 0.7 * u) return y > 0.683 * u ? tone('#eadf9a') : tone('#2f9b55'); // bandeau vert, liseré jaune
    return tone('#b04b1f', (hashPos(x, y, z, 5) - 0.5) * 0.03);
  }));
  const bill = new THREE.ConeGeometry(0.034 * u, 0.17 * u, 4, 1);
  bill.rotateX(Math.PI / 2);
  bill.scale(SH ? 4.4 : 2.3, SH ? 0.5 : 0.45, SH ? 1.45 : 1); // bec large et plat (en spatule chez le souchet)
  if (SH) bill.rotateX(-0.14); // la pointe retombe
  bill.translate(0, 0.655 * u - HP.y, (SH ? 0.5 : 0.47) * u - HP.z);
  hp.push(finish(bill, (x, y, z) => tone(SH ? (z + HP.z > 0.62 * u ? '#3a3e45' : '#555b64') : '#26282b')));
  for (const sx of [-1, 1]) {
    const eye = new THREE.IcosahedronGeometry(1, 0);
    const er = SH ? 0.024 : 0.013;
    eye.scale(er * u, er * u, er * u);
    eye.translate(sx * (SH ? 0.103 : 0.094) * u, 0.675 * u - HP.y, 0.345 * u - HP.z);
    hp.push(finish(eye, () => tone(SH ? '#f2c21c' : '#0b0b0c')));
    if (SH) { // pupille noire
      const pu = new THREE.IcosahedronGeometry(1, 0);
      pu.scale(0.012 * u, 0.012 * u, 0.012 * u);
      pu.translate(sx * 0.121 * u, 0.675 * u - HP.y, 0.352 * u - HP.z);
      hp.push(finish(pu, () => tone('#0b0b0c')));
    }
  }
  const bodyGeo = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());
  const headGeo = mergeGeometries(hp);
  hp.forEach((q) => q.dispose());
  // arrière noir bordé de crème : objet à part qui bascule autour de la croupe
  const tp = [];
  const tail = new THREE.OctahedronGeometry(1, 0);
  tail.scale(0.075 * u, 0.03 * u, 0.15 * u);
  tail.translate(0, 0.01 * u, -0.1 * u);
  tp.push(finish(tail, (x, y) => (Math.abs(x) > 0.045 * u ? tone('#e9d9a3') : tone('#1b1c1f'))));
  const tailGeo = mergeGeometries(tp);
  tp.forEach((q) => q.dispose());
  return { body: bodyGeo, tail: tailGeo, pivot: V3(0, 0.46 * u, -0.3 * u), head: headGeo, headPivot: HP };
}

// ----- martin-pêcheur : droit sur son perchoir, dos bleu, ventre orange, long bec ; la tête pivote -----
function makeKingfisher(d) {
  const u = d.size, A = d.alba;
  const tone = (hex, dl = 0) => birdTone(hex, dl, A);
  const parts = [], hp = [];
  const HP = V3(0, 0.3 * u, 0.06 * u);
  for (const sx of [-1, 1]) { // pattes courtes et rouges
    const leg = new THREE.CylinderGeometry(0.008 * u, 0.01 * u, 0.07 * u, 4, 1);
    leg.translate(sx * 0.04 * u, 0.035 * u, 0.02 * u);
    parts.push(finish(leg, () => tone('#d9482a')));
    const foot = new THREE.BoxGeometry(0.03 * u, 0.01 * u, 0.05 * u);
    foot.translate(sx * 0.04 * u, 0.005 * u, 0.035 * u);
    parts.push(finish(foot, () => tone('#d9482a')));
  }
  const body = new THREE.IcosahedronGeometry(1, 1);
  body.scale(0.085 * u, 0.1 * u, 0.15 * u);
  const bg = finish(body, (x, y, z) => (y < 0.0 ? tone('#ee8f33') : tone('#2b7fc6', (hashPos(x, y, z, 4) - 0.5) * 0.04))); // ventre orange, dos bleu
  bg.rotateX(-1.0); // buste relevé : poitrine en haut, queue vers le bas
  bg.translate(0, 0.17 * u, -0.01 * u);
  parts.push(bg);
  for (const sx of [-1, 1]) {
    const wing = new THREE.IcosahedronGeometry(1, 0);
    wing.scale(0.022 * u, 0.1 * u, 0.065 * u);
    wing.rotateX(0.15);
    wing.translate(sx * 0.082 * u, 0.2 * u, -0.07 * u);
    parts.push(finish(wing, (x, y) => (y < 0.18 * u ? tone('#3fb3d6') : tone('#2468b0'))));
    const flash = new THREE.IcosahedronGeometry(1, 0); // bande turquoise du dos
    flash.scale(0.008 * u, 0.09 * u, 0.03 * u);
    flash.translate(sx * 0.02 * u, 0.2 * u, -0.1 * u);
    parts.push(finish(flash, () => tone('#4fd0dc')));
  }
  const tail = new THREE.ConeGeometry(0.035 * u, 0.1 * u, 4, 1);
  tail.rotateX(Math.PI - 0.25);
  tail.translate(0, 0.045 * u, -0.1 * u);
  parts.push(finish(tail, () => tone('#2268ae')));
  const head = new THREE.IcosahedronGeometry(1, 1);
  head.scale(0.075 * u, 0.072 * u, 0.09 * u);
  head.translate(0, 0.0, 0.02 * u);
  hp.push(finish(head, (x, y, z) => {
    if (y < -0.03 * u && z > 0.0) return tone('#f7f5ee');                                   // gorge blanche
    if (Math.abs(x) > 0.045 * u && z < 0.03 * u && y < 0.03 * u && y > -0.04 * u) return tone('#ee8f33'); // joue orange
    if (Math.abs(x) > 0.05 * u && Math.abs(z - 0.06 * u) < 0.02 * u && y > -0.01 * u) return tone('#f7f5ee'); // tache blanche derrière le bec
    return tone('#2a76bd', (hashPos(x, y, z, 5) - 0.5) * 0.04);
  }));
  const bill = new THREE.ConeGeometry(0.026 * u, 0.3 * u, 4, 1);
  bill.rotateX(Math.PI / 2);
  bill.translate(0, -0.005 * u, 0.2 * u);
  hp.push(finish(bill, (x, y) => (y < -0.012 * u ? tone('#d9482a') : tone('#1d2026')))); // mandibule inférieure rouge
  for (const sx of [-1, 1]) {
    const eye = new THREE.IcosahedronGeometry(1, 0);
    eye.scale(0.014 * u, 0.014 * u, 0.014 * u);
    eye.translate(sx * 0.068 * u, 0.012 * u, 0.05 * u);
    hp.push(finish(eye, () => tone('#0b0b0c')));
  }
  const bodyGeo = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());
  const headGeo = mergeGeometries(hp);
  hp.forEach((q) => q.dispose());
  const tg = new THREE.ConeGeometry(0.0001, 0.0001, 3, 1); // pas de queue articulée : objet vide
  return { body: bodyGeo, tail: tg, pivot: V3(0, 0.1 * u, -0.1 * u), head: headGeo, headPivot: HP };
}

function makeWagtail(d) {
  if (d.kind === 'custom') return makeCustom(d);
  if (d.kind === 'kingfisher') return makeKingfisher(d);
  if (d.kind === 'teal' || d.kind === 'shoveler') return makeTeal(d);
  const u = d.size, A = d.alba;
  const tone = (hex, dl = 0) => birdTone(hex, dl, A);
  const parts = [];
  for (const sx of [-1, 1]) { // pattes fines et noires
    parts.push(finish(limb(V3(sx * 0.06 * u, 0.34 * u, 0), V3(sx * 0.06 * u, 0.02 * u, 0.03 * u), 0.014 * u, 0.01 * u, 4), () => tone('#2b2b2e')));
    const foot = new THREE.ConeGeometry(0.02 * u, 0.12 * u, 3, 1);
    foot.rotateX(Math.PI / 2);
    foot.translate(sx * 0.06 * u, 0.012 * u, 0.08 * u);
    parts.push(finish(foot, () => tone('#2b2b2e')));
  }
  const body = new THREE.IcosahedronGeometry(1, 1);
  body.scale(0.15 * u, 0.14 * u, 0.3 * u);
  body.translate(0, 0.46 * u, 0);
  parts.push(finish(body, (x, y, z) => {
    if (z > 0.15 * u && y < 0.5 * u) return tone('#25292f');   // bavette noire
    return y < 0.45 * u ? tone('#f6f6f3') : tone('#8f979f', (hashPos(x, y, z, 9) - 0.5) * 0.03); // ventre blanc, dos gris
  }));
  for (const sx of [-1, 1]) { // ailes repliées, gris foncé liséré de blanc
    const wing = new THREE.IcosahedronGeometry(1, 0);
    wing.scale(0.035 * u, 0.09 * u, 0.24 * u);
    wing.rotateZ(sx * 0.2);
    wing.translate(sx * 0.13 * u, 0.5 * u, -0.05 * u);
    parts.push(finish(wing, (x, y) => (y < 0.46 * u ? tone('#eceeef') : tone('#6d747c'))));
  }
  const head = new THREE.IcosahedronGeometry(1, 1);
  head.scale(0.1 * u, 0.095 * u, 0.11 * u);
  head.translate(0, 0.6 * u, 0.3 * u);
  parts.push(finish(head, (x, y, z) => (y > 0.62 * u ? tone('#25292f') : y < 0.56 * u ? tone('#25292f') : tone('#f6f6f3')))); // calotte et menton noirs, joues blanches
  const beak = new THREE.ConeGeometry(0.02 * u, 0.12 * u, 4, 1);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.6 * u, 0.44 * u);
  parts.push(finish(beak, () => tone('#33363b')));
  for (const sx of [-1, 1]) {
    const eye = new THREE.IcosahedronGeometry(1, 0);
    eye.scale(0.014 * u, 0.014 * u, 0.014 * u);
    eye.translate(sx * 0.085 * u, 0.62 * u, 0.34 * u);
    parts.push(finish(eye, () => tone('#0d0d0d')));
  }
  const bodyGeo = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());
  // longue queue noire bordée de blanc : objet à part qui bascule autour de la croupe
  const tp = [];
  const tail = new THREE.OctahedronGeometry(1, 0);
  tail.scale(0.06 * u, 0.012 * u, 0.34 * u);
  tail.translate(0, 0, -0.3 * u);
  tp.push(finish(tail, (x) => (Math.abs(x) > 0.035 * u ? tone('#f1f1ee') : tone('#25292f'))));
  const tailGeo = mergeGeometries(tp);
  tp.forEach((q) => q.dispose());
  return { body: bodyGeo, tail: tailGeo, pivot: V3(0, 0.47 * u, -0.22 * u) };
}

function newWagtailDesc(x, z) {
  const rng = mulberry32(61000 + birdCounter++ * 6151);
  return { seed: Math.floor(rng() * 1e6), size: num('wagtailSize') * (0.9 + rng() * 0.2), speed: num('wagtailSpeed'), alba: $('alba').checked, phase: rng() * 6.28, x, z, rot: rng() * Math.PI * 2, scale: 1 };
}

// reste sur la terre ferme, jamais dans l'eau
const isTeal = (d) => d.kind === 'teal' || d.kind === 'shoveler'; // canards : nagent sur l'eau
const tealY = (d, sc) => waterLevel() - 0.355 * d.size * sc; // 1/4 de la hauteur du corps (0,34 u) sous la surface : fond du ventre à 0,27 u
const wagtailOk = (x, z) => Math.hypot(x, z) < groundR * 0.95 && (!$('water').checked || !currentHF || currentHF(x, z) > waterLevel() + 0.03);
function findWagtailSpot() {
  const water = $('water').checked && currentHF;
  for (let k = 0; k < 250; k++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * groundR * 0.9;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!wagtailOk(x, z)) continue;
    if (water && k < 200) { const h = currentHF(x, z); if (h > waterLevel() + 0.6) continue; } // d'abord les rives
    return { x, z };
  }
  return null;
}

// perchoir : terre ferme près de l'eau (rive), sinon n'importe où
function findKingfisherSpot() {
  const water = $('water').checked && currentHF;
  for (let k = 0; k < 400; k++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * groundR * 0.9;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!wagtailOk(x, z)) continue;
    if (water && k < 350) {
      const h = currentHF(x, z);
      if (h < waterLevel() + 0.02 || h > waterLevel() + 0.4) continue;
      let wet = false;
      for (let j = 0; j < 8 && !wet; j++) { const b = (j / 8) * Math.PI * 2; wet = inWater(x + Math.cos(b) * 0.5, z + Math.sin(b) * 0.5); }
      if (!wet) continue;
    }
    return { x, z };
  }
  return null;
}
function addWagtail(d) {
  if (!d.speed) d.speed = 1;
  const g = makeWagtail(d);
  const m = addTree(g.body, d.x, (isTeal(d) ? tealY(d, d.scale) : currentHF ? currentHF(d.x, d.z) : 0) + (g.yOff || 0) * d.scale, d.z, d.scale, d.rot, d.size * 0.8 * d.scale);
  const tail = new THREE.Mesh(g.tail, matTree);
  tail.position.copy(g.pivot);
  tail.castShadow = m.castShadow;
  m.add(tail);
  let head = null;
  if (g.head) { head = new THREE.Mesh(g.head, matTree); head.position.copy(g.headPivot); head.castShadow = m.castShadow; m.add(head); }
  let beakLow = null;
  const legs = (g.legParts || []).map((l) => { // pattes gauche et droite : cuisse (hanche) → jambe (genou) → griffes (cheville)
    const mk = (part, parent) => { if (!part) return null; const lm = new THREE.Mesh(part.geo, matTree); lm.position.copy(part.pivot); lm.castShadow = m.castShadow; parent.add(lm); return lm; };
    const thigh = mk(l.thigh, m), shin = mk(l.shin, thigh || m), foot = mk(l.foot, shin || thigh || m);
    return { thigh, shin, foot };
  });
  if (g.beakLow && head) { beakLow = new THREE.Mesh(g.beakLow, matTree); beakLow.position.copy(g.beakPivot); beakLow.castShadow = m.castShadow; head.add(beakLow); }
  const wings = ['wingL', 'wingR'].filter((k) => g[k]).map((k) => { const wm = new THREE.Mesh(g[k], matTree); wm.position.copy(g.wingPivot); wm.castShadow = m.castShadow; m.add(wm); wm.userData.side = k === 'wingL' ? -1 : 1; return wm; }); // ailes : pivotent autour de la ligne du dos
  m.userData.wagtail = { d, tail, head, legs, beakLow, wings, wingAxis: g.wingAxis || V3(0, 0, -1), rig: !!g.rig, gait: g.gait || 'hop', yOff: g.yOff || 0, mode: 'idle', timer: 0.5 + Math.random() * 1.5, tgt: d.rot, step: Math.random() * 6 };
  return m;
}
function restoreWagtails() {
  wagtailsData.forEach((d) => {
    if (isTeal(d)) { if (!inWater(d.x, d.z)) { const s = findWaterSpot(); if (!s) return; d.x = s.x; d.z = s.z; } }
    else if (!wagtailOk(d.x, d.z)) { const s = findWagtailSpot(); if (!s) return; d.x = s.x; d.z = s.z; }
    d.alba = $('alba').checked;
    addWagtail(d);
  });
}

// immobile (la queue hoche) -> se tourne -> trottine par petits bonds, la queue basculant à chaque pas -> s'arrête…
// perché au bord de l'eau : regarde autour, hoche la tête, de temps en temps pique dans l'eau et revient sur son perchoir
function kingfisherTick(m, dt, t) {
  const w = m.userData.wagtail, d = w.d, p = m.position, sel = m === selected;
  m.rotation.order = 'YXZ';
  if (!w.perch) w.perch = { x: p.x, y: p.y, z: p.z, rot: m.rotation.y };
  const hd = w.head, ph = d.phase;
  if (sel) { w.mode = 'perch'; m.visible = true; m.rotation.x = 0; w.perch = { x: p.x, y: p.y, z: p.z, rot: m.rotation.y }; }
  if (w.mode !== 'dive') {
    w.timer -= dt;
    const look = Math.sin(t * 0.7 + ph) * 0.9 + Math.sin(t * 1.9 + ph * 2) * 0.2;
    hd.rotation.y += (look - hd.rotation.y) * Math.min(1, dt * 5);
    hd.rotation.x += ((Math.sin(t * 1.4 + ph) * 0.1 + Math.max(0, Math.sin(t * 0.5 + ph)) ** 6 * 0.5) - hd.rotation.x) * Math.min(1, dt * 6); // regarde l'eau : bec baissé
    if (!sel && w.timer <= 0 && inWaterSpotsNear(w.perch, w)) {
      w.mode = 'dive'; w.t0 = t; m.visible = true;
      w.timer = 7 + Math.random() * 9;
    } else if (w.timer <= 0) w.timer = 4 + Math.random() * 4;
    return;
  }
  // plongeon : trajet en arc vers l'eau, sous l'eau, puis retour en arc
  const T = 1.7, s = (t - w.t0) / T, P = w.perch, Q = w.target, yw = waterLevel();
  const dx = Q.x - P.x, dz = Q.z - P.z, toward = Math.atan2(dx, dz);
  hd.rotation.set(0, 0, 0);
  if (s < 0.38) { // pique
    const e = s / 0.38;
    p.x = P.x + dx * e; p.z = P.z + dz * e;
    p.y = P.y + (yw - 0.02 - P.y) * e * e + Math.sin(Math.PI * Math.min(1, e * 1.2)) * 0.22 * d.size;
    m.rotation.y = toward; m.rotation.x = 1.2 * e;
    m.visible = true;
  } else if (s < 0.58) { // sous l'eau
    m.visible = false;
    p.x = Q.x; p.z = Q.z; p.y = yw - 0.1;
  } else if (s < 1) { // remonte, repart vers le perchoir
    const e = (s - 0.58) / 0.42;
    p.x = Q.x - dx * e; p.z = Q.z - dz * e;
    p.y = yw + (P.y - yw) * e + Math.sin(Math.PI * e) * 0.24 * d.size;
    m.rotation.y = toward + Math.PI; m.rotation.x = -0.5 * (1 - e);
    m.visible = true;
  } else {
    w.mode = 'perch'; m.visible = true;
    p.set(P.x, P.y, P.z); m.rotation.x = 0; m.rotation.y = P.rot;
  }
}
// cherche un point d'eau à 0,3–0,9 du perchoir ; le mémorise comme cible du plongeon
function inWaterSpotsNear(P, w) {
  if (!$('water').checked || !currentHF) return false;
  for (let k = 0; k < 14; k++) {
    const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.6, x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
    if (inWater(x, z)) { w.target = { x, z }; return true; }
  }
  return false;
}

// mésange : très vive. Tout se fait par à-coups : la tête saute d'une direction à l'autre (saccades), elle sautille par rafales de quelques bonds
// en changeant de cap à chaque bond, picore vite en relevant la tête entre deux coups, et marque de courtes pauses aux aguets.
function customRigTick(m, dt, t) {
  const w = m.userData.wagtail, d = w.d, p = m.position, sel = m === selected, S = m.scale.x, ph = d.phase;
  const ground = (x, z) => (currentHF ? currentHF(x, z) : 0);
  m.rotation.order = 'YXZ';
  if (w.lookT == null) { w.lookT = 0; w.lookY = 0; w.lookX = 0; w.lookZ = 0; w.flick = 0; w.flickT = 1; w.leanT = 1; w.lean = 0; }
  const calm = w.mode === 'idle' && !!w.calm; // moment calme : regard plus lent et plus posé, pas de coups de queue ni d'inclinaison
  w.leanT -= dt;
  if (w.leanT <= 0) { w.leanT = 0.6 + Math.random() * 2; w.lean = calm || Math.random() < 0.45 ? 0 : (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.2); } // nouvelle inclinaison (ou retour droit)
  let hop = 0, crouch = 0, pitch = 0, headX = 0, open = 0, tailX = 0.1, headY = null, snap = 22, swing = 0;
  // saccades du regard : une nouvelle direction toutes les 0,15 à 0,6 s, atteinte presque instantanément
  w.lookT -= dt;
  if (w.lookT <= 0) { const amp = calm ? 0.5 : 1; w.lookT = calm ? 0.7 + Math.random() * 1.6 : 0.15 + Math.random() * 0.45; w.lookY = (Math.random() - 0.5) * 1.8 * amp; w.lookX = (Math.random() - 0.5) * 0.5 * amp; w.lookZ = (Math.random() - 0.5) * 0.35 * amp; }
  // coups de queue secs, de temps en temps
  w.flickT -= dt;
  if (w.flickT <= 0) { w.flickT = 0.4 + Math.random() * 1.6; if (!calm) w.flick = 1; }
  w.flick = Math.max(0, w.flick - dt * 6);
  tailX += 0.35 * w.flick;
  if (!sel) {
    w.timer -= dt;
    if (w.mode === 'idle') { // aux aguets : immobile, la tête fouille partout, parfois un petit sursaut
      if (!calm && t % 5 < 0.5) open = 0.6 * Math.pow(Math.max(0, Math.sin(2 * Math.PI * 6 * t)), 1.5); // pépie
      crouch = 0.08 * Math.max(0, Math.sin(t * 9 + ph)) * w.flick;
      if (w.timer <= 0) {
        const r = Math.random();
        w.calm = false;
        if (r < 0.22) { w.calm = true; w.timer = 2 + Math.random() * 4; } // moment calme : elle reste posée 2 à 6 s
        else if (r < 0.4) { w.mode = 'turn'; w.tgt = m.rotation.y + (Math.random() - 0.5) * 4; w.timer = 0.5; }
        else if (r < 0.7) { w.mode = 'run'; w.timer = w.gait === 'walk' ? ((2 + Math.floor(Math.random() * 9)) * Math.PI) / 18 : ((2 + Math.floor(Math.random() * 2)) * Math.PI) / 28; w.step = 0; } // 2 ou 3 bonds d'un coup, ou quelques pas
        else { w.mode = 'peck'; w.peckT = 0; w.timer = 0.55; }
      }
    } else if (w.mode === 'turn') { // volte-face quasi instantanée
      let dh = w.tgt - m.rotation.y;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const st = clamp(dh, -dt * 16, dt * 16);
      m.rotation.y += st; d.rot = m.rotation.y;
      crouch = 0.2;
      if (Math.abs(dh) < 0.05 || w.timer <= 0) { w.mode = Math.random() < 0.6 ? 'run' : 'idle'; w.timer = w.mode === 'run' ? (w.gait === 'walk' ? ((2 + Math.floor(Math.random() * 9)) * Math.PI) / 18 : ((2 + Math.floor(Math.random() * 2)) * Math.PI) / 28) : 0.3 + Math.random() * 0.8; w.step = 0; }
    } else if (w.mode === 'run' && w.gait === 'walk') { // marche : les pattes alternent, le corps ondule à peine, la tête avance par à-coups
      const sp = d.size * 4.2 * d.speed * S, a = m.rotation.y;
      const nx = p.x + Math.sin(a) * sp * dt, nz = p.z + Math.cos(a) * sp * dt;
      if (wagtailOk(nx, nz)) {
        p.x = nx; p.z = nz; d.x = nx; d.z = nz;
        const prevStep = w.step;
        w.step += dt * 18 * Math.min(2, d.speed); // pas rapides
        if (Math.floor(prevStep / Math.PI) !== Math.floor(w.step / Math.PI)) { m.rotation.y += (Math.random() - 0.5) * 0.7; d.rot = m.rotation.y; } // nouveau pas : légère correction de cap
        swing = 1;
        hop = d.size * 0.012 * S * Math.abs(Math.cos(w.step));
        headX = 0.08 * Math.max(0, Math.sin(w.step * 2)); // petit coup de tête à chaque pas
        headY = 0; snap = 20;
        tailX = 0.1 + 0.08 * Math.sin(w.step);
      } else { w.mode = 'turn'; w.tgt = Math.atan2(-p.x, -p.z) + (Math.random() - 0.5) * 1.2; w.timer = 0.6; }
      if (w.timer <= 0) { w.mode = Math.random() < 0.5 ? 'peck' : 'idle'; w.peckT = 0; w.timer = w.mode === 'peck' ? 0.55 : 0.3 + Math.random() * 1.2; }
    } else if (w.mode === 'run') { // rafale de bonds rapides ; à chaque bond, un petit changement de cap
      const sp = d.size * 8 * d.speed * S, a = m.rotation.y;
      const nx = p.x + Math.sin(a) * sp * dt, nz = p.z + Math.cos(a) * sp * dt;
      if (wagtailOk(nx, nz)) {
        p.x = nx; p.z = nz; d.x = nx; d.z = nz;
        const prev = w.step;
        w.step += dt * 28 * Math.min(2, d.speed); // ~4,5 bonds par seconde
        if (Math.floor(prev / Math.PI) !== Math.floor(w.step / Math.PI)) { m.rotation.y += (Math.random() - 0.5) * 0.9; d.rot = m.rotation.y; } // nouveau bond : nouveau cap
        const sn = Math.sin(w.step);
        hop = Math.max(0, sn) * d.size * 0.1 * S; // petits bonds secs
        crouch = Math.max(0, -sn) * 0.6;
        headX = Math.max(0, sn) * 0.12 - Math.max(0, -sn) * 0.1;
        headY = 0; snap = 30;
        tailX = 0.15 + 0.25 * sn;
      } else { w.mode = 'turn'; w.tgt = Math.atan2(-p.x, -p.z) + (Math.random() - 0.5) * 1.2; w.timer = 0.6; }
      if (w.timer <= 0) { w.mode = Math.random() < 0.5 ? 'peck' : 'idle'; w.peckT = 0; w.timer = w.mode === 'peck' ? 0.55 : 0.2 + Math.random() * 0.9; }
    } else { // picore vite : plonge, coup de bec, relève sèchement la tête et regarde, replonge
      w.peckT += dt;
      const q = Math.min(1, w.peckT / 0.55), e0 = q < 0.3 ? q / 0.3 : q < 0.45 ? 1 : q < 0.7 ? 1 - (q - 0.45) / 0.25 : 0, e = e0 * e0 * (3 - 2 * e0);
      pitch = 0.4 * e; headX = 0.95 * e - 0.25 * (1 - e); crouch = 0.35 * e; tailX = 0.1 + 0.3 * e;
      headY = e > 0.3 ? 0 : null; snap = 30;
      if (e > 0.8) open = (e - 0.8) / 0.2;
      if (w.timer <= 0) { w.mode = 'idle'; w.timer = 0.2 + Math.random() * 0.8; }
    }
  }
  p.y = ground(p.x, p.z) + w.yOff * S * (1 - 0.35 * crouch) + hop;
  m.rotation.x += (pitch - m.rotation.x) * Math.min(1, dt * 16);
  const leanTgt = w.mode === 'idle' ? w.lean : 0; // on ne se penche qu'à l'arrêt
  m.rotation.z += (leanTgt - m.rotation.z) * Math.min(1, dt * 7);
  w.legs.forEach((lg, i) => { // les pattes restent presque verticales quand le corps bascule ou penche ; en marche, elles alternent : la cuisse balance, le genou plie et les griffes se relèvent pendant que la patte avance
    const ph = w.step + (i === 0 ? 0 : Math.PI), sn = Math.sin(ph), s1 = swing ? Math.sign(sn) * Math.pow(Math.abs(sn), 0.45) : 0, lift = swing ? Math.pow(Math.max(0, Math.cos(ph)), 0.5) : 0; // courbes raidies : la patte passe vite d'une position à l'autre et y reste (saccadé)
    if (!lg.thigh) return;
    lg.thigh.rotation.x = -m.rotation.x - 0.45 * s1; lg.thigh.rotation.z = -0.7 * m.rotation.z; lg.thigh.scale.y = 1 - 0.35 * crouch;
    if (lg.shin) lg.shin.rotation.x = 0.9 * lift;
    if (lg.foot) lg.foot.rotation.x = -0.5 * lift;
  });
  w.tail.rotation.x += (tailX - w.tail.rotation.x) * Math.min(1, dt * 14);
  if (w.head) {
    const hd = w.head, k = Math.min(1, dt * snap);
    hd.rotation.y += ((headY ?? w.lookY) - hd.rotation.y) * k;
    hd.rotation.x += ((headX + (headY == null ? w.lookX : 0)) - hd.rotation.x) * k;
    hd.rotation.z += ((headY == null ? w.lookZ : 0) - hd.rotation.z) * k;
  }
  if (w.beakLow) w.beakLow.rotation.x = 0.4 * open;
  if (w.head) {
    const hy = w.head.rotation.y;
    w.tail.rotation.y += ((-0.9 * m.rotation.z + 0.3 * hy) - w.tail.rotation.y) * Math.min(1, dt * 8); // la queue suit un peu le regard
    const spread = 0.12 * Math.abs(hy) + 0.02 * Math.max(0, Math.sin(t * 2.3 + ph)); // les ailes s'écartent un peu du corps par le bas
    for (const wm of w.wings || []) wm.quaternion.setFromAxisAngle(w.wingAxis, -wm.userData.side * spread);
  }
}
function wagtailTick(m, dt, t) {
  if (m.userData.wagtail.d.kind === 'kingfisher') { kingfisherTick(m, dt, t); return; }
  if (m.userData.wagtail.rig) { customRigTick(m, dt, t); return; }
  const w = m.userData.wagtail, d = w.d, p = m.position, sel = m === selected;
  const ground = (x, z) => (currentHF ? currentHF(x, z) : 0);
  let bob = 0.1 + 0.3 * Math.sin(t * 5.5 + d.phase); // arrêt : hochements lents, par rafales
  let hop = 0;
  const teal = isTeal(d);
  const dipRaw = teal ? Math.max(0, Math.sin(t * 0.45 + d.phase * 2)) ** 3 : 0;  // de temps en temps : cul par-dessus tête
  const dabble = dipRaw > 0.25;
  w.up = (w.up || 0) + ((dabble ? 1 : 0) - (w.up || 0)) * Math.min(1, dt * 2.5);
  if (teal) { m.rotation.order = 'YXZ'; m.rotation.x = w.up * 1.3; }          // bascule vers l'avant : bec au fond, queue en l'air
  if (!sel) {
    w.timer -= dt;
    if (w.mode === 'idle') {
      bob = 0.12 + 0.28 * Math.sin(t * 6 + d.phase) * Math.max(0, Math.sin(t * 0.8 + d.phase * 2) + 0.4);
      if (w.timer <= 0) {
        if (Math.random() < 0.55) { w.mode = 'turn'; w.tgt = m.rotation.y + (Math.random() - 0.5) * 3.2; w.timer = 1.2; }
        else { w.mode = 'run'; w.timer = 0.7 + Math.random() * 1.4; }
      }
    } else if (w.mode === 'turn') {
      let dh = w.tgt - m.rotation.y;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const st = clamp(dh, -dt * 7, dt * 7);
      m.rotation.y += st; d.rot = m.rotation.y;
      bob = 0.1 + 0.25 * Math.sin(t * 9 + d.phase);
      if (Math.abs(dh) < 0.05 || w.timer <= 0) { w.mode = 'run'; w.timer = 0.7 + Math.random() * 1.4; }
    } else { // trottine : petits bonds rapides en avance
      const sp = d.size * 5 * d.speed * m.scale.x * (1 - (w.up || 0)), a = m.rotation.y;
      const nx = p.x + Math.sin(a) * sp * dt, nz = p.z + Math.cos(a) * sp * dt;
      if (teal ? inWater(nx, nz) : wagtailOk(nx, nz)) {
        p.x = nx; p.z = nz; d.x = nx; d.z = nz;
        w.step += dt * 16 * Math.min(2, d.speed);
        if (!teal) hop = Math.abs(Math.sin(w.step)) * d.size * 0.1 * m.scale.x;
        bob = teal ? 0.05 : 0.15 + 0.4 * Math.sin(w.step * 1.5);
      } else if (teal) { w.mode = 'turn'; w.tgt = m.rotation.y + Math.PI + (Math.random() - 0.5) * 1.4; w.timer = 1.5; } // rive : demi-tour
      else { w.mode = 'turn'; w.tgt = Math.atan2(-p.x, -p.z) + (Math.random() - 0.5) * 1.2; w.timer = 1.5; } // bord / eau : demi-tour vers l'intérieur
      if (w.timer <= 0) { w.mode = 'idle'; w.timer = 0.6 + Math.random() * 2; }
    }
    p.y = teal ? tealY(d, m.scale.x) + Math.sin(t * 1.6 + d.phase) * d.size * 0.012 : ground(p.x, p.z) + hop; // sur l'eau : légère houle
  }
  w.tail.rotation.x = teal ? bob * 0.3 : bob;
  if (w.head) {
    const hd = w.head, ph = d.phase;
    const dip = w.up || 0;
    const look = Math.sin(t * 0.8 + ph) * 0.5 + Math.sin(t * 2.1 + ph * 3) * 0.15; // regard qui balaie
    hd.rotation.y += (look * (1 - dip) - hd.rotation.y) * Math.min(1, dt * 6);
    hd.rotation.x += ((dip * 0.2 + Math.sin(t * 3 + ph) * 0.04 + (w.mode === 'run' ? Math.sin(w.step * 0.8) * 0.07 : 0)) - hd.rotation.x) * Math.min(1, dt * 6);
    hd.rotation.z = Math.sin(t * 1.1 + ph * 2) * 0.08;
  }
}

function addDuckKind(kind) {
  if (!$('water').checked) { setStatus("Active l'eau (outil Eau) et creuse un lac d'abord."); return; }
  const s = findWaterSpot();
  if (!s) { setStatus("Aucun lac assez profond : creuse avec l'outil Eau."); return; }
  const d = { ...newWagtailDesc(s.x, s.z), kind, size: num(kind === 'teal' ? 'tealSize' : 'shovelerSize') * (0.92 + Math.random() * 0.16), speed: 0.2 };
  wagtailsData.push(d);
  select(addWagtail(d));
}
$('tealAdd').addEventListener('click', () => addDuckKind('teal'));
$('shovelerAdd').addEventListener('click', () => addDuckKind('shoveler'));
$('kingfisherAdd').addEventListener('click', () => {
  const sp = findKingfisherSpot();
  if (!sp) { setStatus('Aucun endroit pour poser un martin-pêcheur.'); return; }
  const d = { ...newWagtailDesc(sp.x, sp.z), kind: 'kingfisher', size: num('kingfisherSize') * (0.92 + Math.random() * 0.16), speed: 1 };
  wagtailsData.push(d);
  select(addWagtail(d));
});
$('wagtailAdd').addEventListener('click', () => {
  const s = findWagtailSpot();
  if (!s) { setStatus('Aucun endroit pour poser une bergeronnette.'); return; }
  const d = newWagtailDesc(s.x, s.z);
  wagtailsData.push(d);
  select(addWagtail(d));
});
const clearWagtails = () => {
  wagtailsData = [];
  select(null);
  trees.filter((t) => t.userData.wagtail).forEach((t) => { world.remove(t); disposeMesh(t); });
  trees = trees.filter((t) => !t.userData.wagtail);
};

// ---------- Oiseaux en vol : mouette et hirondelle de cheminée ----------
let flyersData = []; // { kind: 'gull' | 'swallow', … } : tournent en l'air, ailes battantes
let flyers = [];

// ailes : octaèdre aplati dont la racine est à l'origine ; sweep = flèche vers l'arrière
function wingGeos(span, chord, sweep, color, tipColor, tipFrom) {
  const g = new THREE.OctahedronGeometry(1, 0);
  g.scale(span / 2, span * 0.025, chord);
  g.translate(span / 2, 0, 0);
  const left = g.clone().rotateY(sweep);
  const right = g.clone().rotateY(Math.PI).rotateY(-sweep);
  const paint = (gg) => finish(gg, (x, y, z) => (Math.hypot(x, z) > tipFrom ? tipColor : color));
  return [paint(left), paint(right)];
}

function makeGull(d) {
  const u = d.size, A = d.alba, tone = (hex, dl = 0) => birdTone(hex, dl, A);
  const parts = [];
  const body = new THREE.IcosahedronGeometry(1, 1);
  body.scale(0.075 * u, 0.075 * u, 0.24 * u);
  parts.push(finish(body, (x, y) => tone(y > 0.03 * u ? '#e4e9ef' : '#ffffff')));
  const head = new THREE.IcosahedronGeometry(1, 0);
  head.scale(0.055 * u, 0.052 * u, 0.06 * u);
  head.translate(0, 0.03 * u, 0.27 * u);
  parts.push(finish(head, () => tone('#ffffff')));
  const beak = new THREE.ConeGeometry(0.018 * u, 0.11 * u, 4, 1);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.022 * u, 0.36 * u);
  parts.push(finish(beak, () => tone('#f2b233')));
  const tail = new THREE.OctahedronGeometry(1, 0);
  tail.scale(0.07 * u, 0.008 * u, 0.1 * u);
  tail.translate(0, 0.012 * u, -0.3 * u);
  parts.push(finish(tail, () => tone('#ffffff')));
  const bodyGeo = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());
  // ailes grises à bouts noirs, légèrement en flèche
  const [L, R] = wingGeos(u, 0.13 * u, 0.15, tone('#c5ced8'), tone('#1b1b1f'), 0.62 * u);
  return { body: bodyGeo, left: L, right: R, pivot: V3(0.06 * u, 0.03 * u, 0.04 * u) };
}

function customRigOf(def) {
  const key = def.id + ':' + (def.rev || 0);
  if (!customGeoCache.has(key)) customGeoCache.set(key, { rig: bakeCustomRig(def), flat: null });
  return customGeoCache.get(key).rig;
}
function makeHoopoeFlyer(d) {
  const u = d.size, def = allCustomDefs().find((x) => x.id === 'builtin-huppe-vol');
  if (def && def.parts.length) {
    const parts = def.parts, byUid = new Map(parts.map((p) => [p.uid, p])), memo = new Map();
    const worldOf = (p) => {
      if (memo.has(p)) return memo.get(p);
      const loc = atPartMatrix(p), par = p.parent != null && byUid.get(p.parent);
      const W = par && par !== p ? atChildWorld(worldOf(par), p) : loc;
      memo.set(p, W);
      return W;
    };
    const isWing = (p) => p.params && p.params.kind === 'flywing';
    const merge = (list) => { const geos = list.flatMap((p) => atPartBakeGeos(p, worldOf(p))); if (!geos.length) return null; const m = mergeGeometries(geos); geos.forEach((q) => q.dispose()); return m; };
    const rightSide = (p) => p.params.mir || p.params.side < 0;
    const body = merge(parts.filter((p) => !isWing(p))), wl = parts.filter((p) => isWing(p) && !rightSide(p)), wr = parts.filter((p) => isWing(p) && rightSide(p));
    const linkPt = (p) => (p.link && byUid.get(p.parent) ? V3(...p.link.p).applyMatrix4(worldOf(byUid.get(p.parent))) : V3(0, 0, 0).setFromMatrixPosition(worldOf(p)));
    if (body && wl.length && wr.length) {
      const left = merge(wl), right = merge(wr), pivot = linkPt(wl[0]);
      body.computeBoundingBox();
      const c = body.boundingBox.getCenter(V3(0, 0, 0));
      left.computeBoundingBox();
      const span = 2 * Math.max(Math.abs(left.boundingBox.max.x), Math.abs(left.boundingBox.min.x)), k = u / Math.max(1e-6, span); // l'envergure demandée
      body.translate(-c.x, -c.y, -c.z); body.scale(k, k, k);
      left.translate(-pivot.x, -pivot.y, -pivot.z); left.scale(k, k, k);
      right.translate(-pivot.x, -pivot.y, -pivot.z); right.scale(k, k, k);
      return { body, left, right, pivot: pivot.clone().sub(c).multiplyScalar(k).setX(Math.abs(pivot.x - c.x) * k) };
    }
    if (body) body.dispose();
  }
  // repli : un corps simple et des ailes rayées
  const bodyGeo = finish(new THREE.IcosahedronGeometry(0.1 * u, 1), () => new THREE.Color('#e9a271'));
  const span = u * 0.5, g = new THREE.IcosahedronGeometry(1, 1);
  g.scale(span / 2, span * 0.018, span * 0.42);
  g.translate(span / 2, 0, -span * 0.08);
  const BANDS = [[0.2, 0.28], [0.36, 0.44], [0.52, 0.6], [0.68, 0.75], [0.85, 0.9]];
  const paint = (gg) => finish(gg, (x) => { const r = Math.abs(x) / span; if (r < 0.14) return new THREE.Color('#e9a271'); return new THREE.Color(BANDS.some(([a, b]) => r >= a && r < b) ? '#f3f3ee' : '#1d1d1f'); });
  const left = paint(g.clone().rotateY(0.08)), right = paint(g.clone().rotateY(Math.PI).rotateY(-0.08));
  g.dispose();
  return { body: bodyGeo, left, right, pivot: V3(0.02 * u, 0.03 * u, 0.02 * u) };
}
function makeSwallow(d) {
  const u = d.size, A = d.alba, tone = (hex, dl = 0) => birdTone(hex, dl, A);
  const parts = [];
  const body = new THREE.IcosahedronGeometry(1, 1);
  body.scale(0.05 * u, 0.05 * u, 0.17 * u);
  parts.push(finish(body, (x, y, z) => (y < -0.01 * u ? tone('#f5ecd9') : z > 0.12 * u ? tone('#b5412c') : tone('#1d3a73')))); // ventre crème, front roux, dos bleu nuit
  const head = new THREE.IcosahedronGeometry(1, 0);
  head.scale(0.042 * u, 0.04 * u, 0.045 * u);
  head.translate(0, 0.015 * u, 0.2 * u);
  parts.push(finish(head, (x, y) => (y < 0.005 * u ? tone('#b5412c') : tone('#1d3a73')))); // gorge rousse
  const beak = new THREE.ConeGeometry(0.012 * u, 0.05 * u, 3, 1);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.012 * u, 0.26 * u);
  parts.push(finish(beak, () => tone('#222222')));
  for (const sx of [-1, 1]) { // queue fourchue : deux longs brins qui s'écartent
    const s = new THREE.ConeGeometry(0.014 * u, 0.3 * u, 3, 1);
    s.rotateX(-Math.PI / 2);
    s.rotateY(sx * 0.12);
    s.translate(sx * 0.028 * u, 0, -0.3 * u);
    parts.push(finish(s, () => tone('#17284d')));
  }
  const tailBase = new THREE.OctahedronGeometry(1, 0);
  tailBase.scale(0.04 * u, 0.006 * u, 0.07 * u);
  tailBase.translate(0, 0, -0.2 * u);
  parts.push(finish(tailBase, () => tone('#17284d')));
  const bodyGeo = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());
  const [L, R] = wingGeos(0.82 * u, 0.075 * u, 0.55, tone('#1b2a4a'), tone('#10192e'), 0.5 * u); // ailes fines et très balayées
  return { body: bodyGeo, left: L, right: R, pivot: V3(0.045 * u, 0.02 * u, 0.04 * u) };
}

function newFlyerDesc(kind) {
  const rng = mulberry32(71000 + birdCounter++ * 5003);
  const gull = kind !== 'swallow', hoopoe = kind === 'hoopoe';
  const gr = Math.max(groundR, 2);
  return {
    kind, seed: Math.floor(rng() * 1e6), alba: $('alba').checked, phase: rng() * 6.28,
    size: num(hoopoe ? 'hoopoeSize' : gull ? 'gullSize' : 'swallowSize') * (0.9 + rng() * 0.2),
    speed: num(hoopoe ? 'hoopoeSpeed' : gull ? 'gullSpeed' : 'swallowSpeed'),
    cx: (rng() - 0.5) * gr * 0.5, cz: (rng() - 0.5) * gr * 0.5,           // centre du cercle
    R: gr * (gull ? 0.7 + rng() * 0.5 : 0.45 + rng() * 0.45),             // rayon
    alt: hoopoe ? 1.1 + rng() * 0.6 : gull ? 2.6 + rng() * 1.0 : 1.2 + rng() * 1.0, // altitude
    dir: rng() < 0.5 ? -1 : 1, th0: rng() * Math.PI * 2,
  };
}
// trajectoires : ellipse ou huit, tirées au hasard. Après un tour, une nouvelle trajectoire (rayon, centre, hauteur, sens, forme)
// est choisie et fondue en douceur dans la précédente ; l'état de vol n'est pas sauvegardé.
const flyW = (d) => (d.kind === 'gull' ? 0.28 : d.kind === 'hoopoe' ? 0.12 : 0.85) * d.speed; // huppe : vol très lent
function fitPath(q) { // reste au-dessus du terrain
  const lim = Math.max(groundR, 2) * 0.92, ext = Math.max(q.a, q.b);
  if (ext > lim) { q.a *= lim / ext; q.b *= lim / ext; }
  const room = Math.max(0, lim - Math.max(q.a, q.b)), l = Math.hypot(q.cx, q.cz);
  if (l > room) { q.cx *= room / l; q.cz *= room / l; }
  return q;
}
function randomPath(d, rng, prev) {
  const gull = d.kind !== 'swallow', gr = Math.max(groundR, 2), eight = rng() < 0.3;
  const a = gr * (gull ? 0.4 + rng() * 0.6 : 0.25 + rng() * 0.55);
  return fitPath({
    cx: prev.cx * 0.5 + (rng() - 0.5) * gr * 0.4, cz: prev.cz * 0.5 + (rng() - 0.5) * gr * 0.4,
    a, b: a * (eight ? 0.45 + rng() * 0.3 : 0.55 + rng() * 0.45), rot: rng() * Math.PI, eight,
    alt: gull ? 2.2 + rng() * 1.8 : 1 + rng() * 1.6, amp: gull ? 0.1 + rng() * 0.25 : 0.3 + rng() * 0.5, ph: rng() * 6.28,
    dir: rng() < 0.4 ? -prev.dir : prev.dir,
  });
}
function pathPos(q, th, out) {
  const c = Math.cos(th), s = Math.sin(th);
  const u = q.eight ? q.a * s : q.a * c, v = q.eight ? q.b * Math.sin(2 * th) : q.b * s, cr = Math.cos(q.rot), sr = Math.sin(q.rot);
  return out.set(q.cx + u * cr - v * sr, q.alt + q.amp * Math.sin(2 * th + q.ph), q.cz + u * sr + v * cr);
}
const _fa = V3(0, 0, 0), _fb = V3(0, 0, 0);
function flyAt(f, ahead, out) {
  const d = f.d, w = flyW(d), c = f.cur;
  pathPos(c.q, c.th + c.q.dir * w * ahead, out);
  if (f.tr) {
    pathPos(f.tr.q, f.tr.th + f.tr.q.dir * w * ahead, _fb);
    const k = clamp(f.tr.k + ahead / f.tr.dur, 0, 1);
    out.lerp(_fb, k * k * k * (k * (6 * k - 15) + 10));
  }
  const gh = currentHF ? currentHF(out.x, out.z) : 0;
  if (out.y < gh + 0.6) out.y = gh + 0.6;
  return out;
}
function flyNext(f) { // nouvelle trajectoire, démarrée au point le plus proche de la position et du cap actuels
  const d = f.d, q = randomPath(d, f.rng, f.cur.q), here = f.mesh.position, h0 = f.prevH || 0;
  let best = 0, bc = 1e9;
  for (let i = 0; i < 72; i++) {
    const th = (i / 72) * Math.PI * 2;
    pathPos(q, th, _fa); pathPos(q, th + q.dir * 0.05, _fb);
    let dh = Math.atan2(_fb.x - _fa.x, _fb.z - _fa.z) - h0;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const cost = Math.hypot(_fa.x - here.x, _fa.z - here.z) + 2.5 * Math.abs(dh) + 0.3 * Math.abs(_fa.y - here.y);
    if (cost < bc) { bc = cost; best = th; }
  }
  f.tr = { q, th: best, k: 0, dur: (d.kind === 'swallow' ? 3 : 6) + f.rng() * 2 };
}

function addFlyer(d) {
  const g = d.kind === 'gull' ? makeGull(d) : d.kind === 'hoopoe' ? makeHoopoeFlyer(d) : makeSwallow(d);
  const mesh = new THREE.Mesh(g.body, matTree);
  mesh.rotation.order = 'YXZ'; // cap, puis tangage, puis roulis
  const wl = new THREE.Mesh(g.left, matTree), wr = new THREE.Mesh(g.right, matTree);
  wl.position.copy(g.pivot);
  wr.position.set(-g.pivot.x, g.pivot.y, g.pivot.z);
  mesh.add(wl, wr);
  mesh.castShadow = wl.castShadow = wr.castShadow = $('shadows').checked;
  world.add(mesh);
  const f = { d, mesh, wl, wr, bank: 0, prevH: null, rng: mulberry32((d.seed ^ 0x5bd1) >>> 0), tr: null, lap: 0 };
  f.cur = { q: fitPath({ cx: d.cx, cz: d.cz, a: d.R, b: d.R, rot: 0, eight: false, alt: d.alt, amp: d.kind === 'gull' ? 0.18 : d.kind === 'hoopoe' ? 0.3 : 0.45, ph: d.phase, dir: d.dir }), th: d.th0 };
  f.lapMax = Math.PI * 2 * (0.9 + f.rng() * 0.7);
  flyers.push(f);
  flyerTick(f, 0, 0);
  return f;
}
function clearFlyers() {
  flyers.forEach((f) => { world.remove(f.mesh); f.mesh.geometry.dispose(); f.wl.geometry.dispose(); f.wr.geometry.dispose(); });
  flyers = [];
}
function restoreFlyers() { flyersData.forEach((d) => addFlyer(d)); }

const _fp1 = V3(0, 0, 0), _fp2 = V3(0, 0, 0);
function flyerTick(f, dt, t) {
  const d = f.d, gull = d.kind === 'gull', hoopoe = d.kind === 'hoopoe';
  if (hoopoe && $('hoopoeSlow').checked) dt *= 0.25;
  f.tt = (f.tt || 0) + dt; // temps propre (ralenti compris) pour les battements
  if (dt > 0) {
    dt = Math.min(dt, 0.25);
    const adv = (p) => { const s = p.q.dir * flyW(d) * dt; p.th += s; return Math.abs(s); };
    f.lap += adv(f.cur);
    if (f.tr) {
      adv(f.tr);
      f.tr.k += dt / f.tr.dur;
      if (f.tr.k >= 1) { f.cur = f.tr; f.tr = null; f.lap = 0; f.lapMax = Math.PI * 2 * (0.9 + f.rng() * 0.7); }
    } else if (f.lap > f.lapMax) flyNext(f);
  }
  const p0 = flyAt(f, 0, _fp1), p1 = flyAt(f, 0.05, _fp2);
  f.mesh.position.copy(p0);
  const vx = p1.x - p0.x, vy = p1.y - p0.y, vz = p1.z - p0.z, hz = Math.hypot(vx, vz) || 1e-6;
  const h = Math.atan2(vx, vz);
  // inclinaison dans les virages : proportionnelle à la vitesse de rotation du cap
  if (f.prevH !== null && dt > 0) {
    let dh = h - f.prevH;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    f.bank += (clamp((-dh / dt) * 0.2, -0.75, 0.75) - f.bank) * Math.min(1, dt * 4);
  } else if (f.prevH === null) f.bank = -d.dir * (gull || hoopoe ? 0.3 : 0.45);
  f.prevH = h;
  f.mesh.rotation.set(-Math.atan2(vy, hz), h, f.bank);
  // battements : la mouette plane puis bat par moments ; l'hirondelle bat vite avec de courts planés
  const flap = gull
    ? 0.55 * Math.sin(t * 5 + d.phase) * clamp(0.5 + 1.2 * Math.sin(t * 0.45 + d.phase * 2), 0, 1) + 0.1
    : hoopoe // vol de papillon : grands battements irréguliers, entrecoupés de courts planés ailes ouvertes
      ? 0.9 * Math.sin(f.tt * 4 + d.phase) * clamp(0.3 + 1.4 * Math.sin(f.tt * 0.5 + d.phase * 2), 0, 1) + 0.05
      : 0.8 * Math.sin(t * 16 + d.phase) * clamp(0.6 + 1.2 * Math.sin(t * 1.3 + d.phase * 2), 0, 1) + 0.08;
  f.wl.rotation.z = flap;
  f.wr.rotation.z = -flap;
}

$('gullAdd').addEventListener('click', () => {
  const d = newFlyerDesc('gull');
  flyersData.push(d);
  addFlyer(d);
  setStatus(`${flyersData.length} oiseau(x) en vol`);
});
$('swallowAdd').addEventListener('click', () => {
  const d = newFlyerDesc('swallow');
  flyersData.push(d);
  addFlyer(d);
  setStatus(`${flyersData.length} oiseau(x) en vol`);
});

// un seul bouton pour retirer tous les animaux
$('animalsClear').addEventListener('click', () => {
  clearFish(); clearBirds(); clearFrogs(); clearWagtails();
  flyersData = []; clearFlyers();
  dragonsData = []; clearDragons();
  insectsData = []; clearInsects();
  updateCounts();
  setStatus('Animaux effacés');
});

// ---------- Plantes aquatiques : nénuphar, lentille d'eau ----------
// Elles flottent à la surface de l'eau (leur hauteur suit le niveau de l'eau) et ne sont visibles que sur l'eau.
let liliesData = [];
let ducksData = [];
const lilyY = () => waterLevel() + 0.012;
const onWater = (x, z) => !!currentHF && Math.hypot(x, z) < groundR * 0.95 && currentHF(x, z) < waterLevel() - 0.05;

function newLilyDesc(x, z) {
  const rng = mulberry32(81000 + birdCounter++ * 4219);
  return { seed: Math.floor(rng() * 1e6), size: num('lilySize') * (0.8 + rng() * 0.4), flower: $('lilyFlower').checked, alba: $('alba').checked, phase: rng() * 6.28, x, z, rot: rng() * Math.PI * 2, scale: 1 };
}
// feuille ronde avec l'entaille caractéristique, nervures par secteurs, et en option une fleur de lotus
function makeLily(d) {
  const S = d.size, A = d.alba, rng = mulberry32(d.seed);
  const tone = (hex, dl = 0) => birdTone(hex, dl, A);
  const parts = [];
  const notch = 0.3, a0 = rng() * Math.PI * 2, N = 16;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  for (let k = 0; k <= N; k++) {
    const a = a0 + notch / 2 + ((Math.PI * 2 - notch) * k) / N;
    shape.lineTo(Math.cos(a) * S, Math.sin(a) * S);
  }
  shape.lineTo(0, 0);
  const pad = new THREE.ExtrudeGeometry(shape, { depth: 0.025 * S, bevelEnabled: false });
  pad.rotateX(-Math.PI / 2); // à plat, épaisseur vers le haut
  parts.push(finish(pad, (x, y, z) => {
    const sector = Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI / 8));
    return tone(y > 0.015 * S ? (sector % 2 ? '#4f9a45' : '#5cab4f') : '#3d7a37', (rng() - 0.5) * 0.02);
  }));
  if (d.flower) { // fleur : deux couronnes de pétales autour d'un cœur jaune
    const col = ['#f6c6dc', '#ffffff', '#f4a6c8'][d.seed % 3];
    for (let ring = 0; ring < 2; ring++) {
      const n = ring ? 5 : 8, tilt = ring ? 0.35 : 0.9, len = (ring ? 0.3 : 0.38) * S;
      for (let i = 0; i < n; i++) {
        const p = new THREE.ConeGeometry(0.07 * S, len, 4, 1);
        p.translate(0, len / 2, 0);
        p.rotateZ(-tilt);
        p.rotateY((i / n) * Math.PI * 2 + ring * 0.4);
        p.translate(0, 0.03 * S, 0);
        parts.push(finish(p, (x, y) => tone(col, y > 0.2 * S ? 0.06 : 0)));
      }
    }
    const core = new THREE.IcosahedronGeometry(1, 0);
    core.scale(0.07 * S, 0.06 * S, 0.07 * S);
    core.translate(0, 0.08 * S, 0);
    parts.push(finish(core, () => tone('#f5c33b')));
  }
  const geo = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());
  return geo;
}
function addLily(d) {
  const m = addTree(makeLily(d), d.x, lilyY(), d.z, d.scale, d.rot, d.size * 1.1 * d.scale);
  m.userData.lily = d;
  return m;
}
function restoreLilies() {
  liliesData.forEach((d) => {
    if (!onWater(d.x, d.z)) { const s = findWaterSpot(); if (!s) return; d.x = s.x; d.z = s.z; }
    d.alba = $('alba').checked;
    addLily(d);
  });
}

function newDuckDesc(x, z) {
  const rng = mulberry32(82000 + birdCounter++ * 4561);
  return { seed: Math.floor(rng() * 1e6), size: num('duckSize') * (0.85 + rng() * 0.3), alba: $('alba').checked, phase: rng() * 6.28, x, z, rot: rng() * Math.PI * 2, scale: 1 };
}
// plaque de lentille d'eau : beaucoup de minuscules pastilles vertes réparties dans un disque
function makeDuck(d) {
  const R = d.size, rng = mulberry32(d.seed);
  const tone = (hex, dl = 0) => birdTone(hex, dl, d.alba);
  const greens = ['#8fcf4a', '#6fb83a', '#a8d95c', '#7cc243'];
  const parts = [];
  const n = Math.round(24 + 90 * R);
  for (let i = 0; i < n; i++) {
    const r = R * Math.sqrt(rng()) * (0.8 + 0.2 * rng()), a = rng() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const g = new THREE.CylinderGeometry(0.04, 0.04, 0.012, 5, 1);
    g.scale(0.8 + rng() * 0.8, 1, 0.8 + rng() * 0.8);
    g.rotateY(rng() * Math.PI);
    g.translate(x, 0.006 + rng() * 0.004, z);
    const col = greens[Math.floor(rng() * greens.length)];
    parts.push(finish(g, () => tone(col, (rng() - 0.5) * 0.04)));
  }
  const geo = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());
  return geo;
}
function addDuck(d) {
  const m = addTree(makeDuck(d), d.x, lilyY(), d.z, d.scale, d.rot, d.size * d.scale);
  m.userData.duck = d;
  return m;
}
function restoreDucks() {
  ducksData.forEach((d) => {
    if (!onWater(d.x, d.z)) { const s = findWaterSpot(); if (!s) return; d.x = s.x; d.z = s.z; }
    d.alba = $('alba').checked;
    addDuck(d);
  });
}
// elles flottent : léger balancement, et disparaissent si l'eau se retire
function floatTick(m, t) {
  const d = m.userData.lily || m.userData.duck;
  m.visible = $('water').checked && onWater(m.position.x, m.position.z);
  if (m === selected || !m.visible) return;
  m.position.y = lilyY() + Math.sin(t * 1.2 + d.phase) * 0.006;
  m.rotation.y = d.rot + Math.sin(t * 0.35 + d.phase) * 0.05;
}

$('lilyAdd').addEventListener('click', () => {
  if (!$('water').checked) { setStatus("Active l'eau (outil Eau) et creuse un lac d'abord."); return; }
  const s = findWaterSpot();
  if (!s) { setStatus("Aucun lac assez profond : creuse avec l'outil Eau."); return; }
  const d = newLilyDesc(s.x, s.z);
  liliesData.push(d);
  select(addLily(d));
});
$('duckAdd').addEventListener('click', () => {
  if (!$('water').checked) { setStatus("Active l'eau (outil Eau) et creuse un lac d'abord."); return; }
  const s = findWaterSpot();
  if (!s) { setStatus("Aucun lac assez profond : creuse avec l'outil Eau."); return; }
  const d = newDuckDesc(s.x, s.z);
  ducksData.push(d);
  select(addDuck(d));
});
$('plantsClear').addEventListener('click', () => {
  liliesData = []; ducksData = [];
  select(null);
  trees.filter((t) => t.userData.lily || t.userData.duck).forEach((t) => { world.remove(t); disposeMesh(t); });
  trees = trees.filter((t) => !t.userData.lily && !t.userData.duck);
  setStatus('Plantes aquatiques effacées');
});

// ---------- Libellule ----------
// vole par à-coups : file vers un point au-dessus de l'eau, plane en vibrant des ailes, repart ailleurs
let dragonsData = [];
let dragons = [];
function makeDragonfly(d) {
  const u = d.size, A = d.alba;
  const tone = (hex, dl = 0) => birdTone(hex, dl, A);
  const parts = [];
  const thorax = new THREE.IcosahedronGeometry(1, 0);
  thorax.scale(0.05 * u, 0.055 * u, 0.09 * u);
  parts.push(finish(thorax, () => tone('#1a7a96')));
  const head = new THREE.IcosahedronGeometry(1, 0);
  head.scale(0.04 * u, 0.04 * u, 0.04 * u);
  head.translate(0, 0, 0.12 * u);
  parts.push(finish(head, () => tone('#2b9ab8')));
  for (const sx of [-1, 1]) { // gros yeux verts
    const e = new THREE.IcosahedronGeometry(1, 0);
    e.scale(0.03 * u, 0.03 * u, 0.03 * u);
    e.translate(sx * 0.03 * u, 0.012 * u, 0.14 * u);
    parts.push(finish(e, () => tone('#5fd38a')));
  }
  const rings = 7;
  for (let i = 0; i < rings; i++) { // abdomen long, anneaux bleus et sombres
    const a = -0.07 * u - i * 0.12 * u, b = a - 0.12 * u;
    const r0 = (0.022 - i * 0.0018) * u, r1 = (0.022 - (i + 1) * 0.0018) * u;
    parts.push(finish(limb(V3(0, 0, a), V3(0, 0, b), r0, r1, 4), () => tone(i % 2 ? '#0f5f7a' : '#1c9cc6', i === rings - 1 ? -0.12 : 0)));
  }
  const body = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());
  const w = new THREE.OctahedronGeometry(1, 0);
  w.scale(0.28 * u, 0.004 * u, 0.06 * u);
  w.translate(0.28 * u, 0, 0);
  const left = finish(w.clone(), () => tone('#e4f4ff', 0.02));
  const right = finish(w.clone().rotateY(Math.PI), () => tone('#e4f4ff', 0.02));
  return { body, left, right, u };
}
function newDragonDesc() {
  const rng = mulberry32(91000 + birdCounter++ * 3299);
  const s = $('water').checked ? findWaterSpot() : null;
  const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * groundR * 0.7;
  return { seed: Math.floor(rng() * 1e6), size: num('dragonSize') * (0.9 + rng() * 0.2), speed: num('dragonSpeed'), alba: $('alba').checked, phase: rng() * 6.28, x: s ? s.x : Math.cos(a) * r, z: s ? s.z : Math.sin(a) * r, heading: rng() * Math.PI * 2 };
}
function dragonTarget(f) {
  const water = $('water').checked, s = water ? findWaterSpot() : null;
  const x = s ? s.x : (Math.random() - 0.5) * groundR * 1.2, z = s ? s.z : (Math.random() - 0.5) * groundR * 1.2;
  const base = water ? waterLevel() : currentHF ? currentHF(x, z) : 0;
  f.tx = x; f.tz = z; f.ty = base + 0.25 + Math.random() * 0.5;
}
function addDragonfly(d) {
  const g = makeDragonfly(d);
  const mesh = new THREE.Mesh(g.body, matTree);
  mesh.rotation.order = 'YXZ';
  const wings = [];
  for (const [dz, off] of [[0.04, 0], [-0.02, 1.6]]) { // ailes avant et arrière, en décalage de phase
    const l = new THREE.Mesh(g.left, matTree), r = new THREE.Mesh(g.right, matTree);
    l.position.set(0.03 * g.u, 0.03 * g.u, dz * g.u);
    r.position.set(-0.03 * g.u, 0.03 * g.u, dz * g.u);
    mesh.add(l, r);
    wings.push({ l, r, off });
  }
  const y = ($('water').checked ? waterLevel() : currentHF ? currentHF(d.x, d.z) : 0) + 0.4;
  mesh.position.set(d.x, d.y ?? y, d.z);
  mesh.castShadow = $('shadows').checked;
  world.add(mesh);
  const f = { d, mesh, wings, g, hover: 0.5 + Math.random(), heading: d.heading, tx: d.x, ty: mesh.position.y, tz: d.z };
  dragons.push(f);
  return f;
}
function clearDragons() {
  dragons.forEach((f) => { world.remove(f.mesh); f.mesh.geometry.dispose(); f.g.left.dispose(); f.g.right.dispose(); });
  dragons = [];
}
function restoreDragons() { dragonsData.forEach((d) => addDragonfly(d)); }
function dragonTick(f, dt, t) {
  const d = f.d, p = f.mesh.position;
  if (f.hover > 0) {
    f.hover -= dt;
    p.y += Math.sin(t * 7 + d.phase) * 0.0012; // vol stationnaire : petites oscillations
    if (f.hover <= 0) dragonTarget(f);
  } else {
    const dx = f.tx - p.x, dy = f.ty - p.y, dz = f.tz - p.z, dist = Math.hypot(dx, dy, dz);
    if (dist < 0.08) f.hover = 0.4 + Math.random() * 1.8;
    else {
      const sp = d.speed * Math.min(dist * 3, 1.1);
      p.x += (dx / dist) * sp * dt; p.y += (dy / dist) * sp * dt; p.z += (dz / dist) * sp * dt;
      let dh = Math.atan2(dx, dz) - f.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      f.heading += dh * Math.min(1, dt * 8);
    }
  }
  f.mesh.rotation.set(0, f.heading, 0);
  f.wings.forEach((w) => { // battement très rapide, ailes avant / arrière en décalage
    const a = Math.sin(t * 55 + d.phase + w.off) * 0.5;
    w.l.rotation.z = a; w.r.rotation.z = -a;
  });
  d.x = p.x; d.z = p.z; d.y = p.y; d.heading = f.heading;
}
$('dragonAdd').addEventListener('click', () => {
  const d = newDragonDesc();
  dragonsData.push(d);
  addDragonfly(d);
  setStatus(`${dragonsData.length} libellule(s)`);
});

// ---------- Taille de référence : insectes et fleurs sont proportionnels aux arbres ----------
function treeRef() {
  let s = 0, n = 0;
  for (const m of trees) {
    if (!m.userData.spec) continue;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    s += m.geometry.boundingBox.max.y * m.scale.x;
    n++;
  }
  return n ? s / n : 2.6; // sans arbre : hauteur d'un arbre standard
}
const proportion = () => treeRef() / 2.6;

// ---------- Fleurs : touffes de plusieurs espèces ----------
let flowersData = []; // descripteurs, enregistrés dans le JSON
const FLOWER_NAMES = { daisy: 'Marguerite', tulip: 'Tulipe', sunflower: 'Tournesol', poppy: 'Coquelicot', lavender: 'Lavande', dandelion: 'Pissenlit', rose: 'Rose' };
const FLOWER_H = { daisy: 0.3, tulip: 0.34, sunflower: 0.8, poppy: 0.36, lavender: 0.4, dandelion: 0.24, rose: 0.42 }; // hauteur de tige pour un arbre de 2,6

function newFlowerDesc(type, x, z) {
  const rng = mulberry32(111000 + birdCounter++ * 3989);
  return { type, seed: Math.floor(rng() * 1e6), rel: num('flowerSize'), n: Math.round(num('flowerCount')), alba: $('alba').checked, x, z, rot: rng() * Math.PI * 2, scale: 1 };
}

// une touffe = n tiges de la même espèce ; renvoie aussi la position de chaque corolle (où les insectes se posent)
function makeFlowerClump(d) {
  const rng = mulberry32(d.seed), k = d.rel * proportion(), H = FLOWER_H[d.type] * k;
  const tone = (hex, dl = 0) => birdTone(hex, dl, d.alba);
  const parts = [], blossoms = [];
  const add = (g, hex, dl = 0) => parts.push(finish(g, () => tone(hex, dl + (rng() - 0.5) * 0.03)));
  const petals = (T, n, len, wid, tilt, hex, up = 0) => {
    for (let i = 0; i < n; i++) {
      const g = new THREE.ConeGeometry(wid, len, 4, 1);
      g.scale(1, 1, 0.35);
      g.translate(0, len / 2, 0);
      g.rotateZ(-tilt);
      g.rotateY((i / n) * Math.PI * 2 + rng() * 0.2);
      g.translate(T.x, T.y + up, T.z);
      add(g, hex, 0.02 * (i % 2));
    }
  };
  const ball = (T, rx, ry, rz, hex, detail = 0) => {
    const g = new THREE.IcosahedronGeometry(1, detail);
    g.scale(rx, ry, rz);
    g.translate(T.x, T.y, T.z);
    add(g, hex);
  };
  for (let i = 0; i < d.n; i++) {
    const a = rng() * Math.PI * 2, r = 0.2 * k * Math.sqrt(rng());
    const sx = Math.cos(a) * r, sz = Math.sin(a) * r, h = H * (0.8 + rng() * 0.4);
    const lx = (rng() - 0.5) * 0.12 * h, lz = (rng() - 0.5) * 0.12 * h;
    const base = V3(sx, 0, sz), T = V3(sx + lx, h, sz + lz);
    add(limb(base, T, 0.016 * k, 0.011 * k, 4), '#4f9a45', -0.04);
    for (let j = 0; j < 2; j++) { // deux feuilles
      const lf = new THREE.ConeGeometry(0.03 * k, 0.16 * k, 3, 1);
      lf.scale(1, 1, 0.4);
      lf.translate(0, 0.08 * k, 0);
      lf.rotateZ(-1.0);
      lf.rotateY(rng() * Math.PI * 2);
      lf.translate(sx, h * (0.2 + 0.25 * j), sz);
      add(lf, '#5cab4f');
    }
    let top = h; // hauteur de la corolle (point d'atterrissage)
    switch (d.type) {
      case 'daisy':
        petals(T, 12, 0.2 * h, 0.04 * h, 1.35, '#ffffff', 0.02 * h);
        ball(V3(T.x, T.y + 0.03 * h, T.z), 0.07 * h, 0.04 * h, 0.07 * h, '#f5c518');
        top = h + 0.05 * h;
        break;
      case 'tulip': {
        const col = ['#e0342b', '#f2c230', '#e86aa8', '#8a4fd0', '#ffffff'][Math.floor(rng() * 5)];
        petals(T, 6, 0.28 * h, 0.085 * h, 0.22, col);
        top = h + 0.2 * h;
        break;
      }
      case 'sunflower':
        ball(V3(T.x, T.y + 0.03 * h, T.z), 0.2 * h, 0.05 * h, 0.2 * h, '#5a3a1a', 1);
        petals(T, 16, 0.2 * h, 0.05 * h, 1.3, '#f5c518', 0.02 * h);
        top = h + 0.08 * h;
        break;
      case 'poppy': {
        for (let j = 0; j < 5; j++) {
          const g = new THREE.IcosahedronGeometry(1, 0);
          g.scale(0.1 * h, 0.02 * h, 0.09 * h);
          g.translate(0.07 * h, 0, 0);
          g.rotateZ(0.5);
          g.rotateY((j / 5) * Math.PI * 2 + rng() * 0.3);
          g.translate(T.x, T.y + 0.04 * h, T.z);
          add(g, '#e0261c', 0.02 * (j % 2));
        }
        ball(V3(T.x, T.y + 0.04 * h, T.z), 0.03 * h, 0.03 * h, 0.03 * h, '#1b1b1b');
        top = h + 0.07 * h;
        break;
      }
      case 'lavender':
        for (let j = 0; j < 7; j++) {
          const rr = 0.035 * h * (1 - j * 0.08);
          ball(V3(T.x + (rng() - 0.5) * 0.02 * h, h * (0.6 + 0.06 * j) + 0.02 * h, T.z + (rng() - 0.5) * 0.02 * h), rr, rr * 1.6, rr, ['#8e6fd8', '#a58be6', '#7a5cc4'][j % 3]);
        }
        top = h * 1.05;
        break;
      case 'dandelion':
        ball(V3(T.x, T.y + 0.05 * h, T.z), 0.14 * h, 0.12 * h, 0.14 * h, '#f7d117', 1);
        top = h + 0.14 * h;
        break;
      case 'rose': {
        const col = ['#d6336c', '#e8546a', '#f48fb1', '#ffffff'][Math.floor(rng() * 4)];
        add(new THREE.ConeGeometry(0.05 * h, 0.1 * h, 5, 1).translate(T.x, T.y - 0.03 * h, T.z), '#4f9a45'); // calice
        petals(T, 6, 0.2 * h, 0.07 * h, 0.9, col);
        petals(T, 5, 0.16 * h, 0.06 * h, 0.55, col, 0.01 * h);
        petals(T, 4, 0.12 * h, 0.05 * h, 0.25, col, 0.02 * h);
        top = h + 0.1 * h;
        break;
      }
    }
    blossoms.push([T.x, top, T.z]);
  }
  const geo = mergeGeometries(parts);
  parts.forEach((q) => q.dispose());
  return { geo, blossoms, k };
}
function addFlower(d) {
  const g = makeFlowerClump(d);
  const m = addTree(g.geo, d.x, currentHF ? currentHF(d.x, d.z) : 0, d.z, d.scale, d.rot, 0.3 * g.k * d.scale);
  m.userData.flower = d;
  m.userData.blossoms = g.blossoms;
  return m;
}
function restoreFlowers() {
  const lim = groundR * 0.97;
  flowersData.forEach((d) => {
    const l = Math.hypot(d.x, d.z);
    if (l > lim) { d.x *= lim / l; d.z *= lim / l; }
    d.alba = $('alba').checked;
    addFlower(d);
  });
}
function addFlowerOfType(type) {
  for (let k = 0; k < 60; k++) { // une place sèche, pas dans l'eau
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * groundR * 0.85;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if ($('water').checked && currentHF && currentHF(x, z) < waterLevel() + 0.15) continue;
    const d = newFlowerDesc(type, x, z);
    flowersData.push(d);
    select(addFlower(d));
    return;
  }
  setStatus('Aucune place sèche pour une fleur.');
}
// positions des corolles (dans le repère du monde) : cibles des insectes
function flowerSpots() {
  const out = [];
  for (const m of trees) {
    const b = m.userData.blossoms;
    if (b) {
      const r = m.rotation.y, c = Math.cos(r), s = Math.sin(r), sc = m.scale.x;
      for (const [bx, by, bz] of b) out.push({ x: m.position.x + (c * bx + s * bz) * sc, y: m.position.y + by * sc, z: m.position.z + (-s * bx + c * bz) * sc, m });
    } else if (m.userData.tuft && FLOWERY.has(m.userData.tuft.kind)) { // les touffes d'herbe « fleurs » comptent aussi
      out.push({ x: m.position.x, y: m.position.y + m.userData.tuft.size * m.scale.x, z: m.position.z, m });
    }
  }
  return out;
}

// ---------- Insectes : abeille, papillon, coccinelle ----------
// Taille de base pour un arbre de 2,6 de haut, multipliée par le rapport à la taille réelle des arbres : visibles mais proportionnels.
let insectsData = [];
let insects = [];
const INSECT_BASE = { bee: 0.17, butterfly: 0.38, ladybug: 0.11 };
const INSECT_NAMES = { bee: 'Abeille', butterfly: 'Papillon', ladybug: 'Coccinelle' };
const BUTTERFLY_ROBES = [
  { wing: '#f08a1c', edge: '#1b1b1b', spot: '#ffffff' }, // monarque
  { wing: '#3b82e0', edge: '#14233f', spot: '#9cc4ff' }, // bleu
  { wing: '#f5d22b', edge: '#7a5a10', spot: '#fff3a0' }, // citron
  { wing: '#f4f4ef', edge: '#6b6b6b', spot: '#cfcfcf' }, // blanc
];

function newInsectDesc(kind) {
  const rng = mulberry32(121000 + birdCounter++ * 2713);
  const spots = flowerSpots();
  const sp = spots.length ? spots[Math.floor(rng() * spots.length)] : null;
  const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * groundR * 0.6;
  const x = sp ? sp.x + (rng() - 0.5) * 0.6 : Math.cos(a) * r, z = sp ? sp.z + (rng() - 0.5) * 0.6 : Math.sin(a) * r;
  return { kind, seed: Math.floor(rng() * 1e6), rel: num('insectSize'), variant: Math.floor(rng() * 4), phase: rng() * 6.28, alba: $('alba').checked, x, z, heading: rng() * Math.PI * 2 };
}

function makeInsect(d, u) {
  const tone = (hex, dl = 0) => birdTone(hex, dl, d.alba);
  const parts = [];
  if (d.kind === 'bee') {
    const body = new THREE.IcosahedronGeometry(1, 1);
    body.scale(0.2 * u, 0.18 * u, 0.32 * u);
    body.translate(0, 0, -0.04 * u);
    parts.push(finish(body, (x, y, z) => tone(Math.floor((z + 0.5 * u) / (0.12 * u)) % 2 ? '#1b1b1b' : '#f5c518')));
    const head = new THREE.IcosahedronGeometry(1, 0);
    head.scale(0.12 * u, 0.12 * u, 0.12 * u);
    head.translate(0, 0.01 * u, 0.33 * u);
    parts.push(finish(head, () => tone('#2a2a2a')));
    const sting = new THREE.ConeGeometry(0.03 * u, 0.1 * u, 3, 1);
    sting.rotateX(-Math.PI / 2);
    sting.translate(0, 0, -0.42 * u);
    parts.push(finish(sting, () => tone('#222222')));
    const w = new THREE.OctahedronGeometry(1, 0);
    w.scale(0.22 * u, 0.006 * u, 0.1 * u);
    w.translate(0.22 * u, 0, 0);
    return { body: mergeGeometries(parts), wings: [finish(w.clone().translate(0, 0, 0), () => tone('#e4f4ff', 0.02)), finish(w.clone().rotateY(Math.PI), () => tone('#e4f4ff', 0.02))], pivot: V3(0.06 * u, 0.14 * u, 0.04 * u) };
  }
  if (d.kind === 'butterfly') {
    const robe = BUTTERFLY_ROBES[d.variant % 4];
    const body = new THREE.IcosahedronGeometry(1, 0);
    body.scale(0.025 * u, 0.025 * u, 0.2 * u);
    parts.push(finish(body, () => tone('#2a2a2a')));
    const head = new THREE.IcosahedronGeometry(1, 0);
    head.scale(0.035 * u, 0.035 * u, 0.035 * u);
    head.translate(0, 0, 0.2 * u);
    parts.push(finish(head, () => tone('#222222')));
    for (const sx of [-1, 1]) { // antennes
      const an = new THREE.ConeGeometry(0.006 * u, 0.14 * u, 3, 1);
      an.rotateX(Math.PI / 2);
      an.rotateY(sx * 0.35);
      an.translate(sx * 0.02 * u, 0.01 * u, 0.26 * u);
      parts.push(finish(an, () => tone('#222222')));
    }
    // ailes : paire avant grande, paire arrière plus petite ; bords sombres, taches claires
    const wing = (sx, big) => {
      const g = new THREE.OctahedronGeometry(1, 0);
      const len = (big ? 0.5 : 0.36) * u * 0.5;
      g.scale(len, 0.004 * u, (big ? 0.2 : 0.16) * u);
      g.translate(len, 0, big ? 0.06 * u : -0.1 * u);
      if (sx < 0) g.rotateY(Math.PI);
      return finish(g, (x, y, z) => {
        const rr = Math.hypot(x, z - (big ? 0.06 : -0.1) * u * (sx < 0 ? -1 : 1)) / len;
        return rr > 0.78 ? tone(robe.edge) : hashPos(x, y, z, 31) > 0.9 ? tone(robe.spot) : tone(robe.wing, (hashPos(x, y, z, 7) - 0.5) * 0.04);
      });
    };
    const mergeW = (sx) => mergeGeometries([wing(sx, true), wing(sx, false)]);
    return { body: mergeGeometries(parts), wings: [mergeW(1), mergeW(-1)], pivot: V3(0.03 * u, 0.02 * u, 0.02 * u) };
  }
  // coccinelle : dôme rouge à points noirs, tête noire
  const dome = new THREE.IcosahedronGeometry(1, 1);
  dome.scale(0.25 * u, 0.2 * u, 0.28 * u);
  const pp = dome.attributes.position;
  for (let i = 0; i < pp.count; i++) if (pp.getY(i) < 0) pp.setY(i, 0); // dessous plat
  parts.push(finish(dome, (x, y, z) => (Math.abs(x) < 0.02 * u ? tone('#1b1b1b') : hashPos(x, y, z, 11) > 0.86 ? tone('#1b1b1b') : tone('#d62b1f', (hashPos(x, y, z, 5) - 0.5) * 0.03))));
  const head = new THREE.IcosahedronGeometry(1, 0);
  head.scale(0.14 * u, 0.1 * u, 0.1 * u);
  head.translate(0, 0.03 * u, 0.3 * u);
  parts.push(finish(head, (x, y, z) => (hashPos(x, y, z, 2) > 0.8 ? tone('#f4f4f0') : tone('#1b1b1b'))));
  for (const sx of [-1, 1]) for (const z of [0.1, 0, -0.1]) { // petites pattes
    const leg = new THREE.CylinderGeometry(0.01 * u, 0.01 * u, 0.1 * u, 3, 1);
    leg.rotateZ(sx * 1.2);
    leg.translate(sx * 0.27 * u, 0.02 * u, z * u);
    parts.push(finish(leg, () => tone('#1b1b1b')));
  }
  return { body: mergeGeometries(parts), wings: null };
}

function addInsect(d) {
  const u = INSECT_BASE[d.kind] * d.rel * proportion();
  const g = makeInsect(d, u);
  const mesh = new THREE.Mesh(g.body, matTree);
  mesh.rotation.order = 'YXZ'; // cap, puis tangage
  let wl = null, wr = null;
  if (g.wings) {
    wl = new THREE.Mesh(g.wings[0], matTree);
    wr = new THREE.Mesh(g.wings[1], matTree);
    wl.position.copy(g.pivot);
    wr.position.set(-g.pivot.x, g.pivot.y, g.pivot.z);
    mesh.add(wl, wr);
  }
  const ground = currentHF ? currentHF(d.x, d.z) : 0;
  mesh.position.set(d.x, d.y ?? ground + (d.kind === 'ladybug' ? 0.2 * u : 0.5 * proportion()), d.z);
  mesh.castShadow = $('shadows').checked;
  world.add(mesh);
  const f = { d, u, mesh, wl, wr, g, state: d.kind === 'ladybug' ? 'walk' : 'pick', timer: 0, target: null, heading: d.heading, pitch: 0, c: 0 };
  insects.push(f);
  return f;
}
function clearInsects() {
  insects.forEach((f) => { world.remove(f.mesh); f.mesh.geometry.dispose(); f.wl?.geometry.dispose(); f.wr?.geometry.dispose(); });
  insects = [];
}
function restoreInsects() { insectsData.forEach((d) => addInsect(d)); }

const turnTo = (cur, target, rate) => { let dh = target - cur; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); return cur + dh * rate; };

// choisit une fleur au hasard (en évitant la précédente) ; sans fleur, un point libre dans l'air
function pickTarget(f) {
  const k = proportion(), all = flowerSpots(), spots = all.filter((s) => !f.target || s.m !== f.target.m || spotsOnlyOne(all));
  if (spots.length && (f.d.kind === 'butterfly' || Math.random() < 0.9)) { // le papillon ne quitte pas les fleurs
    const s = spots[Math.floor(Math.random() * spots.length)];
    f.target = { x: s.x, y: s.y, z: s.z, m: s.m, flower: true };
    f.state = 'seek';
  } else {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * groundR * 0.7;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    f.target = { x, z, y: (currentHF ? currentHF(x, z) : 0) + (0.35 + Math.random() * 0.8) * k, m: null, flower: false };
    f.state = 'wander';
  }
}
const spotsOnlyOne = (spots) => new Set(spots.map((s) => s.m)).size <= 1;

function flyInsectTick(f, dt, t) {
  const d = f.d, u = f.u, k = proportion(), p = f.mesh.position, bee = d.kind === 'bee';
  if (f.state === 'pick') pickTarget(f);
  if (f.target && f.target.m && !trees.includes(f.target.m)) pickTarget(f); // la fleur a disparu
  let flying = true;
  if (f.state === 'seek' || f.state === 'wander') {
    const hover = f.state === 'seek' ? 0.9 * u : 0;
    const tx = f.target.x, ty = f.target.y + hover, tz = f.target.z;
    const dx = tx - p.x, dy = ty - p.y, dz = tz - p.z, dist = Math.hypot(dx, dy, dz);
    const v = (bee ? 0.55 : 0.2) * k * Math.min(1, dist / (4 * u + 1e-6) + 0.15);
    if (dist < 0.25 * u + 0.01) f.state = f.state === 'seek' ? 'land' : 'pick';
    else { p.x += (dx / dist) * v * dt; p.y += (dy / dist) * v * dt; p.z += (dz / dist) * v * dt; f.heading = turnTo(f.heading, Math.atan2(dx, dz), Math.min(1, dt * 7)); }
  } else if (f.state === 'land') {
    const ty = f.target.y + 0.25 * u, dy = ty - p.y;
    p.x += (f.target.x - p.x) * Math.min(1, dt * 4);
    p.z += (f.target.z - p.z) * Math.min(1, dt * 4);
    p.y += dy * Math.min(1, dt * 4);
    if (Math.abs(dy) < 0.05 * u) { f.state = 'rest'; f.timer = bee ? 1.5 + Math.random() * 3 : 7 + Math.random() * 9; }
  } else if (f.state === 'rest') {
    flying = false;
    f.timer -= dt;
    if (f.timer <= 0) { f.state = 'seek'; p.y += 0.4 * u; pickTarget(f); }
  }
  // en vol, un papillon flotte (oscillation latérale / verticale) ; l'abeille zigzague légèrement
  let ox = 0, oy = 0;
  if (flying) {
    const w = bee ? 6 : 3.5;
    ox = Math.sin(t * w + d.phase) * (bee ? 0.15 : 0.18) * u;
    oy = Math.sin(t * (bee ? 9 : 5.5) + d.phase * 2) * (bee ? 0.1 : 0.15) * u;
  }
  f.mesh.rotation.set(0, f.heading, 0);
  f.mesh.position.x = p.x + Math.cos(f.heading) * ox;
  f.mesh.position.z = p.z - Math.sin(f.heading) * ox;
  f.mesh.position.y = p.y + oy;
  // battements : abeille très rapide ; papillon ample, ailes ouvertes au repos
  const a = bee
    ? (flying ? Math.sin(t * 75 + d.phase) * 0.6 : Math.sin(t * 9 + d.phase) * 0.12) + 0.15
    : flying ? Math.sin(t * 8 + d.phase) * 0.8 + 0.25 : 0.75 + Math.sin(t * 0.7 + d.phase) * 0.15;
  f.wl.rotation.z = a;
  f.wr.rotation.z = -a;
  d.x = p.x; d.y = p.y; d.z = p.z; d.heading = f.heading;
}

// coccinelle : marche au sol, va au pied d'une fleur, grimpe sur la tige, se repose sur la corolle, redescend
function ladybugTick(f, dt, t) {
  const d = f.d, u = f.u, k = proportion(), p = f.mesh.position;
  const ground = (x, z) => (currentHF ? currentHF(x, z) : 0) + 0.2 * u;
  const sp = 0.09 * k;
  if (f.target && f.target.m && !trees.includes(f.target.m)) { f.target = null; f.state = 'walk'; f.c = 0; f.pitch = 0; }
  if (f.state === 'walk') {
    if (!f.target || f.target.done) {
      const spots = flowerSpots();
      if (spots.length && Math.random() < 0.8) { const s = spots[Math.floor(Math.random() * spots.length)]; f.target = { x: s.x, y: s.y, z: s.z, m: s.m, flower: true }; }
      else { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * groundR * 0.7; f.target = { x: Math.cos(a) * r, z: Math.sin(a) * r, m: null, flower: false }; }
    }
    const dx = f.target.x - p.x, dz = f.target.z - p.z, dist = Math.hypot(dx, dz);
    if (dist < 0.03 * k + 0.02) {
      if (f.target.flower) { f.state = 'climb'; f.c = 0; f.base = { x: p.x, y: p.y, z: p.z }; } else f.target = null;
    } else {
      const nx = p.x + (dx / dist) * sp * dt, nz = p.z + (dz / dist) * sp * dt;
      if (Math.hypot(nx, nz) < groundR * 0.95 && (!$('water').checked || !currentHF || currentHF(nx, nz) > waterLevel() + 0.02)) { p.x = nx; p.z = nz; } else f.target = null;
      p.y = ground(p.x, p.z);
      f.heading = turnTo(f.heading, Math.atan2(dx, dz), Math.min(1, dt * 6));
    }
  } else if (f.state === 'climb' || f.state === 'descend') {
    const up = f.state === 'climb', top = f.target.y, h0 = f.base.y, span = Math.max(0.05, top - h0);
    f.c = Math.min(1, f.c + (0.1 * k * dt) / span);
    const c = up ? f.c : 1 - f.c;
    p.x = f.base.x + (f.target.x - f.base.x) * c;
    p.z = f.base.z + (f.target.z - f.base.z) * c;
    p.y = h0 + (top - h0) * c + 0.15 * u;
    f.pitch = up ? Math.PI / 2 : -Math.PI / 2; // tête vers le haut en montant, vers le bas en descendant
    if (f.c >= 1) {
      if (up) { f.state = 'rest'; f.timer = 3 + Math.random() * 4; }
      else { f.state = 'walk'; f.target = null; f.pitch = 0; p.y = ground(p.x, p.z); }
      f.c = 0;
    }
  } else if (f.state === 'rest') {
    f.timer -= dt;
    f.pitch = 0.2;
    if (f.timer <= 0) { f.state = 'descend'; f.c = 0; }
  }
  f.mesh.rotation.set(-f.pitch, f.heading, 0);
  d.x = p.x; d.y = p.y; d.z = p.z; d.heading = f.heading;
}
function insectTick(f, dt, t) {
  if (f.d.kind === 'ladybug') ladybugTick(f, dt, t);
  else flyInsectTick(f, dt, t);
}
function addInsectOfKind(kind) {
  const d = newInsectDesc(kind);
  insectsData.push(d);
  addInsect(d);
}

// ---------- Feuilles qui tombent (option vrai / faux) ----------
// Des feuilles se détachent du feuillage des arbres, tombent en tournoyant et se posent au sol avant de repartir du haut.
let leafSys = null;
const leafMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true });
const _lm = new THREE.Matrix4(), _lq = new THREE.Quaternion(), _le = new THREE.Euler(), _lp = V3(0, 0, 0), _ls = V3(1, 1, 1), _lc = new THREE.Color();
// arbres qui ont du feuillage (cette saison : un arbre nu l'hiver n'en a plus)
function leafSource() {
  return trees.filter((m) => m.userData.spec && weather.seasonTree(m.userData.spec.q).density > 0);
}
// un point dans le feuillage d'un arbre (repère du monde) + la couleur de ses feuilles ; null s'il n'y a pas de feuillage
function canopyPoint() {
  const src = leafSource();
  if (!src.length) return null;
  const m = src[Math.floor(Math.random() * src.length)];
  const spots = m.userData.spots, sc = m.scale.x, r = m.rotation.y, c = Math.cos(r), s = Math.sin(r);
  let bx, by, bz;
  if (spots && spots.length > 2) { const sp = spots[Math.floor(Math.random() * spots.length)]; bx = sp[0]; by = sp[1]; bz = sp[2]; }
  else { // conifère : un point dans la couronne
    const bb = m.geometry.boundingBox || (m.geometry.computeBoundingBox(), m.geometry.boundingBox), rad = Math.max(0.2, Math.min(bb.max.x, bb.max.z));
    const a = Math.random() * 6.28, rr = rad * 0.6 * Math.sqrt(Math.random());
    bx = Math.cos(a) * rr; bz = Math.sin(a) * rr; by = bb.max.y * (0.35 + 0.5 * Math.random());
  }
  const q = weather.seasonTree(m.userData.spec.q);
  return {
    x: m.position.x + (c * bx + s * bz) * sc + (Math.random() - 0.5) * 0.1,
    y: m.position.y + by * sc,
    z: m.position.z + (-s * bx + c * bz) * sc + (Math.random() - 0.5) * 0.1,
    col: q.mix > 0 && Math.random() < q.mix / 100 ? q.fc2 : q.fc,
  };
}
function spawnLeaf(it) {
  const p = canopyPoint();
  if (!p) { it.state = 'off'; return; }
  it.x = p.x; it.y = p.y; it.z = p.z;
  it.state = 'fall';
  it.phase = Math.random() * 6.28;
  it.spin = [(Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3];
  it.rot = [Math.random() * 6, Math.random() * 6, Math.random() * 6];
  it.vy = 0.16 + Math.random() * 0.14;
  it.col = p.col;
  it.set = false;
}
function rebuildLeaves() {
  if (leafSys) { world.remove(leafSys.mesh); leafSys.mesh.geometry.dispose(); leafSys.mesh.dispose(); leafSys = null; }
  if (!$('fallingLeaves').checked) return;
  const n = clamp(leafSource().length * 40, 40, 400); // elles restent longtemps au sol : il en faut assez pour que certaines tombent encore
  const g = new THREE.OctahedronGeometry(1, 0);
  const lk = 0.14 * proportion(); // feuille visible et proportionnelle aux arbres
  g.scale(lk * 0.55, lk * 0.04, lk * 0.35);
  const mesh = new THREE.InstancedMesh(g, leafMat, n);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  const items = Array.from({ length: n }, () => ({ state: 'off', timer: Math.random() * 6 })); // départs étalés dans le temps
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  world.add(mesh);
  leafSys = { mesh, items, k: lk };
}
function leavesTick(dt, t) {
  if (!leafSys) return;
  const { mesh, items } = leafSys, k = proportion();
  items.forEach((it, i) => {
    if (it.state === 'off') {
      it.timer -= dt;
      if (it.timer <= 0) spawnLeaf(it);
    }
    if (it.state === 'fall') {
      it.y -= it.vy * k * dt;
      it.x += (Math.sin(t * 1.3 + it.phase) * 0.12 + 0.04) * k * dt; // balancement + léger vent
      it.z += Math.cos(t * 1.1 + it.phase) * 0.1 * k * dt;
      it.rot[0] += it.spin[0] * dt; it.rot[1] += it.spin[1] * dt; it.rot[2] += it.spin[2] * dt;
      const water = $('water').checked && currentHF && currentHF(it.x, it.z) < waterLevel();
      const ground = water ? waterLevel() : currentHF ? currentHF(it.x, it.z) : 0;
      if (it.y <= ground + 0.01) {
        it.y = ground + 0.01;
        it.state = water ? 'float' : 'ground'; // sur l'eau la feuille flotte ; sur terre elle reste posée
        it.timer = water ? 25 + Math.random() * 25 : 20 + Math.random() * 30; // elles restent longtemps avant de disparaître
        it.drift = Math.random() * 6.28;
      }
    } else if (it.state === 'float') {
      // flotte à la surface : dérive très lentement, tourne doucement, monte et descend avec l'eau
      const sp = 0.03 * k;
      it.x += Math.cos(it.drift + t * 0.05) * sp * dt;
      it.z += Math.sin(it.drift + t * 0.05) * sp * dt;
      it.rot[1] += 0.15 * dt;
      const stillWater = $('water').checked && currentHF && currentHF(it.x, it.z) < waterLevel();
      if (stillWater) it.y = waterLevel() + 0.012 + Math.sin(t * 1.4 + it.phase) * 0.004;
      else { it.state = 'ground'; it.y = (currentHF ? currentHF(it.x, it.z) : 0) + 0.01; } // la dérive l'a amenée sur la rive
      it.timer -= dt;
      if (it.timer <= 0) { it.state = 'off'; it.timer = Math.random() * 2; }
    } else if (it.state === 'ground') {
      it.timer -= dt;
      if (it.timer <= 0) { it.state = 'off'; it.timer = Math.random() * 2; }
    }
    if (it.state === 'off') { _ls.set(0, 0, 0); _lp.set(0, -100, 0); }
    else {
      _ls.set(1, 1, 1);
      _lp.set(it.x, it.y, it.z);
      if (it.state === 'ground') _le.set(0.05, it.rot[1], 0.05);
      else if (it.state === 'float') _le.set(0.05 + Math.sin(t * 1.4 + it.phase) * 0.04, it.rot[1], 0.05); // légère houle
      else _le.set(it.rot[0], it.rot[1], it.rot[2]);
      _lq.setFromEuler(_le);
    }
    if (it.state === 'off') _lq.identity();
    _lm.compose(_lp, _lq, _ls);
    mesh.setMatrixAt(i, _lm);
    if (!it.set && it.col) { _lc.set(it.col).offsetHSL((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.08); mesh.setColorAt(i, _lc); it.set = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  });
  mesh.instanceMatrix.needsUpdate = true;
}
$('fallingLeaves').addEventListener('input', rebuildLeaves);

// ---------- Préréglages d'arbres (raccourcis) ----------
const PRESET_BASE = {
  type: 'broad', trunkH: 1, trunkW: 0.18, levels: 4, kids: 2, angle: 42, lenR: 0.72, radR: 0.66, curv: 0.35, twist: 0.4, droop: 0, irr: 0.4,
  density: 60, leafSize: 0.24, leafShape: 'sphere', leafPoly: 2, leafVar: 0.3, squash: 0.85, hueVar: 0.015, mix: 0,
  fc: '#5fa14a', fc2: '#e0821f', tc: '#6b4a2f', fruit: 'none', fruitDensity: 0.6, pot: 'none', potColor: '#b5653f',
};
const TREE_PRESETS = [
  { id: 'poplar', name: 'Peuplier', seed: 21, q: { trunkH: 1.55, trunkW: 0.15, angle: 16, lenR: 0.8, radR: 0.6, curv: 0.08, twist: 0.1, droop: -0.35, irr: 0.25, density: 88, leafSize: 0.2, leafShape: 'cloud', squash: 1.15, fc: '#6fae3f', fc2: '#a5d35c', mix: 30, tc: '#8a7a63' } },
  { id: 'oak', name: 'Chêne', seed: 5, q: { trunkH: 0.8, trunkW: 0.3, kids: 3, angle: 58, lenR: 0.74, radR: 0.7, curv: 0.55, twist: 0.5, droop: 0.05, irr: 0.6, density: 72, leafSize: 0.3, leafShape: 'cloud', squash: 0.8, fc: '#4c8a38', fc2: '#6a9c3e', mix: 15, tc: '#5a4630' } },
  { id: 'ash', name: 'Frêne', seed: 9, q: { trunkH: 1.25, trunkW: 0.2, angle: 34, lenR: 0.78, radR: 0.64, curv: 0.25, twist: 0.3, droop: 0.1, irr: 0.35, density: 55, leafSize: 0.22, leafShape: 'leaf', fc: '#7db04a', fc2: '#a0c860', mix: 25, tc: '#7a6c58' } },
  { id: 'walnut', name: 'Noyer', seed: 14, q: { trunkH: 0.75, trunkW: 0.32, angle: 62, lenR: 0.75, radR: 0.7, curv: 0.5, twist: 0.45, irr: 0.5, density: 78, leafSize: 0.32, leafShape: 'cloud', squash: 0.85, fc: '#4a7f32', tc: '#6b5a44', fruit: 'walnut', fruitDensity: 0.4 } },
  { id: 'apple', name: 'Pommier', seed: 3, q: { trunkH: 0.6, trunkW: 0.22, kids: 3, angle: 64, lenR: 0.7, radR: 0.66, curv: 0.45, twist: 0.55, irr: 0.55, density: 68, leafSize: 0.26, fc: '#69a73f', tc: '#6b4a2f', fruit: 'apple', fruitDensity: 0.65 } },
  { id: 'cherry', name: 'Cerisier', seed: 12, q: { trunkH: 0.85, trunkW: 0.2, angle: 52, curv: 0.4, twist: 0.4, irr: 0.5, density: 70, leafSize: 0.24, fc: '#7bb34c', fc2: '#f4b8cf', mix: 10, tc: '#6e4a3a' } },
  { id: 'pear', name: 'Poirier', seed: 8, q: { trunkH: 1.0, trunkW: 0.2, angle: 30, lenR: 0.76, curv: 0.3, density: 68, leafSize: 0.24, fc: '#5fa044', fruit: 'pear', fruitDensity: 0.55 } },
  { id: 'orange', name: 'Oranger', seed: 6, q: { trunkH: 0.6, trunkW: 0.2, kids: 3, angle: 60, lenR: 0.7, curv: 0.3, twist: 0.3, irr: 0.3, density: 92, leafSize: 0.27, fc: '#2f7d3a', tc: '#6b4a2f', fruit: 'orange', fruitDensity: 0.7 } },
  { id: 'lemon', name: 'Citronnier', seed: 17, q: { trunkH: 0.65, trunkW: 0.2, kids: 3, angle: 58, curv: 0.35, irr: 0.35, density: 88, leafSize: 0.26, fc: '#4c9a3a', fruit: 'lemon', fruitDensity: 0.6 } },
  { id: 'plum', name: 'Prunier', seed: 4, q: { trunkH: 0.7, trunkW: 0.22, angle: 56, curv: 0.45, density: 70, leafSize: 0.25, fc: '#5a9a3e', fruit: 'plum', fruitDensity: 0.6 } },
  { id: 'willow', name: 'Saule pleureur', seed: 2, q: { trunkH: 0.95, trunkW: 0.26, kids: 3, angle: 48, curv: 0.6, twist: 0.4, droop: 1, irr: 0.5, density: 88, leafSize: 0.2, leafShape: 'cloud', fc: '#8cb85a', fc2: '#a8cc70', mix: 20, tc: '#6b5a44', leafShape: 'strand', leafSize: 0.2 } },
  { id: 'birch', name: 'Bouleau', seed: 31, q: { trunkH: 1.3, trunkW: 0.14, angle: 28, lenR: 0.78, curv: 0.3, droop: 0.35, irr: 0.4, density: 70, leafSize: 0.2, fc: '#8fc060', tc: '#e8e4da' } },
  { id: 'bamboo', name: 'Bambou', seed: 7, q: { type: 'bamboo', trunkH: 1.5, trunkW: 0.3, kids: 3, angle: 24, curv: 0.5, density: 85, leafSize: 0.15, leafShape: 'sphere', fc: '#6aa84a', fc2: '#a3c45a', mix: 25, hueVar: 0.02, tc: '#86a84a' } },
  { id: 'fir', name: 'Sapin', seed: 1, q: { type: 'conifer', trunkH: 1.1, trunkW: 0.18, density: 70, leafSize: 0.3, fc: '#2f6b3a', tc: '#5a3d28' } },
];
const presetQ = (p) => ({ ...PRESET_BASE, ...p.q, alba: true, ground: false });
// ---------- Arbres : + ajoute un arbre du type choisi, − retire le dernier ----------
const TREE_SC = 0.65; // échelle d'un arbre ajouté (un arbre « normal » fait environ 1,7 unité de haut)
const treeSpecOf = (p, sd) => ({ seed: sd, q: { ...params(), ...presetQ(p), alba: $('alba').checked, relief: num('relief'), hillSize: num('hillSize'), preset: p.id } });
// un emplacement libre : sur la terre ferme, sans trop chevaucher les autres couronnes
function freeSpot(rr) {
  let x = 0, z = 0;
  for (let k = 0; k < 80; k++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * Math.max(0, groundR - rr - 0.3);
    x = Math.cos(a) * d; z = Math.sin(a) * d;
    if ($('water').checked && currentHF && currentHF(x, z) < waterLevel() + 0.2) continue;
    const gap = 0.75 - 0.5 * (k / 80);
    if (trees.every((m) => !m.userData.spec || Math.hypot(m.position.x - x, m.position.z - z) >= (m.userData.radius + rr) * gap)) break;
  }
  return { x, z };
}
function addPresetTree(p) {
  if (!groundMesh) return null;
  const spec = treeSpecOf(p, 1 + Math.floor(Math.random() * 90000));
  const made = makeTree(spec.q, spec.seed, null);
  const sc = TREE_SC * (0.85 + 0.3 * Math.random()), rr = made.radial * sc, { x, z } = freeSpot(rr);
  const m = addTree(made.geo, x, currentHF ? currentHF(x, z) : 0, z, sc, Math.random() * Math.PI * 2, rr);
  Object.assign(m.userData, { spec, trunk: made.trunk, spots: made.spots });
  rebuildLeaves();
  setStatus(`${p.name} ajouté · ${faceCount()} faces`);
  return m;
}
function removePresetTree(p) {
  for (let i = trees.length - 1; i >= 0; i--) {
    if (trees[i].userData.spec?.q.preset === p.id) { dropMesh(trees[i]); rebuildLeaves(); return; }
  }
}
// réglages de forme : ils s'appliquent à l'arbre sélectionné
function fillTreeUi(q) {
  TREE_IDS.forEach((id) => { if (q[id] !== undefined) $(id).value = q[id]; });
  showValues();
}
function remakeTree(m) {
  const spec = m.userData.spec;
  if (!spec || !trees.includes(m)) return;
  const sk = isBroad(spec.q) && validSkel(spec.skeleton) ? spec.skeleton : null;
  const made = makeTree(spec.q, spec.seed, sk);
  const old = m.geometry;
  m.geometry = made.geo;
  old.dispose();
  Object.assign(m.userData, { trunk: made.trunk, spots: made.spots, radius: made.radial * m.userData.baseScale });
  rebuildLeaves();
  if (selected === m) placeRing();
  setStatus(`${faceCount()} faces`);
}
let treeEditTimer;
function applyUiToSelected() {
  const m = selected;
  if (!m || !m.userData.spec) { setStatus('Clique un arbre dans la vue pour régler sa forme.'); return; }
  const spec = m.userData.spec, q = params(), nq = { ...spec.q };
  TREE_IDS.forEach((id) => (nq[id] = q[id]));
  if (shapeSig(nq) !== shapeSig(spec.q)) delete spec.skeleton; // forme changée : les branches retouchées à la main n'ont plus lieu d'être
  spec.q = nq;
  clearTimeout(treeEditTimer);
  treeEditTimer = setTimeout(() => remakeTree(m), 40);
}
// clic sur le nom d'un type : l'arbre sélectionné prend ce type
function morphSelected(p) {
  const m = selected;
  if (!m || !m.userData.spec) { setStatus('Sélectionne un arbre pour changer son type.'); return; }
  const spec = m.userData.spec;
  spec.q = treeSpecOf(p, spec.seed).q;
  delete spec.skeleton;
  fillTreeUi(spec.q);
  remakeTree(m);
}

// ---------- Aperçus 3D : vignettes rendues hors écran avec les vrais modèles ----------
const thumbCache = new Map();
let thumbR = null, thumbScene = null, thumbCam = null;
const matThumb = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
const tm = (geo) => new THREE.Mesh(geo, matThumb);
function thumbInit() {
  if (thumbR) return;
  thumbR = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, alpha: true, preserveDrawingBuffer: true });
  thumbR.setPixelRatio(1);
  thumbR.setSize(160, 160, false);
  thumbR.setClearColor(0x000000, 0);
  thumbScene = new THREE.Scene();
  thumbScene.add(new THREE.HemisphereLight(0xffffff, 0x667755, 1.6));
  const dl = new THREE.DirectionalLight(0xffffff, 2.2);
  dl.position.set(3, 5, 2);
  thumbScene.add(dl);
  thumbCam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
}
function renderThumb(group) {
  thumbInit();
  group.updateMatrixWorld(true);
  thumbScene.add(group);
  const box = new THREE.Box3().setFromObject(group), c = box.getCenter(new THREE.Vector3());
  const r = box.getSize(new THREE.Vector3()).length() / 2 || 0.5;
  const dist = (r / Math.sin(THREE.MathUtils.degToRad(15))) * 1.02;
  thumbCam.position.copy(c).add(new THREE.Vector3(0.75, 0.4, 1).normalize().multiplyScalar(dist));
  thumbCam.near = dist * 0.05; thumbCam.far = dist * 4;
  thumbCam.updateProjectionMatrix();
  thumbCam.lookAt(c);
  thumbR.render(thumbScene, thumbCam);
  const url = thumbR.domElement.toDataURL('image/png');
  thumbScene.remove(group);
  return url;
}
function disposeGroup(g) {
  g.traverse((o) => {
    o.geometry?.dispose();
    if (o.material && o.material !== matThumb) { o.material.map?.dispose(); o.material.dispose(); }
  });
}
// groupe 3D d'aperçu pour une clé (« fish », « flower:rose », « tree:oak », « insect:bee »…)
function previewGroup(key) {
  const [kind, arg] = key.split(':');
  const g = new THREE.Group();
  const withKids = (body, kids) => { const m = tm(body); kids.forEach(([geo, pos, rot]) => { const k = tm(geo); k.position.copy(pos); if (rot) k.rotation.set(...rot); m.add(k); }); return m; };
  switch (kind) {
    case 'tree': {
      const p = TREE_PRESETS.find((x) => x.id === arg);
      g.add(tm(makeTreeBase(presetQ(p), p.seed).geo)); // sans la saison : l'aperçu montre l'arbre « normal »
      break;
    }
    case 'fish': { const d = { seed: 7, size: 0.6, alba: true, kind: 'koi' }, m = makeFish(d); g.add(withKids(m.body, [[m.tail, V3(0, 0, -0.85 * d.size)]])); break; }
    case 'egret': { const m = makeEgret({ seed: 1, size: 1, alba: true }); g.add(withKids(m.body, [[m.neck, m.pivot]])); break; }
    case 'ibis': { const m = makeIbis({ seed: 1, size: 1, alba: true }); g.add(withKids(m.body, [[m.neck, m.pivot]])); break; }
    case 'flamingo': { const m = makeFlamingo({ seed: 1, size: 1, alba: true }); g.add(withKids(m.body, [[m.neck, m.pivot]])); break; }
    case 'heron': { const m = makeHeron({ seed: 1, size: 1, alba: true }); g.add(withKids(m.body, [[m.neck, m.pivot]])); break; }
    case 'frog': { const m = makeFrog({ seed: 2, size: 1, alba: true }); g.add(withKids(m.body, [[m.throat, m.pivot]])); break; }
    case 'kingfisher': { const m = makeKingfisher({ seed: 4, size: 1, alba: true }); g.add(withKids(m.body, [[m.head, m.headPivot]])); break; }
    case 'shoveler': { const m = makeTeal({ seed: 4, size: 1, alba: true, kind: 'shoveler' }); g.add(withKids(m.body, [[m.tail, m.pivot], [m.head, m.headPivot]])); break; }
    case 'teal': { const m = makeTeal({ seed: 4, size: 1, alba: true }); g.add(withKids(m.body, [[m.tail, m.pivot], [m.head, m.headPivot]])); break; }
    case 'custom': { const def = allCustomDefs().find((x) => x.id === arg); if (def) g.add(tm(bakeCustom(def))); break; }
    case 'wagtail': { const m = makeWagtail({ seed: 4, size: 1, alba: true }); g.add(withKids(m.body, [[m.tail, m.pivot]])); break; }
    case 'pecker': { // le pic sur un morceau de tronc, tête en haut
      const m = makeWoodpecker({ seed: 3, size: 0.5, alba: true });
      const trunk = tm(finish(new THREE.CylinderGeometry(0.3, 0.36, 3, 7, 3), () => birdTone('#6b4a2f', 0, true)));
      const bird = withKids(m.body, [[m.head, m.pivot]]);
      bird.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(0, 0, 1), V3(1, 0, 0), V3(0, 1, 0)));
      bird.position.set(0.5, 0.6, 0);
      g.add(trunk, bird);
      break;
    }
    case 'gull': case 'swallow': case 'hoopoeFly': {
      const d = { seed: 2, size: 1, alba: true }, m = kind === 'gull' ? makeGull(d) : kind === 'hoopoeFly' ? makeHoopoeFlyer(d) : makeSwallow(d);
      const b = tm(m.body), wl = tm(m.left), wr = tm(m.right);
      wl.position.copy(m.pivot); wr.position.set(-m.pivot.x, m.pivot.y, m.pivot.z);
      wl.rotation.z = 0.3; wr.rotation.z = -0.3;
      b.add(wl, wr);
      g.add(b);
      break;
    }
    case 'dragon': {
      const m = makeDragonfly({ seed: 3, size: 1, alba: true, kind: 'dragon' }), b = tm(m.body);
      for (const dz of [0.04, -0.02]) {
        const l = tm(m.left), r = tm(m.right);
        l.position.set(0.03 * m.u, 0.03 * m.u, dz * m.u); r.position.set(-0.03 * m.u, 0.03 * m.u, dz * m.u);
        l.rotation.z = 0.25; r.rotation.z = -0.25;
        b.add(l, r);
      }
      g.add(b);
      break;
    }
    case 'insect': {
      const d = { kind: arg, seed: 1, variant: 0, alba: true }, m = makeInsect(d, 1), b = tm(m.body);
      if (m.wings) {
        const wl = tm(m.wings[0]), wr = tm(m.wings[1]);
        wl.position.copy(m.pivot); wr.position.set(-m.pivot.x, m.pivot.y, m.pivot.z);
        const a = arg === 'butterfly' ? 0.8 : 0.35;
        wl.rotation.z = a; wr.rotation.z = -a;
        b.add(wl, wr);
      }
      g.add(b);
      break;
    }
    case 'flower': g.add(tm(makeFlowerClump({ type: arg, seed: 5, rel: 1 / proportion(), n: 5, alba: true }).geo)); break;
    case 'lily': g.add(tm(makeLily({ seed: 3, size: 1, flower: true, alba: true }))); break;
    case 'duck': g.add(tm(makeDuck({ seed: 2, size: 0.45, alba: true }))); break;
    case 'tuft': g.add(tm(makeTuft({ seed: 4, size: 1, blades: 9, bend: 0.5, color: '#6fb04f', kind: arg === 'mix' ? 'blades' : arg, flower: '#f2b8d8', alba: true }))); break;
    case 'rock': g.add(tm(makeRock({ seed: 8, size: 1, flat: 0.7, rough: 0.5, moss: 0.25, color: '#9a9ea6', alba: true }))); break;
    case 'bridge': { g.add(tm(makeBridge({ type: arg || 'wood', len: 1.6, w: 0.4, h: 0.25, rail: true, color: '#a9794c', seed: 3, alba: true }))); break; }
    case 'stairs': { const gg = makeStairs({ type: arg || 'stone', steps: 8, w: 0.3, sh: 0.05, rail: true, color: '#bdb5a3', seed: 3, alba: true }); g.add(tm(gg)); break; }
    case 'bench': g.add(tm(makeBench({ seed: 1, size: 1, back: true, wood: '#b9854e', alba: true }))); break;
    case 'sign': {
      const s = makeSign({ seed: 2, h: 1, wood: '#c8955a', alba: true, boards: [{ text: 'Forêt', angle: 0.4, dir: 1, len: 1 }, { text: 'Lac', angle: 2.6, dir: -1, len: 1.1 }] });
      g.add(tm(s.geo));
      s.labels.forEach((l) => l.planes.forEach((pg) => g.add(new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: l.tex, transparent: true, alphaTest: 0.2 })))));
      break;
    }
  }
  return g;
}
function getThumb(key) {
  if (thumbCache.has(key)) return thumbCache.get(key);
  const g = previewGroup(key);
  const url = renderThumb(g);
  disposeGroup(g);
  thumbCache.set(key, url);
  return url;
}
// les vignettes sont générées l'une après l'autre (sans bloquer l'interface) ; MessageChannel : pas ralenti en arrière-plan
const thumbQueue = [];
let thumbBusy = false;
const thumbChan = new MessageChannel();
thumbChan.port1.onmessage = () => {
  const job = thumbQueue.shift();
  if (!job) { thumbBusy = false; return; }
  try { job.img.src = getThumb(job.key); } catch (e) { console.warn('aperçu impossible :', job.key, e); }
  thumbChan.port2.postMessage(0);
};
function enqueueThumb(img, key) {
  thumbQueue.push({ img, key });
  if (!thumbBusy) { thumbBusy = true; thumbChan.port2.postMessage(0); }
}
// clés d'aperçu des lignes « espèce » (par nom affiché)
const THUMB_KEYS = {
  ...Object.fromEntries(TREE_PRESETS.map((p) => [p.name, 'tree:' + p.id])),
  'Carpe koï': 'fish', 'Héron': 'heron', 'Flamant rose': 'flamingo', 'Ibis falcinelle': 'ibis', 'Héron garde-bœufs': 'egret', 'Pic': 'pecker', 'Sarcelle': 'teal', 'Canard souchet': 'shoveler', 'Martin-pêcheur': 'kingfisher', 'Grenouille': 'frog', 'Bergeronnette': 'wagtail', 'Mouette': 'gull', 'Huppe (en vol)': 'hoopoeFly', 'Hirondelle': 'swallow', 'Libellule': 'dragon',
  'Abeille': 'insect:bee', 'Papillon': 'insect:butterfly', 'Coccinelle': 'insect:ladybug', 'Nénuphar': 'lily', "Lentille d'eau": 'duck',
  ...Object.fromEntries(Object.entries(FLOWER_NAMES).map(([type, name]) => [name, 'flower:' + type])),
};
function renderPreviews() {
  document.querySelectorAll('img[data-prev]').forEach((img) => {
    const kind = img.dataset.prev;
    enqueueThumb(img, kind === 'tuft' ? 'tuft:' + $('tuftKind').value : kind);
  });
}
$('tuftKind').addEventListener('input', () => {
  const img = document.querySelector('img[data-prev="tuft"]');
  if (img) enqueueThumb(img, 'tuft:' + $('tuftKind').value);
});

// ---------- Onglets du panneau ----------
// clic sur un objet de la scène : ouvre l'onglet et la section de ses réglages (et la fait défiler dans la vue)
function revealMenuFor(m) {
  const u = m.userData;
  let tab = null, id = null;
  if (u.spec) tab = 'tree';
  else if (u.rock) [tab, id] = ['nature', 'rockSize'];
  else if (u.tuft) [tab, id] = ['nature', 'tuftSize'];
  else if (u.flower) [tab, id] = ['nature', 'flowerSize'];
  else if (u.lily || u.duck) [tab, id] = ['nature', 'plantRows'];
  else if (u.sign) [tab, id] = ['decor', 'signHeight'];
  else if (u.bench) [tab, id] = ['decor', 'benchSize'];
  else if (u.stairs) [tab, id] = ['decor', 'stairsType'];
  else if (u.bridge) [tab, id] = ['decor', 'bridgeType'];
  else if (u.fish) [tab, id] = ['animals', 'fishSize'];
  else if (u.heron) [tab, id] = ['animals', u.heron.d.kind === 'flamingo' ? 'flamingoSize' : u.heron.d.kind === 'ibis' ? 'ibisSize' : u.heron.d.kind === 'egret' ? 'egretSize' : 'heronSize'];
  else if (u.frog) [tab, id] = ['animals', 'frogSize'];
  else if (u.wagtail) [tab, id] = ['animals', u.wagtail.d.kind === 'teal' ? 'tealSize' : u.wagtail.d.kind === 'shoveler' ? 'shovelerSize' : u.wagtail.d.kind === 'kingfisher' ? 'kingfisherSize' : u.wagtail.d.kind === 'custom' ? 'customSel' : 'wagtailSize'];
  if (!tab) return;
  showTab(tab);
  const el = id && $(id);
  if (!el) return;
  for (let p = el.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true; // sections repliées : on les ouvre
  el.closest('label,div')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}
// ---------- Atelier d'animaux : une scène vide où l'on assemble et déforme des formes (patate, sphère…) pour créer son propre animal ----------
// Un animal personnalisé est une liste de pièces { shape, pos, rot (°), scl, color, mirror, verts }. `verts` = positions des sommets après sculpture
// (la forme de départ est régénérée à l'identique, on ne stocke que ce qui a été déformé). La bibliothèque est gardée dans le navigateur et dans les scènes.
let customLibrary = [];
try { customLibrary = JSON.parse(localStorage.getItem('lowpoly-custom-animals') || '[]'); } catch { customLibrary = []; }
// animaux « de série » construits par l'atelier (huppe fasciée, mésange charbonnière) : assemblés une fois, dans un atelier invisible, et proposés dans l'onglet Animaux
const BUILTIN_ANIMALS = [{ id: 'builtin-huppe', name: 'Huppe fasciée', gait: 'walk', build: () => atelierBuildHoopoe() }, { id: 'builtin-huppe-vol', name: 'Huppe fasciée (en vol)', hidden: true, build: () => atelierBuildHoopoeFlying() }, { id: 'builtin-mesange', name: 'Mésange charbonnière', gait: 'hop', build: () => atelierBuildGreatTit() }];
let builtinDefs = null;
function builtinCustomDefs() {
  if (builtinDefs) return builtinDefs;
  builtinDefs = [];
  const prev = atelier, nameEl = $('atName'), sizeEl = $('atSize'), n0 = nameEl.value, s0 = sizeEl.value, st0 = $('status') ? $('status').textContent : null;
  for (const b of BUILTIN_ANIMALS) {
    atelier = { group: new THREE.Group(), parts: [], uid: 0, sel: null, mode: 'move', hidden: [], drag: null, downAt: null, editId: null, anim: null };
    try { b.build(); builtinDefs.push({ id: b.id, name: b.name, size: +sizeEl.value, parts: atelierPartsOut(), rev: 1, builtin: true, gait: b.gait, hidden: !!b.hidden }); } catch (e) { console.error('animal de série : ' + b.name, e); }
    for (const p of atelier.parts) p.geo.dispose();
  }
  atelier = prev;
  nameEl.value = n0; sizeEl.value = s0;
  if (st0 != null) $('status').textContent = st0;
  if (atelier) { atelierSelect(atelier.sel); atelierRenderList(); } // l'atelier ouvert retrouve son affichage
  return builtinDefs;
}
const allCustomDefs = () => [...builtinCustomDefs(), ...customLibrary];
const saveCustomLibrary = () => { try { localStorage.setItem('lowpoly-custom-animals', JSON.stringify(customLibrary)); } catch { /* stockage plein */ } };
function mergeCustomLibrary(list) {
  if (!Array.isArray(list)) return;
  for (const def of list) if (def && def.id && !customLibrary.some((x) => x.id === def.id)) customLibrary.push(def);
  saveCustomLibrary();
}
const AT_SHAPES = { quill: 'Lame (bout rond)', quillBase: 'Lame (fût)', quillTip: 'Lame (bout)', feather: 'Plume (forme)', beakUp: 'Bec (haut)', beakLow: 'Bec (bas)', beakUpC: 'Bec recourbé (haut)', beakLowC: 'Bec recourbé (bas)', claw: 'Griffe', patch: 'Aile (tranche du corps)', ring: 'Rond', plume: 'Plume', hip: 'Bassin', thigh: 'Cuisse', shin: 'Jambe', foot: 'Patte', leg: 'Patte (ancienne)', tail: 'Queue', potato: 'Patate', potatoFine: 'Patate fine', sphere: 'Tête', egg: 'Corps', head: 'Tête ovale', cylinder: 'Cylindre', cone: 'Cône', box: 'Cube', capsule: 'Capsule', disc: 'Disque plat', wing: 'Aile', spike: 'Pointe', beak: 'Bec', beakWide: 'Bec large', eye: 'Œil' };
// forme de départ : géométrie indexée (sommets soudés) pour que la sculpture déplace des sommets partagés
// niveau de détail L (1 à 8) : finesse du maillage ; les valeurs par défaut reproduisent les formes d'origine
const AT_DETAIL0 = { patch: 4, ring: 3, plume: 2, hip: 3, thigh: 2, shin: 2, foot: 2, leg: 2, tail: 2, potato: 2, potatoFine: 3, sphere: 2, head: 2, egg: 3, disc: 2, wing: 2, eye: 1, cylinder: 3, cone: 3, box: 3, capsule: 3, spike: 1, beak: 2, beakWide: 2 };
const atDetailOf = (shape, def) => clamp(Math.round(def?.detail ?? AT_DETAIL0[shape] ?? 2), 1, 8);
// tranche du corps : P.pts = points de la surface (centre puis R anneaux de S points), épaissie vers l'intérieur de P.thick ; P.mir = symétrique en X
function atelierShellGeo(P) {
  const R = P.R, S = P.S, n = 1 + R * S, outer = [], inner = [], mx = P.mir ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const p = V3(P.pts[i * 3] * mx, P.pts[i * 3 + 1], P.pts[i * 3 + 2]), nn = p.clone().normalize();
    outer.push(p.clone().addScaledVector(nn, P.out || 0.004));
    inner.push(p.clone().addScaledVector(nn, -P.thick));
  }
  const ring = (r, k) => 1 + (r - 1) * S + ((k % S) + S) % S;
  const tris = [];
  const add = (V, a, b, c, dirSign, ref) => { // triangle orienté : sa normale doit regarder dans le sens dirSign · (centre du triangle - ref)
    const A = V[a], B = V[b], C = V[c], nrm = B.clone().sub(A).cross(C.clone().sub(A)), mid = A.clone().add(B).add(C).multiplyScalar(1 / 3).sub(ref);
    tris.push(nrm.dot(mid) * dirSign >= 0 ? [A, B, C] : [A, C, B]);
  };
  const o0 = V3(0, 0, 0);
  for (let k = 0; k < S; k++) { add(outer, 0, ring(1, k), ring(1, k + 1), 1, o0); add(inner, 0, ring(1, k), ring(1, k + 1), -1, o0); }
  for (let r = 1; r < R; r++) for (let k = 0; k < S; k++) {
    const a = ring(r, k), b = ring(r, k + 1), c = ring(r + 1, k), d = ring(r + 1, k + 1);
    add(outer, a, c, b, 1, o0); add(outer, b, c, d, 1, o0); add(inner, a, c, b, -1, o0); add(inner, b, c, d, -1, o0);
  }
  const ctr = outer[0].clone();
  for (let k = 0; k < S; k++) { // tranche du bord
    const a = ring(R, k), b = ring(R, k + 1), pa = outer[a], pb = outer[b], qa = inner[a], qb = inner[b], mid = pa.clone().add(pb).multiplyScalar(0.5).sub(ctr);
    for (const t of [[pa, pb, qa], [pb, qb, qa]]) { const nrm = t[1].clone().sub(t[0]).cross(t[2].clone().sub(t[0])); tris.push(nrm.dot(mid) >= 0 ? t : [t[0], t[2], t[1]]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flatMap((t) => t.flatMap((v) => [v.x, v.y, v.z])), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(tris.length * 9).fill(1), 3));
  const m = mergeVertices(g, 1e-4);
  g.dispose();
  return m;
}
// coque d'œuf coupée par un plan : la peau de la forme P.shell (épaisseur P.t = fraction du rayon, vers l'intérieur), seulement du côté P.keep du plan { n, d } (repère local) ; P.mir = symétrique en X
function atelierEggShellGeo(P) {
  const g0 = atelierGeo(P.shell, P.detail), pos = g0.attributes.position, ind = g0.index.array, n = V3(...P.n), mx = P.mir ? -1 : 1;
  const tris = [], rim = [];
  const segs = [[], []];
  for (let layer = 0; layer < 2; layer++) {
    const f = layer ? 1 - P.t : 1.02; // la peau dépasse un peu du corps (pas de scintillement)
    for (let t = 0; t < ind.length; t += 3) {
      const poly = [0, 1, 2].map((i) => V3(pos.getX(ind[t + i]), pos.getY(ind[t + i]), pos.getZ(ind[t + i])).multiplyScalar(f));
      if (layer) poly.reverse(); // la face intérieure regarde vers le centre
      const res = [], ent = [];
      for (let i = 0; i < 3; i++) {
        const a = poly[i], b = poly[(i + 1) % 3], da = P.keep * (n.dot(a) - P.d), db = P.keep * (n.dot(b) - P.d);
        if (da >= 0) res.push(a);
        if ((da >= 0) !== (db >= 0)) { const x = a.clone().lerp(b, da / (da - db)); res.push(x); ent.push(x); }
      }
      for (let i = 1; i + 1 < res.length; i++) tris.push([res[0], res[i], res[i + 1]]);
      segs[layer][t / 3] = ent.length === 2 ? ent : null;
    }
  }
  const outDir = n.clone().multiplyScalar(-P.keep); // la tranche regarde vers le côté enlevé
  for (let k = 0; k < segs[0].length; k++) {
    const o = segs[0][k], i2 = segs[1][k];
    if (!o || !i2) continue;
    for (const q of [[o[0], o[1], i2[0]], [o[1], i2[1], i2[0]]]) {
      const nrm = q[1].clone().sub(q[0]).cross(q[2].clone().sub(q[0]));
      rim.push(nrm.dot(outDir) >= 0 ? q : [q[0], q[2], q[1]]);
    }
  }
  const all = tris.concat(rim).map((q) => (P.mir ? [q[0], q[2], q[1]] : q));
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(all.flatMap((q) => q.flatMap((v) => [v.x * mx, v.y, v.z])), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(all.length * 9).fill(1), 3));
  g = mergeVertices(g, 1e-4);
  g0.dispose();
  return g;
}
// bande d'aile : P.pts = grille de (P.nu + 1) × (P.nv + 1) points posés sur le corps, épaissie de P.thick vers l'axe du corps ; P.mir = symétrique en X
function atelierGridGeo(P) {
  const nu = P.nu, nv = P.nv, mx = P.mir ? -1 : 1, outer = [], inner = [], ctr = V3(0, 0, 0);
  for (let i = 0; i < (nu + 1) * (nv + 1); i++) {
    const p = V3(P.pts[i * 3] * mx, P.pts[i * 3 + 1], P.pts[i * 3 + 2]), rad = P.flat ? V3(P.flat[0] * mx, P.flat[1], P.flat[2]) : P.sph ? p.clone() : V3(p.x, 0, p.z);
    if (rad.lengthSq() < 1e-10) rad.set(mx, 0, 0);
    rad.normalize();
    outer.push(p);
    inner.push(p.clone().addScaledVector(rad, -P.thick));
    ctr.add(p);
  }
  ctr.multiplyScalar(1 / outer.length);
  const id = (u, v) => u * (nv + 1) + v, tris = [];
  const face = (a, b, c, sign) => { // orienté vers l'extérieur du corps (sign = 1) ou vers son axe (sign = -1)
    const nrm = b.clone().sub(a).cross(c.clone().sub(a));
    if (nrm.lengthSq() < 1e-14) return;
    const mid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    tris.push(nrm.dot(P.flat ? V3(P.flat[0] * mx, P.flat[1], P.flat[2]) : P.sph ? mid : V3(mid.x, 0, mid.z)) * sign >= 0 ? [a, b, c] : [a, c, b]);
  };
  const edge = (a, b, a2, b2) => { // tranche du bord : regarde à l'opposé du centre de la bande
    const mid = a.clone().add(b).multiplyScalar(0.5).sub(ctr);
    for (const t of [[a, b, a2], [b, b2, a2]]) {
      const nrm = t[1].clone().sub(t[0]).cross(t[2].clone().sub(t[0]));
      if (nrm.lengthSq() < 1e-14) continue;
      tris.push(nrm.dot(mid) >= 0 ? t : [t[0], t[2], t[1]]);
    }
  };
  for (let u = 0; u < nu; u++) for (let v = 0; v < nv; v++) {
    const a = id(u, v), b = id(u + 1, v), c = id(u, v + 1), d = id(u + 1, v + 1);
    face(outer[a], outer[b], outer[c], 1); face(outer[b], outer[d], outer[c], 1);
    face(inner[a], inner[b], inner[c], -1); face(inner[b], inner[d], inner[c], -1);
  }
  for (let u = 0; u < nu; u++) { edge(outer[id(u, 0)], outer[id(u + 1, 0)], inner[id(u, 0)], inner[id(u + 1, 0)]); edge(outer[id(u, nv)], outer[id(u + 1, nv)], inner[id(u, nv)], inner[id(u + 1, nv)]); }
  for (let v = 0; v < nv; v++) { edge(outer[id(0, v)], outer[id(0, v + 1)], inner[id(0, v)], inner[id(0, v + 1)]); edge(outer[id(nu, v)], outer[id(nu, v + 1)], inner[id(nu, v)], inner[id(nu, v + 1)]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flatMap((t) => t.flatMap((p) => [p.x, p.y, p.z])), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(tris.length * 9).fill(1), 3));
  const m = mergeVertices(g, 1e-5);
  g.dispose();
  return m;
}
function atelierGeo(shape, L = AT_DETAIL0[shape] ?? 2, params = null) {
  if (shape === 'patch' && params && params.nu) return atelierGridGeo(params);
  if (shape === 'patch' && params && params.shell) return atelierEggShellGeo(params);
  if (shape === 'patch' && params) return atelierShellGeo(params);
  const rad = 4 + 2 * L; // nombre de côtés des formes de révolution
  let g;
  switch (shape) {
    case 'potato': case 'potatoFine': case 'egg': g = new THREE.IcosahedronGeometry(0.3, L); break;
    case 'cylinder': g = new THREE.CylinderGeometry(0.15, 0.15, 0.6, rad, 2 + L); break;
    case 'cone': g = new THREE.ConeGeometry(0.2, 0.6, rad, 1 + L); break;
    case 'box': g = new THREE.BoxGeometry(0.5, 0.5, 0.5, L, L, L); break;
    case 'capsule': g = new THREE.CapsuleGeometry(0.12, 0.4, 1 + L, rad); break;
    case 'disc': g = new THREE.IcosahedronGeometry(0.3, L); g.scale(1, 0.13, 1.4); break;
    case 'wing': g = new THREE.IcosahedronGeometry(0.3, L); g.scale(1.4, 0.09, 0.75); g.translate(0.4, 0, 0); break; // ovale aplati, pivot à la racine : s'étire vers l'extérieur
    case 'head': g = new THREE.IcosahedronGeometry(0.2, L); break;
    case 'beak': case 'beakUp': case 'beakLow': case 'beakUpC': case 'beakLowC': g = new THREE.ConeGeometry(0.06, 0.3, rad, 1 + L); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.15); g.scale(1.1, 0.7, 1); break;
    case 'beakWide': g = new THREE.ConeGeometry(0.1, 0.3, rad, 1 + L); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.15); g.scale(1.7, 0.35, 1); break; // bec de canard, large et plat
    case 'eye': g = new THREE.IcosahedronGeometry(0.03, L); break;
    case 'quill': { // lame régulière à bout arrondi : racine à l'origine, part vers -Z, plate dans le plan X-Z
      const w = 0.04, sh = new THREE.Shape();
      sh.moveTo(-w, 0); sh.lineTo(w, 0); sh.lineTo(w, 0.7 - w); sh.absarc(0, 0.7 - w, w, 0, Math.PI, false); sh.lineTo(-w, 0);
      g = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false, curveSegments: 6 });
      g.rotateX(-Math.PI / 2); g.translate(0, -0.015, 0);
      break;
    }
    case 'quillBase': { // fût de la lame : rectangle de 0 à -0,525 en Z
      const w = 0.04, sh = new THREE.Shape();
      sh.moveTo(-w, 0); sh.lineTo(w, 0); sh.lineTo(w, 0.525); sh.lineTo(-w, 0.525); sh.lineTo(-w, 0);
      g = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false });
      g.rotateX(-Math.PI / 2); g.translate(0, -0.015, 0);
      break;
    }
    case 'quillTip': { // bout de la lame : court rectangle terminé en demi-cercle, racine à l'origine, vers -Z (longueur 0,175)
      const w = 0.04, sh = new THREE.Shape();
      const Lt = 0.175; // bout pointu, arrondi d'un seul côté : le côté +X s'incurve jusqu'à la pointe, le côté -X monte presque droit
      sh.moveTo(-w, 0); sh.lineTo(w, 0); sh.lineTo(w, Lt - 2.5 * w); sh.quadraticCurveTo(w, Lt, -0.3 * w, Lt); sh.lineTo(-w, Lt - 0.8 * w); sh.lineTo(-w, 0);
      g = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false, curveSegments: 6 });
      g.rotateX(-Math.PI / 2); g.translate(0, -0.015, 0);
      break;
    }
    case 'feather': { // plume irrégulière : contour un peu dentelé et dissymétrique (varie avec params.seed), vrillée et incurvée plus loin
      const rng = mulberry32((params && params.seed) || 7), n = 14, right = [], left = [], asym = 0.8 + 0.4 * rng(), notchR = 4 + Math.floor(rng() * 8), notchL = 4 + Math.floor(rng() * 8);
      for (let i = 0; i <= n; i++) {
        const t = i / n, w0 = Math.max(t < 0.5 ? 0.014 : 0, 0.11 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.75));
        let wr = w0 * (1 + 0.3 * (rng() - 0.5)), wl = w0 * asym * (1 + 0.3 * (rng() - 0.5));
        if (i === notchR) wr *= 0.5; // une entaille dans la barbe de chaque côté
        if (i === notchL) wl *= 0.5;
        right.push(new THREE.Vector2(wr, 0.7 * t)); left.push(new THREE.Vector2(-wl, 0.7 * t));
      }
      const sh = new THREE.Shape([...right, ...left.reverse()]);
      g = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false });
      g.rotateX(-Math.PI / 2); g.translate(0, -0.015, 0);
      break;
    }
    case 'claw': { // griffe : boudin à bout arrondi, base à l'origine, vers +Z ; recourbé plus bas
      const prof = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12, e = Math.max(0, (t - 0.82) / 0.18); prof.push(new THREE.Vector2(Math.max(1e-4, 0.009 * Math.sqrt(Math.max(0, 1 - e * e))), 0.12 * t)); }
      g = new THREE.LatheGeometry(prof, 7); g.rotateX(Math.PI / 2);
      break;
    }
    case 'hip': g = new THREE.CylinderGeometry(0.1, 0.1, 0.14, rad + 4, 1 + (L >> 1)); g.rotateZ(Math.PI / 2); break; // rond vertical : un disque debout, ses deux faces regardent à droite et à gauche (axe X)
    case 'thigh': g = new THREE.CylinderGeometry(0.04, 0.032, 0.22, rad, 1 + L); g.translate(0, -0.11, 0); break; // cuisse : racine (haut) à l'origine, descend vers -Y
    case 'shin': g = new THREE.CylinderGeometry(0.026, 0.02, 0.22, rad, 1 + L); g.translate(0, -0.11, 0); break; // jambe : plus fine
    case 'foot': g = new THREE.BoxGeometry(0.06, 0.02, 0.14, 2, 1, 1 + L); g.translate(0, -0.01, 0.05); break; // patte (pied) : plaque qui part vers l'avant (+Z)
    case 'leg': g = new THREE.CylinderGeometry(0.05, 0.032, 0.5, rad, 2 + L); g.translate(0, -0.25, 0); break; // racine (haut) à l'origine, descend vers -Y
    case 'ring': g = new THREE.TorusGeometry(0.3, 0.012, 5 + (L >> 1), 18 + 5 * L); g.rotateX(Math.PI / 2); break; // anneau dans le plan X-Z (axe Y) : parallèle à l'ovale vert
    case 'plume': g = new THREE.BoxGeometry(0.1, 0.04, 0.7, 1, 1, 4 + 2 * L); g.translate(0, 0, -0.35); break; // long rectangle ; le bout est aplati plus bas (voir plus loin)
    case 'tail': g = new THREE.BoxGeometry(0.16, 0.04, 0.7, Math.max(1, L >> 1), 1, 2 + L); g.translate(0, 0, -0.35); break; // longue plaque rectangulaire à bout carré, racine à l'origine, vers l'arrière (-Z)
    case 'spike': g = new THREE.ConeGeometry(0.07, 0.4, rad, 2 + L); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.2); break; // pointe vers l'avant (+Z), base à l'origine
    default: g = new THREE.IcosahedronGeometry(0.3, L);
  }
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  if (/^beak(Up|Low)/.test(shape)) g = atelierClipGeo(g, { n: [0, 1, 0], d: 0, keep: shape.startsWith('beakUp') ? 1 : -1 }); // demi-bec (mandibule), base à l'origine, pointe vers +Z
  const p = g.attributes.position;
  if (shape === 'egg') { // œuf : allongé, plus étroit en haut
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = clamp(y / 0.3, -1, 1), k = 1 - 0.17 * t;
      p.setXYZ(i, x * k, y * 1.3, z * k);
    }
  } else if (shape === 'quill' || shape === 'quillBase' || shape === 'quillTip') { // lame : l'épaisseur s'aplatit vers le bout (de 100 % à 15 % sur la lame entière)
    const off = shape === 'quillTip' ? 0.525 : 0;
    for (let i = 0; i < p.count; i++) { const t = clamp((off - p.getZ(i)) / 0.7, 0, 1); p.setY(i, p.getY(i) * (1 - 0.85 * t * t)); }
  } else if (shape === 'feather') { // épaisseur qui diminue de la racine (100 %) au bout (20 %) ; vrille et courbure propres à chaque plume
    const rng = mulberry32(((params && params.seed) || 7) + 101), tw = (rng() - 0.5) * 0.9, bend = (rng() - 0.3) * 0.25, side = (rng() - 0.5) * 0.12;
    for (let i = 0; i < p.count; i++) {
      const t = clamp(-p.getZ(i) / 0.7, 0, 1), x0 = p.getX(i), y0 = p.getY(i) * (1 - 0.8 * t), a = tw * Math.pow(t, 1.5), c = Math.cos(a), sn = Math.sin(a);
      p.setXYZ(i, x0 * c - y0 * sn + side * t * t, x0 * sn + y0 * c + bend * t * t, p.getZ(i));
    }
  } else if (shape === 'beakUpC' || shape === 'beakLowC') { // bec recourbé : droit à la base, il plonge de plus en plus (40° au bout)
    const LEN = 0.3, B = (60 * Math.PI) / 180, N = 24, cy = [0], cz = [0];
    for (let i = 1; i <= N; i++) { const th = B * Math.pow((i - 0.5) / N, 2); cy.push(cy[i - 1] - (Math.sin(th) * LEN) / N); cz.push(cz[i - 1] + (Math.cos(th) * LEN) / N); }
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), t = clamp(p.getZ(i) / LEN, 0, 1), fi = t * N, i0 = Math.min(N - 1, Math.floor(fi)), fr = fi - i0, th = B * t * t;
      p.setXYZ(i, x, cy[i0] + (cy[i0 + 1] - cy[i0]) * fr + y * Math.cos(th), cz[i0] + (cz[i0 + 1] - cz[i0]) * fr + y * Math.sin(th));
    }
  } else if (shape === 'claw') { // recourbé : la griffe part droit puis plonge de plus en plus (80° au bout)
    const LEN = 0.12, B = (80 * Math.PI) / 180, N = 24, cy = [0], cz = [0];
    for (let i = 1; i <= N; i++) { const th = B * Math.pow((i - 0.5) / N, 2); cy.push(cy[i - 1] - (Math.sin(th) * LEN) / N); cz.push(cz[i - 1] + (Math.cos(th) * LEN) / N); }
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), t = clamp(p.getZ(i) / LEN, 0, 1), fi = t * N, i0 = Math.min(N - 1, Math.floor(fi)), fr = fi - i0, th = B * t * t;
      p.setXYZ(i, x, cy[i0] + (cy[i0 + 1] - cy[i0]) * fr + y * Math.cos(th), cz[i0] + (cz[i0 + 1] - cz[i0]) * fr + y * Math.sin(th));
    }
  } else if (shape === 'plume') { // bout aplati : sur le dernier tiers, l'épaisseur diminue jusqu'à 20 % et la largeur un peu
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i), t = clamp((-z - 0.45) / 0.25, 0, 1); // 0 jusqu'à 0,45 du bout, puis 1 à l'extrémité
      p.setY(i, p.getY(i) * (1 - 0.8 * t));
      p.setX(i, p.getX(i) * (1 - 0.25 * t));
    }
  } else if (shape === 'wing') { // aile : ovale incurvé qui épouse le flanc rond du corps (la face intérieure est +Y)
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, p.getY(i) + (z * z) / 0.6 + 0.12 * x * x); // courbure en travers (rayon ≈ 0,3 comme l'œuf) et léger rapprochement vers la queue qui s'affine : l'aile épouse le flanc
    }
  } else if (shape === 'potato' || shape === 'potatoFine' || shape === 'head') { // patate : bosses douces et un peu aplatie
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = Math.sin(x * 11 + 1.3) * Math.cos(y * 9 + 0.7) * 0.5 + Math.sin(z * 12 + 2.1) * 0.5;
      const k = 1 + 0.16 * n;
      p.setXYZ(i, x * k, y * k * 0.86, z * k * 1.1);
    }
  }
  const n = p.count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return g;
}
// coupe une géométrie indexée par le plan { n, d } (repère local) : garde les points où keep·(n·p - d) >= 0, referme la coupe par un bouchon
function atelierClipGeo(g, cut) {
  const n = V3(...cut.n), d = cut.d, k = cut.keep, pos = g.attributes.position, ind = g.index.array;
  const out = [], segs = [], P = (i) => V3(pos.getX(i), pos.getY(i), pos.getZ(i));
  const sd = (v) => k * (n.dot(v) - d);
  for (let t = 0; t < ind.length; t += 3) {
    const poly = [P(ind[t]), P(ind[t + 1]), P(ind[t + 2])], res = [], ent = [];
    for (let i = 0; i < 3; i++) {
      const a = poly[i], b = poly[(i + 1) % 3], da = sd(a), db = sd(b);
      if (da >= 0) res.push(a);
      if ((da >= 0) !== (db >= 0)) { const x = a.clone().lerp(b, da / (da - db)); res.push(x); ent.push(x); }
    }
    for (let i = 1; i + 1 < res.length; i++) out.push(res[0], res[i], res[i + 1]);
    if (ent.length === 2) segs.push(ent);
  }
  if (segs.length) { // bouchon : éventail depuis le centre de la coupe, tourné vers l'extérieur de la partie gardée
    const c = V3(0, 0, 0);
    for (const sg of segs) c.add(sg[0]).add(sg[1]);
    c.multiplyScalar(1 / (segs.length * 2));
    const out0 = n.clone().multiplyScalar(-k);
    for (const [a, b] of segs) {
      if (new THREE.Vector3().subVectors(a, c).cross(new THREE.Vector3().subVectors(b, c)).dot(out0) > 0) out.push(c, a, b); else out.push(c, b, a);
    }
  }
  let ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(out.flatMap((v) => [v.x, v.y, v.z]), 3));
  ng.setAttribute('color', new THREE.BufferAttribute(new Float32Array(out.length * 3).fill(1), 3));
  ng = mergeVertices(ng, 1e-4);
  g.dispose();
  return ng;
}
function atelierPartGeo(def) {
  let g = atelierGeo(def.shape, atDetailOf(def.shape, def), def.params || null);
  const p = g.attributes.position;
  if (def.verts && def.verts.length === p.count * 3) for (let i = 0; i < p.count; i++) p.setXYZ(i, def.verts[i * 3], def.verts[i * 3 + 1], def.verts[i * 3 + 2]);
  if (def.cuts) for (const c of def.cuts) g = atelierClipGeo(g, c);
  return g;
}
const AT_MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1);
const atPartMatrix = (def) => new THREE.Matrix4().compose(V3(...def.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...def.rot.map((a) => (a * Math.PI) / 180))), V3(...def.scl));
// géométrie finale d'un animal : pièces assemblées (et leurs symétriques), couleurs par face, pieds posés sur y = 0
function bakeCustom(def) {
  const geos = [], byUid = new Map(def.parts.map((p) => [p.uid, p])), memo = new Map();
  const worldOf = (p) => { // matrice monde d'une pièce : celle de son parent × la sienne
    if (memo.has(p)) return memo.get(p);
    const loc = atPartMatrix(p), par = p.parent != null && byUid.get(p.parent);
    const W = par && par !== p ? atChildWorld(worldOf(par), p) : loc;
    memo.set(p, W);
    return W;
  };
  for (const part of def.parts) {
    const base = new THREE.Color(part.color || '#c8a070');
    const g = atelierPartGeo(part);
    g.applyMatrix4(worldOf(part));
    const cf = (x, y, z) => base.clone().offsetHSL(0, 0, (hashPos(x * 60, y * 60, z * 60, 3) - 0.5) * 0.05);
    const add = (geo) => geos.push(part.smooth ? softFinish(geo, cf, 1) : finish(geo, cf)); // forme lisse : normales moyennées sur toute la pièce
    add(g.clone());
    if (part.mirror && part.shape !== 'eye') {
      const m = g.clone();
      m.applyMatrix4(AT_MIRROR);
      const ia = m.index.array;
      for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; } // le miroir inverse les faces
      add(m);
    }
  }
  if (!geos.length) geos.push(finish(new THREE.IcosahedronGeometry(0.1, 1), () => new THREE.Color('#c8a070')));
  const merged = mergeGeometries(geos);
  geos.forEach((q) => q.dispose());
  merged.computeBoundingBox();
  merged.translate(0, -merged.boundingBox.min.y, 0);
  return merged;
}
// géométries finies d'une pièce (et de sa copie symétrique), posées dans le repère de l'animal par la matrice W
function atPartBakeGeos(part, W) {
  const base = new THREE.Color(part.color || '#c8a070'), g = atelierPartGeo(part), out = [];
  const fn = atPartColorFn(part, g), inv = W.clone().invert();
  g.applyMatrix4(W);
  const cf = (x, y, z) => fn(V3(x, y, z).applyMatrix4(inv)).clone().offsetHSL(0, 0, (hashPos(x * 60, y * 60, z * 60, 3) - 0.5) * 0.05);
  const add = (geo) => out.push(part.smooth ? softFinish(geo, cf, 1) : finish(geo, cf));
  add(g.clone());
  if (part.mirror && part.shape !== 'eye') {
    const m = g.clone();
    m.applyMatrix4(AT_MIRROR);
    const ia = m.index.array;
    for (let i = 0; i < ia.length; i += 3) { const t = ia[i + 1]; ia[i + 1] = ia[i + 2]; ia[i + 2] = t; }
    add(m);
  }
  g.dispose();
  return out;
}
// animal articulé : il faut un corps (œuf) et une tête (boule) liée à lui ; sinon null (l'animal reste d'un seul bloc)
// Le torse est centré sur la hanche (racine des cuisses) : c'est autour d'elle qu'il bascule pour picorer ; la tête tourne au cou, le bec du bas à sa base, la queue à sa sortie du corps.
function bakeCustomRig(def) {
  const parts = def.parts, byUid = new Map(parts.map((p) => [p.uid, p])), memo = new Map();
  const worldOf = (p) => {
    if (memo.has(p)) return memo.get(p);
    const loc = atPartMatrix(p), par = p.parent != null && byUid.get(p.parent);
    const W = par && par !== p ? atChildWorld(worldOf(par), p) : loc;
    memo.set(p, W);
    return W;
  };
  const body = parts.find((p) => p.shape === 'egg' && p.parent == null) || parts.find((p) => p.shape === 'egg');
  const head = body && parts.find((p) => p.shape === 'sphere' && p.parent === body.uid);
  if (!body || !head) return null;
  const isDesc = (p, anc) => { let q = p; for (let n = 0; n < 40 && q && q.parent != null; n++) { q = byUid.get(q.parent); if (q === anc) return true; } return false; };
  const LEGS = ['hip', 'thigh', 'shin', 'foot', 'leg', 'claw'], groups = { torso: [], head: [], beakLow: [], tail: [], legs: [], wingL: [], wingR: [] };
  for (const p of parts) {
    const k = p.shape.startsWith('beakLow') && isDesc(p, head) ? 'beakLow' : p === head || isDesc(p, head) ? 'head' : LEGS.includes(p.shape) ? 'legs' : p.shape === 'plume' || p.shape === 'tail' || (p.shape === 'patch' && p.params && p.params.kind === 'tail') ? 'tail'
      : p.shape === 'patch' && p.params && p.params.kind === 'wing' ? (p.params.mir ? 'wingL' : 'wingR') : 'torso';
    groups[k].push(p);
  }
  const merge = (list) => { const geos = list.flatMap((p) => atPartBakeGeos(p, worldOf(p))); if (!geos.length) return null; const m = mergeGeometries(geos); geos.forEach((q) => q.dispose()); return m; };
  const G = {};
  for (const k in groups) G[k] = merge(groups[k]);
  let minY = Infinity;
  for (const k in G) if (G[k]) { G[k].computeBoundingBox(); minY = Math.min(minY, G[k].boundingBox.min.y); }
  const Wb = worldOf(body), bodyPos = V3(0, 0, 0).setFromMatrixPosition(Wb);
  const neck = head.link ? V3(...head.link.p).applyMatrix4(Wb) : V3(0, 0, 0).setFromMatrixPosition(worldOf(head));
  const eggGeo = atelierPartGeo(body);
  eggGeo.computeBoundingBox();
  const tailRoot = V3(0, eggGeo.boundingBox.max.y * 0.6, 0).applyMatrix4(Wb);
  eggGeo.dispose();
  const thighs = groups.legs.filter((p) => p.shape === 'thigh' && p.link && byUid.get(p.parent));
  const hip = thighs.length ? thighs.reduce((a, p) => a.add(V3(...p.link.p).applyMatrix4(worldOf(byUid.get(p.parent)))), V3(0, 0, 0)).multiplyScalar(1 / thighs.length) : V3(bodyPos.x, minY + (bodyPos.y - minY) * 0.5, bodyPos.z);
  const bl = groups.beakLow[0], beakPivot = bl && bl.link && byUid.get(bl.parent) ? V3(...bl.link.p).applyMatrix4(worldOf(byUid.get(bl.parent))) : neck.clone();
  // pattes gauche / droite : côté selon la position par rapport au plan de symétrie du corps (axe X du corps) ; pivot = racine de la cuisse de ce côté
  const rX = V3(1, 0, 0).transformDirection(Wb), sideOf = (p) => (V3(0, 0, 0).setFromMatrixPosition(worldOf(p)).sub(bodyPos).dot(rX) >= 0 ? 1 : -1);
  const shift = (g, P) => { if (g) g.translate(-P.x, -P.y, -P.z); return g; };
  const linkPt = (p) => (p.link && byUid.get(p.parent) ? V3(...p.link.p).applyMatrix4(worldOf(byUid.get(p.parent))) : V3(0, 0, 0).setFromMatrixPosition(worldOf(p)));
  const legParts = [];
  for (const sgn of [1, -1]) {
    const list = groups.legs.filter((p) => sideOf(p) === sgn);
    if (!list.length) continue;
    const th = list.filter((p) => p.shape === 'thigh'), sh = list.filter((p) => p.shape === 'shin'), ft = list.filter((p) => p.shape === 'claw' || p.shape === 'foot');
    const hipP = th.length ? linkPt(th[0]) : hip.clone();
    if (!th.length || !sh.length) { legParts.push({ thigh: { geo: shift(merge(list), hipP), pivot: hipP.clone().sub(hip) } }); continue; } // patte d'un seul bloc
    const kneeP = linkPt(sh[0]), ankleP = ft.length ? linkPt(ft[0]) : null, rest = list.filter((p) => !th.includes(p) && !sh.includes(p) && !ft.includes(p));
    const leg = { thigh: { geo: shift(merge([...th, ...rest]), hipP), pivot: hipP.clone().sub(hip) }, shin: { geo: shift(merge(sh), kneeP), pivot: kneeP.clone().sub(hipP) } };
    if (ankleP && ft.length) leg.foot = { geo: shift(merge(ft), ankleP), pivot: ankleP.clone().sub(kneeP) };
    legParts.push(leg);
  }
  // ailes : pivot sur la ligne du dos, au-dessus du centre du corps ; axe de rotation = grand axe du corps (vers la queue)
  const bsc = V3(0, 0, 0), bq = new THREE.Quaternion();
  Wb.decompose(V3(0, 0, 0), bq, bsc);
  const kb = Math.cbrt(Math.abs(bsc.x * bsc.y * bsc.z)), zs = V3(0, 0, 1).applyQuaternion(bq).y >= 0 ? 1 : -1;
  const back = bodyPos.clone().addScaledVector(V3(0, 0, zs).applyQuaternion(bq), 0.28 * kb), wingAxis = V3(0, 1, 0).applyQuaternion(bq).normalize();
  shift(G.torso, hip); shift(G.head, neck); shift(G.beakLow, beakPivot); shift(G.tail, tailRoot); shift(G.wingL, back); shift(G.wingR, back);
  if (G.legs) G.legs.dispose();
  return { torso: G.torso, head: G.head, beakLow: G.beakLow, tail: G.tail, wingL: G.wingL, wingR: G.wingR, wingPivot: back.clone().sub(hip), wingAxis, legParts, hipY: hip.y - minY, neck: neck.clone().sub(hip), tailPivot: tailRoot.clone().sub(hip), beakPivot: beakPivot.clone().sub(neck) };
}
const customGeoCache = new Map();
function makeCustom(d) {
  const def = allCustomDefs().find((x) => x.id === d.custom);
  const tiny = () => new THREE.ConeGeometry(0.0001, 0.0001, 3, 1);
  if (def) {
    const key = def.id + ':' + (def.rev || 0);
    if (!customGeoCache.has(key)) customGeoCache.set(key, { rig: bakeCustomRig(def), flat: null });
    const c = customGeoCache.get(key);
    if (c.rig) { // articulé : chaque groupe est copié et mis à l'échelle de l'animal
      const R = c.rig, S = d.size, cp = (g) => { if (!g) return null; const q = g.clone(); q.scale(S, S, S); return q; };
      return { body: cp(R.torso) || tiny(), tail: cp(R.tail) || tiny(), pivot: R.tailPivot.clone().multiplyScalar(S), head: cp(R.head), headPivot: R.neck.clone().multiplyScalar(S), beakLow: cp(R.beakLow), beakPivot: R.beakPivot.clone().multiplyScalar(S), wingL: cp(R.wingL), wingR: cp(R.wingR), wingPivot: R.wingPivot.clone().multiplyScalar(S), wingAxis: R.wingAxis.clone(), legParts: R.legParts.map((l) => { const o = {}; for (const k of ['thigh', 'shin', 'foot']) if (l[k]) o[k] = { geo: cp(l[k].geo), pivot: l[k].pivot.clone().multiplyScalar(S) }; return o; }), yOff: R.hipY * S, rig: true, gait: def.gait || 'hop' };
    }
    if (!c.flat) c.flat = bakeCustom(def);
    const body = c.flat.clone();
    body.scale(d.size, d.size, d.size);
    return { body, tail: tiny(), pivot: V3(0, 0, 0) };
  }
  const body = finish(new THREE.IcosahedronGeometry(0.15, 1), () => new THREE.Color('#999999'));
  body.scale(d.size, d.size, d.size);
  return { body, tail: tiny(), pivot: V3(0, 0, 0) };
}
function syncCustomSpecies() {
  for (let i = SPECIES.length - 1; i >= 0; i--) if (SPECIES[i].custom) SPECIES.splice(i, 1);
  for (const def of allCustomDefs()) {
    if (def.hidden) continue; // (la huppe en vol est un oiseau volant, pas un animal posé)
    SPECIES.push({
      g: 'animal', custom: true, name: def.name, thumb: 'custom:' + def.id,
      count: () => wagtailsData.filter((x) => x.kind === 'custom' && x.custom === def.id).length,
      add: () => addCustomAnimal(def.id),
      remove: () => { const d = wagtailsData.findLast((x) => x.kind === 'custom' && x.custom === def.id); wagtailsData = wagtailsData.filter((x) => x !== d); if (d) dropMesh(trees.find((t) => t.userData.wagtail?.d === d)); },
    });
  }
  const sel = $('customSel');
  if (sel) { const cur = sel.value; sel.innerHTML = ''; for (const def of customLibrary) { const o = document.createElement('option'); o.value = def.id; o.textContent = def.name; sel.appendChild(o); } if (customLibrary.some((x) => x.id === cur)) sel.value = cur; }
}
function addCustomAnimal(id) {
  const def = allCustomDefs().find((x) => x.id === id);
  if (!def) return;
  const s = findWagtailSpot();
  if (!s) { setStatus('Aucun endroit pour poser cet animal.'); return; }
  const d = { ...newWagtailDesc(s.x, s.z), kind: 'custom', custom: id, size: def.size, speed: 0.5 };
  wagtailsData.push(d);
  select(addWagtail(d));
}
function rebuildCustomInstances(id) {
  for (const m of trees.slice()) {
    const w = m.userData.wagtail;
    if (!w || w.d.kind !== 'custom' || w.d.custom !== id) continue;
    if (selected === m) select(null);
    world.remove(m); disposeMesh(m);
    trees = trees.filter((t) => t !== m);
    addWagtail(w.d);
  }
}

// ----- l'atelier lui-même -----
let atelier = null; // { group, parts, sel, mode, hidden, saved, editId, drag, downAt, name }
const atMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
const atMatSel = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0, emissive: 0x2a3c66 });
function atelierMakePart(def) {
  const part = { def: { shape: def.shape, pos: [...def.pos], rot: [...def.rot], scl: [...def.scl], color: def.color, mirror: def.shape === 'eye' ? false : !!def.mirror, detail: def.detail ?? null, verts: def.verts ? [...def.verts] : null, uid: def.uid ?? ++atelier.uid, parent: def.parent ?? null, smooth: !!def.smooth, params: def.params ? { ...def.params } : null, color2: def.color2 || null, grp: def.grp ?? null, sink: def.sink || 0, cuts: def.cuts ? def.cuts.map((c) => ({ ...c })) : null, dots: def.dots ? def.dots.map((d) => [...d]) : null, pair: def.pair ?? null, sym: def.sym ? { ...def.sym } : null, link: def.link ? { p: [...def.link.p], q: [...def.link.q], axis: def.link.axis ?? null, arc: def.link.arc ? { ...def.link.arc } : null } : null } };
  atelier.uid = Math.max(atelier.uid, part.def.uid);
  part.geo = atelierPartGeo(part.def);
  atelierShade(part);
  part.mesh = new THREE.Mesh(part.geo, atelierMatFor(part, false));
  part.mesh.matrixAutoUpdate = false; // sa matrice est la matrice monde (parenté comprise), calculée par atelierApplyTransform
  part.mesh.userData.part = part;
  atelier.group.add(part.mesh);
  atelierApplyColor(part);
  atelierSetMirror(part, part.def.mirror);
  atelierApplyTransform(part);
  atelier.parts.push(part);
  return part;
}
function atelierSetMirror(part, on) {
  part.def.mirror = on;
  if (on && !part.twin) { part.twin = new THREE.Mesh(part.geo, part.mesh.material); part.twin.userData.part = part; part.twin.matrixAutoUpdate = false; atelier.group.add(part.twin); }
  if (!on && part.twin) { atelier.group.remove(part.twin); part.twin = null; }
  atelierApplyTransform(part);
}
const atLinkMatrix = (link) => (link ? new THREE.Matrix4().compose(V3(...link.p), new THREE.Quaternion(...link.q), V3(1, 1, 1)) : new THREE.Matrix4());
// Étirer une pièce n'étire pas les pièces qui y sont liées : l'enfant suit la position (le point de liaison reste sur la surface étirée) et l'orientation de son parent, mais garde sa propre taille.
function atChildWorld(Pw, def) {
  const loc = atPartMatrix(def), pp = V3(0, 0, 0), pq = new THREE.Quaternion(), ps = V3(1, 1, 1);
  Pw.decompose(pp, pq, ps);
  if (def.link) {
    const J = V3(...def.link.p).applyMatrix4(Pw);
    if (def.sink) J.addScaledVector(pp.clone().sub(J).normalize(), def.sink); // enfoncement : on rentre la pièce dans son parent, vers son centre
    return new THREE.Matrix4().compose(J, pq.multiply(new THREE.Quaternion(...def.link.q)), V3(1, 1, 1)).multiply(loc);
  }
  return new THREE.Matrix4().compose(V3(...def.pos).applyMatrix4(Pw), pq.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...def.rot.map((a) => (a * Math.PI) / 180)))), V3(...def.scl));
}
// repère de la rotule (sans échelle) : position = point de liaison dans le monde, orientation = celle du parent × rotation libre
function atLinkBase(Pw, link, sink = 0) {
  const pp = V3(0, 0, 0), pq = new THREE.Quaternion(), ps = V3(1, 1, 1);
  Pw.decompose(pp, pq, ps);
  const J = V3(...link.p).applyMatrix4(Pw);
  if (sink) J.addScaledVector(pp.clone().sub(J).normalize(), sink);
  return new THREE.Matrix4().compose(J, pq.multiply(new THREE.Quaternion(...link.q)), V3(1, 1, 1));
}
// repère local (pos, rot en degrés, scl) d'une matrice monde Wn pour un enfant de Pw (avec ou sans rotule)
function atLocalOf(Pw, link, Wn, sink = 0) {
  const pos = V3(0, 0, 0), q = new THREE.Quaternion(), sc = V3(1, 1, 1);
  if (!Pw) Wn.decompose(pos, q, sc);
  else if (link) atLinkBase(Pw, link, sink).invert().multiply(Wn).decompose(pos, q, sc);
  else {
    const pp = V3(0, 0, 0), pq = new THREE.Quaternion(), ps = V3(1, 1, 1), wq = new THREE.Quaternion();
    Pw.decompose(pp, pq, ps);
    Wn.decompose(pos, wq, sc);
    pos.applyMatrix4(Pw.clone().invert());
    q.copy(pq.invert().multiply(wq));
  }
  const e = new THREE.Euler().setFromQuaternion(q);
  return { pos: pos.toArray(), rot: [e.x, e.y, e.z].map((a) => (a * 180) / Math.PI), scl: sc.toArray() };
}
const atParentOf = (part) => (part.def.parent != null ? atelier.parts.find((p) => p.def.uid === part.def.parent) || null : null);
function atelierWorld(part, guard = 0) { // matrice monde = parent × local
  const loc = atPartMatrix(part.def), par = guard < 30 ? atParentOf(part) : null;
  return par ? atChildWorld(atelierWorld(par, guard + 1), part.def) : loc; // l'enfant suit son parent sans être étiré avec lui
}
function atelierApplyTransform(part) {
  const m = part.mesh;
  if (part.def.grp == null) for (const q of atelier.parts) if (q.def.grp === part.def.uid) q.def.scl = [...part.def.scl]; // les membres d'un groupe gardent l'étirement de la meneuse
  m.matrix.copy(atelierWorld(part));
  m.matrixWorldNeedsUpdate = true;
  part.base = m.matrix.clone();
  if (part.twin) { part.twin.matrix.copy(AT_MIRROR).multiply(m.matrix); part.twin.matrixWorldNeedsUpdate = true; part.baseT = part.twin.matrix.clone(); }
  for (const c of atelier.parts) if (c.def.parent === part.def.uid && c !== part) atelierApplyTransform(c); // les pièces accrochées suivent
}
// impose une matrice monde à une pièce : son repère local (relatif à son parent) est recalculé
function atelierSetWorld(part, Wn) {
  const par = atParentOf(part), loc = atLocalOf(par ? atelierWorld(par) : null, par ? part.def.link : null, Wn, part.def.sink || 0);
  part.def.pos = loc.pos; part.def.rot = loc.rot; part.def.scl = loc.scl;
  atelierApplyTransform(part);
  atelierSyncPair(part);
  if (atelier.sel === part) ['X', 'Y', 'Z'].forEach((a, i) => { $('atP' + a).value = part.def.pos[i]; $('atR' + a).value = part.def.rot[i]; $('atS' + a).value = part.def.scl[i]; });
  showValues();
}
const atGroupLead = (part) => (part && part.def.grp != null ? atelier.parts.find((q) => q.def.uid === part.def.grp) || part : part);
const atPartnerOf = (part) => (part.def.pair != null ? atelier.parts.find((p) => p !== part && p.def.uid === part.def.pair) || null : null);
// les pièces d'une paire sont gérées ensemble : tout ce qu'on fait à l'une est répété en miroir (par rapport au plan central) sur l'autre.
// Le miroir M·W·M donne la bonne matrice ; l'aile, qui part vers +X, est de plus retournée de 180° autour de Y (sa forme est symétrique en Z).
// plan de symétrie d'une paire : par défaut le plan central de l'atelier ; sinon le plan perpendiculaire à l'un des axes (X, Y ou Z) d'une pièce de référence, passant par son centre
function atelierMirrorOf(leader) {
  const sym = leader.def.sym, ref = sym && sym.ref != null ? atelier.parts.find((p) => p.def.uid === sym.ref) : null;
  if (!ref || ref === leader || ref === atPartnerOf(leader)) return AT_MIRROR.clone();
  const W = atelierWorld(ref), n = V3(0, 0, 0).setFromMatrixColumn(W, sym.axis ?? 0).normalize(), c = V3(0, 0, 0).setFromMatrixPosition(W), k = 2 * n.dot(c);
  return new THREE.Matrix4().set(
    1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z, k * n.x,
    -2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z, k * n.y,
    -2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z, k * n.z,
    0, 0, 0, 1);
}
function atelierSyncPair(leader, seen = new Set()) {
  const A = atelier, partner = atPartnerOf(leader);
  seen.add(leader);
  if (A.syncing) return;
  if (partner) {
  A.syncing = true;
  try {
    const R = atelierMirrorOf(leader);
    // Wp = R · W · Mloc : Mloc est une symétrie locale qui laisse la forme inchangée (retournement de X ; pour l'aile, qui part vers +X, retournement de Z)
    const Wp = R.clone().multiply(atelierWorld(leader)).multiply(new THREE.Matrix4().makeScale(leader.def.shape === 'wing' ? 1 : -1, 1, leader.def.shape === 'wing' ? -1 : 1));
    const lk = leader.def.link, par = atParentOf(leader);
    let loc;
    if (par && lk && par !== partner && !atIsDescendant(par, partner)) { // liée : l'autre se lie à l'autre pièce du parent (ou au même parent), au point miroir
      const pp = atPartnerOf(par) || par;
      const J = V3(...lk.p).applyMatrix4(atelierWorld(par)).applyMatrix4(R); // point de rotule reflété
      const Pw = atelierWorld(pp), pl = J.applyMatrix4(Pw.clone().invert());
      partner.def.parent = pp.def.uid;
      partner.def.link = { p: pl.toArray(), q: [0, 0, 0, 1], axis: lk.axis ?? null, arc: null };
      loc = atLocalOf(Pw, partner.def.link, Wp);
    } else { partner.def.parent = null; partner.def.link = null; loc = atLocalOf(null, null, Wp); }
    partner.def.pos = loc.pos; partner.def.rot = loc.rot; partner.def.scl = loc.scl;
    partner.def.sink = leader.def.sink || 0;
    if (!!partner.def.smooth !== !!leader.def.smooth) { partner.def.smooth = !!leader.def.smooth; atelierShade(partner); }
    if (partner.def.color !== leader.def.color) { partner.def.color = leader.def.color; atelierApplyColor(partner); }
    partner.def.sym = leader.def.sym ? { ...leader.def.sym } : null;
    atelierApplyTransform(partner);
  } finally { A.syncing = false; }
  }
  // les paires dont le plan de symétrie dépend de cette pièce suivent quand elle bouge
  for (const q of A.parts) if (q.def.pair != null && q.def.sym && q.def.sym.ref === leader.def.uid && !seen.has(q) && !seen.has(atPartnerOf(q))) atelierSyncPair(q, seen);
}
const atIsDescendant = (p, anc) => { for (let q = atParentOf(p), n = 0; q && n < 40; q = atParentOf(q), n++) if (q === anc) return true; return false; };
// change le parent d'une pièce sans la déplacer dans l'atelier : son repère local est recalculé
function atelierReparent(part, parent) {
  if (parent === part || (parent && atIsDescendant(parent, part))) return false;
  const W = atelierWorld(part);
  part.def.parent = parent ? parent.def.uid : null;
  part.def.link = null; // un simple changement de parent est une fixation rigide
  const loc = atLocalOf(parent ? atelierWorld(parent) : null, null, W);
  part.def.pos = loc.pos; part.def.rot = loc.rot; part.def.scl = loc.scl;
  atelierApplyTransform(part);
  return true;
}
// crée des pièces à partir d'une liste ; `to` = index (dans la liste) de la pièce à laquelle on accroche
function atelierBuild(list) {
  const made = list.map((d) => atelierMakePart(d));
  list.forEach((d, i) => { if (d.to != null && made[d.to]) atelierReparent(made[i], made[d.to]); });
  return made;
}
// zones de couleur d'une pièce, comptées depuis son bout (-Z) : [[fraction de la longueur, couleur], ...] triées du bout vers la racine
function atColorZones(def) {
  const P = def.params;
  let z = null;
  if (P && Array.isArray(P.tips) && P.tips.length) z = P.tips.map(([f, c]) => [f, new THREE.Color(c)]);
  else if (def.color2 && P && P.tip) z = [[P.tip, new THREE.Color(def.color2)]];
  if (z) { z.axis = (P && P.tipsAxis) || 'z'; z.from = (P && P.tipsFrom) || 'min'; if (P && P.tipsDir) { z.dir = V3(...P.tipsDir).normalize(); z.origin = V3(...(P.tipsOrigin || [0, 0, 0])); z.len = P.tipsLen || 1; } } // axe des zones et côté de départ (par défaut : Z, depuis le bout -Z) ; ou direction libre depuis une origine (fraction depuis la racine)
  return z;
}
const atZonePick = (zones, bb, v, base) => {
  const ax = zones.axis, len = Math.max(1e-6, bb.max[ax] - bb.min[ax]);
  const f = zones.dir ? (v.x - zones.origin.x) * zones.dir.x + (v.y - zones.origin.y) * zones.dir.y + (v.z - zones.origin.z) * zones.dir.z : zones.from === 'max' ? (bb.max[ax] - v[ax]) / len : (v[ax] - bb.min[ax]) / len;
  if (zones.dir) { const g = f / zones.len; for (const [fz, c] of zones) if (g < fz) return c; return base; }
  for (const [fz, c] of zones) if (f < fz) return c;
  return base;
};
// couleur d'un sommet (coordonnées locales de la pièce) : zones depuis le bout, ou dégradé params.grad = { dir, from, to } (de « from » du côté +dir à « to » du côté -dir), sinon la couleur de base
function atPartColorFn(def, geo) {
  const base = new THREE.Color(def.color || '#c8a070'), zones = atColorZones(def), G = def.params && def.params.grad;
  if (!zones && !G) return () => base;
  geo.computeBoundingBox();
  const bb = geo.boundingBox.clone();
  if (zones) return (v) => atZonePick(zones, bb, v, base);
  const dir = V3(...G.dir).normalize(), from = new THREE.Color(G.from), to = new THREE.Color(G.to), pos = geo.attributes.position, tmp = V3(0, 0, 0);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.count; i++) { const d = tmp.fromBufferAttribute(pos, i).dot(dir); if (d < lo) lo = d; if (d > hi) hi = d; }
  return (v) => to.clone().lerp(from, clamp((v.dot(dir) - lo) / Math.max(1e-6, hi - lo), 0, 1));
}
function atelierApplyColor(part) {
  const a = part.geo.attributes.color, p = part.geo.attributes.position, fn = atPartColorFn(part.def, part.geo), v = V3(0, 0, 0);
  for (let i = 0; i < a.count; i++) { const k = fn(v.fromBufferAttribute(p, i)); a.setXYZ(i, k.r, k.g, k.b); }
  a.needsUpdate = true;
}
function atelierSelect(part) {
  if (!atelier) return;
  part = atGroupLead(part); // un membre d'un groupe : c'est la meneuse qu'on manipule
  atelier.sel = part;
  const mate = part ? atPartnerOf(part) : null; // les deux pièces d'une paire sont en surbrillance : on les déplace ensemble
  for (const p of atelier.parts) { const mat = atelierMatFor(p, p === part || p === mate); p.mesh.material = mat; if (p.twin) p.twin.material = mat; }
  const box = $('atSelBox');
  box.hidden = !part;
  if (part) {
    const d = part.def, set = (id, v) => { $(id).value = v; };
    ['X', 'Y', 'Z'].forEach((a, i) => { set('atP' + a, d.pos[i]); set('atR' + a, d.rot[i]); set('atS' + a, d.scl[i]); });
    $('atColor').value = d.color;
    $('atMirror').checked = d.mirror;
    $('atSmooth').checked = !!d.smooth;
    $('atMirror').disabled = d.shape === 'eye'; // pas de symétrie automatique pour l'œil
    $('atDetach').disabled = !atParentOf(part);
    $('atDetail').value = atDetailOf(d.shape, d);
    $('atDetailInfo').textContent = (part.geo.index.count / 3) + ' polygones' + (d.mirror ? ' (×2 avec la symétrie)' : '');
    showValues();
  }
  atelierRenderList();
  atelierSymUi();
  atelierSlideUi();
}
// calage de la pièce liée : libre, ou sur l'axe 1, 2 ou 3 de sa pièce parente
function atelierSlideUi() {
  const p = atelier.sel, box = $('atSlideBox');
  box.hidden = !(p && p.def.link && atParentOf(p));
  if (!box.hidden) { $('atSink').value = p.def.sink || 0; showValues(); $('atSlideAxis').value = p.def.link.axis == null ? '' : String(p.def.link.axis); }
}
function atelierSlideSet() {
  const p = atelier?.sel;
  if (!p || !p.def.link) return;
  const par = atParentOf(p), v = $('atSlideAxis').value;
  p.def.link.arc = null;
  p.def.link.axis = v === '' ? null : +v;
  if (par && p.def.link.axis != null) { // la liaison vient se poser sur l'axe choisi (au point le plus proche)
    const a = p.def.link.axis, cur = V3(...p.def.link.p);
    p.def.link.p = atelierOnAxis(par, a, cur.getComponent(a)).toArray();
    atelierApplyTransform(p);
  }
  atelierSyncPair(p);
}
// réglage de l'axe de symétrie (visible seulement pour une pièce appariée)
function atelierSymUi() {
  const p = atelier.sel, box = $('atSymBox');
  const paired = !!p && !!atPartnerOf(p);
  box.hidden = !paired;
  if (!paired) return;
  const mate = atPartnerOf(p), sel = $('atSymRef');
  sel.innerHTML = '';
  const opt = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
  opt('', "Plan central de l'atelier");
  atelier.parts.forEach((q, i) => { if (q !== p && q !== mate) opt(String(q.def.uid), (i + 1) + '. ' + AT_SHAPES[q.def.shape]); });
  const sym = p.def.sym;
  sel.value = sym && sym.ref != null && [...sel.options].some((o) => o.value === String(sym.ref)) ? String(sym.ref) : '';
  $('atSymAxis').value = String(sym?.axis ?? 0);
  $('atSymAxis').disabled = sel.value === '';
}
function atelierSymSet() {
  const p = atelier?.sel;
  if (!p || !atPartnerOf(p)) return;
  const ref = $('atSymRef').value, sym = ref === '' ? null : { ref: +ref, axis: +$('atSymAxis').value };
  p.def.sym = sym ? { ...sym } : null;
  atPartnerOf(p).def.sym = sym ? { ...sym } : null;
  $('atSymAxis').disabled = ref === '';
  atelierSyncPair(p); // la deuxième pièce est recalculée avec le nouveau plan
}
function atelierRenderList() {
  const box = $('atParts');
  box.innerHTML = '';
  atelier.parts.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = p === atelier.sel ? '' : 'alt';
    const par = atParentOf(p);
    b.textContent = (i + 1) + '. ' + AT_SHAPES[p.def.shape] + (p.def.mirror ? ' ⇋' : '') + (par ? ' ↳' + (atelier.parts.indexOf(par) + 1) : '') + (p.def.grp != null ? ' ⟐' : '') + (atPartnerOf(p) ? ' ↔' + (atelier.parts.indexOf(atPartnerOf(p)) + 1) : '');
    b.title = par ? 'Accrochée à la pièce ' + (atelier.parts.indexOf(par) + 1) : 'Pièce libre';
    b.addEventListener('click', () => atelierSelect(p));
    box.appendChild(b);
  });
  let faces = 0;
  for (const p of atelier.parts) faces += (p.geo.index.count / 3) * (p.def.mirror ? 2 : 1);
  $('atFaces').textContent = faces + ' polygones';
}
function enterAtelier(def) {
  if (atelier || edit) return;
  if (poseMode) exitPose();
  select(null);
  atelier = { group: new THREE.Group(), parts: [], uid: 0, sel: null, mode: 'move', hidden: [], drag: null, downAt: null, editId: def ? def.id : null,
    saved: { pos: camera.position.clone(), target: controls.target.clone(), min: controls.minDistance, max: controls.maxDistance } };
  for (const c of world.children) { atelier.hidden.push([c, c.visible]); c.visible = false; }
  ring.visible = handle.visible = false;
  // décor de l'atelier : sol quadrillé, plan de symétrie, flèche d'avant (+Z)
  const grid = new THREE.GridHelper(4, 16, 0x6f84a0, 0x3b4a5e);
  const sym = new THREE.Mesh(new THREE.PlaneGeometry(0.004, 2.4), new THREE.MeshBasicMaterial({ color: 0xff9a2e, transparent: true, opacity: 0.55 }));
  sym.rotation.x = -Math.PI / 2; sym.position.y = 0.002;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), new THREE.MeshBasicMaterial({ color: 0x4de88a }));
  arrow.rotation.x = Math.PI / 2; arrow.position.set(0, 0.01, 1.45); arrow.scale.set(1, 1, 0.1);
  atelier.group.add(grid, sym, arrow);
  scene.add(atelier.group);
  controls.target.set(0, 0.5, 0);
  camera.position.set(1.7, 1.3, 2.4);
  controls.minDistance = 0.4; controls.maxDistance = 12;
  document.body.classList.add('atelier');
  $('atBar').hidden = false; $('atPanel').hidden = false;
  $('atName').value = def ? def.name : 'Mon animal';
  $('atSize').value = def ? def.size : 0.5;
  atelierBuild(def ? def.parts : []);
  A_handles();
  atPlaneInit();
  atelierMode('move');
  atelierSelect(null);
  showValues();
  atelierHistoryReset();
}
// ----- plan de coupe : un plan que l'on déplace le long d'un axe de la scène et que l'on peut tourner ; il trace sa section sur toutes les formes -----
const AT_PLANE = { on: false, axis: 1, pos: 0.5, rot: [0, 0, 0], cut: true };
function atPlaneMatrix() {
  const P = AT_PLANE, T = V3(0, 0, 0).setComponent(P.axis, P.pos);
  const R = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...P.rot.map((a) => (a * Math.PI) / 180)));
  return new THREE.Matrix4().makeTranslation(T.x, T.y, T.z).multiply(R); // translation sur l'axe choisi, puis rotation autour du centre du plan
}
// normale du plan dans l'atelier (axe choisi tourné) et un de ses points
function atPlaneNormal() { return V3(0, 0, 0).setComponent(AT_PLANE.axis, 1).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...AT_PLANE.rot.map((a) => (a * Math.PI) / 180)))); }
function atPlaneInit() {
  const g = new THREE.PlaneGeometry(3.2, 3.2);
  const base = new THREE.Matrix4().makeRotationX(-Math.PI / 2); // PlaneGeometry : normale +Z ; remise dans le plan voulu par atPlaneUpdate
  void base;
  atelier.plane = new THREE.Group();
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x4d8ae8, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0x4d8ae8, transparent: true, opacity: 0.9 }));
  atelier.plane.add(mesh, edge);
  atelier.plane.matrixAutoUpdate = false;
  atelier.plane.visible = false;
  atelier.plane.renderOrder = 990;
  atelier.group.add(atelier.plane);
  const handle = new THREE.Mesh(poseDotGeo, new THREE.MeshBasicMaterial({ color: 0xff9a2e, depthTest: false, transparent: true }));
  handle.renderOrder = 1003; handle.visible = false;
  atelier.planeHandle = handle;
  atelier.group.add(handle);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60000 * 3), 3));
  atelier.sections = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0x111111, depthTest: false, transparent: true, opacity: 0.95 }));
  atelier.sections.renderOrder = 991; atelier.sections.frustumCulled = false; atelier.sections.visible = false;
  atelier.group.add(atelier.sections);
}
function atPlaneUpdate() {
  const A = atelier, P = AT_PLANE, show = P.on;
  A.plane.visible = A.planeHandle.visible = show;
  A.sections.visible = show && P.cut;
  if (!show) return;
  // la géométrie du plan est dans le plan X-Y (normale +Z) : on la remet dans le plan perpendiculaire à l'axe choisi
  const orient = new THREE.Matrix4();
  if (P.axis === 1) orient.makeRotationX(-Math.PI / 2); else if (P.axis === 0) orient.makeRotationY(Math.PI / 2);
  A.plane.matrix.copy(atPlaneMatrix()).multiply(orient);
  A.plane.matrixWorldNeedsUpdate = true;
  A.planeHandle.position.setFromMatrixPosition(atPlaneMatrix());
  A.planeHandle.scale.setScalar(camera.position.distanceTo(A.planeHandle.position) * 0.02);
  if (!P.cut) return;
  // section : pour chaque triangle de chaque forme, le segment où il coupe le plan
  const n = atPlaneNormal(), c = A.planeHandle.position, out = A.sections.geometry.attributes.position;
  const w = [V3(0, 0, 0), V3(0, 0, 0), V3(0, 0, 0)], d = [0, 0, 0];
  let m = 0;
  const run = (part, M) => {
    const pos = part.geo.attributes.position, ind = part.geo.index.array;
    const dist = new Float32Array(pos.count), wp = new Float32Array(pos.count * 3), v = V3(0, 0, 0);
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(M); wp[i * 3] = v.x; wp[i * 3 + 1] = v.y; wp[i * 3 + 2] = v.z; dist[i] = (v.x - c.x) * n.x + (v.y - c.y) * n.y + (v.z - c.z) * n.z; }
    for (let t = 0; t < ind.length; t += 3) {
      const ia = ind[t], ib = ind[t + 1], ic = ind[t + 2], da = dist[ia], db = dist[ib], dc = dist[ic];
      if ((da > 0 && db > 0 && dc > 0) || (da < 0 && db < 0 && dc < 0) || m + 2 > 60000) continue;
      const ids = [ia, ib, ic], ds = [da, db, dc], pts = [];
      for (let e = 0; e < 3; e++) {
        const i0 = ids[e], i1 = ids[(e + 1) % 3], d0 = ds[e], d1 = ds[(e + 1) % 3];
        if ((d0 > 0) !== (d1 > 0) && d0 !== d1) {
          const f = d0 / (d0 - d1);
          pts.push(V3(wp[i0 * 3] + (wp[i1 * 3] - wp[i0 * 3]) * f, wp[i0 * 3 + 1] + (wp[i1 * 3 + 1] - wp[i0 * 3 + 1]) * f, wp[i0 * 3 + 2] + (wp[i1 * 3 + 2] - wp[i0 * 3 + 2]) * f));
        }
      }
      if (pts.length >= 2) { out.setXYZ(m++, pts[0].x, pts[0].y, pts[0].z); out.setXYZ(m++, pts[1].x, pts[1].y, pts[1].z); }
    }
  };
  void w; void d;
  for (const part of A.parts) { run(part, part.mesh.matrix); if (part.twin) run(part, part.twin.matrix); }
  out.needsUpdate = true;
  A.sections.geometry.setDrawRange(0, m);
}
// coupe la pièce sélectionnée (et sa partenaire de paire) avec le plan ; keep = 1 : on garde le dessus (côté de la normale), -1 : le dessous
function atelierCutWithPlane(keep) {
  const A = atelier, sel = A.sel;
  if (!sel) { setStatus("Sélectionne d'abord une forme à couper."); return; }
  if (!AT_PLANE.on) { setStatus("Affiche d'abord le plan."); return; }
  const nw = atPlaneNormal(), cw = V3(0, 0, 0).setFromMatrixPosition(atPlaneMatrix());
  let did = false;
  for (const q of [sel, atPartnerOf(sel)]) {
    if (!q) continue;
    const M = q.mesh.matrix, inv = M.clone().invert(), nl = nw.clone().transformDirection(new THREE.Matrix4().copy(M).transpose()), cl = cw.clone().applyMatrix4(inv);
    // normale locale = Mᵀ·n (valable même avec des étirements) ; d = n_local · point_local
    const nn = nw.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(M).transpose());
    void nl;
    const len = nn.length();
    if (len < 1e-9) continue;
    nn.multiplyScalar(1 / len);
    const cut = { n: nn.toArray(), d: nn.dot(cl), keep };
    const test = atelierClipGeo(q.geo.clone(), cut);
    if (test.index.count < 3) { test.dispose(); setStatus('Cette coupe ne garderait rien : annulée.'); continue; }
    test.dispose();
    q.def.cuts = [...(q.def.cuts || []), cut];
    const old = q.geo;
    q.geo = atelierPartGeo(q.def);
    q.mesh.geometry = q.geo;
    if (q.twin) q.twin.geometry = q.geo;
    old.dispose();
    atelierApplyColor(q);
    atelierShade(q);
    did = true;
  }
  if (did) { atelierRenderList(); setStatus(keep > 0 ? 'Forme coupée : on garde ce qui est au-dessus du plan.' : 'Forme coupée : on garde ce qui est en dessous du plan.'); }
}
// ailes : tranche de la surface du corps (lancers de rayons depuis son centre), un ovale allongé vers la queue sur le flanc +X
function atelierShellPoints(body, side) {
  const g = body.geo, pos = g.attributes.position, ind = g.index.array, bb = (g.computeBoundingBox(), g.boundingBox);
  const L = bb.max.y - bb.min.y, yc = bb.min.y + 0.4 * L, hy = 0.34 * L, hz = 0.55 * bb.max.x, R = 4, S = 14;
  const hit = (dir) => { // surface la plus éloignée touchée par le rayon (0,0,0) → dir
    let best = 0;
    const a = V3(0, 0, 0), b = V3(0, 0, 0), c = V3(0, 0, 0), e1 = V3(0, 0, 0), e2 = V3(0, 0, 0), pv = V3(0, 0, 0), tv = V3(0, 0, 0), qv = V3(0, 0, 0);
    for (let t = 0; t < ind.length; t += 3) {
      a.fromBufferAttribute(pos, ind[t]); b.fromBufferAttribute(pos, ind[t + 1]); c.fromBufferAttribute(pos, ind[t + 2]);
      e1.subVectors(b, a); e2.subVectors(c, a); pv.crossVectors(dir, e2);
      const det = e1.dot(pv);
      if (Math.abs(det) < 1e-12) continue;
      tv.set(0, 0, 0).sub(a);
      const u = tv.dot(pv) / det;
      if (u < 0 || u > 1) continue;
      qv.crossVectors(tv, e1);
      const v = dir.dot(qv) / det;
      if (v < 0 || u + v > 1) continue;
      const tt = e2.dot(qv) / det;
      if (tt > best) best = tt;
    }
    return best ? dir.clone().multiplyScalar(best) : null;
  };
  const pts = [], center = hit(V3(side * bb.max.x, yc, 0).normalize());
  if (!center) return null;
  pts.push(center.x, center.y, center.z);
  for (let r = 1; r <= R; r++) for (let k = 0; k < S; k++) {
    const f = r / R, ph = (2 * Math.PI * k) / S, p = hit(V3(side * bb.max.x, yc + f * Math.cos(ph) * hy, f * Math.sin(ph) * hz).normalize());
    if (!p) return null;
    pts.push(p.x, p.y, p.z);
  }
  return { pts: pts.map((v) => +v.toFixed(4)), R, S, thick: 0.03, mir: false };
}
function atelierAddShellWings(body) {
  const P = atelierShellPoints(body, 1);
  if (!P) return null;
  const Wb = atelierWorld(body), pos = V3(0, 0, 0), q = new THREE.Quaternion(), sc = V3(1, 1, 1);
  Wb.decompose(pos, q, sc);
  const eu = new THREE.Euler().setFromQuaternion(q), rot = [eu.x, eu.y, eu.z].map((a) => (a * 180) / Math.PI), color = AT_COLOR0.wing;
  const mk = (params) => atelierMakePart({ shape: 'patch', pos: pos.toArray(), rot, scl: sc.toArray(), color, mirror: false, detail: 4, smooth: false, params });
  const lead = mk(P), mate = mk({ ...P, mir: true });
  atelierBallLink(lead, body, pos);
  const sym = { ref: body.def.uid, axis: 0 };
  lead.def.pair = mate.def.uid; mate.def.pair = lead.def.uid;
  lead.def.sym = { ...sym }; mate.def.sym = { ...sym };
  atelierSyncPair(lead);
  return lead;
}
// aile = peau de l'œuf (du corps) du côté choisi du plan de coupe, avec sa symétrique de l'autre côté du corps
function atelierAddEggWings(body, keep) {
  if (!AT_PLANE.on) { setStatus("Affiche d'abord le plan et place-le sur l'aile."); return null; }
  const M = body.mesh.matrix, nw = atPlaneNormal(), cw = V3(0, 0, 0).setFromMatrixPosition(atPlaneMatrix());
  const nn = nw.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(M).transpose());
  if (nn.length() < 1e-9) return null;
  nn.normalize();
  const cl = cw.clone().applyMatrix4(M.clone().invert()), params = { shell: body.def.shape, detail: atDetailOf(body.def.shape, body.def), n: nn.toArray().map((v) => +v.toFixed(5)), d: +nn.dot(cl).toFixed(5), keep, t: 0.08, mir: false };
  const test = atelierEggShellGeo(params);
  const empty = test.index.count < 3;
  test.dispose();
  if (empty) { setStatus('Le plan ne laisse rien de ce côté du corps.'); return null; }
  const Wb = atelierWorld(body), pos = V3(0, 0, 0), q = new THREE.Quaternion(), sc = V3(1, 1, 1);
  Wb.decompose(pos, q, sc);
  const eu = new THREE.Euler().setFromQuaternion(q), rot = [eu.x, eu.y, eu.z].map((a) => (a * 180) / Math.PI);
  const mk = (pr) => atelierMakePart({ shape: 'patch', pos: pos.toArray(), rot, scl: sc.toArray(), color: AT_COLOR0.wing, mirror: false, detail: 4, smooth: false, params: pr });
  const lead = mk(params), mate = mk({ ...params, mir: true });
  atelierBallLink(lead, body, pos);
  const sym = { ref: body.def.uid, axis: 0 };
  lead.def.pair = mate.def.uid; mate.def.pair = lead.def.uid;
  lead.def.sym = { ...sym }; mate.def.sym = { ...sym };
  atelierSyncPair(lead);
  return lead;
}
// ----- ailes de mésange (modèle : mésange charbonnière) : sur chaque flanc, une aile repliée qui épouse le corps, de l'épaule jusqu'au-dessus de la queue,
// en trois bandes de couleur : couvertures bleu-gris, barre alaire blanche, rémiges bleu foncé terminées en pointe -----
// rayon du corps à la hauteur y, dans la direction dir = (cos φ, 0, sin φ) : rayon lancé depuis l'axe Y de la forme
function atBodyRay(body) {
  const pos = body.geo.attributes.position, ind = body.geo.index.array;
  const a = V3(0, 0, 0), b = V3(0, 0, 0), c = V3(0, 0, 0), e1 = V3(0, 0, 0), e2 = V3(0, 0, 0), pv = V3(0, 0, 0), tv = V3(0, 0, 0), qv = V3(0, 0, 0);
  return (O, dir) => { // distance (la plus grande) de O à la surface le long de dir, 0 si rien
    let best = 0;
    for (let t = 0; t < ind.length; t += 3) {
      a.fromBufferAttribute(pos, ind[t]); b.fromBufferAttribute(pos, ind[t + 1]); c.fromBufferAttribute(pos, ind[t + 2]);
      e1.subVectors(b, a); e2.subVectors(c, a); pv.crossVectors(dir, e2);
      const det = e1.dot(pv);
      if (Math.abs(det) < 1e-12) continue;
      tv.subVectors(O, a);
      const u = tv.dot(pv) / det;
      if (u < -1e-6 || u > 1 + 1e-6) continue;
      qv.crossVectors(tv, e1);
      const v = dir.dot(qv) / det;
      if (v < -1e-6 || u + v > 1 + 1e-6) continue;
      const tt = e2.dot(qv) / det;
      if (tt > best) best = tt;
    }
    return best;
  };
}
function atBodyRadius(body) { const ray = atBodyRay(body), O = V3(0, 0, 0); return (y, dir) => ray(O.set(0, y, 0), dir); }
// ventre de mésange : corps jaune et bande noire au milieu du ventre, large sous la gorge, qui s'affine jusqu'entre les pattes
function atelierAddTitBelly(body) {
  body.def.color = '#f2dc3c';
  atelierApplyColor(body);
  body.geo.computeBoundingBox();
  const bb = body.geo.boundingBox, radius = atBodyRadius(body), Wb = atelierWorld(body), zs = V3(0, 0, 1).transformDirection(Wb).y >= 0 ? 1 : -1, DEG = Math.PI / 180;
  for (const old of atelier.parts.filter((p) => p.def.shape === 'patch' && p.def.parent === body.def.uid && p.def.params && (p.def.params.kind === 'belly' || p.def.params.kind === 'bellyW' || (p.def.params.nu === 14 && p.def.params.nv === 4)))) atelierRemove(old); // une seule bande : la précédente est remplacée
  const ray = atBodyRay(body), MV = 12, yA = bb.min.y, yB = bb.max.y * 0.97, mp = [], wMax = 0.3 * Math.max(bb.max.x, -bb.min.x), OFF = 0.01;
  const width = (y) => wMax * (1 - 0.6 * Math.min(1, Math.max(0, (y - yA) / (yB - yA)) / 0.5)); // largeur réelle : constante en haut, puis s'affine sur le ventre
  const row = (pts) => { for (const p of pts) mp.push(+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)); };
  // 1) le dôme du haut : rayons en éventail depuis un point de l'axe à l'intérieur du bout large, de son sommet (ψ = 0) jusqu'à son flanc (ψ = 80°)
  const O = V3(0, bb.min.y * 0.5, 0), NT = 12;
  let yLast = yA;
  for (let it = 0; it <= NT; it++) {
    const psi = ((2 + 80 * (it / NT)) * Math.PI) / 180, dc = V3(0, -Math.cos(psi), -zs * Math.sin(psi)), rho = ray(O, dc);
    if (!(rho > 0)) return null;
    const yc = O.y - Math.cos(psi) * rho, band = Math.min(60 * DEG, width(yc) / Math.max(1e-4, rho * Math.sin(psi)));
    const half = band, pts = []; // la bande garde sa largeur jusque sous la tête (pas de collier)
    for (let iv = 0; iv <= MV; iv++) {
      const d = half * (-1 + (2 * iv) / MV), dir = V3(Math.sin(psi) * Math.sin(d), -Math.cos(psi), -zs * Math.sin(psi) * Math.cos(d)), r = ray(O, dir);
      if (!(r > 0)) return null;
      pts.push(O.clone().addScaledVector(dir, r + OFF));
    }
    row(pts);
    yLast = yc;
  }
  // 2) le reste : rayons horizontaux depuis l'axe, jusqu'au bout pointu sous la queue
  const NB = 14;
  for (let ib = 1; ib <= NB; ib++) {
    const y = yLast + ((yB - yLast) * ib) / NB, rc = radius(y, V3(0, 0, -zs));
    if (!(rc > 0)) return null;
    // plastron : noir jusqu'au bord des ailes sur le haut du corps (u < 0,3), puis il se resserre jusqu'à la bande du ventre (u > 0,55)
    const half = Math.min(60 * DEG, width(y) / rc), pts = [];
    for (let iv = 0; iv <= MV; iv++) {
      const d = half * (-1 + (2 * iv) / MV), dir = V3(Math.sin(d), 0, -zs * Math.cos(d)), r = radius(y, dir);
      if (!(r > 0)) return null;
      pts.push(V3(dir.x * (r + OFF), y, dir.z * (r + OFF)));
    }
    row(pts);
  }
  const MU = NT + NB;
  const pos0 = V3(0, 0, 0), q = new THREE.Quaternion(), sc = V3(1, 1, 1);
  Wb.decompose(pos0, q, sc);
  const eu = new THREE.Euler().setFromQuaternion(q), rot = [eu.x, eu.y, eu.z].map((x) => (x * 180) / Math.PI);
  const stripe = atelierMakePart({ shape: 'patch', pos: pos0.toArray(), rot, scl: sc.toArray(), color: '#000000', mirror: false, detail: 4, smooth: false, params: { kind: 'belly', nu: MU, nv: MV, pts: mp.map((v) => +v.toFixed(4)), thick: 0.012, mir: false } });
  atelierBallLink(stripe, body, pos0);
  return stripe;
}
// tête de mésange charbonnière : calotte et gorge noires (la tête entière passe en noir), grandes joues blanches, yeux et bec
function atelierAddTitHead(head, body, opts = {}) {
  const A = atelier;
  // on remplace ce qu'il y avait déjà sur la tête (yeux, bec, joues)
  for (const old of A.parts.filter((p) => (p.def.parent === head.def.uid || (p.def.shape === 'eye' && atParentOf(p)?.def.parent === head.def.uid)) && (p.def.shape === 'eye' || p.def.shape.startsWith('beak') || (p.def.shape === 'patch' && p.def.params && p.def.params.kind === 'cheek')))) if (A.parts.includes(old)) atelierRemove(old);
  head.def.color = opts.headColor || '#0a0a0c';
  atelierApplyColor(head);
  const Wh = atelierWorld(head), C = V3(0, 0, 0), qh = new THREE.Quaternion(), sh = V3(1, 1, 1);
  Wh.decompose(C, qh, sh);
  head.geo.computeBoundingBox();
  const R = head.geo.boundingBox.max.x, kh = Math.cbrt(Math.abs(sh.x * sh.y * sh.z)), Rw = R * kh, DEG = Math.PI / 180;
  // repère de la tête dans l'atelier : r = côté (axe X de la tête), f = vers l'avant (à l'opposé de la queue du corps, à l'horizontale), u = vers le haut
  let r = V3(1, 0, 0).applyQuaternion(qh), f = body ? V3(0, -1, 0).transformDirection(atelierWorld(body)) : V3(0, 0, 1).applyQuaternion(qh);
  f.y = 0;
  if (f.lengthSq() < 0.01) f = V3(0, 0, 1).applyQuaternion(qh);
  f.addScaledVector(r, -f.dot(r));
  if (f.lengthSq() < 1e-6) f = V3(0, 0, 1).applyQuaternion(qh);
  f.normalize();
  let u = f.clone().cross(r).normalize();
  if (u.y < 0) { r = r.multiplyScalar(-1); u = u.multiplyScalar(-1); }
  const dirW = (az, el) => f.clone().multiplyScalar(Math.cos(el) * Math.cos(az)).addScaledVector(r, Math.cos(el) * Math.sin(az)).addScaledVector(u, Math.sin(el));
  const qi = qh.clone().invert(), euH = new THREE.Euler().setFromQuaternion(qh), rotH = [euH.x, euH.y, euH.z].map((x) => (x * 180) / Math.PI), sym = { ref: head.def.uid, axis: 0 };
  const pairUp = (lead, mate) => { lead.def.pair = mate.def.uid; mate.def.pair = lead.def.uid; lead.def.sym = { ...sym }; mate.def.sym = { ...sym }; atelierSyncPair(lead); };
  // joues blanches : un ovale sur chaque côté, de la base du bec jusqu'à la nuque, sous l'œil
  const NU = 10, NV = 6, az0 = 64 * DEG, AZ = 36 * DEG, el0 = -5 * DEG, EL = 24 * DEG, cp = [];
  for (let iu = 0; iu <= NU; iu++) {
    const t = -1 + (2 * iu) / NU, h = EL * Math.sqrt(Math.max(0, 1 - t * t));
    for (let iv = 0; iv <= NV; iv++) {
      const d = dirW(az0 + AZ * t, el0 + h * (-1 + (2 * iv) / NV)).applyQuaternion(qi).multiplyScalar(R + 0.007); // dans le repère de la tête
      cp.push(+d.x.toFixed(4), +d.y.toFixed(4), +d.z.toFixed(4));
    }
  }
  const mkCheek = (mir) => atelierMakePart({ shape: 'patch', pos: C.toArray(), rot: rotH, scl: sh.toArray(), color: '#f4f4ee', mirror: false, detail: 4, smooth: false, params: { kind: 'cheek', sph: true, nu: NU, nv: NV, pts: cp, thick: 0.01, mir } });
  if (opts.cheeks !== false) {
    const cheek = mkCheek(false), cheek2 = mkCheek(true);
    atelierBallLink(cheek, head, C);
    pairUp(cheek, cheek2);
  }
  // yeux : dans le noir, juste au-dessus du bord avant de la joue
  const es = (0.85 * kh) / 0.45, eyePos = C.clone().addScaledVector(dirW(52 * DEG, 21 * DEG), Rw * 0.97);
  const mkEye = (p) => atelierMakePart({ shape: 'eye', pos: p.toArray(), rot: rotH, scl: [es, es, es], color: '#2a2622', mirror: false, detail: AT_DETAIL_NEW, smooth: true });
  const eye = mkEye(eyePos), eye2 = mkEye(eyePos);
  atelierBallLink(eye, head, eyePos);
  pairUp(eye, eye2);
  // pupille : petit reflet blanc à la surface de l'œil, un peu vers l'avant et le haut, lié à l'œil
  const ps = 0.38 * es, pupPos = eyePos.clone().addScaledVector(dirW(40 * DEG, 30 * DEG), 0.03 * es * 0.78);
  const mkPup = () => atelierMakePart({ shape: 'eye', pos: pupPos.toArray(), rot: rotH, scl: [ps, ps, ps], color: '#f4f4f0', mirror: false, detail: AT_DETAIL_NEW, smooth: true });
  const pup = mkPup(), pup2 = mkPup();
  atelierBallLink(pup, eye, pupPos);
  pairUp(pup, pup2);
  // bec : court cône gris foncé, à l'avant, un peu sous le milieu de la tête
  const bs = (0.55 * kh) / 0.45, beakPos = C.clone().addScaledVector(f, Rw * 0.9).addScaledVector(u, -Rw * 0.1);
  const tilt = (opts.beakTilt || 0) * DEG, fb = f.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(u, -Math.sin(tilt)), ub = u.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(f, Math.sin(tilt)); // bec incliné vers le bas
  const bk = opts.beak || [1, 1, 0.85], beakColor = opts.beakColor || '#3a3d42';
  const eb = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, ub, fb)));
  const rotB = [eb.x, eb.y, eb.z].map((x) => (x * 180) / Math.PI);
  const beak = atelierMakePart({ shape: opts.curved ? 'beakUpC' : 'beakUp', pos: beakPos.toArray(), rot: rotB, scl: [bs * bk[0], bs * bk[1], bs * bk[2]], color: beakColor, mirror: false, detail: AT_DETAIL_NEW, smooth: true });
  const beakLow = atelierMakePart({ shape: opts.curved ? 'beakLowC' : 'beakLow', pos: beakPos.toArray(), rot: rotB, scl: [bs * bk[0], bs * bk[1], bs * bk[2]], color: beakColor, mirror: false, detail: AT_DETAIL_NEW, smooth: true });
  atelierBallLink(beak, head, beakPos);
  atelierBallLink(beakLow, head, beakPos); // la mandibule du bas pivote à la base du bec : c'est elle qui s'ouvre
  return beak;
}
// queue de mésange : longue planche bleu-gris légèrement en toit, un peu échancrée au bout, bordée de blanc ; elle sort du bout pointu du corps, dans l'axe du corps, sous la pointe des ailes
function atelierAddTitTail(body) { return atelierAddBandTail(body, [[0, 10, '#4f78aa']], '#eef0ee'); } // mésange : bleu-gris bordée de blanc
function atelierAddBandTail(body, segs, edgeColor, form = {}) {
  const A = atelier;
  if (!form.keep) for (const old of A.parts.filter((p) => p.def.parent === body.def.uid && (p.def.shape === 'plume' || p.def.shape === 'tail' || (p.def.shape === 'patch' && p.def.params && p.def.params.kind === 'tail')))) if (A.parts.includes(old)) atelierRemove(old); // remplace l'ancienne queue
  body.geo.computeBoundingBox();
  const bb = body.geo.boundingBox, Wb = atelierWorld(body), zs = V3(0, 0, 1).transformDirection(Wb).y >= 0 ? 1 : -1; // zs : côté du dos
  const yS = form.y0 ?? bb.max.y * 0.5, yEnd = yS + bb.max.y * 0.5 + (form.len ?? 0.62), x0 = form.x0 || 0, W0 = form.W0 ?? 0.045, W1 = form.W1 ?? 0.07, EDGE = 0.02, NOTCH = 0.035, TILT = Math.tan((5 * Math.PI) / 180), NU = 30; // rangées fines : les frontières de couleur restent nettes
  const P3 = (x, u) => { // point de la queue : x en travers, u de 0 (dans le corps) à 1 (le bout)
    const yTip = yEnd - NOTCH * (1 - Math.min(1, Math.abs(x) / (W1 + EDGE))), y = yS + (yTip - yS) * u;
    const yaw = form.yaw || 0, xr = x * Math.cos(yaw) - (y - yS) * Math.sin(yaw), yr = yS + (y - yS) * Math.cos(yaw) + x * Math.sin(yaw); // yaw : la plume est tournée autour de sa racine (éventail)
    return [xr + x0, yr, zs * (0.03 + (y - yS) * TILT - 0.22 * Math.abs(x))]; // léger relèvement vers le dos, et forme de toit (les bords retombent)
  };
  const grid = (x0f, x1f, nv, r0 = 0, r1 = NU) => { // bande entre deux bords (fonctions de u), rangées r0 à r1
    const out = [];
    for (let iu = r0; iu <= r1; iu++) { const u = iu / NU; for (let iv = 0; iv <= nv; iv++) out.push(...P3(x0f(u) + ((x1f(u) - x0f(u)) * iv) / nv, u).map((v) => +v.toFixed(4))); }
    return out;
  };
  const w = (u) => W0 + (W1 - W0) * u;
  const pos0 = V3(0, 0, 0), q = new THREE.Quaternion(), sc = V3(1, 1, 1);
  Wb.decompose(pos0, q, sc);
  const eu = new THREE.Euler().setFromQuaternion(q), rot = [eu.x, eu.y, eu.z].map((x) => (x * 180) / Math.PI);
  const mk = (color, pts, nu, nv, mir) => atelierMakePart({ shape: 'patch', pos: pos0.toArray(), rot, scl: sc.toArray(), color, mirror: false, detail: 4, smooth: false, params: { kind: form.kind || 'tail', side: form.side || 0, flat: [0, 0, zs], nu, nv, pts, thick: 0.012, mir } });
  // plumes centrales : une pièce par tranche de couleur ; la première mène, les autres lui sont liées et forment un groupe avec elle (on les manipule ensemble)
  let first = null;
  for (const [r0, r1, color] of segs) {
    const mid = mk(color, grid((u) => -w(u), w, 4, r0 * 3, r1 * 3), (r1 - r0) * 3, 4, false); // tranches données sur 10, grille sur 30
    if (!first) { first = mid; atelierBallLink(mid, body, pos0); }
    else { atelierBallLink(mid, first, pos0); mid.def.grp = first.def.uid; }
  }
  if (edgeColor) { // plumes externes, une de chaque côté
    const ep = grid(w, (u) => w(u) + EDGE, 1), e1 = mk(edgeColor, ep, NU, 1, false), e2 = mk(edgeColor, ep, NU, 1, true);
    atelierBallLink(e1, body, pos0);
    e1.def.pair = e2.def.uid; e2.def.pair = e1.def.uid;
    e1.def.sym = { ref: body.def.uid, axis: 0 }; e2.def.sym = { ref: body.def.uid, axis: 0 };
    atelierSyncPair(e1);
  }
  return first;
}
// pattes de mésange : de chaque côté une cuisse (courte, dans les plumes du ventre, part vers le bas et l'arrière), une jambe fine (vers le bas et l'avant) et 4 griffes (3 devant, 1 derrière)
// huppe fasciée : éventail de plumes plates sur le dessus de la tête, du front à la nuque, orange à bout noir ; chaque plume est liée à la tête à sa racine
function atelierAddCrest(head, body, color, tipColor) {
  const A = atelier;
  const isCrest = (p) => p.def.shape === 'plume' || p.def.shape === 'feather' || p.def.shape.startsWith('quill');
  for (const old of A.parts.filter((p) => isCrest(p) && (p.def.parent === head.def.uid || atParentOf(p)?.def.parent === head.def.uid))) if (A.parts.includes(old)) atelierRemoveOne(old); // l'ancienne huppe (fûts et bouts)
  const Wh = atelierWorld(head), C = V3(0, 0, 0), qh = new THREE.Quaternion(), sh = V3(1, 1, 1);
  Wh.decompose(C, qh, sh);
  head.geo.computeBoundingBox();
  const R = head.geo.boundingBox.max.x, kh = Math.cbrt(Math.abs(sh.x * sh.y * sh.z)), Rw = R * kh, DEG = Math.PI / 180;
  let r = V3(1, 0, 0).applyQuaternion(qh), f = body ? V3(0, -1, 0).transformDirection(atelierWorld(body)) : V3(0, 0, 1).applyQuaternion(qh);
  f.y = 0;
  if (f.lengthSq() < 0.01) f = V3(0, 0, 1).applyQuaternion(qh);
  f.addScaledVector(r, -f.dot(r)).normalize();
  let u = f.clone().cross(r).normalize();
  if (u.y < 0) { r = r.multiplyScalar(-1); u = u.multiplyScalar(-1); }
  const N = 8, out = [];
  for (let i = 0; i < N; i++) {
    const rootA = (-40 + (100 * i) / (N - 1)) * DEG, dirA = (22 + (63 * i) / (N - 1)) * DEG; // huppe couchée : toutes les plumes partent vers l'arrière, de plus en plus couchées vers la nuque // angle depuis la verticale, vers l'arrière (négatif = vers l'avant) : éventail bien ouvert
    const root = C.clone().addScaledVector(u.clone().multiplyScalar(Math.cos(rootA)).addScaledVector(f, -Math.sin(rootA)), Rw * 0.95);
    const d = u.clone().multiplyScalar(Math.cos(dirA)).addScaledVector(f, -Math.sin(dirA)); // direction de la plume
    const Z = d.clone().multiplyScalar(-1), Y = r.clone(), X = Y.clone().cross(Z).normalize(); // la plume part vers -Z ; son épaisseur (Y) est latérale : elle est à plat dans le plan de symétrie
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z))), rot = [e.x, e.y, e.z].map((x) => (x * 180) / Math.PI);
    rot[1] += ((i * 5 + 2) % 7) - 3; // légère variation de la rotation Y (±3°) d'une plume à l'autre
    const ks = kh / 0.45, len = (0.42 + 0.38 * (i / (N - 1))) * ks; // courtes devant, longues derrière
    const scl = [0.525 * ks, 0.28 * ks, len * 0.62]; // lames bien plates
    const shaft = atelierMakePart({ shape: 'quillBase', pos: root.toArray(), rot, scl, color, mirror: false, detail: 2, smooth: false }); // fût étroit
    atelierBallLink(shaft, head, root);
    const tipPos = root.clone().addScaledVector(d, 0.525 * scl[2]); // le bout noir, à bout rond, prend la suite du fût (frontière nette : deux pièces)
    const tip = atelierMakePart({ shape: 'quillTip', pos: tipPos.toArray(), rot, scl, color: tipColor, mirror: false, detail: 2, smooth: false });
    atelierBallLink(tip, shaft, tipPos);
    out.push(shaft);
  }
  return out[0];
}
// arrière du corps d'une autre couleur : demi-manchon sur la moitié inférieure du corps (ventre et bas des flancs), d'une hauteur (fraction du demi-corps côté queue) jusqu'au bout pointu
function atelierAddRearPatch(body, color, from = 0.15) {
  body.geo.computeBoundingBox();
  const bb = body.geo.boundingBox, radius = atBodyRadius(body), Wb = atelierWorld(body), zs = V3(0, 0, 1).transformDirection(Wb).y >= 0 ? 1 : -1;
  const NU = 10, NV = 20, y0 = bb.max.y * from, y1 = bb.max.y * 0.985, pts = [];
  for (let iu = 0; iu <= NU; iu++) {
    const y = y0 + (y1 - y0) * iu / NU;
    for (let iv = 0; iv <= NV; iv++) {
      const d = -Math.PI / 2 + (Math.PI * iv) / NV, dir = V3(Math.sin(d), 0, -zs * Math.cos(d)), r = radius(y, dir); // moitié inférieure seulement (du flanc au ventre)
      if (!(r > 0)) return null;
      pts.push(+(dir.x * (r + 0.004)).toFixed(4), +y.toFixed(4), +(dir.z * (r + 0.004)).toFixed(4));
    }
  }
  const pos0 = V3(0, 0, 0), q = new THREE.Quaternion(), sc = V3(1, 1, 1);
  Wb.decompose(pos0, q, sc);
  const eu = new THREE.Euler().setFromQuaternion(q), rot = [eu.x, eu.y, eu.z].map((x) => (x * 180) / Math.PI);
  const patch = atelierMakePart({ shape: 'patch', pos: pos0.toArray(), rot, scl: sc.toArray(), color, mirror: false, detail: 4, smooth: false, params: { kind: 'rear', nu: NU, nv: NV, pts, thick: 0.006, mir: false } });
  atelierBallLink(patch, body, pos0);
  return patch;
}
// cône d'une couleur sur l'arrière-train : base dans le corps, pointe vers la queue (dans l'axe du corps)
function atelierAddRearCone(body, color, from = 0.2, to = 1.2) {
  body.geo.computeBoundingBox();
  const bb = body.geo.boundingBox, Wb = atelierWorld(body), radius = atBodyRadius(body), yA = bb.max.y * from, yB = bb.max.y * to;
  const rb = radius(yA, V3(1, 0, 0)) * 1.02, H = yB - yA, pos0 = V3(0, 0, 0), q = new THREE.Quaternion(), sc = V3(1, 1, 1);
  if (!(rb > 0)) return null;
  Wb.decompose(pos0, q, sc);
  const eu = new THREE.Euler().setFromQuaternion(q), rot = [eu.x, eu.y, eu.z].map((x) => (x * 180) / Math.PI);
  const cone = atelierMakePart({ shape: 'cone', pos: V3(0, (yA + yB) / 2, 0).applyMatrix4(Wb).toArray(), rot, scl: [(sc.x * rb) / 0.2, (sc.y * H) / 0.6, (sc.z * rb) / 0.2], color, mirror: false, detail: AT_DETAIL_NEW, smooth: true });
  atelierBallLink(cone, body, pos0);
  return cone;
}
function atelierAddTitLegs(body, thighColor = null) {
  const A = atelier;
  for (const old of A.parts.filter((p) => ['hip', 'thigh', 'shin', 'foot', 'leg', 'claw'].includes(p.def.shape))) if (A.parts.includes(old)) atelierRemoveOne(old); // remplace les anciennes pattes
  const Wb = atelierWorld(body), c = V3(0, 0, 0), qb = new THREE.Quaternion(), sc = V3(1, 1, 1);
  Wb.decompose(c, qb, sc);
  const k = Math.cbrt(Math.abs(sc.x * sc.y * sc.z)), DEG = Math.PI / 180;
  // repère de l'oiseau : r = côté (axe X du corps), f = vers l'avant (à l'opposé de la queue, à l'horizontale), up = vers le haut
  let r = V3(1, 0, 0).applyQuaternion(qb), f = V3(0, -1, 0).applyQuaternion(qb);
  f.y = 0;
  if (f.lengthSq() < 0.01) f = V3(0, 0, 1);
  f.addScaledVector(r, -f.dot(r)).normalize();
  let up = f.clone().cross(r).normalize();
  if (up.y < 0) { r.multiplyScalar(-1); up.multiplyScalar(-1); }
  const rotOf = (X, Y, Z) => { const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z))); return [e.x, e.y, e.z].map((x) => (x * 180) / Math.PI); };
  const segRot = (d) => { const Y = d.clone().multiplyScalar(-1), X = r.clone().addScaledVector(Y, -r.dot(Y)).normalize(); return rotOf(X, Y, X.clone().cross(Y)); }; // segment qui descend le long de d
  const toeRot = (d) => { const X = up.clone().cross(d).normalize(); return rotOf(X, d.clone().cross(X).normalize(), d); }; // griffe pointée vers d
  const sym = { ref: body.def.uid, axis: 0 }, GREY = '#56616e';
  const pair = (shape, pos, rot, scl, color, parent, J) => { // pièce de droite + sa symétrique, liée par une rotule au point J de son parent
    const mk = () => atelierMakePart({ shape, pos: pos.toArray(), rot, scl, color, mirror: false, detail: AT_DETAIL_NEW, smooth: true });
    const lead = mk(), mate = mk();
    atelierBallLink(lead, parent, J);
    lead.def.pair = mate.def.uid; mate.def.pair = lead.def.uid;
    lead.def.sym = { ...sym }; mate.def.sym = { ...sym };
    atelierSyncPair(lead);
    return lead;
  };
  const d1 = up.clone().multiplyScalar(-Math.cos(22 * DEG)).addScaledVector(f, -Math.sin(22 * DEG)); // cuisse : vers le bas et l'arrière
  const d2 = up.clone().multiplyScalar(-Math.cos(14 * DEG)).addScaledVector(f, Math.sin(14 * DEG));  // jambe : vers le bas et l'avant
  const hipP = c.clone().addScaledVector(r, 0.085 * k).addScaledVector(up, -0.13 * k).addScaledVector(f, -0.03 * k); // racine de la cuisse, dans le ventre
  const L1 = 0.22 * 1.1 * k, L2 = 0.22 * k, knee = hipP.clone().addScaledVector(d1, L1), ankle = knee.clone().addScaledVector(d2, L2);
  const thigh = pair('thigh', hipP, segRot(d1), [0.65 * k, 1.1 * k, 0.65 * k], thighColor || body.def.color, body, hipP);
  const shin = pair('shin', knee.clone().addScaledVector(d2, -0.01 * k), segRot(d2), [0.5 * k, k, 0.5 * k], GREY, thigh, knee);
  const toe = (ang, len, back) => { // direction au sol : f tourné de ang autour de la verticale (ou vers l'arrière), la pointe un peu vers le bas
    const d = (back ? f.clone().multiplyScalar(-1) : f.clone().multiplyScalar(Math.cos(ang)).addScaledVector(r, Math.sin(ang))).normalize();
    pair('claw', ankle, toeRot(d), [0.8 * k, 0.8 * k, len * k], GREY, shin, ankle);
  };
  toe(0, 1.1); toe(30 * DEG, 0.95); toe(-30 * DEG, 0.95); toe(0, 0.8, true);
  return shin;
}
function atelierAddTitWings(body) { return atelierAddBandWings(body, [[0, 8, '#6f8fb5'], [8, 10, '#f4f4ee'], [10, 24, '#2f5f9a']], '#8ea63c'); } // mésange : couvertures bleu-gris, barre blanche, rémiges bleues, manteau vert
function atelierAddBandWings(body, bands, mantleColor, form = {}) {
  const g = body.geo;
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const radius = atBodyRadius(body);
  const Wb = atelierWorld(body), zs = V3(0, 0, 1).transformDirection(Wb).y >= 0 ? 1 : -1; // côté du dos : celui des deux côtés Z du corps qui regarde vers le haut
  const NU = 24, NV = 6, DEG = Math.PI / 180;
  const y0 = bb.min.y * 0.85, yE = bb.max.y * 0.72, y1 = bb.max.y * 1.55; // de l'épaule (derrière la tête) jusqu'un peu après le bout du corps ; après yE l'aile se détache du corps
  const wPhiC = (u) => ((form.phi0 ?? 22) + (form.dphi ?? 52) * Math.min(1, u / 0.75)) * DEG; // ligne centrale : du flanc vers le dos
  const wHalf = (u) => (form.half ?? 40) * DEG * Math.min(1, Math.sqrt(u / 0.1)) * Math.pow(Math.max(0, 1 - Math.pow(u, 2.4)), 0.9);
  const pts = [];
  for (let iu = 0; iu <= NU; iu++) {
    const u = iu / NU, y = y0 + (y1 - y0) * u;
    const phiC = wPhiC(u); // la ligne centrale part du flanc et remonte vers le dos : les deux pointes se rejoignent au-dessus de la queue
    const half = wHalf(u); // contour : épaule arrondie, bout pointu
    for (let iv = 0; iv <= NV; iv++) {
      const phi = phiC + half * (-1 + (2 * iv) / NV), dir = V3(Math.cos(phi), 0, Math.sin(phi) * zs);
      let r;
      if (y <= yE) r = radius(y, dir);
      else { const rE = radius(yE, dir), rB = radius(yE - 0.03, dir), slope = (rE - rB) / 0.03; r = Math.max(rE * 0.35, rE + slope * 0.55 * (y - yE)); } // pointe libre : prolonge le corps en plus droit
      if (!(r > 0)) return null;
      r += 0.018; // posée au-dessus de la peau et du manteau vert
      pts.push(dir.x * r, y, dir.z * r);
    }
  }
  const pos0 = V3(0, 0, 0), q = new THREE.Quaternion(), sc = V3(1, 1, 1);
  Wb.decompose(pos0, q, sc);
  const eu = new THREE.Euler().setFromQuaternion(q), rot = [eu.x, eu.y, eu.z].map((x) => (x * 180) / Math.PI), sym = { ref: body.def.uid, axis: 0 };
  const band = (u0, u1, color) => { // une bande = colonnes u0 à u1 de la grille, en paire symétrique liée au corps
    const sub = pts.slice(u0 * (NV + 1) * 3, (u1 + 1) * (NV + 1) * 3).map((v) => +v.toFixed(4));
    const mk = (mir) => atelierMakePart({ shape: 'patch', pos: pos0.toArray(), rot, scl: sc.toArray(), color, mirror: false, detail: 4, smooth: false, params: { kind: 'wing', nu: u1 - u0, nv: NV, pts: sub, thick: 0.02, mir } });
    const lead = mk(false), mate = mk(true);
    atelierBallLink(lead, body, pos0);
    lead.def.pair = mate.def.uid; mate.def.pair = lead.def.uid;
    lead.def.sym = { ...sym }; mate.def.sym = { ...sym };
    atelierSyncPair(lead);
    return lead;
  };
  let first = null;
  for (const [a, b, c] of bands) { const q = band(a, Math.min(NU, b), c); if (!first) first = q; }
  if (mantleColor) { // manteau : duvet sur le milieu du dos, entre les deux ailes (il passe un peu dessous), de la nuque jusqu'au croupion où il finit en pointe
    const MU = 12, MV = 8, yA = bb.min.y * 0.85, yB = bb.max.y * 0.6, mp = [];
    let ok = true;
    for (let iu = 0; iu <= MU && ok; iu++) {
      const u = iu / MU, y = yA + (yB - yA) * u;
      const uw = (y - y0) / (y1 - y0), gap = Math.PI / 2 - (wPhiC(uw) + wHalf(uw)); // demi-espace libre entre les ailes à cette hauteur
      const half = Math.max(0, Math.min(46 * DEG, gap + 7 * DEG)) * Math.min(1, Math.sqrt(u / 0.08)) * Math.min(1, (1 - u) / 0.15);
      for (let iv = 0; iv <= MV; iv++) {
        const phi = Math.PI / 2 + half * (-1 + (2 * iv) / MV), dir = V3(Math.cos(phi), 0, Math.sin(phi) * zs), r = radius(y, dir);
        if (!(r > 0)) { ok = false; break; }
        mp.push(dir.x * (r + 0.003), y, dir.z * (r + 0.003));
      }
    }
    if (ok) {
      const mantle = atelierMakePart({ shape: 'patch', pos: pos0.toArray(), rot, scl: sc.toArray(), color: mantleColor, mirror: false, detail: 4, smooth: false, params: { kind: 'mantle', nu: MU, nv: MV, pts: mp.map((v) => +v.toFixed(4)), thick: 0.006, mir: false } });
      atelierBallLink(mantle, body, pos0);
    }
  }
  return first;
}
// poignée orange du plan : on la glisse pour déplacer le plan le long de son axe
function atPlaneHandleHit(e) {
  const A = atelier;
  if (!AT_PLANE.on) return false;
  const rect = dom.getBoundingClientRect(), v = A.planeHandle.position.clone().project(camera);
  return Math.hypot(rect.left + ((v.x + 1) / 2) * rect.width - e.clientX, rect.top + ((1 - v.y) / 2) * rect.height - e.clientY) < 18;
}
function A_handles() {
  atelier.pin = new THREE.Mesh(poseDotGeo, new THREE.MeshBasicMaterial({ color: 0xff9a2e, depthTest: false, transparent: true }));
  atelier.pin.renderOrder = 1000; atelier.pin.visible = false;
  atelier.group.add(atelier.pin);
  // axes de symétrie de la pièce choisie : ses trois axes locaux (rouge X, vert Y, bleu Z) passant par son centre
  const ag = new THREE.BufferGeometry();
  ag.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
  ag.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 0.35, 0.3, 1, 0.35, 0.3, 0.3, 1, 0.55, 0.3, 1, 0.55, 0.35, 0.55, 1, 0.35, 0.55, 1]), 3));
  atelier.axes = new THREE.LineSegments(ag, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.9 }));
  atelier.axes.renderOrder = 996; atelier.axes.frustumCulled = false; atelier.axes.visible = false;
  atelier.group.add(atelier.axes);
  // axes de TOUTES les formes (plus discrets que ceux de la pièce choisie)
  const al = new THREE.BufferGeometry(), cols = new Float32Array(480 * 3), AX = [[0.9, 0.3, 0.27], [0.27, 0.85, 0.5], [0.3, 0.5, 0.9]];
  for (let i = 0; i < 480; i++) { const c = AX[Math.floor((i % 6) / 2)]; cols[i * 3] = c[0]; cols[i * 3 + 1] = c[1]; cols[i * 3 + 2] = c[2]; }
  al.setAttribute('position', new THREE.BufferAttribute(new Float32Array(480 * 3), 3));
  al.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const arcG = new THREE.BufferGeometry();
  arcG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12000 * 3), 3));
  arcG.setAttribute('color', new THREE.BufferAttribute(new Float32Array(12000 * 3), 3));
  atelier.arcs = new THREE.LineSegments(arcG, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.55 }));
  atelier.arcs.renderOrder = 992; atelier.arcs.frustumCulled = false;
  atelier.group.add(atelier.arcs);
  atelier.axesAll = new THREE.LineSegments(al, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.5 }));
  atelier.axesAll.renderOrder = 993; atelier.axesAll.frustumCulled = false;
  atelier.group.add(atelier.axesAll);
  atelier.rings = [];
  for (const [axis, color, k] of [['x', 0xe8504d, 1], ['y', 0x4de88a, 1.14], ['z', 0x4d8ae8, 1.28]]) {
    const g = new THREE.TorusGeometry(1, 0.035, 8, 64);
    if (axis === 'x') g.rotateY(Math.PI / 2); else if (axis === 'y') g.rotateX(Math.PI / 2);
    const r = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.85 }));
    r.renderOrder = 998; r.visible = false; r.frustumCulled = false;
    r.userData.ringAxis = axis; r.userData.k = k;
    atelier.group.add(r);
    atelier.rings.push(r);
  }
  atelier.handles = [];
  for (const [ax, color] of [[0, 0xe8504d], [1, 0x4de88a], [2, 0x4d8ae8]]) {
    for (const sign of [1, -1]) {
      const h = new THREE.Mesh(poseDotGeo, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }));
      h.renderOrder = 999; h.visible = false; h.userData.handle = { ax, sign };
      atelier.group.add(h);
      atelier.handles.push(h);
    }
  }
}
// point (monde) autour duquel tourne la pièce : sa rotule, sinon son pivot
function atelierPivotWorld(p) {
  const par = atParentOf(p);
  if (par && p.def.link) return V3(...p.def.link.p).applyMatrix4(atelierWorld(par));
  return V3(0, 0, 0).setFromMatrixPosition(p.mesh.matrix);
}
const atAvgSize = (d) => Math.cbrt(Math.abs(d.scl[0] * d.scl[1] * d.scl[2]));
// ellipse « principale » d'une pièce : elle passe par les 4 sorties d'axes du plan perpendiculaire à l'axe k (demi-axes différents de chaque côté si la forme est dissymétrique, comme l'œuf)
function atelierArcPoint(bb, k, th) {
  const i = k === 0 ? 1 : 0, j = k === 2 ? 1 : 2, c = Math.cos(th), sn = Math.sin(th), v = V3(0, 0, 0);
  v.setComponent(i, (c >= 0 ? bb.max.getComponent(i) : -bb.min.getComponent(i)) * c);
  v.setComponent(j, (sn >= 0 ? bb.max.getComponent(j) : -bb.min.getComponent(j)) * sn);
  return v;
}
// normale sortante approchée en un point local d'une forme (celle d'un ellipsoïde passant par les sorties d'axes)
function atelierEllipsoidNormal(bb, p) {
  const n = V3(0, 0, 0);
  for (let a = 0; a < 3; a++) { const x = p.getComponent(a), r = x >= 0 ? bb.max.getComponent(a) : -bb.min.getComponent(a); n.setComponent(a, x / Math.max(1e-4, r * r)); }
  return n.lengthSq() < 1e-12 ? V3(0, 0, 1) : n.normalize();
}
// la pièce liée glisse sur les arcs de son parent, en restant tournée vers l'extérieur de la forme
// point de la pièce parente (repère local) calé sur son axe a (0 = axe 1, 1 = axe 2, 2 = axe 3) : on garde la coordonnée de l'axe, les deux autres sont mises à 0
function atelierOnAxis(par, a, v) {
  par.geo.computeBoundingBox();
  const bb = par.geo.boundingBox, out = V3(0, 0, 0);
  out.setComponent(a, clamp(v, bb.min.getComponent(a) * 1.06, bb.max.getComponent(a) * 1.06)); // jusqu'à tout juste au-delà de la surface
  return out;
}
function atelierSlide(dr, e) {
  const part = dr.part, par = atParentOf(part), lk = part.def.link;
  if (!par || !lk || lk.axis == null) return;
  // calée sur un grand axe de la pièce parente : seule la position le long de cet axe change, l'orientation reste
  const Pw = atelierWorld(par), O = V3(0, 0, 0).setFromMatrixPosition(Pw), D = V3(0, 0, 0).setFromMatrixColumn(Pw, lk.axis), sc = D.length();
  D.normalize();
  const t = atelierAxisParam(O, D);
  if (t === null) return;
  lk.p = atelierOnAxis(par, lk.axis, t / Math.max(1e-6, sc)).toArray();
  atelierApplyTransform(part);
}
// ----- animation d'aperçu : hochements de tête, sautillements et picorage, en boucle (6 s) ; ne modifie aucun réglage -----
function atAnimStop() {
  const A = atelier;
  if (!A?.anim?.on) return;
  A.anim.on = false;
  for (const p of A.parts) { if (p.base) { p.mesh.matrix.copy(p.base); p.mesh.matrixWorldNeedsUpdate = true; } if (p.twin && p.baseT) { p.twin.matrix.copy(p.baseT); p.twin.matrixWorldNeedsUpdate = true; } }
  for (const id in AT_MOVES) { $(id).textContent = AT_MOVES[id].label; $(id).classList.add('alt'); }
}
// les mouvements disponibles : un bouton chacun (en boucle), « Animer » enchaîne tout
const AT_MOVES = {
  atAnim: { label: 'Animer', kind: 'all' },
  atMvPitch: { label: 'Tête : bas / haut', kind: 'headPitch' },
  atMvYaw: { label: 'Tête : gauche / droite', kind: 'headYaw' },
  atMvBow: { label: 'Corps : se baisse', kind: 'bow' },
  atMvLean: { label: 'Corps : penche gauche / droite', kind: 'lean' },
};
function atAnimStart(id) {
  if (!atelier) return;
  if (atelier.anim?.on && atelier.anim.id === id) { atAnimStop(); return; }
  atAnimStop();
  if (!atelier.parts.some((p) => p.def.shape === 'egg')) { setStatus("Il faut d'abord un corps."); return; }
  atelier.anim = { on: true, t0: performance.now(), kind: AT_MOVES[id].kind, id };
  for (const k in AT_MOVES) { $(k).textContent = k === id ? 'Arrêter' : AT_MOVES[k].label; $(k).classList.toggle('alt', k !== id); }
  setStatus(AT_MOVES[id].label + ' : mouvement en boucle, rien n\'est modifié. Un clic dans la scène l\'arrête.');
}
function atAnimTick() {
  const A = atelier, an = A.anim;
  if (!an || !an.on) return;
  const body = A.parts.find((p) => p.def.shape === 'egg' && p.def.parent == null) || A.parts.find((p) => p.def.shape === 'egg');
  if (!body || !body.base) return;
  const head = A.parts.find((p) => p.def.shape === 'sphere' && p.def.parent === body.def.uid) || null;
  const tt = (performance.now() - an.t0) / 1000, t = tt % 6;
  let nod = 0, hop = 0, peck = 0, open = 0, yaw = 0, bow = 0, lean = 0;
  if (an.kind === 'lean') lean = 0.3 * Math.sin((2 * Math.PI * tt) / 2.6); // elle se penche d'un côté puis de l'autre
  if (an.kind === 'headPitch') nod = 0.35 * Math.sin((2 * Math.PI * tt) / 1.6); // la tête monte et descend
  else if (an.kind === 'headYaw') yaw = 0.55 * Math.sin((2 * Math.PI * tt) / 2); // la tête regarde à gauche puis à droite
  else if (an.kind === 'bow') { bow = 0.45 * (0.5 - 0.5 * Math.cos((2 * Math.PI * tt) / 2.4)); nod = 0.15 * Math.sin((2 * Math.PI * tt) / 2.4); } // la tête pique un peu plus pendant la descente, se relève un peu pendant la remontée (pas de hochement) // le corps bascule vers l'avant (elle se baisse) puis se redresse
  // séquence complète : hochements (0-1 s), sautillements (1,5-2,4 s), deux picorages (3-4,6 s), puis respiration tranquille
  else if (t < 1) nod = 0.22 * Math.sin(2 * Math.PI * 3 * t) * Math.sin(Math.PI * t);
  else if (t >= 1.5 && t < 2.4) hop = Math.sin(Math.PI * (((t - 1.5) / 0.45) % 1));
  else if (t >= 3 && t < 4.6) { const ph = ((t - 3) / 0.8) % 1, e = ph < 0.35 ? ph / 0.35 : ph < 0.5 ? 1 : ph < 0.85 ? 1 - (ph - 0.5) / 0.35 : 0; peck = e * e * (3 - 2 * e); }
  else if (t >= 4.6) { nod = 0.03 * Math.sin(2 * Math.PI * 0.7 * (t - 4.6)); if (t > 4.9 && t < 5.7) open = 0.6 * Math.pow(Math.max(0, Math.sin(2 * Math.PI * 5 * (t - 4.9))), 1.5); } // elle pépie : le bec claque vite
  if (peck > 0.8) open = Math.max(open, (peck - 0.8) / 0.2); // ouvert au moment où le bec touche le sol
  // repère de l'oiseau : r = côté, f = avant, up = haut (comme pour les pattes)
  const C = V3(0, 0, 0), qb = new THREE.Quaternion(), sc = V3(1, 1, 1);
  body.base.decompose(C, qb, sc);
  const k = Math.cbrt(Math.abs(sc.x * sc.y * sc.z));
  const r = V3(1, 0, 0).applyQuaternion(qb), f = V3(0, -1, 0).applyQuaternion(qb);
  f.y = 0;
  if (f.lengthSq() < 0.01) f.set(0, 0, 1);
  f.addScaledVector(r, -f.dot(r)).normalize();
  const up = f.clone().cross(r).normalize();
  if (up.y < 0) { r.multiplyScalar(-1); up.multiplyScalar(-1); }
  const rotAbout = (P, ax, ang) => new THREE.Matrix4().makeTranslation(P.x, P.y, P.z).multiply(new THREE.Matrix4().makeRotationAxis(ax, ang)).multiply(new THREE.Matrix4().makeTranslation(-P.x, -P.y, -P.z));
  // les pattes ne suivent pas la bascule du corps : le corps tourne autour de la hanche (racine des cuisses), les pattes ne font que sauter avec lui
  const LEGS = ['hip', 'thigh', 'shin', 'foot', 'leg', 'claw'], thighs = A.parts.filter((p) => p.def.shape === 'thigh' && p.base);
  const hip = thighs.length ? thighs.reduce((acc, p) => acc.add(atelierPivotWorld(p)), V3(0, 0, 0)).multiplyScalar(1 / thighs.length) : C.clone().addScaledVector(up, -0.4 * k);
  const hopM = new THREE.Matrix4().makeTranslation(0, 0.1 * k * hop, 0);
  // accroupissement : les pattes sont écrasées verticalement depuis le sol (les griffes restent posées), la hanche descend d'autant
  const claws = A.parts.filter((p) => p.def.shape === 'claw' && p.base), gY = claws.length ? Math.min(...claws.map((p) => atelierPivotWorld(p).y)) : hip.y - 0.45 * k;
  const squat = 1 - 0.45 * (bow / 0.45) * (bow > 0 ? 1 : 0) - 0.25 * peck, drop = (1 - squat) * (hip.y - gY);
  const legM = hopM.clone().multiply(new THREE.Matrix4().makeTranslation(0, gY, 0)).multiply(new THREE.Matrix4().makeScale(1, squat, 1)).multiply(new THREE.Matrix4().makeTranslation(0, -gY, 0));
  const hipLow = hip.clone().setY(hip.y - drop);
  const bodyM = hopM.clone().multiply(new THREE.Matrix4().makeTranslation(0, -drop, 0)).multiply(rotAbout(hipLow, r, 0.32 * peck + bow)).multiply(rotAbout(hipLow, f, lean));
  if (lean) legM.multiply(rotAbout(V3(hip.x, gY, hip.z), f, 0.3 * lean)); // les pattes suivent un peu, en pivotant au sol
  const P = head ? atelierPivotWorld(head) : C; // la tête tourne autour de son point de liaison au corps (le cou)
  const headM = bodyM.clone().multiply(rotAbout(P, up, yaw)).multiply(rotAbout(P, r, nod + 0.85 * peck + 0.8 * bow));
  body.geo.computeBoundingBox();
  const tailRoot = V3(0, body.geo.boundingBox.max.y * 0.6, 0).applyMatrix4(body.base), tailM = bodyM.clone().multiply(rotAbout(tailRoot, r, 0.7 * bow)).multiply(rotAbout(tailRoot, up, -0.9 * lean + 0.3 * yaw)); // la queue pivote à la sortie du corps ; penchée, elle part en balancier de l'autre côté
  // quand la queue monte, les ailes s'écartent un peu du corps par le bas : chacune pivote autour de la ligne du dos, dans l'axe du corps
  const rX = V3(1, 0, 0).applyQuaternion(qb), aY = V3(0, 1, 0).applyQuaternion(qb), dB = V3(0, 0, V3(0, 0, 1).applyQuaternion(qb).y >= 0 ? 1 : -1).applyQuaternion(qb), back = C.clone().addScaledVector(dB, 0.28 * k), spread = 0.25 * (bow / 0.45);
  const spreadAll = spread + 0.12 * Math.abs(yaw), wingM = (p) => bodyM.clone().multiply(rotAbout(back, aY, -(p.def.params.mir ? -1 : 1) * spreadAll));
  for (const p of A.parts) {
    if (!p.base) continue;
    let M = head && (p === head || atIsDescendant(p, head)) ? headM : LEGS.includes(p.def.shape) ? legM : (p.def.shape === 'plume' || p.def.shape === 'tail' || (p.def.shape === 'patch' && p.def.params?.kind === 'tail')) ? tailM : p.def.shape === 'patch' && p.def.params?.kind === 'wing' && spreadAll ? wingM(p) : bodyM;
    if (p.def.shape.startsWith('beakLow') && open > 0) M = M.clone().multiply(rotAbout(atelierPivotWorld(p), r, 0.4 * open)); // la mandibule du bas s'abaisse
    p.mesh.matrix.copy(M).multiply(p.base); p.mesh.matrixWorldNeedsUpdate = true;
    if (p.twin && p.baseT) { p.twin.matrix.copy(M).multiply(p.baseT); p.twin.matrixWorldNeedsUpdate = true; }
  }
}
function atelierTick() {
  const A = atelier, p = A.sel, show = !!p && A.mode === 'stretch';
  atAnimTick();
  atPlaneUpdate();
  atDrawUpdate();
  if (p && document.activeElement !== $('atSizeU')) { // curseur « Taille » = taille moyenne de la pièce
    const v = atAvgSize(p.def), sl = $('atSizeU'), lab = document.querySelector('b[data-for="atSizeU"]');
    if (+sl.value !== +v.toFixed(2)) sl.value = v;
    if (lab) lab.textContent = v.toFixed(2);
  }
  const par = p && atParentOf(p);
  A.pin.visible = !!par; // point orange : où la pièce choisie est accrochée
  if (par) { A.pin.position.copy(atelierPivotWorld(p)); A.pin.scale.setScalar(camera.position.distanceTo(A.pin.position) * (p.def.link ? 0.026 : 0.017)); }
  { // axes de toutes les autres formes (et de leurs copies symétriques), toujours affichés
    const on = $('atAxes').checked, pa = A.axesAll.geometry.attributes.position, v = V3(0, 0, 0);
    A.axesAll.visible = on;
    let n = 0;
    if (on) for (const q of A.parts) {
      if (q === p) continue;
      q.geo.computeBoundingBox();
      const bb = q.geo.boundingBox;
      for (const [mesh, M] of [[q.mesh, q.mesh.matrix], [q.twin, q.twin?.matrix]]) {
        if (!mesh || n + 6 > 480) continue;
        for (let ax = 0; ax < 3; ax++) {
          const e = Math.max(Math.abs(bb.min.getComponent(ax)), Math.abs(bb.max.getComponent(ax))) * 1.2;
          for (let k = 0; k < 2; k++) { v.set(0, 0, 0).setComponent(ax, k ? e : -e).applyMatrix4(M); pa.setXYZ(n++, v.x, v.y, v.z); }
        }
      }
    }
    pa.needsUpdate = true;
    A.axesAll.geometry.setDrawRange(0, n);
    // ovales des trois plans de chaque forme (rouge : plan Y-Z, vert : plan X-Z, bleu : plan X-Y), copies symétriques comprises
    const ar = A.arcs.geometry.attributes.position, ac = A.arcs.geometry.attributes.color, PLC = [[0.9, 0.3, 0.27], [0.27, 0.85, 0.5], [0.3, 0.5, 0.9]];
    let m = 0;
    A.arcs.visible = on;
    if (on) for (const q of A.parts) {
      q.geo.computeBoundingBox();
      const bb = q.geo.boundingBox;
      for (const M of [q.mesh.matrix, q.twin?.matrix]) {
        if (!M || m + 288 > 12000) continue;
        for (let k = 0; k < 3; k++) {
          let prev = null;
          for (let i2 = 0; i2 <= 48; i2++) {
            const cur = atelierArcPoint(bb, k, (i2 / 48) * Math.PI * 2).applyMatrix4(M);
            if (prev) {
              ar.setXYZ(m, prev.x, prev.y, prev.z); ac.setXYZ(m, ...PLC[k]); m++;
              ar.setXYZ(m, cur.x, cur.y, cur.z); ac.setXYZ(m, ...PLC[k]); m++;
            }
            prev = cur;
          }
        }
      }
    }
    ar.needsUpdate = true; ac.needsUpdate = true;
    A.arcs.geometry.setDrawRange(0, m);
  }
  A.axes.visible = !!p && $('atAxes').checked;
  if (A.axes.visible) { // trois traits qui traversent la forme de part en part, un peu au-delà de sa surface
    p.geo.computeBoundingBox();
    const bb = p.geo.boundingBox, pa = A.axes.geometry.attributes.position, v = V3(0, 0, 0);
    for (let ax = 0; ax < 3; ax++) {
      const e = Math.max(Math.abs(bb.min.getComponent(ax)), Math.abs(bb.max.getComponent(ax))) * 1.3;
      for (let k = 0; k < 2; k++) { v.set(0, 0, 0).setComponent(ax, k ? e : -e).applyMatrix4(p.mesh.matrix); pa.setXYZ(ax * 2 + k, v.x, v.y, v.z); }
    }
    pa.needsUpdate = true;
  }
  const showRings = !!p && A.mode === 'rotate'; // en mode Tourner : trois anneaux autour de la pièce
  for (const r of A.rings) {
    r.visible = showRings && !$('atLock' + r.userData.ringAxis.toUpperCase()).checked; // axe verrouillé : pas d'anneau
    if (!r.visible) continue;
    r.position.copy(atelierPivotWorld(p));
    r.scale.setScalar(camera.position.distanceTo(r.position) * 0.1 * r.userData.k);
  }
  for (const h of A.handles) h.visible = show;
  if (!show) return;
  p.geo.computeBoundingBox();
  const bb = p.geo.boundingBox;
  for (const h of A.handles) {
    const { ax, sign } = h.userData.handle, v = V3(0, 0, 0);
    v.setComponent(ax, sign > 0 ? bb.max.getComponent(ax) : bb.min.getComponent(ax));
    h.position.copy(v.applyMatrix4(p.mesh.matrix));
    h.scale.setScalar(camera.position.distanceTo(h.position) * 0.016);
  }
}
// paramètre t du point de l'axe (O + t·D) le plus proche du rayon de la souris
function atelierAxisParam(O, D) {
  const r = raycaster.ray, w0 = r.origin.clone().sub(O), b = r.direction.dot(D), dd = r.direction.dot(w0), e = D.dot(w0), den = 1 - b * b;
  return Math.abs(den) < 1e-5 ? null : (e - b * dd) / den;
}
function exitAtelier() {
  if (!atelier) return;
  const A = atelier;
  for (const p of A.parts) p.geo.dispose();
  A.group.traverse((c) => { if (c !== A.group && c.geometry && !A.parts.some((p) => p.geo === c.geometry)) c.geometry.dispose(); });
  scene.remove(A.group);
  for (const [c, v] of A.hidden) c.visible = v;
  controls.minDistance = A.saved.min; controls.maxDistance = A.saved.max;
  camera.position.copy(A.saved.pos); controls.target.copy(A.saved.target);
  controls.enabled = true;
  atelier = null;
  document.body.classList.remove('atelier');
  $('atBar').hidden = true; $('atPanel').hidden = true;
}
function atelierMode(mode) {
  atelier.mode = mode;
  $('atModeMove').classList.toggle('alt', mode !== 'move');
  $('atModeRotate').classList.toggle('alt', mode !== 'rotate');
  $('atModeStretch').classList.toggle('alt', mode !== 'stretch');
  $('atModeDraw').classList.toggle('alt', mode !== 'draw');
  setStatus(mode === 'draw' ? "Dessin : clique sur une forme pour poser un point sur le coin de polygone le plus proche (re-clique un point pour le retirer). Les points sont reliés dans l'ordre."
    : mode === 'stretch' ? 'Étirer : tire sur un point de couleur au bout d\'un axe : ce côté s\'étire, l\'autre reste fixe (Maj = les deux côtés).'
    : mode === 'rotate' ? "Tourner : glisse un anneau (rouge X, vert Y, bleu Z) pour tourner la pièce sélectionnée autour de son centre, ou autour de sa rotule si elle est liée."
    : "Déplacer : glisse une pièce pour la bouger. Une pièce liée glisse sur les arcs de son parent (Maj = la détacher).");
}
function atelierPartsOut() {
  return atelier.parts.map((p) => {
    const d = p.def, out = { uid: d.uid, parent: d.parent, pair: d.pair, sym: d.sym || null, link: d.link ? { p: d.link.p.map((v) => +v.toFixed(4)), q: d.link.q.map((v) => +v.toFixed(5)), axis: d.link.axis ?? null, arc: d.link.arc || null } : null, shape: d.shape, pos: d.pos.map((v) => +v.toFixed(3)), rot: d.rot.map((v) => +v.toFixed(1)), scl: d.scl.map((v) => +v.toFixed(3)), color: d.color, mirror: d.mirror };
    if (d.detail != null) out.detail = d.detail;
    if (d.smooth) out.smooth = true;
    if (d.params) out.params = d.params;
    if (d.color2) out.color2 = d.color2;
    if (d.grp != null) out.grp = d.grp;
    if (d.dots && d.dots.length) out.dots = d.dots.map((q) => q.map((v) => +v.toFixed(4)));
    if (d.cuts) out.cuts = d.cuts.map((c) => ({ n: c.n.map((v) => +v.toFixed(5)), d: +c.d.toFixed(5), keep: c.keep }));
    if (d.sink) out.sink = +d.sink.toFixed(4);
    if (d.verts) out.verts = d.verts.map((v) => +v.toFixed(3));
    return out;
  });
}
// brouillon : l'animal en cours est gardé dans le navigateur et rouvert au prochain lancement
const AT_DRAFT_KEY = 'lowpoly-atelier-draft';
const atelierSerialize = () => ({ id: atelier.editId, name: $('atName').value, size: +$('atSize').value, parts: atelierPartsOut() });
function atelierLoadDraft() { try { const d = JSON.parse(localStorage.getItem(AT_DRAFT_KEY) || 'null'); return d && Array.isArray(d.parts) ? d : null; } catch { return null; } }
let atelierDraftLast = '';
function atelierStoreDraft() {
  if (!atelier) return;
  const j = JSON.stringify(atelierSerialize());
  if (j === atelierDraftLast) return;
  atelierDraftLast = j;
  try { localStorage.setItem(AT_DRAFT_KEY, j); } catch { /* stockage plein */ }
}
setInterval(atelierStoreDraft, 700);
window.addEventListener('pagehide', atelierStoreDraft);
// ----- historique : annuler / rétablir (états complets de l'animal, enregistrés dès qu'un changement se stabilise) -----
const AT_H = { stack: [], idx: 0, pending: null, pendingAt: 0 };
function atelierHistoryReset() {
  AT_H.stack = [JSON.stringify(atelierSerialize())];
  AT_H.idx = 0; AT_H.pending = null;
  atelierHistoryButtons();
}
function atelierHistoryButtons() {
  $('atUndo').disabled = AT_H.idx <= 0;
  $('atRedo').disabled = AT_H.idx >= AT_H.stack.length - 1;
}
function atelierHistoryPoll() {
  if (!atelier || atelier.drag) return; // pas pendant un geste : un glissé = une seule étape
  const cur = JSON.stringify(atelierSerialize());
  if (cur === AT_H.stack[AT_H.idx]) { AT_H.pending = null; return; }
  const now = performance.now();
  if (cur !== AT_H.pending) { AT_H.pending = cur; AT_H.pendingAt = now; return; }
  if (now - AT_H.pendingAt < 300) return; // le réglage est encore en train de bouger (curseur)
  AT_H.stack.length = AT_H.idx + 1; // un nouveau changement efface les « rétablir »
  AT_H.stack.push(cur);
  if (AT_H.stack.length > 120) AT_H.stack.shift(); else AT_H.idx++;
  AT_H.pending = null;
  atelierHistoryButtons();
}
setInterval(atelierHistoryPoll, 200);
function atelierRestore(st) {
  const A = atelier, selUid = A.sel?.def.uid;
  for (const p of A.parts) { A.group.remove(p.mesh); if (p.twin) A.group.remove(p.twin); p.geo.dispose(); }
  A.parts = []; A.sel = null;
  $('atName').value = st.name; $('atSize').value = st.size;
  st.parts.forEach((p) => atelierMakePart(p));
  atelierSelect(A.parts.find((p) => p.def.uid === selUid) || null);
  showValues();
}
function atelierUndo(dir = -1) {
  if (!atelier) return;
  atelierHistoryPoll(); // enregistre d'abord ce qui est en cours
  const i = AT_H.idx + dir;
  if (i < 0 || i >= AT_H.stack.length) return;
  AT_H.idx = i;
  atelierRestore(JSON.parse(AT_H.stack[i]));
  AT_H.stack[i] = JSON.stringify(atelierSerialize()); // l'état reconstruit sert de référence (arrondis)
  AT_H.pending = null;
  atelierHistoryButtons();
  setStatus(dir < 0 ? 'Action annulée.' : 'Action rétablie.');
}
function atelierSave() {
  const name = $('atName').value.trim();
  if (!name) { setStatus("Donne un nom à l'animal."); return; }
  if (!atelier.parts.length) { setStatus('Ajoute au moins une forme.'); return; }
  const parts = atelierPartsOut();
  let def = atelier.editId && customLibrary.find((x) => x.id === atelier.editId);
  if (def) { def.name = name; def.size = +$('atSize').value; def.parts = parts; def.rev = (def.rev || 0) + 1; }
  else { def = { id: 'c' + Date.now().toString(36), name, size: +$('atSize').value, parts, rev: 1 }; customLibrary.push(def); }
  saveCustomLibrary();
  const id = def.id;
  try { localStorage.removeItem(AT_DRAFT_KEY); } catch { /* ok */ }
  atelierDraftLast = '';
  exitAtelier();
  syncCustomSpecies();
  renderSpecies();
  rebuildCustomInstances(id);
  showTab('animals');
  setStatus(`« ${name} » enregistré : il est dans la liste des animaux (+).`);
}
// ----- souris dans l'atelier -----
function atelierPick(e) {
  setRay(e);
  const objs = [];
  for (const p of atelier.parts) { objs.push(p.mesh); if (p.twin) objs.push(p.twin); }
  return raycaster.intersectObjects(objs, false)[0];
}
function atelierPinHit(e) {
  const A = atelier;
  if (A.mode !== 'move' || !A.sel || !A.pin.visible) return null;
  const rect = dom.getBoundingClientRect(), v = A.pin.position.clone().project(camera);
  if (Math.hypot(rect.left + ((v.x + 1) / 2) * rect.width - e.clientX, rect.top + ((1 - v.y) / 2) * rect.height - e.clientY) > 18) return null;
  return { object: A.sel.mesh, point: A.pin.position.clone() };
}
function atelierPointerDown(e) {
  if (e.button !== 0) return;
  const A = atelier;
  atAnimStop();
  if (atPlaneHandleHit(e)) { // glisser le plan le long de son axe
    e.stopImmediatePropagation();
    setRay(e);
    const O = V3(0, 0, 0), D = V3(0, 0, 0).setComponent(AT_PLANE.axis, 1), t0 = atelierAxisParam(O, D);
    if (t0 !== null) { A.drag = { mode: 'plane', O, D, t0, p0: AT_PLANE.pos, moved: false }; controls.enabled = false; dom.setPointerCapture(e.pointerId); }
    return;
  }
  A.downAt = { x: e.clientX, y: e.clientY };
  if (A.mode === 'draw') return; // la caméra reste libre ; le point est posé au relâchement
  if (A.mode === 'rotate' && A.sel) { // anneau de rotation ?
    setRay(e);
    const rh = raycaster.intersectObjects(A.rings.filter((r) => r.visible), false)[0];
    if (rh) {
      e.stopImmediatePropagation();
      const ax = rh.object.userData.ringAxis, axis = V3(ax === 'x' ? 1 : 0, ax === 'y' ? 1 : 0, ax === 'z' ? 1 : 0), c = atelierPivotWorld(A.sel);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axis, c), p0 = V3(0, 0, 0);
      if (raycaster.ray.intersectPlane(plane, p0)) {
        A.drag = { mode: 'rotate', part: A.sel, axis, c, plane, v0: p0.sub(c).normalize(), moved: false };
        controls.enabled = false;
        dom.setPointerCapture(e.pointerId);
      }
      return;
    }
  }
  if (A.mode === 'stretch' && A.sel) { // poignée d'étirement ?
    setRay(e);
    const hh = raycaster.intersectObjects(A.handles.filter((h) => h.visible), false)[0];
    if (hh) {
      e.stopImmediatePropagation();
      const { ax, sign } = hh.object.userData.handle, part = A.sel;
      const O = V3(0, 0, 0).setFromMatrixPosition(part.mesh.matrix), D = V3(0, 0, 0).setFromMatrixColumn(part.mesh.matrix, ax).normalize();
      const t0 = atelierAxisParam(O, D);
      if (t0 !== null && Math.abs(t0) > 0.02) {
        // étirement d'un seul côté : l'extrémité opposée à la poignée reste fixe dans l'atelier (Maj = les deux côtés)
        part.geo.computeBoundingBox();
        const bb = part.geo.boundingBox, eo = V3(0, 0, 0).setComponent(ax, sign > 0 ? bb.min.getComponent(ax) : bb.max.getComponent(ax));
        const Po = eo.clone().applyMatrix4(part.mesh.matrix), tb = D.dot(hh.object.position.clone().sub(Po));
        A.drag = { mode: 'stretch', part, ax, O, D, t0, s0: part.def.scl[ax], eo, Po, tb, moved: false };
        controls.enabled = false;
        dom.setPointerCapture(e.pointerId);
      }
      return;
    }
  }
  const hit = atelierPinHit(e) || atelierPick(e); // le point orange (point de liaison) se saisit aussi : il déplace la pièce
  if (!hit) return; // dans le vide : la caméra tourne
  const hitPart = hit.object.userData.part, part = atGroupLead(hitPart), flip = hit.object === hitPart.twin;
  if (part !== A.sel) atelierSelect(part);
  e.stopImmediatePropagation();
  if (A.mode === 'rotate') return; // Tourner : on choisit la pièce, puis on tourne avec les anneaux
  camera.updateMatrixWorld();
  const wp = hit.point.clone();
  if (flip) wp.x = -wp.x; // le point visé sur la copie symétrique correspond à ce point-là sur la pièce d'origine
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(V3(0, 0, 0)).negate(), hit.point);
  A.drag = { mode: A.mode, plane, start: hit.point.clone(), flip, part, moved: false };
  if (A.mode === 'sculpt') {
    const mesh = part.mesh, P = part.geo.attributes.position;
    mesh.updateWorldMatrix(true, false);
    const hl = mesh.worldToLocal(wp.clone()), s = (Math.abs(part.def.scl[0]) + Math.abs(part.def.scl[1]) + Math.abs(part.def.scl[2])) / 3;
    const R = +$('atRadius').value / s, base = P.array.slice(), w = new Float32Array(P.count);
    for (let i = 0; i < P.count; i++) { const dd = Math.hypot(base[i * 3] - hl.x, base[i * 3 + 1] - hl.y, base[i * 3 + 2] - hl.z); w[i] = dd < R ? (1 - dd / R) ** 2 : 0; }
    A.drag.base = base; A.drag.w = w;
    A.drag.inv = new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld.clone().invert());
  } else {
    A.drag.startPos = [...part.def.pos];
    const par = atParentOf(part);
    if (A.mode === 'move' && par && part.def.link && part.def.link.axis != null && !e.shiftKey) { // pièce liée : elle glisse sur les arcs de son parent (Maj = la détacher et la déplacer librement)
      par.geo.computeBoundingBox();
      A.drag.slide = true;
      A.drag.q0 = new THREE.Quaternion(...part.def.link.q);
      A.drag.n0 = atelierEllipsoidNormal(par.geo.boundingBox, V3(...part.def.link.p));
    }
  }
  controls.enabled = false;
  dom.setPointerCapture(e.pointerId);
}
function atelierPointerMove(e) {
  const dr = atelier.drag;
  if (!dr) return;
  setRay(e);
  if (dr.mode === 'plane') {
    const t = atelierAxisParam(dr.O, dr.D);
    if (t === null) return;
    AT_PLANE.pos = clamp(dr.p0 + (t - dr.t0), -1.5, 2.5);
    $('atPlanePos').value = AT_PLANE.pos;
    showValues();
    return;
  }
  if (dr.mode === 'rotate') { // angle parcouru par le curseur autour du centre, dans le plan de l'anneau
    const p = V3(0, 0, 0);
    if (!raycaster.ray.intersectPlane(dr.plane, p)) return;
    const v = p.sub(dr.c).normalize();
    const ang = Math.atan2(dr.axis.dot(V3(0, 0, 0).crossVectors(dr.v0, v)), dr.v0.dot(v));
    dr.v0 = v;
    if (dr.part.def.link && atParentOf(dr.part)) { // rotule : la pièce tourne autour du point de liaison, sans le quitter
      const par = atParentOf(dr.part), lk = dr.part.def.link, base = atLinkBase(atelierWorld(par), { p: lk.p, q: [0, 0, 0, 1] });
      const Wj = base.clone().multiply(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(...lk.q)));
      const Rot = new THREE.Matrix4().makeTranslation(dr.c.x, dr.c.y, dr.c.z).multiply(new THREE.Matrix4().makeRotationAxis(dr.axis, ang)).multiply(new THREE.Matrix4().makeTranslation(-dr.c.x, -dr.c.y, -dr.c.z));
      const Lj = base.invert().multiply(Rot.multiply(Wj)), pp = V3(0, 0, 0), qq = new THREE.Quaternion(), ss = V3(1, 1, 1);
      Lj.decompose(pp, qq, ss);
      lk.q = qq.normalize().toArray();
      atelierApplyTransform(dr.part);
      atelierSyncPair(dr.part);
      return;
    }
    const W = atelierWorld(dr.part);
    const Wn = new THREE.Matrix4().makeTranslation(dr.c.x, dr.c.y, dr.c.z).multiply(new THREE.Matrix4().makeRotationAxis(dr.axis, ang)).multiply(new THREE.Matrix4().makeTranslation(-dr.c.x, -dr.c.y, -dr.c.z)).multiply(W);
    atelierSetWorld(dr.part, Wn);
    return;
  }
  if (dr.mode === 'stretch') {
    const part = dr.part;
    if (!$('atStretchBoth').checked !== e.shiftKey && Math.abs(dr.tb) > 0.02) { // un seul côté : le bout opposé ne bouge pas
      const t = atelierAxisParam(dr.Po, dr.D);
      if (t === null) return;
      part.def.scl[dr.ax] = Math.max(0.02, dr.s0 * clamp(t / dr.tb, 0.05, 8));
      atelierApplyTransform(part);
      const Po2 = dr.eo.clone().applyMatrix4(part.mesh.matrix), W = part.mesh.matrix.clone();
      W.premultiply(new THREE.Matrix4().makeTranslation(dr.Po.x - Po2.x, dr.Po.y - Po2.y, dr.Po.z - Po2.z));
      atelierSetWorld(part, W);
      return;
    }
    const t = atelierAxisParam(dr.O, dr.D);
    if (t === null) return;
    const f = clamp(t / dr.t0, 0.05, 8);
    part.def.scl[dr.ax] = Math.max(0.02, dr.s0 * f);
    atelierApplyTransform(part);
    atelierSyncPair(part);
    $('atS' + 'XYZ'[dr.ax]).value = part.def.scl[dr.ax];
    showValues();
    return;
  }
  const p = V3(0, 0, 0);
  if (!raycaster.ray.intersectPlane(dr.plane, p)) return;
  const dw = p.sub(dr.start);
  dr.moved = true;
  if (dr.mode === 'sculpt') {
    if (dr.flip) dw.x = -dw.x;
    const dl = dw.applyMatrix3(dr.inv), P = dr.part.geo.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const k = dr.w[i];
      P.setXYZ(i, dr.base[i * 3] + dl.x * k, dr.base[i * 3 + 1] + dl.y * k, dr.base[i * 3 + 2] + dl.z * k);
    }
    P.needsUpdate = true;
    dr.part.geo.computeBoundingSphere();
    atelierShade(dr.part);
  } else if (dr.slide) {
    atelierSlide(dr, e);
    atelierSyncPair(dr.part);
  } else {
    if (!dr.detached && atParentOf(dr.part) && (!dr.part.def.link || e.shiftKey)) { // on la prend : elle quitte son parent (sans bouger) pour pouvoir s'aimanter ailleurs
      atelierReparent(dr.part, null);
      dr.startPos = [...dr.part.def.pos];
      dr.detached = true;
    }
    const par = atParentOf(dr.part);
    let inv = null;
    if (par) {
      const Pw = atelierWorld(par), lk = dr.part.def.link, pp = V3(0, 0, 0), pq = new THREE.Quaternion(), ps = V3(1, 1, 1);
      if (lk) { Pw.decompose(pp, pq, ps); inv = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(pq.multiply(new THREE.Quaternion(...lk.q))).invert()); } // lié : repère sans échelle
      else inv = new THREE.Matrix3().setFromMatrix4(Pw.invert());
    }
    const place = (w) => { // déplacement exprimé dans le repère du parent
      const v = w.clone();
      if (inv) v.applyMatrix3(inv);
      dr.part.def.pos = [dr.startPos[0] + v.x, dr.startPos[1] + v.y, dr.startPos[2] + v.z];
      atelierApplyTransform(dr.part);
    };
    place(dw);
    atelierSyncPair(dr.part);
    ['X', 'Y', 'Z'].forEach((a, i) => { $('atP' + a).value = dr.part.def.pos[i]; });
    showValues();
  }
}
// ----- mode dessin : points posés sur les coins de polygones des formes -----
function atelierDrawClick(e) {
  const A = atelier, rect = dom.getBoundingClientRect();
  const scr = (v) => { const p = v.clone().project(camera); return [rect.left + ((p.x + 1) / 2) * rect.width, rect.top + ((1 - p.y) / 2) * rect.height]; };
  // clic sur un point existant : on le retire
  for (const part of A.parts) {
    const ds = part.def.dots;
    if (!ds) continue;
    for (let i = 0; i < ds.length; i++) {
      const [x, y] = scr(V3(...ds[i]).applyMatrix4(part.mesh.matrix));
      if (Math.hypot(x - e.clientX, y - e.clientY) < 10) { ds.splice(i, 1); if (!ds.length) part.def.dots = null; atelierSelect(part); return; }
    }
  }
  const hit = atelierPick(e);
  if (!hit || !hit.face) return;
  const part = hit.object.userData.part;
  if (!part) return;
  if (hit.object !== part.mesh) { setStatus("Pose le point du côté d'origine de la forme (pas sur sa copie symétrique)."); return; }
  const pos = part.geo.attributes.position, M = part.mesh.matrix;
  let best = null, bd = Infinity;
  for (const i of [hit.face.a, hit.face.b, hit.face.c]) {
    const v = V3(pos.getX(i), pos.getY(i), pos.getZ(i)), d = v.clone().applyMatrix4(M).distanceTo(hit.point);
    if (d < bd) { bd = d; best = v; }
  }
  (part.def.dots ||= []).push(best.toArray());
  atelierSelect(part);
}
const atDotMat = new THREE.MeshBasicMaterial({ color: 0xff9a2e, depthTest: false, transparent: true });
function atDrawUpdate() {
  const A = atelier;
  if (!A.dotGroup) { A.dotGroup = new THREE.Group(); A.group.add(A.dotGroup); A.dotLine = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x111111, depthTest: false, transparent: true })); A.dotLine.renderOrder = 1001; A.dotLine.frustumCulled = false; A.group.add(A.dotLine); A.dotPool = []; }
  const segs = [];
  let n = 0;
  for (const part of A.parts) {
    const ds = part.def.dots;
    if (!ds) continue;
    const ws = ds.map((d) => V3(...d).applyMatrix4(part.mesh.matrix));
    for (const w of ws) {
      let m = A.dotPool[n];
      if (!m) { m = new THREE.Mesh(poseDotGeo, atDotMat); m.renderOrder = 1002; A.dotGroup.add(m); A.dotPool[n] = m; }
      m.visible = true; m.position.copy(w); m.scale.setScalar(camera.position.distanceTo(w) * 0.008);
      n++;
    }
    for (let i = 0; i + 1 < ws.length; i++) segs.push(ws[i].x, ws[i].y, ws[i].z, ws[i + 1].x, ws[i + 1].y, ws[i + 1].z);
  }
  for (let i = n; i < A.dotPool.length; i++) A.dotPool[i].visible = false;
  A.dotLine.geometry.dispose();
  A.dotLine.geometry = new THREE.BufferGeometry();
  A.dotLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
}
function atelierPointerUp(e) {
  const A = atelier, dr = A.drag;
  if (dr) {
    if (dr.mode === 'sculpt' && dr.moved) dr.part.def.verts = Array.from(dr.part.geo.attributes.position.array);
    A.drag = null;
    controls.enabled = true;
    return;
  }
  if (A.mode === 'draw' && A.downAt && e.target === dom && Math.hypot(e.clientX - A.downAt.x, e.clientY - A.downAt.y) < 4) { atelierDrawClick(e); A.downAt = null; return; }
  if (A.downAt && e.target === dom && Math.hypot(e.clientX - A.downAt.x, e.clientY - A.downAt.y) < 4 && !atelierPick(e)) atelierSelect(null);
  A.downAt = null;
}
// emplacement libre pour une nouvelle forme : on essaie le centre, puis des cercles de plus en plus larges, jusqu'à ne toucher aucune pièce
function atelierFreeSpot(shape, scl = [1, 1, 1], y = 0.5) {
  const g = atelierGeo(shape, atDetailOf(shape, null)), size = V3(0, 0, 0);
  g.computeBoundingBox();
  const bb = g.boundingBox.clone();
  bb.min.multiply(V3(...scl)); bb.max.multiply(V3(...scl)); // (un facteur négatif échange min et max : on remet l'ordre)
  const lo = bb.min.clone().min(bb.max), hi = bb.min.clone().max(bb.max);
  g.dispose();
  const others = [];
  for (const p of atelier.parts) {
    p.geo.computeBoundingBox();
    others.push(p.geo.boundingBox.clone().applyMatrix4(p.mesh.matrix));
    if (p.twin) others.push(p.geo.boundingBox.clone().applyMatrix4(p.twin.matrix));
  }
  const free = (x, yy, z) => {
    const b = new THREE.Box3(V3(lo.x + x - 0.02, lo.y + yy - 0.02, lo.z + z - 0.02), V3(hi.x + x + 0.02, hi.y + yy + 0.02, hi.z + z + 0.02));
    return !others.some((o) => o.intersectsBox(b));
  };
  if (free(0, y, 0)) return [0, y, 0];
  for (let r = 0.25; r <= 4; r += 0.25) {
    const n = Math.max(8, Math.round(r * 16));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (free(x, y, z)) return [x, y, z];
    }
  }
  return [0, y, 4.2];
}
// liaison par rotule au point J (monde) : la pièce reste où elle est, mais pivote ensuite librement autour de J
function atelierBallLink(child, target, J) {
  if (target === child || atIsDescendant(target, child)) return false;
  const Wc = atelierWorld(child), Pw = atelierWorld(target), pl = J.clone().applyMatrix4(Pw.clone().invert());
  child.def.parent = target.def.uid;
  child.def.link = { p: pl.toArray(), q: [0, 0, 0, 1] };
  const loc = atLocalOf(Pw, child.def.link, Wc);
  child.def.pos = loc.pos; child.def.rot = loc.rot; child.def.scl = loc.scl;
  atelierApplyTransform(child);
  atelierSyncPair(child);
  return true;
}
function atelierRemove(part) {
  const partner = atPartnerOf(part);
  atelierRemoveOne(part);
  if (partner) atelierRemoveOne(partner);
}
function atelierRemoveOne(part) {
  const A = atelier;
  for (const q of A.parts.filter((x) => x.def.grp === part.def.uid)) if (A.parts.includes(q)) atelierRemoveOne(q); // les membres du groupe partent avec la meneuse
  for (const c of A.parts) if (c.def.parent === part.def.uid) atelierReparent(c, atParentOf(part)); // les enfants passent au parent de la pièce supprimée
  A.group.remove(part.mesh); if (part.twin) A.group.remove(part.twin);
  part.geo.dispose();
  A.parts = A.parts.filter((p) => p !== part);
  atelierSelect(null);
}
function atelierKeyDown(e) {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || '') && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { atelierUndo(e.shiftKey ? 1 : -1); e.preventDefault(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { atelierUndo(1); e.preventDefault(); }
  else if (e.key === 'Escape') { atelierSelect(null); e.preventDefault(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && atelier.sel) { atelierRemove(atelier.sel); e.preventDefault(); }
}
const atMatS = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: false, roughness: 1, metalness: 0 });
const atMatSelS = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: false, roughness: 1, metalness: 0, emissive: 0x2a3c66 });
const atelierMatFor = (part, sel) => (part.def.smooth ? (sel ? atMatSelS : atMatS) : (sel ? atMatSel : atMat));
// forme lisse : normales moyennées entre faces voisines ; sinon l'ombrage plat ignore les normales
function atelierShade(part) { if (part.def.smooth) part.geo.computeVertexNormals(); }
const AT_DETAIL_NEW = 8; // toute nouvelle forme démarre au maximum de polygones (réglable ensuite, 1 à 8)
// corps de référence : la pièce sélectionnée si c'est un corps, sinon le premier corps de l'atelier
const atelierBodyRef = () => (atelier.sel && atelier.sel.def.shape === 'egg' ? atelier.sel : atelier.parts.find((p) => p.def.shape === 'egg') || null);
// aile orientée comme le corps : posée sur son flanc droit, couchée le long de lui (vers l'arrière), à l'orientation du corps
function atelierWingOnBody(body) {
  body.geo.computeBoundingBox();
  const bb = body.geo.boundingBox, Wb = atelierWorld(body), pos = V3(0, 0, 0), q = new THREE.Quaternion(), sc = V3(1, 1, 1);
  Wb.decompose(pos, q, sc);
  // le « Corps » (œuf) a son grand axe sur Y : le bout large (tête) est du côté -Y, le bout pointu (queue) du côté +Y ; le dessus est +Z une fois couché
  // le long du flanc : la racine est sur le côté du corps, dans sa moitié côté tête et un peu au-dessus du milieu, posée sur la surface de l'œuf ; l'aile s'étend ensuite sur la longueur du corps vers la queue, inclinée pour suivre la pente
  // cercle que forme la tête avec le corps : l'intersection de la sphère de la tête (centre au haut du corps, rayon = celui de la tête, proportionnelle au corps)
  // et de la surface de l'œuf. Le point d'accroche est sur ce cercle, côté +X, à 40° au-dessus du flanc. On le cherche par dichotomie sur le méridien (angle α depuis le haut du corps).
  const ya = Math.abs(bb.min.y), a0 = bb.max.x, c0 = bb.max.z, PHI = 1.1; // ailes sur le dos : à 63° au-dessus du flanc, donc près de la ligne médiane
  const k = Math.cbrt(Math.abs(sc.x * sc.y * sc.z));
  const headPart = atelier.parts.find((p) => p.def.shape === 'sphere' && p.def.parent === body.def.uid);
  const rHead = headPart ? 0.3 * Math.cbrt(Math.abs(headPart.def.scl[0] * headPart.def.scl[1] * headPart.def.scl[2])) : 0.3 * 0.5 * k; // rayon monde de la tête
  const Hw = V3(0, -ya, 0).applyMatrix4(Wb); // centre de la tête : le haut du corps
  const surf = (al) => V3(a0 * Math.sin(al) * Math.cos(PHI), -ya * Math.cos(al), c0 * Math.sin(al) * Math.sin(PHI)); // point de la surface de l'œuf
  let lo = 0, hi = Math.PI / 2;
  for (let n = 0; n < 40; n++) { const mid = (lo + hi) / 2; if (surf(mid).applyMatrix4(Wb).distanceTo(Hw) < rHead) lo = mid; else hi = mid; }
  const pc = surf((lo + hi) / 2); // point du cercle tête / corps : donne le niveau (hauteur sur l'axe Y)
  const ringY = RING_FR.map((f) => -ya * f).reduce((best, v) => (Math.abs(v - pc.y) < Math.abs(best - pc.y) ? v : best), -ya * RING_FR[0]); // rond vert le plus proche de ce niveau
  const rr = Math.sqrt(Math.max(0.02, 1 - (ringY / ya) ** 2));
  const pl = V3(a0 * rr * Math.cos(PHI), ringY, c0 * rr * Math.sin(PHI)), xs = pl.x, yy = pl.y, zz = pl.z; // le point d'accroche est sur ce rond
  const nrm = V3(xs / (a0 * a0), yy / (ya * ya), zz / (c0 * c0)).normalize(), tilt = Math.atan2(nrm.z, nrm.x);
  const root = pl.clone().applyMatrix4(Wb);
  // l'aile (longue selon X) tourne de 90° autour de Z : elle suit le grand axe du corps vers la queue (+Y), et son côté plat (Y) se couche contre le flanc (X)
  const qw = q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -tilt, 0))).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)))
    .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -10 * Math.PI / 180, 0))); // les ailes convergent de 10° vers la ligne médiane : leurs pointes se croisent légèrement vers la queue
  const eu = new THREE.Euler().setFromQuaternion(qw);
  // point d'accroche de l'aile = intersection de son arc rouge et de son axe vert : l'axe vert (Y) traverse l'aile de part en part, il rencontre l'arc rouge
  // (ellipse perpendiculaire à X) au point (0, y max, 0), côté corps, juste sous l'aile. C'est ce point-là qui est posé sur le flanc et sert de pivot.
  const wg = atelierGeo('wing', AT_DETAIL0.wing);
  wg.computeBoundingBox();
  const A = atelierArcPoint(wg.boundingBox, 0, 0).multiplyScalar(k).applyQuaternion(qw);
  wg.dispose();
  return { pos: root.clone().sub(A).toArray(), rot: [eu.x, eu.y, eu.z].map((a) => (a * 180) / Math.PI), scl: [k, k, k], root, arc: { level: ringY, p0: -1.3, p1: 1.3, tilt0: tilt } };
}
// réglages par défaut choisis par l'utilisateur pour chaque forme (orientation, étirement, couleur), gardés dans le navigateur
const AT_DEFAULTS_KEY = 'lowpoly-shape-defaults';
const atLoadDefaults = () => { try { return JSON.parse(localStorage.getItem(AT_DEFAULTS_KEY) || '{}') || {}; } catch { return {}; } };
const AT_COLOR0 = { ring: '#4de88a', plume: '#8a8678', beak: '#e8962e', eye: '#151515', tail: '#8a8678', wing: '#a9a69a', leg: '#d96a3a', hip: '#7a7f88', thigh: '#7a7f88', shin: '#7a7f88', foot: '#7a7f88' };
// jambes complètes : un bassin (rond vertical, 2 points d'accroche) lié au corps, puis de chaque côté cuisse → jambe → patte, chacune liée à la précédente par rotule
function atelierAddLegs(body, color = '#7a7f88') {
  const c = V3(0, 0.5, 0), q = new THREE.Quaternion(), sc = V3(1, 1, 1);
  if (body) atelierWorld(body).decompose(c, q, sc);
  const k = body ? Math.cbrt(Math.abs(sc.x * sc.y * sc.z)) : 1, S = [k, k, k];
  const base = body ? V3(c.x, c.y - 0.2 * k, c.z - 0.02 * k) : c.clone(); // sous le ventre
  const mk = (shape, pos) => atelierMakePart({ shape, pos: pos.toArray(), rot: [0, 0, 0], scl: [...S], color, mirror: false, detail: AT_DETAIL_NEW, smooth: true });
  const hip = mk('hip', base);
  if (body) atelierBallLink(hip, body, base);
  const L = 0.22 * k, e = 0.01 * k, off = new THREE.Vector3(0.07 * k, 0, 0); // L : longueur d'un segment ; e : retrait de la racine
  // chaîne de droite (la gauche est son miroir par rapport au plan du bassin)
  const thighPos = base.clone().add(off), thighRoot = thighPos.clone().add(V3(0, -e, 0));
  const shinPos = thighPos.clone().add(V3(0, -(L - e), 0)), knee = thighPos.clone().add(V3(0, -L, 0));
  const footPos = shinPos.clone().add(V3(0, -(L - e), 0)), ankle = shinPos.clone().add(V3(0, -L, 0));
  const chain = [['thigh', thighPos, hip, thighRoot], ['shin', shinPos, null, knee], ['foot', footPos, null, ankle]];
  let parent = hip;
  for (const item of chain) {
    const lead = mk(item[0], item[1]), mate = mk(item[0], item[1]);
    atelierBallLink(lead, parent, item[3]);
    lead.def.pair = mate.def.uid; mate.def.pair = lead.def.uid;
    lead.def.sym = mate.def.sym = { ref: hip.def.uid, axis: 0 };
    atelierSyncPair(lead);
    parent = lead;
  }
  return hip;
}
// tête : taille proportionnelle au corps, centre ancré sur l'axe vertical (Y, vert) du corps, au point le plus haut du corps ;
// la liaison est calée sur cet axe : le seul déplacement possible de la tête est de glisser le long de lui
function atelierAddHead(body) {
  body.geo.computeBoundingBox();
  const bb = body.geo.boundingBox, Wb = atelierWorld(body), pos = V3(0, 0, 0), q = new THREE.Quaternion(), sc = V3(1, 1, 1);
  Wb.decompose(pos, q, sc);
  const ARC = { k: 0, t0: Math.PI / 2, t1: Math.PI }; // arc rouge : de θ = π (le haut du corps, là où est la tête) à θ = π/2 (le milieu du dos)
  const k = Math.cbrt(Math.abs(sc.x * sc.y * sc.z)), J = atelierArcPoint(bb, ARC.k, ARC.t1).applyMatrix4(Wb), h = 0.5 * k; // le haut du corps est le côté -Y de l'œuf (bout large) ; la tête fait la moitié de la taille du corps
  const head = atelierMakePart({ shape: 'sphere', pos: J.toArray(), rot: [0, 0, 0], scl: [h, h, h], color: AT_COLOR0.sphere || '#c8a070', mirror: false, detail: AT_DETAIL_NEW, smooth: true });
  atelierBallLink(head, body, J); // son centre est le point de liaison
  head.def.link.axis = null;
  head.def.link.arc = null;
  atelierApplyTransform(head);
  return head;
}
// niveaux (sur l'axe Y du corps, en fraction du demi-grand axe vers la tête) des 4 ronds posés avec chaque corps
const RING_FR = [0.25, 0.4667, 0.6833, 0.9];
// queue en deux plumes : elles partent du bout pointu du corps, côte à côte, avec un léger angle l'une vers l'autre pour se croiser vers l'extrémité
const TAIL_T0 = Math.PI / 2 - 0.18; // position de départ sur le cercle bleu : près du bas du corps (θ = π/2), un peu côté +X
function atelierAddTail(body, color = '#8a8678') {
  const c = V3(0, 0.5, 0), q = new THREE.Quaternion(), sc = V3(1, 1, 1);
  let root = c.clone(), side = V3(1, 0, 0);
  if (body) {
    body.geo.computeBoundingBox();
    const bb = body.geo.boundingBox, Wb = atelierWorld(body);
    Wb.decompose(c, q, sc);
    root = atelierArcPoint(bb, 2, TAIL_T0).applyMatrix4(Wb); // sur le cercle bleu (plan X-Y du corps), en bas du corps, légèrement à droite du bout
    side = V3(0, 0, 0).setFromMatrixColumn(Wb, 0).normalize();
  }
  const k = body ? Math.cbrt(Math.abs(sc.x * sc.y * sc.z)) : 1, YAW = 4 * Math.PI / 180;
  const base = q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))); // la plume (vers -Z) suit le grand axe du corps, vers la queue (+Y)
  const mk = (sx) => {
    const qq = base.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sx * YAW, 0))), eu = new THREE.Euler().setFromQuaternion(qq);
    const pos = root.clone().addScaledVector(side, body ? 0 : sx * 0.035 * k); // avec un corps : la 2e plume est recalculée en miroir
    return atelierMakePart({ shape: 'plume', pos: pos.toArray(), rot: [eu.x, eu.y, eu.z].map((a) => (a * 180) / Math.PI), scl: [k, k, k], color, mirror: false, detail: AT_DETAIL_NEW, smooth: false });
  };
  const lead = mk(1), mate = mk(-1); // celle de droite penche vers la gauche et inversement : elles se croisent
  if (body) {
    atelierBallLink(lead, body, V3(...lead.def.pos));
    lead.def.sink = 0.03 * k; // recul léger : la queue rentre à peine dans le corps
    atelierApplyTransform(lead);
  }
  lead.def.pair = mate.def.uid; mate.def.pair = lead.def.uid;
  if (body) { lead.def.sym = mate.def.sym = { ref: body.def.uid, axis: 0 }; atelierSyncPair(lead); }
  return lead;
}
// ----- modèle prêt à l'emploi : mésange bleue, assemblée avec les formes de l'atelier (corps, tête, bec, yeux, ailes, queue, pattes) -----
const AT_TIT_KEY = 'lowpoly-tit-model';
// mésange charbonnière complète : corps et tête (ceux de ta mésange enregistrée s'il y en a une, sinon ceux d'origine), puis ventre, tête, ailes, queue et pattes générés
function atelierBuildGreatTit() {
  const A = atelier;
  atAnimStop();
  for (const p of A.parts.slice()) atelierRemove(p);
  $('atName').value = 'Mésange charbonnière';
  $('atSize').value = 0.22;
  const mb = atModelBody();
  const body = atelierMakePart({ shape: 'egg', pos: mb ? [...mb.pos] : [0, 0.55, 0], rot: mb ? [...mb.rot] : [-145, 0, 0], scl: mb ? [...mb.scl] : [0.68, 0.82, 0.68], color: '#f2dc3c', mirror: false, detail: AT_DETAIL_NEW, smooth: true, verts: mb && mb.verts ? [...mb.verts] : null });
  let head = null;
  const fromModel = mb ? atelierAddFromModel('head', body) : null;
  if (fromModel && fromModel.length) head = fromModel[0];
  else {
    head = atelierMakePart({ shape: 'sphere', pos: [0, 0.88, 0.22], rot: [0, 0, 0], scl: [0.45, 0.43, 0.45], color: '#0a0a0c', mirror: false, detail: AT_DETAIL_NEW, smooth: true });
    atelierBallLink(head, body, V3(0, 0.88, 0.22));
  }
  atelierAddTitBelly(body);
  atelierAddTitHead(head, body);
  atelierAddTitWings(body);
  atelierAddTitTail(body);
  atelierAddTitLegs(body);
  atelierSelect(null);
  atelierRenderList();
  setStatus('Mésange charbonnière assemblée. « Animer » pour la voir bouger, « Enregistrer l\'animal » pour la garder.');
}
// huppe fasciée : corps et tête orangés, long bec noir fin incliné vers le bas, huppe orange à bout noir, ailes et queue noires rayées de blanc, pattes grises
const AT_HOOPOE_KEY = 'lowpoly-hoopoe-model';
function atelierBuildHoopoe() {
  const A = atelier;
  atAnimStop();
  let saved = null; // ta version de la huppe (bouton « Enregistrer comme Huppe »), sinon celle construite ici
  try { saved = JSON.parse(localStorage.getItem(AT_HOOPOE_KEY) || 'null'); } catch { saved = null; }
  if (saved && Array.isArray(saved.parts) && saved.parts.length) {
    atelierRestore(saved);
    atelierSelect(null);
    atelierRenderList();
    setStatus('Huppe fasciée chargée (ta version enregistrée).');
    return;
  }
  for (const p of A.parts.slice()) atelierRemove(p);
  $('atName').value = 'Huppe fasciée';
  $('atSize').value = 0.24;
  const ORANGE = '#e9a271';
  const body = atelierMakePart({ shape: 'egg', pos: [0, 0.55, 0], rot: [-118, 0, 0], scl: [0.64, 0.78, 0.64], color: ORANGE, mirror: false, detail: AT_DETAIL_NEW, smooth: true }); // vrai œuf, pas trop allongé
  // tête : au bout large du corps, un peu en avant et au-dessus, liée au corps à ce bout (le cou)
  body.geo.computeBoundingBox();
  const bb = body.geo.boundingBox, Wb = atelierWorld(body), top = V3(0, bb.min.y, 0).applyMatrix4(Wb);
  const f = V3(0, -1, 0).transformDirection(Wb).setY(0).normalize(), h = 0.42, rH = 0.3 * h;
  const hp = top.clone().addScaledVector(f, rH * 0.5).add(V3(0, rH * 0.45, 0)); // cou court : la tête est à moitié rentrée dedans
  const head = atelierMakePart({ shape: 'sphere', pos: hp.toArray(), rot: [0, 0, 0], scl: [h, h * 0.95, h], color: ORANGE, mirror: false, detail: AT_DETAIL_NEW, smooth: true });
  atelierBallLink(head, body, top);
  head.def.params = { grad: { dir: f.clone().applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...head.def.rot.map((a) => (a * Math.PI) / 180))).invert()).toArray().map((v) => +v.toFixed(4)), from: '#ea8a46', to: '#f2c9a3' } }; // dégradé : vif à l'avant, pâle à l'arrière
  { // cou : capsule orangée du haut du corps au centre de la tête, liée au corps
    const a = top.clone().addScaledVector(hp.clone().sub(top).normalize(), -rH * 0.7), d = hp.clone().sub(a), L = d.length(), dir = d.clone().normalize();
    const Y = dir, X = V3(1, 0, 0).addScaledVector(Y, -Y.x).normalize(), Z = X.clone().cross(Y);
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z)));
    const rad = rH * 0.72, neck = atelierMakePart({ shape: 'egg', pos: a.clone().addScaledVector(dir, L / 2).toArray(), rot: [e.x, e.y, e.z].map((x) => (x * 180) / Math.PI), scl: [rad / 0.3, L / 0.78, rad / 0.3], color: ORANGE, mirror: false, detail: AT_DETAIL_NEW, smooth: true }); // œuf : bout large dans le corps, bout fin dans la tête
    atelierBallLink(neck, body, top);
  }
  atelierAddTitHead(head, body, { headColor: ORANGE, cheeks: false, beak: [0.5, 0.5, 2.3], beakColor: '#1b1b1d', beakTilt: 8, curved: true });
  atelierAddRearPatch(body, '#f3f3ee', 0.1); // tout l'arrière du corps, à partir des pattes, est blanc
  atelierAddRearCone(body, '#f3f3ee', 0.2, 1.5); // cône blanc sur l'arrière-train, étiré, pointe vers la queue
  atelierAddCrest(head, body, '#e08a52', '#1b1b1d'); // couronne de plumes orange à bout noir
  atelierAddBandWings(body, [[0, 5, '#1d1d1f'], [5, 8, '#f3f3ee'], [8, 11, '#1d1d1f'], [11, 14, '#f3f3ee'], [14, 17, '#1d1d1f'], [17, 20, '#f3f3ee'], [20, 24, '#1d1d1f']], null, { phi0: 8, dphi: 60, half: 56 }); // larges : elles recouvrent bien les deux flancs
  atelierAddBandTail(body, [[0, 5, '#1d1d1f'], [5, 7, '#f3f3ee'], [7, 10, '#1d1d1f']], null);
  atelierAddTitLegs(body, '#f3f3ee'); // cuisses blanches
  for (const p of A.parts) if (!p.def.smooth) { p.def.smooth = true; atelierShade(p); } // tout est lissé (ailes, queue, plumes, manchon)
  atelierSelect(null);
  atelierRenderList();
  setStatus('Huppe fasciée assemblée. « Animer » pour la voir bouger, « Enregistrer l\'animal » pour la garder.');
}
// huppe en vol : la huppe posée, sans ses ailes repliées, son manteau et ses pattes, corps à l'horizontale, avec deux grandes ailes ouvertes, noires barrées de blanc
const AT_HOOPOE_FLY_KEY = 'lowpoly-hoopoe-fly-model';
function atelierBuildHoopoeFlying() {
  const A = atelier;
  atAnimStop();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(AT_HOOPOE_FLY_KEY) || 'null'); } catch { saved = null; }
  if (saved && Array.isArray(saved.parts) && saved.parts.length) {
    atelierRestore(saved);
    atelierSelect(null);
    atelierRenderList();
    setStatus('Huppe fasciée en vol chargée (ta version enregistrée).');
    return;
  }
  atelierBuildHoopoe();
  $('atName').value = 'Huppe fasciée (en vol)';
  const body = atelierBodyRef();
  if (!body) return;
  for (const p of A.parts.slice()) if (A.parts.includes(p) && ((p.def.shape === 'patch' && ['wing', 'mantle'].includes(p.def.params?.kind)) || ['hip', 'thigh', 'shin', 'foot', 'leg', 'claw'].includes(p.def.shape))) atelierRemoveOne(p);
  // au repos la queue a deux plumes : en vol, six plumes en éventail ; les ailes sont faites pareil, en plumes qui rayonnent depuis l'épaule
  for (const p of A.parts.slice()) if (A.parts.includes(p) && p.def.shape === 'patch' && p.def.params?.kind === 'tail') atelierRemoveOne(p);
  body.def.rot = [-90, 0, 0]; body.def.pos = [0, 0.75, 0]; // à l'horizontale : la queue vers -Z, la tête vers +Z, le dos en haut
  atelierApplyTransform(body);
  body.geo.computeBoundingBox();
  const bb = body.geo.boundingBox, Wb = atelierWorld(body), DEG = Math.PI / 180;
  // une plume : lame à bout rond partant du point root dans la direction horizontale d (unitaire), à plat ; zones de couleur depuis le bout
  const feather = (root, d, len, width, tips, base, kind, mir) => {
    const a = Math.atan2(-d.x, -d.z); // rotation autour de Y qui envoie -Z (le sens de la lame) sur d
    return atelierMakePart({ shape: 'quill', pos: root.toArray(), rot: [0, (a * 180) / Math.PI, 0], scl: [width / 0.08, 0.5, len / 0.7], color: base, mirror: false, detail: 2, smooth: true, params: { kind, mir, tips } });
  };
  // queue : six fois la plume de la queue posée (planche noire à bande blanche), en éventail (±30°)
  for (let i = 0; i < 6; i++) atelierAddBandTail(body, [[0, 5, '#1d1d1f'], [5, 7, '#f3f3ee'], [7, 10, '#1d1d1f']], null, { keep: true, W0: 0.03, W1: 0.12, yaw: (-30 + (60 * i) / 5) * DEG });
  // ailes : la même plume que la queue, neuf par côté, qui rayonnent depuis l'épaule : la plus longue presque de côté, la plus courte le long du corps ;
  // chacune orange à la racine puis noire barrée de blanc
  const WSEG = [[0, 1, '#e9a271'], [1, 3, '#1d1d1f'], [3, 4, '#f3f3ee'], [4, 6, '#1d1d1f'], [6, 7, '#f3f3ee'], [7, 9, '#1d1d1f'], [9, 10, '#f3f3ee']];
  const NW = 9;
  for (const sx of [1, -1]) for (let i = 0; i < NW; i++) {
    const t = i / (NW - 1);
    atelierAddBandTail(body, WSEG, null, { keep: true, kind: 'flywing', side: sx, x0: sx * 0.03, y0: bb.max.y * -0.1, W0: 0.025, W1: 0.1, len: 0.42 - 0.3 * t, yaw: sx * (78 - 66 * t) * DEG });
  }
  atelierSelect(null);
  atelierRenderList();
  setStatus('Huppe fasciée en vol assemblée : ailes ouvertes. « Enregistrer comme Huppe en vol » pour que la huppe volante de la scène l\'utilise.');
}
function rebuildHoopoeFlyers() {
  for (const d of flyersData.filter((x) => x.kind === 'hoopoe')) {
    const f = flyers.find((x) => x.d === d);
    if (f) { world.remove(f.mesh); f.mesh.geometry.dispose(); f.wl.geometry.dispose(); f.wr.geometry.dispose(); flyers = flyers.filter((x) => x !== f); }
    addFlyer(d);
  }
}
function hoopoeFlyInvalidate() {
  builtinDefs = null;
  for (const k of [...customGeoCache.keys()]) if (k.startsWith('builtin-huppe-vol:')) customGeoCache.delete(k);
  renderSpecies();
  rebuildHoopoeFlyers();
}
$('atHoopoeFly').addEventListener('click', () => { if (atelier) atelierBuildHoopoeFlying(); });
$('atHoopoeFlySave').addEventListener('click', () => {
  if (!atelier || !atelier.parts.length) return;
  const st = atelierSerialize();
  st.name = 'Huppe fasciée (en vol)';
  try { localStorage.setItem(AT_HOOPOE_FLY_KEY, JSON.stringify(st)); } catch { setStatus("Impossible d'enregistrer (stockage du navigateur plein)."); return; }
  hoopoeFlyInvalidate();
  setStatus('Enregistré comme Huppe en vol : la huppe volante de la scène utilise maintenant cette version.');
});
$('atHoopoeFlyReset').addEventListener('click', () => {
  localStorage.removeItem(AT_HOOPOE_FLY_KEY);
  hoopoeFlyInvalidate();
  if (atelier) atelierBuildHoopoeFlying();
  setStatus('Huppe en vol : retour à la version construite.');
});
$('atHoopoe').addEventListener('click', () => { if (atelier) atelierBuildHoopoe(); });
$('atHoopoeSave').addEventListener('click', () => { // les pièces actuelles deviennent la huppe fasciée : dans l'atelier (bouton « Huppe fasciée ») et dans la scène (onglet Animaux)
  if (!atelier || !atelier.parts.length) return;
  const st = atelierSerialize();
  st.name = 'Huppe fasciée';
  try { localStorage.setItem(AT_HOOPOE_KEY, JSON.stringify(st)); } catch { setStatus("Impossible d'enregistrer (stockage du navigateur plein)."); return; }
  builtinDefs = null; // la version de série est refaite à partir de l'enregistrement
  for (const k of [...customGeoCache.keys()]) if (k.startsWith('builtin-huppe:')) customGeoCache.delete(k);
  syncCustomSpecies();
  renderSpecies();
  rebuildCustomInstances('builtin-huppe');
  setStatus('Enregistré comme Huppe fasciée : le bouton « Huppe fasciée » et la huppe de la scène utilisent maintenant cette version.');
});
$('atHoopoeReset').addEventListener('click', () => {
  localStorage.removeItem(AT_HOOPOE_KEY);
  builtinDefs = null;
  for (const k of [...customGeoCache.keys()]) if (k.startsWith('builtin-huppe:')) customGeoCache.delete(k);
  syncCustomSpecies();
  renderSpecies();
  rebuildCustomInstances('builtin-huppe');
  if (atelier) atelierBuildHoopoe(); // l'atelier affiche tout de suite la version d'origine
  setStatus('Huppe fasciée : retour à la version construite.');
});
$('atGreatTit').addEventListener('click', () => { if (atelier) atelierBuildGreatTit(); });
for (const id of ['atAnim', 'atMvPitch', 'atMvYaw', 'atMvBow', 'atMvLean']) $(id).addEventListener('click', () => atAnimStart(id));
$('atTitSave').addEventListener('click', () => {
  if (!atelier) return;
  try { localStorage.setItem(AT_TIT_KEY, JSON.stringify(atelierSerialize())); } catch { setStatus("Impossible d'enregistrer (stockage du navigateur plein)."); return; }
  // elle est aussi ajoutée à la liste des animaux (onglet Animaux) sous le nom « Mésange », pour pouvoir la poser dans la scène
  const parts = atelierPartsOut();
  let def = customLibrary.find((x) => x.id === 'ma-mesange');
  if (def) { def.parts = parts; def.size = +$('atSize').value; def.rev = (def.rev || 0) + 1; }
  else { def = { id: 'ma-mesange', name: 'Mésange', size: +$('atSize').value, parts, rev: 1 }; customLibrary.push(def); }
  saveCustomLibrary();
  syncCustomSpecies();
  renderSpecies();
  rebuildCustomInstances('ma-mesange');
  setStatus('Enregistré sous « Mésange » : elle est dans la liste des animaux (bouton +), et le bouton « Mésange bleue » recharge cette version.');
});
$('atCopy').addEventListener('click', async () => { // copie les pièces actuelles en JSON, à coller dans la conversation
  if (!atelier) return;
  const txt = JSON.stringify(atelierSerialize());
  try { await navigator.clipboard.writeText(txt); setStatus('Pièces copiées dans le presse-papiers (' + atelier.parts.length + ' pièces) : colle-les dans la conversation.'); }
  catch { console.log(txt); setStatus("Copie impossible : le JSON est dans la console du navigateur (F12)."); }
});
// Les boutons « Corps », « Tête » et « Queue » ajoutent exactement ceux de la mésange enregistrée (« Enregistrer comme Mésange ») : mêmes orientation, étirements, couleur, finesse,
// et pour la tête et la queue, même liaison au corps (point, calage, enfoncement, croisement), à l'échelle du nouveau corps.
function atModelLoad() { try { const m = JSON.parse(localStorage.getItem(AT_TIT_KEY) || 'null'); return m && Array.isArray(m.parts) ? m : null; } catch { return null; } }
function atModelBody() { const m = atModelLoad(); return m ? m.parts.find((p) => p.shape === 'egg' && p.parent == null) || null : null; }
function atelierAddFromModel(kind, body) {
  const m = atModelLoad(), Sb = atModelBody();
  if (!m || !Sb) return null;
  const kk = (d) => Math.cbrt(Math.abs(d.scl[0] * d.scl[1] * d.scl[2])), s = kk(body.def) / kk(Sb); // rapport de taille entre le nouveau corps et celui du modèle
  const kids = m.parts.filter((p) => p.parent === Sb.uid && p.shape === (kind === 'head' ? 'sphere' : 'plume'));
  if (!kids.length) return null;
  const made = new Map();
  for (const c of kids) {
    const d = JSON.parse(JSON.stringify(c));
    delete d.uid;
    d.parent = body.def.uid; // le lien (point sur le corps, arc, axe) est exprimé dans le repère du corps : il s'applique tel quel
    d.pos = c.pos.map((v) => v * s); d.scl = c.scl.map((v) => v * s);
    if (d.sink) d.sink *= s;
    d.pair = null;
    made.set(c.uid, atelierMakePart(d));
  }
  for (const c of kids) { // paires (les deux plumes) : on retrouve les nouvelles pièces correspondantes
    const a = made.get(c.uid), b2 = c.pair != null ? made.get(c.pair) : null;
    if (a && b2) { a.def.pair = b2.def.uid; if (c.sym) a.def.sym = { ...c.sym, ref: body.def.uid }; }
  }
  return [...made.values()];
}
document.querySelectorAll('#atShapes button').forEach((b) => b.addEventListener('click', () => {
  if (!atelier) return;
  if (b.dataset.shape === 'sphere' && atelierBodyRef()) { // tête : proportionnée au corps et ancrée sur son axe vertical
    const fromModel = atelierAddFromModel('head', atelierBodyRef());
    if (fromModel) { atelierSelect(fromModel[0]); setStatus('Tête ajoutée comme dans ta mésange enregistrée.'); return; }
    atelierSelect(atelierAddHead(atelierBodyRef()));
    setStatus("Tête ancrée sur l'arc rouge du corps, au haut du corps : tu ne peux la faire glisser que le long de cet arc, jusqu'au milieu du dos.");
    return;
  }
  if (b.dataset.pair === 'tail') { // queue : deux plumes
    const fromModel = atelierBodyRef() ? atelierAddFromModel('tail', atelierBodyRef()) : null;
    if (fromModel) { atelierSelect(fromModel[0]); setStatus('Queue ajoutée comme dans ta mésange enregistrée.'); return; }
    atelierSelect(atelierAddTail(atelierBodyRef(), AT_COLOR0.plume));
    return;
  }
  if (b.dataset.pair === 'leg') { // pattes complètes : bassin, puis cuisse / jambe / patte de chaque côté
    atelierSelect(atelierAddLegs(atelierBodyRef()));
    return;
  }
  if (b.dataset.pair === 'wing' && atelierBodyRef()) { // ailes : deux tranches découpées dans la surface du corps
    const lead = atelierAddShellWings(atelierBodyRef());
    if (lead) { atelierSelect(lead); setStatus("Ailes posées : deux tranches du corps, symétriques, sans croisement."); return; }
  }
  if ((b.dataset.pair === 'wing' || b.dataset.shape === 'wing') && atelierBodyRef()) { // ailes : orientées comme le corps, liées à lui par une rotule à la racine
    const body = atelierBodyRef(), w = atelierWingOnBody(body);
    const lead = atelierMakePart({ shape: 'wing', pos: w.pos, rot: w.rot, scl: w.scl, color: AT_COLOR0.wing, mirror: false, detail: AT_DETAIL_NEW, smooth: b.dataset.shape !== 'tail' }); // la queue garde ses arêtes vives (rectangle)
    atelierBallLink(lead, body, w.root);
    if (b.dataset.pair === 'wing') {
      const mate = atelierMakePart({ shape: 'wing', pos: [0, 0, 0], rot: [0, 0, 0], scl: [1, 1, 1], color: AT_COLOR0.wing, mirror: false, detail: AT_DETAIL_NEW, smooth: true });
      const sym = { ref: body.def.uid, axis: 0 }; // symétrie par rapport au plan du corps (son axe X) : l'autre aile se place seule de l'autre côté
      lead.def.pair = mate.def.uid; mate.def.pair = lead.def.uid;
      lead.def.sym = { ...sym }; mate.def.sym = { ...sym };
      atelierSyncPair(lead);
    }
    atelierSelect(lead);
    return;
  }
  if (b.dataset.pair) { // paire : deux pièces indépendantes, une de chaque côté (pas de symétrie automatique)
    const sh = b.dataset.pair, c = atelierFreeSpot(sh, [sh === 'wing' ? 2.4 : 2.2, 1, 1]), color = AT_COLOR0[sh];
    const defs = sh === 'eye'
      ? [{ pos: [c[0] + 0.09, c[1], c[2]], rot: [0, 0, 0] }, { pos: [c[0] - 0.09, c[1], c[2]], rot: [0, 0, 0] }]
      : [{ pos: [c[0] + 0.06, c[1], c[2]], rot: [0, 0, 0] }, { pos: [c[0] - 0.06, c[1], c[2]], rot: [0, 180, 0] }]; // l'aile de gauche est retournée : elle part vers -X
    const made = defs.map((d) => atelierMakePart({ shape: sh, pos: d.pos, rot: d.rot, scl: [1, 1, 1], color, mirror: false, detail: AT_DETAIL_NEW, smooth: true }));
    made[0].def.pair = made[1].def.uid; made[1].def.pair = made[0].def.uid;
    atelierSyncPair(made[0]); // la deuxième pièce est recalculée en miroir de la première
    atelierSelect(made[0]);
    return;
  }
  const ud = atLoadDefaults()[b.dataset.shape]; // réglage enregistré par l'utilisateur pour cette forme, sinon orientation par défaut
  const mb = b.dataset.shape === 'egg' ? atModelBody() : null; // corps de la mésange enregistrée : orientation, étirements, couleur, finesse
  const rot0 = mb ? mb.rot : ud ? ud.rot : b.dataset.shape === 'egg' ? [-115, 0, 0] : [0, 0, 0], scl0 = mb ? mb.scl : ud ? ud.scl : [1, 1, 1];
  const p = atelierMakePart({ shape: b.dataset.shape, pos: atelierFreeSpot(b.dataset.shape, scl0), rot: [...rot0], scl: [...scl0], color: (mb && mb.color) || (ud && ud.color) || AT_COLOR0[b.dataset.shape] || '#c8a070', mirror: false, detail: mb && mb.detail != null ? mb.detail : AT_DETAIL_NEW, smooth: true });
  atelierSelect(p);
}));
['atPX', 'atPY', 'atPZ', 'atRX', 'atRY', 'atRZ', 'atSX', 'atSY', 'atSZ'].forEach((id) => $(id).addEventListener('input', () => {
  const p = atelier?.sel;
  if (!p) return;
  const g = (a) => +$(a).value;
  p.def.pos = [g('atPX'), g('atPY'), g('atPZ')];
  p.def.rot = [g('atRX'), g('atRY'), g('atRZ')];
  p.def.scl = [g('atSX'), g('atSY'), g('atSZ')];
  atelierApplyTransform(p);
  atelierSyncPair(p);
}));
$('atDetail').addEventListener('input', () => {
  const p = atelier?.sel;
  if (!p) return;
  const L = +$('atDetail').value;
  if (L === atDetailOf(p.def.shape, p.def)) return;
  for (const q of [p, atPartnerOf(p)]) {
    if (!q) continue;
    q.def.detail = L;
    q.def.verts = null; // le nombre de sommets change : la sculpture ne s'applique plus
    const old = q.geo;
    q.geo = atelierPartGeo(q.def);
    q.mesh.geometry = q.geo;
    if (q.twin) q.twin.geometry = q.geo;
    old.dispose();
    atelierApplyColor(q);
    atelierShade(q);
  }
  $('atDetailInfo').textContent = (p.geo.index.count / 3) + ' polygones' + (p.def.mirror ? ' (×2 avec la symétrie)' : '');
  atelierRenderList();
});
$('atSizeU').addEventListener('input', () => {
  const p = atelier?.sel;
  if (!p) return;
  const cur = atAvgSize(p.def), v = +$('atSizeU').value;
  if (cur < 1e-6) return;
  const k = v / cur;
  p.def.scl = p.def.scl.map((x) => x * k);
  atelierApplyTransform(p);
  atelierSyncPair(p);
  ['X', 'Y', 'Z'].forEach((a, i) => { $('atS' + a).value = p.def.scl[i]; });
  showValues();
});
$('atSlideAxis').addEventListener('change', atelierSlideSet);
$('atSink').addEventListener('input', () => { // enfonce la pièce liée (et sa paire) dans son parent
  const p = atelier?.sel;
  if (!p || !p.def.link) return;
  p.def.sink = +$('atSink').value;
  atelierApplyTransform(p);
  atelierSyncPair(p);
});
$('atSymRef').addEventListener('change', atelierSymSet);
$('atSymAxis').addEventListener('change', atelierSymSet);
$('atSmooth').addEventListener('change', () => {
  const p = atelier?.sel;
  if (!p) return;
  for (const q of [p, atPartnerOf(p)]) { if (!q) continue; q.def.smooth = $('atSmooth').checked; atelierShade(q); }
  atelierSelect(p); // met à jour les matériaux des deux pièces
});
$('atColor').addEventListener('input', () => { const p = atelier?.sel; if (!p) return; p.def.color = $('atColor').value; atelierApplyColor(p); atelierSyncPair(p); });
$('atMirror').addEventListener('change', () => { const p = atelier?.sel; if (!p) return; atelierSetMirror(p, $('atMirror').checked); atelierRenderList(); });
$('atModeMove').addEventListener('click', () => atelier && atelierMode('move'));
$('atModeDraw').addEventListener('click', () => atelier && atelierMode('draw'));
$('atDotUndo').addEventListener('click', () => { const p = atelier?.sel; if (p?.def.dots?.length) { p.def.dots.pop(); if (!p.def.dots.length) p.def.dots = null; } });
$('atDotClear').addEventListener('click', () => { const p = atelier?.sel; if (p) p.def.dots = null; });
$('atModeRotate').addEventListener('click', () => atelier && atelierMode('rotate'));
$('atModeStretch').addEventListener('click', () => atelier && atelierMode('stretch'));
$('atDetach').addEventListener('click', () => { const p = atelier?.sel; if (p && atelierReparent(p, null)) { atelierSyncPair(p); atelierSelect(p); setStatus('Pièce décrochée.'); } });
$('atDup').addEventListener('click', () => {
  const p = atelier?.sel;
  if (!p) return;
  const d = JSON.parse(JSON.stringify(p.def));
  delete d.uid; // la copie reçoit son propre numéro
  d.pair = null; d.sym = null;
  if (d.parent == null) d.pos = atelierFreeSpot(d.shape, d.scl, d.pos[1]); // copie posée à côté, hors de l original
  else {
    // pièce liée : la copie n'hérite pas de la liaison (sinon son centre serait décalé du point de rotule et les anneaux ne seraient plus centrés sur elle).
    // Elle devient une pièce libre, avec la même position dans l'atelier, un peu à côté : il suffit de la glisser sur un point d'accroche pour la lier.
    const pos = V3(0, 0, 0), q = new THREE.Quaternion(), sc = V3(1, 1, 1);
    atelierWorld(p).decompose(pos, q, sc);
    const eu = new THREE.Euler().setFromQuaternion(q);
    d.parent = null; d.link = null;
    d.pos = [pos.x + 0.12, pos.y + 0.05, pos.z];
    d.rot = [eu.x, eu.y, eu.z].map((a) => (a * 180) / Math.PI);
    d.scl = sc.toArray();
  }
  atelierSelect(atelierMakePart(d));
});
$('atDel').addEventListener('click', () => { if (atelier?.sel) atelierRemove(atelier.sel); });
$('atDefault').addEventListener('click', () => { // la pièce choisie devient le réglage par défaut de sa forme
  const p = atelier?.sel;
  if (!p) return;
  const pos = V3(0, 0, 0), q = new THREE.Quaternion(), sc = V3(1, 1, 1);
  atelierWorld(p).decompose(pos, q, sc);
  const eu = new THREE.Euler().setFromQuaternion(q), all = atLoadDefaults();
  all[p.def.shape] = { rot: [eu.x, eu.y, eu.z].map((a) => +((a * 180) / Math.PI).toFixed(2)), scl: sc.toArray().map((v) => +v.toFixed(4)), color: p.def.color };
  try { localStorage.setItem(AT_DEFAULTS_KEY, JSON.stringify(all)); setStatus('Enregistré : chaque nouvelle forme « ' + AT_SHAPES[p.def.shape] + ' » apparaîtra avec cette orientation et ces étirements.'); } catch { setStatus("Impossible d'enregistrer."); }
});
$('atDefaultReset').addEventListener('click', () => {
  const p = atelier?.sel;
  if (!p) return;
  const all = atLoadDefaults();
  delete all[p.def.shape];
  try { localStorage.setItem(AT_DEFAULTS_KEY, JSON.stringify(all)); setStatus('Réglage par défaut de « ' + AT_SHAPES[p.def.shape] + ' » effacé : retour à la forme d origine.'); } catch { /* ok */ }
});
$('atPlaneToggle').addEventListener('click', () => {
  AT_PLANE.on = !AT_PLANE.on;
  $('atPlaneToggle').textContent = AT_PLANE.on ? 'Masquer le plan' : 'Afficher le plan';
  $('atPlaneBox').hidden = !AT_PLANE.on;
});
$('atPlaneAxis').addEventListener('change', () => { AT_PLANE.axis = +$('atPlaneAxis').value; });
$('atPlanePos').addEventListener('input', () => { AT_PLANE.pos = +$('atPlanePos').value; });
['atPlaneRX', 'atPlaneRY', 'atPlaneRZ'].forEach((id, i) => $(id).addEventListener('input', () => { AT_PLANE.rot[i] = +$(id).value; }));
$('atPlaneCut').addEventListener('change', () => { AT_PLANE.cut = $('atPlaneCut').checked; });
$('atCutUp').addEventListener('click', () => atelierCutWithPlane(1));
$('atCutDown').addEventListener('click', () => atelierCutWithPlane(-1));
$('atEggWing').addEventListener('click', () => {
  if (!atelier) return;
  const sel = atelier.sel, body = sel && sel.def.shape === 'egg' ? sel : atelierBodyRef();
  if (!body) { setStatus("Il faut d'abord un corps."); return; }
  const w = atelierAddEggWings(body, 1);
  if (w) { atelierSelect(w); setStatus("Aile posée : la peau de l'œuf au-dessus du plan, et sa symétrique de l'autre côté."); }
});
$('atCutUndo').addEventListener('click', () => {
  const p = atelier?.sel;
  if (!p) return;
  for (const q of [p, atPartnerOf(p)]) {
    if (!q || !q.def.cuts) continue;
    q.def.cuts = null;
    const old = q.geo;
    q.geo = atelierPartGeo(q.def);
    q.mesh.geometry = q.geo;
    if (q.twin) q.twin.geometry = q.geo;
    old.dispose();
    atelierApplyColor(q);
    atelierShade(q);
  }
  atelierRenderList();
});
$('atPlaneReset').addEventListener('click', () => {
  AT_PLANE.rot = [0, 0, 0]; AT_PLANE.pos = 0.5;
  ['atPlaneRX', 'atPlaneRY', 'atPlaneRZ'].forEach((id) => { $(id).value = 0; });
  $('atPlanePos').value = 0.5;
  showValues();
});
$('atSave').addEventListener('click', () => atelier && atelierSave());
$('atQuit').addEventListener('click', exitAtelier);
$('atOpen').addEventListener('click', () => enterAtelier(atelierLoadDraft()));
$('atNew').addEventListener('click', () => { // repart de zéro
  if (!atelier) return;
  for (const p of atelier.parts.slice()) atelierRemove(p);
  atelier.editId = null;
  $('atName').value = 'Mon animal';
  atelierSelect(null);
  try { localStorage.removeItem(AT_DRAFT_KEY); } catch { /* ok */ }
  atelierDraftLast = '';
  atelierHistoryPoll(); // « Nouveau » est lui aussi une étape qu'on peut annuler
});
$('atUndo').addEventListener('click', () => atelierUndo(-1));
$('atRedo').addEventListener('click', () => atelierUndo(1));
$('customEdit').addEventListener('click', () => { const def = customLibrary.find((x) => x.id === $('customSel').value); if (def) enterAtelier(def); });
$('customDel').addEventListener('click', () => {
  const id = $('customSel').value;
  if (!id) return;
  customLibrary = customLibrary.filter((x) => x.id !== id);
  saveCustomLibrary();
  for (const m of trees.slice()) { const w = m.userData.wagtail; if (w && w.d.kind === 'custom' && w.d.custom === id) { if (selected === m) select(null); world.remove(m); disposeMesh(m); trees = trees.filter((t) => t !== m); } }
  wagtailsData = wagtailsData.filter((x) => !(x.kind === 'custom' && x.custom === id));
  syncCustomSpecies();
  renderSpecies();
});

// ---------- Modification avancée d'un animal : points bleus sur les articulations, glisser pour tourner ----------
let poseMode = null; // { m, d, dots: [{ name, mesh, j }], sel, drag }
const poseDotMat = new THREE.MeshBasicMaterial({ color: 0x1e9bf0, depthTest: false, transparent: true, opacity: 0.95 });
const poseDotSel = new THREE.MeshBasicMaterial({ color: 0xff9a2e, depthTest: false, transparent: true, opacity: 1 });
const poseDotGeo = new THREE.SphereGeometry(1, 14, 10);
function enterPose(m) {
  if (!m || !m.userData.rig || edit || poseMode) return;
  const J = m.userData.rig, d = m.userData.heron?.d;
  if (!d) return;
  poseMode = { m, d, dots: [], sel: null, drag: null, ring: null, rings: [] };
  // trois anneaux de rotation autour de l'articulation choisie : rouge = plie d'avant en arrière (axe X), vert = tourne à droite / à gauche (axe Y),
  // bleu = penche sur le côté (axe Z) ; de rayons légèrement différents pour qu'on puisse les attraper séparément
  for (const [axis, color, k] of [['x', 0xe8504d, 1], ['y', 0x4de88a, 1.15], ['z', 0x4d8ae8, 1.3]]) {
    const g = new THREE.TorusGeometry(1, 0.045, 8, 56);
    if (axis === 'x') g.rotateY(Math.PI / 2); else if (axis === 'y') g.rotateX(Math.PI / 2);
    g.userData.k = k;
    const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(g, mat);
    ring.renderOrder = 997; ring.visible = false; ring.frustumCulled = false;
    ring.userData.axis = axis;
    scene.add(ring);
    poseMode.rings.push(ring);
  }
  for (const [name, j] of Object.entries(J)) {
    if (!JOINT_NAMES[name]) continue;
    const mesh = new THREE.Mesh(poseDotGeo, poseDotMat);
    mesh.renderOrder = 999;
    mesh.userData.joint = name;
    scene.add(mesh);
    poseMode.dots.push({ name, mesh, j });
  }
  $('poseBar').hidden = false;
  updatePoseBar();
  setStatus('Modification avancée : glisse un point bleu pour tourner l\'articulation.');
}
function exitPose() {
  if (!poseMode) return;
  poseMode.dots.forEach((x) => { scene.remove(x.mesh); });
  poseMode.rings.forEach((r) => { scene.remove(r); r.geometry.dispose(); r.material.dispose(); });
  poseMode = null;
  controls.enabled = true;
  $('poseBar').hidden = true;
}
function updatePoseBar() {
  const n = poseMode?.sel;
  $('poseJoint').textContent = n ? JOINT_NAMES[n] : 'aucune articulation sélectionnée';
  $('poseResetJoint').disabled = !n;
}
const _pqw = new THREE.Quaternion();
function poseTick() {
  const _p = V3(0, 0, 0);
  const sj = poseMode.sel && poseMode.m.userData.rig[poseMode.sel];
  for (const r of poseMode.rings) {
    r.visible = !!sj;
    if (!sj) continue;
    sj.obj.getWorldPosition(_p);
    sj.obj.parent.getWorldQuaternion(_pqw); // les axes suivent le parent : ils ne bougent pas quand on tourne l'articulation
    r.position.copy(_p);
    r.quaternion.copy(_pqw);
    r.scale.setScalar(camera.position.distanceTo(_p) * 0.06 * r.geometry.userData.k);
  }
  for (const x of poseMode.dots) {
    x.mesh.material = x.name === poseMode.sel ? poseDotSel : poseDotMat;
    x.j.obj.getWorldPosition(_p);
    x.mesh.position.copy(_p);
    x.mesh.scale.setScalar(camera.position.distanceTo(_p) * 0.009);
  }
}
function posePointerDown(e) {
  if (e.button !== 0) return;
  if (poseMode.sel) { // anneaux de rotation : prioritaires sur les points
    setRay(e);
    const rh = raycaster.intersectObjects(poseMode.rings, false)[0];
    if (rh) {
      e.stopImmediatePropagation();
      const j = poseMode.m.userData.rig[poseMode.sel], c = j.obj.getWorldPosition(V3(0, 0, 0)), pw = j.obj.parent.getWorldQuaternion(new THREE.Quaternion());
      const ax = rh.object.userData.axis, axis = (ax === 'x' ? V3(1, 0, 0) : ax === 'y' ? V3(0, 1, 0) : V3(0, 0, 1)).applyQuaternion(pw).normalize();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axis, c), p0 = V3(0, 0, 0);
      if (raycaster.ray.intersectPlane(plane, p0)) {
        poseMode.ring = { axis, c, plane, v0: p0.sub(c).normalize() };
        controls.enabled = false;
        dom.setPointerCapture(e.pointerId);
      }
      return;
    }
  }
  // point le plus proche du curseur, à l'écran (les points sont petits : tolérance de 16 px)
  const r = dom.getBoundingClientRect(), v = V3(0, 0, 0);
  let best = null, bd = 16;
  for (const x of poseMode.dots) {
    v.copy(x.mesh.position).project(camera);
    if (v.z > 1) continue;
    const dd = Math.hypot(r.left + ((v.x + 1) / 2) * r.width - e.clientX, r.top + ((1 - v.y) / 2) * r.height - e.clientY);
    if (dd < bd) { bd = dd; best = x; }
  }
  if (!best) return; // clic ailleurs : la caméra tourne normalement
  e.stopImmediatePropagation();
  poseMode.sel = best.name;
  poseMode.drag = { x: e.clientX, y: e.clientY };
  controls.enabled = false;
  dom.setPointerCapture(e.pointerId);
  updatePoseBar();
}
const _pq = new THREE.Quaternion(), _pw = new THREE.Quaternion(), _pr = V3(0, 0, 0), _pu = V3(0, 0, 0);
function posePointerMove(e) {
  if (poseMode.ring) { // rotation autour d'un anneau : angle parcouru par le curseur autour du centre, dans le plan de l'anneau
    const R = poseMode.ring, o = poseMode.m.userData.rig[poseMode.sel].obj, p = V3(0, 0, 0);
    setRay(e);
    if (!raycaster.ray.intersectPlane(R.plane, p)) return;
    const v = p.sub(R.c).normalize();
    const ang = Math.atan2(R.axis.dot(V3(0, 0, 0).crossVectors(R.v0, v)), R.v0.dot(v));
    R.v0 = v;
    o.parent.getWorldQuaternion(_pw);
    _pq.setFromAxisAngle(R.axis, ang);
    o.quaternion.premultiply(_pw).premultiply(_pq).premultiply(_pw.clone().invert()).normalize();
    (poseMode.d.pose ||= {})[poseMode.sel] = o.quaternion.toArray();
    return;
  }
  const dr = poseMode.drag;
  if (!dr || !poseMode.sel) return;
  const dx = e.clientX - dr.x, dy = e.clientY - dr.y;
  dr.x = e.clientX; dr.y = e.clientY;
  const o = poseMode.m.userData.rig[poseMode.sel].obj;
  camera.updateMatrixWorld();
  _pr.setFromMatrixColumn(camera.matrixWorld, 0);
  _pu.setFromMatrixColumn(camera.matrixWorld, 1);
  // rotation décidée à l'écran (droite / haut de la caméra), exprimée dans le repère du parent
  _pq.setFromAxisAngle(_pu, dx * 0.012).multiply(new THREE.Quaternion().setFromAxisAngle(_pr, dy * 0.012));
  o.parent.getWorldQuaternion(_pw);
  o.quaternion.premultiply(_pw).premultiply(_pq).premultiply(_pw.clone().invert()).normalize();
  (poseMode.d.pose ||= {})[poseMode.sel] = o.quaternion.toArray();
}
function posePointerUp() {
  if (poseMode.ring) { poseMode.ring = null; controls.enabled = true; return; }
  if (!poseMode.drag) return;
  poseMode.drag = null;
  controls.enabled = true;
}
$('poseResetJoint').addEventListener('click', () => {
  if (!poseMode?.sel) return;
  poseMode.m.userData.rig[poseMode.sel].obj.quaternion.identity();
  if (poseMode.d.pose) delete poseMode.d.pose[poseMode.sel];
});
$('poseResetAll').addEventListener('click', () => {
  if (!poseMode) return;
  for (const [name, j] of Object.entries(poseMode.m.userData.rig)) if (name !== 'body') j.obj.quaternion.identity();
  delete poseMode.d.pose;
});
$('poseDone').addEventListener('click', exitPose);
$('selPose').addEventListener('click', () => { if (selected) enterPose(selected); });

function showTab(name) {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('#controls > .tab').forEach((s) => (s.hidden = s.dataset.tab !== name));
  try { localStorage.setItem('lowpoly-tab', name); } catch {}
}
document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
{
  let tab = 'tree';
  try { tab = localStorage.getItem('lowpoly-tab') || 'tree'; } catch {}
  showTab(document.querySelector(`#tabs button[data-tab="${tab}"]`) ? tab : 'tree');
}

// ---------- Lignes « espèce : − nombre + » ----------
const dropMesh = (m) => {
  if (!m) return;
  if (selected === m) select(null);
  dropPeckersOf(m);
  world.remove(m);
  disposeMesh(m);
  trees = trees.filter((t) => t !== m);
};
const lastOfKind = (arr, kind) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i].kind === kind) return i; return -1; };
const SPECIES = [
  ...TREE_PRESETS.map((p) => ({ g: 'tree', name: p.name, count: () => trees.filter((m) => m.userData.spec?.q.preset === p.id).length, add: () => addPresetTree(p), remove: () => removePresetTree(p), pick: () => morphSelected(p) })),
  { g: 'animal', name: 'Carpe koï', count: () => fishData.length, add: () => $('fishAdd').click(), remove: () => { const d = fishData.pop(); if (d) dropMesh(trees.find((t) => t.userData.fish?.d === d)); } },
  { g: 'animal', name: 'Héron', count: () => heronsData.filter((x) => !x.kind).length, add: () => $('heronAdd').click(), remove: () => { const d = heronsData.findLast((x) => !x.kind); heronsData = heronsData.filter((x) => x !== d); if (d) dropMesh(trees.find((t) => t.userData.heron?.d === d)); } },
  { g: 'animal', name: 'Flamant rose', count: () => heronsData.filter((x) => x.kind === 'flamingo').length, add: () => $('flamingoAdd').click(), remove: () => { const d = heronsData.findLast((x) => x.kind === 'flamingo'); heronsData = heronsData.filter((x) => x !== d); if (d) dropMesh(trees.find((t) => t.userData.heron?.d === d)); } },
  { g: 'animal', name: 'Ibis falcinelle', count: () => heronsData.filter((x) => x.kind === 'ibis').length, add: () => $('ibisAdd').click(), remove: () => { const d = heronsData.findLast((x) => x.kind === 'ibis'); heronsData = heronsData.filter((x) => x !== d); if (d) dropMesh(trees.find((t) => t.userData.heron?.d === d)); } },
  { g: 'animal', name: 'Héron garde-bœufs', count: () => heronsData.filter((x) => x.kind === 'egret').length, add: () => $('egretAdd').click(), remove: () => { const d = heronsData.findLast((x) => x.kind === 'egret'); heronsData = heronsData.filter((x) => x !== d); if (d) dropMesh(trees.find((t) => t.userData.heron?.d === d)); } },
  { g: 'animal', name: 'Pic', count: () => peckersData.length, add: () => $('peckerAdd').click(), remove: () => { const d = peckersData.pop(); const b = d && peckers.find((x) => x.userData.pecker.d === d); if (b) { b.parent?.remove(b); disposeMesh(b); peckers = peckers.filter((x) => x !== b); } } },
  { g: 'animal', name: 'Grenouille', count: () => frogsData.length, add: () => $('frogAdd').click(), remove: () => { const d = frogsData.pop(); if (d) dropMesh(trees.find((t) => t.userData.frog?.d === d)); } },
  { g: 'animal', name: 'Sarcelle', count: () => wagtailsData.filter((x) => x.kind === 'teal').length, add: () => $('tealAdd').click(), remove: () => { const d = wagtailsData.findLast((x) => x.kind === 'teal'); wagtailsData = wagtailsData.filter((x) => x !== d); if (d) dropMesh(trees.find((t) => t.userData.wagtail?.d === d)); } },
  { g: 'animal', name: 'Canard souchet', count: () => wagtailsData.filter((x) => x.kind === 'shoveler').length, add: () => $('shovelerAdd').click(), remove: () => { const d = wagtailsData.findLast((x) => x.kind === 'shoveler'); wagtailsData = wagtailsData.filter((x) => x !== d); if (d) dropMesh(trees.find((t) => t.userData.wagtail?.d === d)); } },
  { g: 'animal', name: 'Martin-pêcheur', count: () => wagtailsData.filter((x) => x.kind === 'kingfisher').length, add: () => $('kingfisherAdd').click(), remove: () => { const d = wagtailsData.findLast((x) => x.kind === 'kingfisher'); wagtailsData = wagtailsData.filter((x) => x !== d); if (d) dropMesh(trees.find((t) => t.userData.wagtail?.d === d)); } },
  { g: 'animal', name: 'Bergeronnette', count: () => wagtailsData.filter((x) => !x.kind).length, add: () => $('wagtailAdd').click(), remove: () => { const d = wagtailsData.findLast((x) => !x.kind); wagtailsData = wagtailsData.filter((x) => x !== d); if (d) dropMesh(trees.find((t) => t.userData.wagtail?.d === d)); } },
  { g: 'animal', name: 'Mouette', count: () => flyersData.filter((d) => d.kind === 'gull').length, add: () => $('gullAdd').click(), remove: () => removeFlyer('gull') },
  { g: 'animal', name: 'Huppe (en vol)', count: () => flyersData.filter((d) => d.kind === 'hoopoe').length, add: () => { const d = newFlyerDesc('hoopoe'); flyersData.push(d); addFlyer(d); setStatus(flyersData.length + ' oiseau(x) en vol'); }, remove: () => removeFlyer('hoopoe') },
  { g: 'animal', name: 'Hirondelle', count: () => flyersData.filter((d) => d.kind === 'swallow').length, add: () => $('swallowAdd').click(), remove: () => removeFlyer('swallow') },
  { g: 'animal', name: 'Libellule', count: () => dragonsData.length, add: () => $('dragonAdd').click(), remove: () => { const d = dragonsData.pop(); const f = d && dragons.find((x) => x.d === d); if (f) { world.remove(f.mesh); f.mesh.geometry.dispose(); dragons = dragons.filter((x) => x !== f); } } },
  ...Object.keys(INSECT_BASE).map((kind) => ({ g: 'insect', name: INSECT_NAMES[kind], count: () => insectsData.filter((d) => d.kind === kind).length, add: () => addInsectOfKind(kind), remove: () => removeInsect(kind) })),
  ...Object.keys(FLOWER_NAMES).map((type) => ({ g: 'flower', name: FLOWER_NAMES[type], count: () => flowersData.filter((d) => d.type === type).length, add: () => addFlowerOfType(type), remove: () => { const i = flowersData.map((d) => d.type).lastIndexOf(type); if (i < 0) return; const d = flowersData.splice(i, 1)[0]; dropMesh(trees.find((t) => t.userData.flower === d)); } })),
  { g: 'plant', name: 'Nénuphar', count: () => liliesData.length, add: () => $('lilyAdd').click(), remove: () => { const d = liliesData.pop(); if (d) dropMesh(trees.find((t) => t.userData.lily === d)); } },
  { g: 'plant', name: "Lentille d'eau", count: () => ducksData.length, add: () => $('duckAdd').click(), remove: () => { const d = ducksData.pop(); if (d) dropMesh(trees.find((t) => t.userData.duck === d)); } },
];
function removeFlyer(kind) {
  const i = lastOfKind(flyersData, kind);
  if (i < 0) return;
  const d = flyersData.splice(i, 1)[0];
  const f = flyers.find((x) => x.d === d);
  if (f) { world.remove(f.mesh); f.mesh.geometry.dispose(); f.wl.geometry.dispose(); f.wr.geometry.dispose(); flyers = flyers.filter((x) => x !== f); }
}
function removeInsect(kind) {
  const i = lastOfKind(insectsData, kind);
  if (i < 0) return;
  const d = insectsData.splice(i, 1)[0];
  const f = insects.find((x) => x.d === d);
  if (f) { world.remove(f.mesh); f.mesh.geometry.dispose(); f.wl?.geometry.dispose(); f.wr?.geometry.dispose(); insects = insects.filter((x) => x !== f); }
}
const GROUP_BOX = { tree: 'treePresets', animal: 'animalRows', insect: 'insectRows', flower: 'flowerRows', plant: 'plantRows' };
// réglages « avancés » de chaque animal : les curseurs taille / vitesse (déclarés dans l'onglet Animaux) sont rangés sous sa ligne
const ANIMAL_ADV = {
  'Carpe koï': ['fishSize', 'fishSpeed'], 'Héron': ['heronSize'], 'Flamant rose': ['flamingoSize'], 'Ibis falcinelle': ['ibisSize'], 'Héron garde-bœufs': ['egretSize'], 'Pic': ['peckerSize', 'peckerSpeed'], 'Grenouille': ['frogSize'],
  'Sarcelle': ['tealSize'], 'Canard souchet': ['shovelerSize'], 'Martin-pêcheur': ['kingfisherSize'], 'Bergeronnette': ['wagtailSize', 'wagtailSpeed'], 'Mouette': ['gullSize', 'gullSpeed'], 'Huppe (en vol)': ['hoopoeSize', 'hoopoeSpeed', 'hoopoeSlow'],
  'Hirondelle': ['swallowSize', 'swallowSpeed'], 'Libellule': ['dragonSize', 'dragonSpeed'],
};
function renderSpecies() {
  syncCustomSpecies();
  // les curseurs « Avancé » vivent dans les lignes d'animaux : on les met à l'abri avant de vider les listes (sinon ils seraient détruits)
  let stash = $('sliderStash');
  if (!stash) { stash = document.createElement('div'); stash.id = 'sliderStash'; stash.hidden = true; document.body.appendChild(stash); }
  document.querySelectorAll('details.adv > label').forEach((l) => stash.appendChild(l));
  const oldSec = $('fishSize')?.closest('details'); // section « Tailles et vitesses » (vidée plus bas)
  Object.values(GROUP_BOX).forEach((id) => ($(id).innerHTML = ''));
  SPECIES.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'species';
    row.innerHTML = '<img class="thumb" alt="" /><span></span><button type="button" class="alt minus" title="Retirer le dernier">−</button><b class="cnt">0</b><button type="button" class="plus" title="Ajouter">+</button>';
    row.children[1].textContent = s.name;
    if (s.pick) { row.children[1].style.cursor = 'pointer'; row.children[1].title = "Change le type de l'arbre sélectionné"; row.children[1].addEventListener('click', s.pick); }
    if (s.thumb || THUMB_KEYS[s.name]) enqueueThumb(row.querySelector('img'), s.thumb || THUMB_KEYS[s.name]);
    row.querySelector('.minus').addEventListener('click', () => { s.remove(); updateCounts(); });
    row.querySelector('.plus').addEventListener('click', () => { s.add(); setTimeout(updateCounts, 0); });
    s.cnt = row.querySelector('.cnt');
    $(GROUP_BOX[s.g]).appendChild(row);
    const adv = s.g === 'animal' && ANIMAL_ADV[s.name];
    if (adv) {
      const det = document.createElement('details');
      det.className = 'adv';
      det.innerHTML = '<summary>Avancé</summary>';
      adv.forEach((id) => { const el = $(id)?.closest('label'); if (el) det.appendChild(el); });
      $(GROUP_BOX[s.g]).appendChild(det);
    }
  });
  if (oldSec && !oldSec.querySelector('label')) oldSec.remove();
  updateCounts();
}
function updateCounts() { SPECIES.forEach((s) => { if (s.cnt) s.cnt.textContent = s.count(); }); }
setInterval(updateCounts, 400);

$('flowersClear').addEventListener('click', () => {
  flowersData = [];
  select(null);
  trees.filter((t) => t.userData.flower).forEach((t) => { world.remove(t); disposeMesh(t); });
  trees = trees.filter((t) => !t.userData.flower);
  updateCounts();
});

// ---------- Édition en direct de l'objet sélectionné ----------
// Les réglages des sections Pierres / Herbe / Poissons / Panneaux / Bancs modifient l'objet sélectionné ;
// sans sélection, ils servent de valeurs pour les prochains ajouts.
// poissons, hérons et grenouilles stockent { d, … animation } : leur fiche est dans `.d` (les autres objets la portent directement)
const WRAPPED = ['fish', 'heron', 'frog', 'wagtail'];
const descOf = (m, kind) => (WRAPPED.includes(kind) ? m.userData[kind]?.d : m.userData[kind]);
const SIGN_NAMES = ['Forêt', 'Lac', 'Plage', 'Village', 'Montagne', 'Rivière', 'Source', 'Sommet', 'Port', 'Champ'];

const LIVE = {
  rock: {
    ids: ['rockSize', 'rockFlat', 'rockRough', 'rockMoss', 'rockColor'],
    add: addRock,
    edit: (d) => {
      d.size = num('rockSize'); d.flat = num('rockFlat'); d.rough = num('rockRough');
      d.moss = num('rockMoss') / 100; d.color = $('rockColor').value;
    },
    fill: (d) => ({ rockSize: d.size, rockFlat: d.flat, rockRough: d.rough, rockMoss: Math.round(d.moss * 100), rockColor: d.color }),
  },
  tuft: {
    ids: ['tuftSize', 'tuftBlades', 'tuftBend', 'tuftColor', 'flowerColor', 'tuftKind'],
    add: addTuft,
    edit: (d) => {
      d.size = num('tuftSize'); d.blades = Math.round(num('tuftBlades')); d.bend = num('tuftBend');
      d.color = $('tuftColor').value; d.flower = $('flowerColor').value;
      if ($('tuftKind').value !== 'mix') d.kind = $('tuftKind').value;
    },
    fill: (d) => ({ tuftSize: d.size, tuftBlades: d.blades, tuftBend: d.bend, tuftColor: d.color, flowerColor: d.flower, tuftKind: d.kind }),
  },
  fish: {
    ids: ['fishSize', 'fishSpeed'],
    add: addFish,
    edit: (d) => { d.size = num('fishSize'); d.speed = num('fishSpeed'); },
    fill: (d) => ({ fishSize: d.size, fishSpeed: d.speed }),
  },
  sign: {
    ids: ['signBoards', 'signHeight', 'signWood', 'signText'],
    add: addSign,
    // `id` = réglage modifié : on ne touche qu'à ce qui change (les textes existants sont conservés)
    edit: (d, id) => {
      if (id === 'signHeight') d.h = num('signHeight');
      if (id === 'signWood') d.wood = $('signWood').value;
      if (id === 'signBoards') {
        const n = Math.round(num('signBoards'));
        while (d.boards.length > n) d.boards.pop(); // moins de flèches : on retire les dernières
        while (d.boards.length < n) { // plus de flèches : décalées autour du poteau, avec un nom pas encore utilisé
          const last = d.boards[d.boards.length - 1];
          const used = new Set(d.boards.map((b) => b.text));
          const text = SIGN_NAMES.find((s) => !used.has(s)) || SIGN_NAMES[d.boards.length % SIGN_NAMES.length];
          d.boards.push({ text, angle: +((last ? last.angle : 0) + 0.7 + Math.random() * 0.9).toFixed(3), dir: d.boards.length % 2 ? -1 : 1, len: +(0.9 + Math.random() * 0.35).toFixed(2) });
        }
      }
      if (id === 'signText') {
        const labels = $('signText').value.split(',').map((s) => s.trim()).filter(Boolean);
        d.boards.forEach((b, i) => (b.text = labels.length ? labels[i % labels.length] : ''));
      }
    },
    fill: (d) => ({ signBoards: d.boards.length, signHeight: d.h, signWood: d.wood, signText: d.boards.map((b) => b.text).join(', ') }),
  },
  heron: {
    ids: ['heronSize', 'flamingoSize', 'ibisSize', 'egretSize'],
    add: addHeron,
    edit: (d) => { d.size = num(d.kind === 'flamingo' ? 'flamingoSize' : d.kind === 'ibis' ? 'ibisSize' : d.kind === 'egret' ? 'egretSize' : 'heronSize'); },
    fill: (d) => (d.kind === 'flamingo' ? { flamingoSize: d.size } : d.kind === 'ibis' ? { ibisSize: d.size } : d.kind === 'egret' ? { egretSize: d.size } : { heronSize: d.size }),
  },
  frog: {
    ids: ['frogSize'],
    add: addFrog,
    edit: (d) => { d.size = num('frogSize'); },
    fill: (d) => ({ frogSize: d.size }),
  },
  wagtail: {
    ids: ['wagtailSize', 'wagtailSpeed', 'tealSize', 'shovelerSize', 'kingfisherSize'],
    add: addWagtail,
    edit: (d) => { if (d.kind === 'custom') return; d.size = num(d.kind === 'teal' ? 'tealSize' : d.kind === 'shoveler' ? 'shovelerSize' : d.kind === 'kingfisher' ? 'kingfisherSize' : 'wagtailSize'); if (!d.kind) d.speed = num('wagtailSpeed'); },
    fill: (d) => (d.kind === 'custom' ? {} : d.kind === 'teal' ? { tealSize: d.size } : d.kind === 'shoveler' ? { shovelerSize: d.size } : d.kind === 'kingfisher' ? { kingfisherSize: d.size } : { wagtailSize: d.size, wagtailSpeed: d.speed }),
  },

  lily: {
    ids: ['lilySize', 'lilyFlower'],
    add: addLily,
    edit: (d) => { d.size = num('lilySize'); d.flower = $('lilyFlower').checked; },
    fill: (d) => ({ lilySize: d.size, lilyFlower: d.flower }),
  },
  duck: {
    ids: ['duckSize'],
    add: addDuck,
    edit: (d) => { d.size = num('duckSize'); },
    fill: (d) => ({ duckSize: d.size }),
  },
  bridge: {
    ids: ['bridgeType', 'bridgeLen', 'bridgeW', 'bridgeH', 'bridgeY', 'bridgeRail', 'bridgeColor'],
    add: addBridge,
    edit: (d) => { d.type = $('bridgeType').value; d.len = num('bridgeLen'); d.w = num('bridgeW'); d.h = num('bridgeH'); d.dy = num('bridgeY'); d.rail = $('bridgeRail').checked; d.color = $('bridgeColor').value; },
    fill: (d) => ({ bridgeType: d.type, bridgeLen: d.len, bridgeW: d.w, bridgeH: d.h, bridgeY: d.dy || 0, bridgeRail: d.rail, bridgeColor: d.color }),
  },
  stairs: {
    ids: ['stairsType', 'stairsSteps', 'stairsW', 'stairsH', 'stairsY', 'stairsRail', 'stairsColor'],
    add: addStairs,
    edit: (d) => { d.type = $('stairsType').value; d.steps = Math.round(num('stairsSteps')); d.w = num('stairsW'); d.sh = num('stairsH'); d.dy = num('stairsY'); d.rail = $('stairsRail').checked; d.color = $('stairsColor').value; },
    fill: (d) => ({ stairsType: d.type, stairsSteps: d.steps, stairsW: d.w, stairsH: d.sh, stairsY: d.dy || 0, stairsRail: d.rail, stairsColor: d.color }),
  },
  bench: {
    ids: ['benchSize', 'benchBack', 'benchWood'],
    add: addBench,
    edit: (d) => { d.size = num('benchSize'); d.back = $('benchBack').checked; d.wood = $('benchWood').value; },
    fill: (d) => ({ benchSize: d.size, benchBack: d.back, benchWood: d.wood }),
  },
};

// recrée l'objet sélectionné avec le descripteur modifié (même place, même rotation, même taille)
function liveEdit(kind, id) {
  const m = selected;
  const d = m && descOf(m, kind);
  if (!d) return;
  LIVE[kind].edit(d, id);
  select(null);
  world.remove(m);
  disposeMesh(m);
  trees = trees.filter((t) => t !== m);
  select(LIVE[kind].add(d));
}
Object.entries(LIVE).forEach(([kind, cfg]) =>
  cfg.ids.forEach((id) => $(id).addEventListener('input', () => liveEdit(kind, id)))
);

// à la sélection, les réglages affichent les valeurs de l'objet
function syncUi(m) {
  for (const [kind, cfg] of Object.entries(LIVE)) {
    const d = descOf(m, kind);
    if (!d) continue;
    for (const [id, v] of Object.entries(cfg.fill(d))) {
      const el = $(id);
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v;
    }
  }
}

// ---------- Outils du terrain : listeners ----------
function setBrush() {
  const b = $('brush').value;
  select(null);
  brushRing.visible = false;
  if (b !== 'none') brushRing.material.color.set(BRUSH_COLORS[b]);
  dom.style.cursor = b === 'none' ? '' : 'crosshair';
  $('toolbar').dataset.tool = b; // la barre d'outils affiche taille / force seulement pour les pinceaux
  if (b === 'path' || b === 'quay' || b === 'wall') showTab('world');
  if (activePath && (activePath.kind || 'path') !== b) deselectPathOnly(); // changer d'outil : on ne continue pas le tracé d'un autre type
  syncLineUi(); // les réglages des chemins sont dans l'onglet Monde
  document.querySelectorAll('#tools button').forEach((btn) => btn.classList.toggle('active', btn.dataset.brush === b));
}
$('brush').addEventListener('change', setBrush);
// les boutons d'outils pilotent le champ caché #brush
document.querySelectorAll('#tools button').forEach((btn) =>
  btn.addEventListener('click', () => {
    $('brush').value = btn.dataset.brush;
    $('brush').dispatchEvent(new Event('change'));
  })
);
['water', 'waterLevel', 'waterOpacity'].forEach((id) => $(id).addEventListener('input', () => { showValues(); recolorGround(); updateWater(); }));
// niveau de l'eau : boutons − / + toujours visibles dans la barre d'outils
const stepWater = (d) => {
  const el = $('waterLevel');
  $('water').checked = true;
  el.value = clamp(Math.round((parseFloat(el.value) + d) * 100) / 100, +el.min, +el.max);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
$('waterDown').addEventListener('click', () => stepWater(-0.05));
$('waterUp').addEventListener('click', () => stepWater(0.05));
const showWater = () => { $('waterVal').textContent = $('water').checked ? parseFloat($('waterLevel').value).toFixed(2) : 'off'; };
setInterval(showWater, 300);
$('clearPaint').addEventListener('click', () => { paintStamps = []; recolorGround(); });
$('clearSculpt').addEventListener('click', () => { sculpt.fill(0); refreshGround(0, 0, 1e6); rebuildPaths(); });

// ---------- Sélection / déplacement à la souris ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const dom = renderer.domElement;
const _v = new THREE.Vector3();
let drag = null;   // { plane, offset } pendant qu'on déplace un arbre
let downAt = null; // pour distinguer un clic dans le vide d'un mouvement de caméra

function setRay(e) {
  const r = dom.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}

// ---------- Chemins : courbes tracées à la souris, posés sur le relief ----------
// Un chemin = points de contrôle (x, z) + courbe (spline lissée ou segments droits) + matière + largeur,
// et en option un muret de pierre sur un ou deux bords. Le ruban suit le terrain.
let pathsData = [];      // descripteurs (enregistrés dans le JSON)
let activePath = null;   // chemin en cours d'édition : points visibles et déplaçables
const pathMeshes = new Map(); // descripteur -> mesh
let pathHandles = [];    // petites sphères des points de contrôle du chemin actif
const matPath = new THREE.MeshStandardMaterial({
  vertexColors: true, flatShading: true, roughness: 1, metalness: 0,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, // évite le scintillement avec le terrain
});
const handleGeo = new THREE.SphereGeometry(1, 12, 8);
const matHandle = new THREE.MeshBasicMaterial({ color: 0xff9a3c, depthTest: false, transparent: true });
const matHandleOn = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });
const PATH_MATS = {
  asphalt: { base: '#4d5258', edge: '#9aa0a6', var: 0.012, name: 'Goudron' },
  sand: { base: '#e8d6a6', edge: '#d9c590', var: 0.015, name: 'Sable' },
  dirt: { base: '#a47b52', edge: '#8a6742', var: 0.03, name: 'Terre' },
  gravel: { base: '#b0aaa0', edge: '#8f8a82', var: 0.07, name: 'Gravier' },
  cobble: { base: '#9a948c', edge: '#6f6a64', var: 0.04, name: 'Pavés' },
};

function newWallDesc() {
  return {
    kind: 'wall', pts: [], curve: 'line', closed: $('wallClosed').checked, width: 0.3, // width : sert aux poignées / à l'insertion de points
    type: $('wallType').value, h: num('wallH'), t: num('wallT'), color: $('wallColor').value, cap: $('wallCap').checked, pillars: $('wallPillars').checked,
    plant: $('wallPlant').value, plantAmt: num('wallPlantAmt'), plantSide: $('wallPlantSide').value, openings: [],
    seed: Math.floor(Math.random() * 1e6), alba: $('alba').checked,
  };
}
function newPathDesc(kind) {
  if (kind === 'wall') return newWallDesc();
  const quay = kind === 'quay'; // quai : pavé, muret de pierre claire côté eau (à droite du sens du tracé)
  return {
    kind: quay ? 'quay' : 'path',
    pts: [], curve: quay ? 'line' : $('pathCurve').value, closed: $('pathClosed').checked, mat: quay ? 'cobble' : $('pathMat').value,
    width: quay ? 0.45 : num('pathWidth'), lines: $('pathLine').checked,
    wall: quay ? 'right' : $('pathWall').value, wallH: num('pathWallH'), wallT: quay ? 0.16 : num('pathWallT'), wallColor: quay ? '#d6cdb6' : $('pathWallColor').value,
    seed: Math.floor(Math.random() * 1e6), alba: $('alba').checked,
  };
}

// points échantillonnés régulièrement le long de la courbe (tous les ~0,12)
function pathSamples(p) {
  if (p.pts.length < 2) return [];
  const pts = p.pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const closed = !!p.closed && pts.length > 2;
  let curve;
  if (p.curve === 'line') {
    curve = new THREE.CurvePath();
    for (let i = 0; i < pts.length - 1; i++) curve.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    if (closed) curve.add(new THREE.LineCurve3(pts[pts.length - 1], pts[0]));
  } else curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
  const n = Math.max(2, Math.ceil(curve.getLength() / 0.12));
  const out = curve.getSpacedPoints(n);
  if (closed) out.pop(); // le dernier point recoupe le premier
  return { pts: out, closed };
}

const walls = createWalls({ finish, hashPos, mulberry32, clamp, getHF: () => currentHF, getGroundR: () => groundR, samples: (p) => pathSamples(p) });

function buildPathGeometry(p) {
  if (p.kind === 'wall') return walls.build(p);
  const S = pathSamples(p);
  if (!S.pts || S.pts.length < 2) return null;
  const P = S.pts, M = P.length, closed = S.closed;
  const quay = p.kind === 'quay';
  const hy = (x, z) => (currentHF ? currentHF(x, z) : 0) + 0.04;
  // quai : dessus parfaitement plat (un seul niveau pour tout le quai : le point le plus haut du terrain sous le tracé)
  const topY = Math.max(...P.map((q) => hy(q.x, q.z))) + 0.02;
  const tops = P.map(() => topY);
  const bottom = ($('water').checked ? waterLevel() : -0.3) - 0.3; // pied du mur : sous la surface de l'eau
  const nc = 8; // colonnes en travers
  const base = new THREE.Color(PATH_MATS[p.mat].base), edge = new THREE.Color(PATH_MATS[p.mat].edge);
  const wallC = new THREE.Color(p.wallColor);
  const tone = (c, dl) => {
    c.getHSL(_hsl, THREE.SRGBColorSpace);
    let s = _hsl.s, l = clamp(_hsl.l + dl, 0, 1);
    if (p.alba) { s = Math.min(1, s * 0.95 + 0.06); l = l * 0.85 + 0.15; }
    return new THREE.Color().setHSL(_hsl.h, s, l, THREE.SRGBColorSpace);
  };
  // tangente et normale (dans le plan xz) à chaque échantillon
  const T = [], N = [];
  for (let i = 0; i < M; i++) {
    const a = P[closed ? (i - 1 + M) % M : Math.max(0, i - 1)], b = P[closed ? (i + 1) % M : Math.min(M - 1, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
    T.push([tx / l, tz / l]);
    N.push([-tz / l, tx / l]);
  }
  // ruban : (M x nc+1) sommets posés sur le terrain
  const lim = groundR * 0.985; // le chemin ne déborde pas du terrain
  const V = P.map((q, i) => {
    const row = [];
    for (let c = 0; c <= nc; c++) {
      const s = -p.width / 2 + (p.width * c) / nc;
      let x = q.x + N[i][0] * s, z = q.z + N[i][1] * s;
      const d = Math.hypot(x, z);
      if (d > lim) { x *= lim / d; z *= lim / d; }
      row.push([x, quay ? tops[i] : hy(x, z), z]);
    }
    return row;
  });
  const pos = [], col = [];
  const mi = (i) => (closed ? i % M : i);
  let dist = 0;
  const segs = closed ? M : M - 1;
  for (let i = 0; i < segs; i++) {
    dist += Math.hypot(P[mi(i + 1)].x - P[i].x, P[mi(i + 1)].z - P[i].z);
    for (let c = 0; c < nc; c++) {
      const a = V[i][c], b = V[i][c + 1], d = V[mi(i + 1)][c], e = V[mi(i + 1)][c + 1];
      const noise = (hashPos(i, c, 0, p.seed % 97) - 0.5) * 2 * PATH_MATS[p.mat].var;
      let color;
      if (c === 0 || c === nc - 1) color = tone(edge, noise); // bords : bordure / côté plus sombre
      else if (p.mat === 'asphalt' && p.lines && (c === nc / 2 - 1 || c === nc / 2) && Math.floor(dist / 0.35) % 2 === 0) color = tone(new THREE.Color('#f0efe6'), noise); // pointillés centraux
      else if (p.mat === 'cobble') color = tone(base, noise + (((Math.floor(dist / 0.18) + c) % 2) ? 0.04 : -0.03)); // damier de pavés
      else color = tone(base, noise);
      pos.push(...a, ...b, ...d, ...b, ...e, ...d);
      for (let k = 0; k < 6; k++) col.push(color.r, color.g, color.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const parts = [g];

  // quai : mur de pierre vertical, assises régulières, chaperon plus clair sur le dessus
  if (quay && p.wall !== 'none') {
    const sides = p.wall === 'both' ? [-1, 1] : [p.wall === 'left' ? -1 : 1];
    const rng = mulberry32(p.seed);
    const L = [0];
    for (let i = 1; i < M; i++) L.push(L[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z));
    const total = closed ? L[M - 1] + Math.hypot(P[0].x - P[M - 1].x, P[0].z - P[M - 1].z) : L[M - 1];
    const at = (s) => { let lo = 0, hi = M - 1; while (lo < hi) { const m2 = (lo + hi) >> 1; if (L[m2] < s) lo = m2 + 1; else hi = m2; } return lo; };
    for (const side of sides) {
      for (let r = 0; ; r++) {
        let any = false;
        let s = (r % 2) * 0.14;
        while (s < total - 0.1) {
          const bl = 0.24 + rng() * 0.12;
          const mid = Math.min(total - 0.01, s + bl / 2);
          const i = Math.min(M - 1, at(mid)), q = P[i], tt = T[i], nn = N[i];
          const H = tops[i] - bottom, rows = Math.max(2, Math.round(H / 0.1)), rh = H / rows;
          if (r < rows) {
            any = true;
            const cope = r === 0;
            const tk = p.wallT * (cope ? 1.35 : 0.95 + rng() * 0.1);
            const off = side * (p.width / 2 + tk / 2 - (cope ? 0.01 : -0.01));
            const x = q.x + nn[0] * off, z = q.z + nn[1] * off;
            if (Math.hypot(x, z) <= lim - bl * 0.5) {
              const b = new THREE.BoxGeometry(tk, rh * (cope ? 0.9 : 0.96), bl * 0.97);
              b.rotateY(Math.atan2(tt[0], tt[1]));
              b.translate(x, tops[i] - rh * (r + 0.5) - (cope ? 0 : 0.01), z);
              const dl = (rng() - 0.5) * 0.08 + (cope ? 0.06 : -r * 0.004);
              parts.push(finish(b, () => tone(wallC, dl)));
            }
          }
          s += bl;
        }
        if (!any) break;
      }
    }
  }
  // muret de pierre : blocs empilés en quinconce le long d'un ou des deux bords
  if (!quay && p.wall !== 'none') {
    const sides = p.wall === 'both' ? [-1, 1] : [p.wall === 'left' ? -1 : 1];
    const rowH = 0.09, rows = Math.max(1, Math.round(p.wallH / rowH)), rh = p.wallH / rows;
    const rng = mulberry32(p.seed);
    // longueur cumulée par échantillon
    const L = [0];
    for (let i = 1; i < M; i++) L.push(L[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z));
    const total = closed ? L[M - 1] + Math.hypot(P[0].x - P[M - 1].x, P[0].z - P[M - 1].z) : L[M - 1];
    const at = (s) => { // échantillon le plus proche de l'abscisse s
      let lo = 0, hi = M - 1;
      while (lo < hi) { const m2 = (lo + hi) >> 1; if (L[m2] < s) lo = m2 + 1; else hi = m2; }
      return lo;
    };
    for (const side of sides) {
      for (let r = 0; r < rows; r++) {
        let s = (r % 2) * 0.13; // quinconce : une rangée sur deux est décalée
        while (s < total - 0.1) {
          const bl = 0.2 + rng() * 0.13; // longueur du bloc
          const mid = Math.min(total - 0.01, s + bl / 2);
          const i = Math.min(M - 1, at(mid)), q = P[i], tt = T[i], nn = N[i];
          const off = side * (p.width / 2 + p.wallT / 2 + 0.01 + (rng() - 0.5) * 0.02);
          const x = q.x + nn[0] * off, z = q.z + nn[1] * off;
          if (Math.hypot(x, z) > lim - bl * 0.5) { s += bl; continue; } // pas de bloc au-delà du bord du terrain
          const t = p.wallT * (0.9 + rng() * 0.2);
          const b = new THREE.BoxGeometry(t, rh * 0.96, bl * 0.96);
          b.rotateY(Math.atan2(tt[0], tt[1]) + (rng() - 0.5) * 0.08);
          const y0 = hy(x, z) - 0.05; // enfoncé un peu dans le sol : suit les pentes sans trou
          b.translate(x, y0 + rh * (r + 0.5) + 0.025, z);
          const dl = (rng() - 0.5) * 0.1 + (r === rows - 1 ? 0.04 : 0);
          parts.push(finish(b, () => tone(wallC, dl)));
          s += bl;
        }
      }
    }
  }
  const geo = parts.length > 1 ? mergeGeometries(parts) : parts[0];
  if (parts.length > 1) parts.forEach((q) => q.dispose());
  return geo;
}

function rebuildPath(p) {
  const old = pathMeshes.get(p);
  if (old) { world.remove(old); old.geometry.dispose(); pathMeshes.delete(p); }
  const geo = buildPathGeometry(p);
  if (geo) {
    const m = new THREE.Mesh(geo, p.kind === 'wall' ? matFlat : matPath);
    m.receiveShadow = m.castShadow = $('shadows').checked;
    m.userData.path = p;
    world.add(m);
    pathMeshes.set(p, m);
  }
  if (p === activePath) refreshHandles();
}
function rebuildPaths() { pathsData.forEach(rebuildPath); }
function clearPaths() {
  pathMeshes.forEach((m) => { world.remove(m); m.geometry.dispose(); });
  pathMeshes.clear();
  clearHandles();
}

// poignées des points de contrôle du chemin actif
function clearHandles() {
  pathHandles.forEach((h) => world.remove(h));
  pathHandles = [];
}
function refreshHandles() {
  clearHandles();
  if (!activePath) return;
  const s = Math.max(0.07, activePath.width * 0.22);
  activePath.pts.forEach(([x, z], i) => {
    const h = new THREE.Mesh(handleGeo, i === 0 ? matHandleOn : matHandle);
    h.position.set(x, (currentHF ? currentHF(x, z) : 0) + 0.12, z);
    h.scale.setScalar(s);
    h.renderOrder = 15;
    h.userData.pathPoint = i;
    world.add(h);
    pathHandles.push(h);
  });
}

// sélection d'un chemin : points affichés, panneau de réglages rempli avec ses valeurs
function selectPath(p) {
  if (p) select(null);
  activePath = p;
  $('pathPanelState').textContent = p ? `Chemin sélectionné · ${p.pts.length} point(s)` : 'Aucun chemin sélectionné : les réglages servent au prochain tracé.';
  $('wallPanelState').textContent = p && p.kind === 'wall' ? `Mur sélectionné · ${p.pts.length} point(s)` : 'Aucun mur sélectionné : les réglages servent au prochain tracé.';
  if (p && p.kind === 'wall') { fillWallUi(p); $('wallSec').open = true; }
  else if (p) {
    $('pathMat').value = p.mat; $('pathWidth').value = p.width; $('pathCurve').value = p.curve;
    $('pathLine').checked = p.lines; $('pathClosed').checked = p.closed;
    $('pathWall').value = p.wall; $('pathWallH').value = p.wallH; $('pathWallT').value = p.wallT; $('pathWallColor').value = p.wallColor;
    showValues();
  }
  refreshHandles();
  syncLineUi();
}
// un seul panneau de réglages à la fois : celui du tracé en cours (chemin / quai, ou mur)
function syncLineUi() {
  const kind = activePath ? activePath.kind : { wall: 'wall', path: 'path', quay: 'quay' }[$('brush').value];
  const wall = kind === 'wall', line = kind === 'path' || kind === 'quay' || (activePath && !activePath.kind);
  $('wallSec').hidden = !!line;
  $('pathSec').hidden = wall;
  if (wall) $('wallSec').open = true;
  if (line) $('pathSec').open = true;
}
const deselectPathOnly = () => { if (activePath) { activePath = null; syncLineUi(); $('pathPanelState').textContent = 'Aucun chemin sélectionné : les réglages servent au prochain tracé.'; clearHandles(); } };

// clic en mode « Chemin » : ajoute un point (ou en insère un sur un tronçon existant)
function pathClick(local) {
  if (!activePath) {
    activePath = newPathDesc($('brush').value);
    pathsData.push(activePath);
    if (activePath.kind === 'quay' || activePath.kind === 'wall') selectPath(activePath); // le panneau affiche les réglages du quai
  }
  const p = activePath;
  let insertAt = p.pts.length;
  if (p.pts.length >= 2) {
    // clic tout près du tracé : on insère le point à cet endroit plutôt qu'en bout de chemin
    const S = pathSamples(p);
    if (S.pts && S.pts.length) {
      let best = 1e9, bi = -1;
      S.pts.forEach((q, i) => { const dd = Math.hypot(q.x - local.x, q.z - local.z); if (dd < best) { best = dd; bi = i; } });
      if (best < Math.max(0.15, p.width * 0.7)) {
        // quel tronçon de contrôle est le plus proche de ce point ?
        let bs = 1e9;
        for (let i = 0; i < p.pts.length - 1; i++) {
          const a = p.pts[i], b = p.pts[i + 1];
          const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
          const tt = clamp(((local.x - a[0]) * dx + (local.z - a[1]) * dz) / l2, 0, 1);
          const d2 = Math.hypot(local.x - (a[0] + dx * tt), local.z - (a[1] + dz * tt));
          if (d2 < bs) { bs = d2; insertAt = i + 1; }
        }
      }
    }
  }
  p.pts.splice(insertAt, 0, [r3(local.x), r3(local.z)]);
  rebuildPath(p);
  refreshHandles();
  $('pathPanelState').textContent = `${p.kind === 'quay' ? 'Quai' : p.kind === 'wall' ? 'Mur' : 'Tracé'} en cours · ${p.pts.length} point(s) (Entrée pour terminer)`;
}
function deletePath() {
  if (!activePath) return;
  const m = pathMeshes.get(activePath);
  if (m) { world.remove(m); m.geometry.dispose(); pathMeshes.delete(activePath); }
  pathsData = pathsData.filter((q) => q !== activePath);
  deselectPathOnly();
  setStatus('Chemin supprimé');
}
// ruban sous le curseur ? (pour sélectionner un chemin en cliquant dessus)
function pickPath() {
  const hit = raycaster.intersectObjects([...pathMeshes.values()], false)[0];
  return hit ? hit.object.userData.path : null;
}

// les réglages modifient le chemin actif en direct
// ----- murs : réglages, ouvertures (porte, grille), plantes -----
const WALL_IDS = ['wallType', 'wallH', 'wallT', 'wallColor', 'wallCap', 'wallPillars', 'wallClosed', 'wallPlant', 'wallPlantAmt', 'wallPlantSide'];
let wallOpenIdx = -1;
function fillWallUi(p) {
  $('wallType').value = p.type; $('wallH').value = p.h; $('wallT').value = p.t; $('wallColor').value = p.color;
  $('wallCap').checked = p.cap; $('wallPillars').checked = p.pillars; $('wallClosed').checked = !!p.closed;
  $('wallPlant').value = p.plant; $('wallPlantAmt').value = p.plantAmt; $('wallPlantSide').value = p.plantSide;
  wallOpenIdx = p.openings.length ? Math.min(Math.max(wallOpenIdx, 0), p.openings.length - 1) : -1;
  fillOpeningUi(p);
  showValues();
}
function fillOpeningUi(p) {
  const sel = $('wallOpenSel'), names = { door: 'Porte', doorarch: 'Porte cintrée', gate: 'Grille', gatearch: 'Grille cintrée', arch: 'Passage' };
  sel.innerHTML = '';
  p.openings.forEach((o, i) => { const op = document.createElement('option'); op.value = i; op.textContent = (i + 1) + '. ' + names[o.kind]; sel.appendChild(op); });
  const o = p.openings[wallOpenIdx];
  $('wallOpenBox').hidden = !o;
  if (!o) return;
  sel.value = wallOpenIdx;
  $('wallOpenKind').value = o.kind; $('wallOpenPos').value = Math.round(o.pos * 100); $('wallOpenW').value = o.w; $('wallOpenH').value = o.h ?? 0.34; $('wallOpenColor').value = o.color; $('wallOpenAngle').value = o.open;
  showValues();
}
WALL_IDS.forEach((id) => $(id).addEventListener('input', () => {
  const p = activePath;
  if (id === 'wallType') { const d = WALL_TYPES[$('wallType').value]; if (d) { $('wallColor').value = d.color; } }
  if (!p || p.kind !== 'wall') return;
  p.type = $('wallType').value; p.h = num('wallH'); p.t = num('wallT'); p.color = $('wallColor').value; p.cap = $('wallCap').checked; p.pillars = $('wallPillars').checked;
  p.closed = $('wallClosed').checked; p.plant = $('wallPlant').value; p.plantAmt = num('wallPlantAmt'); p.plantSide = $('wallPlantSide').value;
  rebuildPath(p);
}));
$('wallOpenSel').addEventListener('change', () => { wallOpenIdx = +$('wallOpenSel').value; if (activePath?.kind === 'wall') fillOpeningUi(activePath); });
['wallOpenKind', 'wallOpenPos', 'wallOpenW', 'wallOpenH', 'wallOpenColor', 'wallOpenAngle'].forEach((id) => $(id).addEventListener('input', () => {
  const p = activePath, o = p?.kind === 'wall' && p.openings[wallOpenIdx];
  if (!o) return;
  o.kind = $('wallOpenKind').value; o.pos = num('wallOpenPos') / 100; o.w = num('wallOpenW'); o.h = num('wallOpenH'); o.color = $('wallOpenColor').value; o.open = num('wallOpenAngle');
  if (id === 'wallOpenKind') { // couleur par défaut du type d'ouverture
    o.color = o.kind === 'door' || o.kind === 'doorarch' ? '#7a5230' : o.kind === 'arch' ? '#7a5230' : '#2e3238';
    $('wallOpenColor').value = o.color;
  }
  rebuildPath(p);
}));
function addOpening(kind) {
  const p = activePath;
  if (!p || p.kind !== 'wall') { setStatus("Sélectionne un mur (outil « Mur » ou clic sur un mur) pour y ajouter une porte ou une grille."); return; }
  const used = p.openings.map((o) => o.pos);
  let pos = 0.5;
  for (const c of [0.5, 0.25, 0.75, 0.125, 0.375, 0.625, 0.875]) if (used.every((u) => Math.abs(u - c) > 0.1)) { pos = c; break; }
  p.openings.push({ kind, pos, w: kind === 'door' || kind === 'doorarch' ? 0.2 : 0.3, color: kind === 'door' || kind === 'doorarch' ? '#7a5230' : kind === 'arch' ? '#7a5230' : '#2e3238', open: 0 });
  wallOpenIdx = p.openings.length - 1;
  fillOpeningUi(p);
  rebuildPath(p);
}
$('wallAddDoor').addEventListener('click', () => addOpening('door'));
$('wallAddDoorArch').addEventListener('click', () => addOpening('doorarch'));
$('wallAddGate').addEventListener('click', () => addOpening('gate'));
$('wallAddArch').addEventListener('click', () => addOpening('arch'));
$('wallOpenDel').addEventListener('click', () => {
  const p = activePath;
  if (!p || p.kind !== 'wall' || wallOpenIdx < 0) return;
  p.openings.splice(wallOpenIdx, 1);
  wallOpenIdx = Math.min(wallOpenIdx, p.openings.length - 1);
  fillOpeningUi(p);
  rebuildPath(p);
});
$('wallDel').addEventListener('click', deletePath);
$('wallNew').addEventListener('click', () => { deselectPathOnly(); setBrushTool('wall'); setStatus('Clique sur le sol pour poser les points du mur. Entrée pour terminer.'); });
const PATH_IDS = ['pathMat', 'pathWidth', 'pathCurve', 'pathLine', 'pathClosed', 'pathWall', 'pathWallH', 'pathWallT', 'pathWallColor'];
PATH_IDS.forEach((id) =>
  $(id).addEventListener('input', () => {
    const p = activePath;
    if (!p || p.kind === 'wall') return;
    p.mat = $('pathMat').value; p.width = num('pathWidth'); p.curve = $('pathCurve').value; p.lines = $('pathLine').checked;
    p.closed = $('pathClosed').checked; p.wall = $('pathWall').value; p.wallH = num('pathWallH'); p.wallT = num('pathWallT');
    p.wallColor = $('pathWallColor').value;
    rebuildPath(p);
  })
);
$('pathNew').addEventListener('click', () => { deselectPathOnly(); setBrushTool('path'); setStatus('Clique sur le sol pour tracer un nouveau chemin.'); });
$('pathFinish').addEventListener('click', () => { deselectPathOnly(); setBrushTool('none'); });
$('pathDel').addEventListener('click', deletePath);
const isLineTool = () => ['path', 'quay', 'wall'].includes($('brush').value); // outils qui tracent une ligne
function setBrushTool(b) { $('brush').value = b; $('brush').dispatchEvent(new Event('change')); }

// Sélection tolérante : les petits objets (herbe fine, pierres, poissons…) sont attrapés si le clic passe
// près d'eux, pas seulement sur un triangle exact. Sinon le clic « tombe » entre les brins et la caméra tourne.
const _pc = new THREE.Vector3(), _pp = new THREE.Vector3();
function pickObject() {
  const hit = raycaster.intersectObjects(trees, false)[0];
  const o = raycaster.ray.origin, dd = raycaster.ray.direction;
  let best = null;
  for (const m of trees) {
    const u = m.userData;
    if (!(u.tuft || u.rock || u.fish || u.sign || u.bench || u.stairs || u.bridge || u.flower || u.lily || u.duck) || !m.visible) continue;
    const ws = world.scale.x * (m.scale.x / (u.baseScale || 1));
    const worldR = u.radius * ws;
    _pc.copy(m.position);
    _pc.y += u.radius * 0.5; // centre approximatif de l'objet
    world.localToWorld(_pc);
    const t = _pc.clone().sub(o).dot(dd);
    if (t <= 0) continue;
    _pp.copy(o).addScaledVector(dd, t);
    const dist = _pp.distanceTo(_pc);
    // tolérance : au moins 1,6 % de la distance à la caméra (≈ une quinzaine de pixels)
    if (dist < Math.max(worldR * 1.1, t * 0.016) && (!best || t < best.t)) best = { object: m, t, point: _pp.clone() };
  }
  if (best && (!hit || best.t < hit.distance + 0.5)) return { object: best.object, point: best.point, distance: best.t };
  return hit;
}

// phase de capture : on passe avant OrbitControls pour qu'il ne tourne pas quand on attrape un arbre
dom.addEventListener('pointerdown', (e) => {
  if (atelier) { atelierPointerDown(e); return; }
  if (poseMode) { posePointerDown(e); return; } // modification de pose : seuls les points bleus captent le geste
  if (edit) { editPointerDown(e); return; } // modification avancée d'un arbre : ses propres gestes
  if (e.button !== 0) return;
  downAt = { x: e.clientX, y: e.clientY };
  setRay(e);
  world.updateMatrixWorld(true);
  // soleil : on l'attrape en priorité
  if (sunGizmo.visible && raycaster.intersectObject(sunGizmo, false)[0]) {
    e.stopImmediatePropagation();
    drag = { mode: 'sun' };
    controls.enabled = false;
    dom.setPointerCapture(e.pointerId);
    return;
  }
  // poignées du chemin actif : on les attrape avec n'importe quel outil (Maj + clic = supprimer le point)
  if (activePath && pathHandles.length) {
    const ph = raycaster.intersectObjects(pathHandles, false)[0];
    if (ph) {
      e.stopImmediatePropagation();
      const i = ph.object.userData.pathPoint;
      if (e.shiftKey) {
        activePath.pts.splice(i, 1);
        if (!activePath.pts.length) { deletePath(); return; } // plus aucun point : le chemin disparaît
        rebuildPath(activePath);
        refreshHandles();
        return;
      }
      drag = { mode: 'pathpt', idx: i };
      controls.enabled = false;
      dom.setPointerCapture(e.pointerId);
      return;
    }
  }
  // outil « Chemin » : un clic sur le sol ajoute un point (ou en insère un sur le tracé)
  if (isLineTool()) {
    const hit = groundMesh && raycaster.intersectObject(groundMesh, false)[0];
    if (!hit) return;
    e.stopImmediatePropagation();
    drag = { mode: 'pathclick' };
    controls.enabled = false;
    dom.setPointerCapture(e.pointerId);
    pathClick(world.worldToLocal(hit.point.clone()));
    return;
  }
  // pinceau actif : on travaille sur le sol, pas sur les arbres
  if ($('brush').value !== 'none') {
    const hit = groundMesh && raycaster.intersectObject(groundMesh, false)[0];
    if (!hit) return;
    e.stopImmediatePropagation();
    if ($('brush').value === 'level' && e.shiftKey) { // Maj + clic : prend la hauteur du point cliqué
      $('levelH').value = (Math.round(world.worldToLocal(hit.point.clone()).y * 100) / 100).toFixed(2);
      showValues();
      setStatus('Hauteur de nivellement : ' + $('levelH').value);
      return;
    }
    drag = { mode: 'paint', point: world.worldToLocal(hit.point.clone()), last: null };
    controls.enabled = false;
    dom.setPointerCapture(e.pointerId);
    brushStroke();
    brushTick(0.06); // premier coup immédiat, sans attendre l'image suivante
    return;
  }
  // poignée de rotation (prioritaire sur les arbres)
  if (selected && raycaster.intersectObject(handle, false)[0]) {
    e.stopImmediatePropagation();
    const base = world.localToWorld(selected.position.clone());
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -base.y);
    const p = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, p);
    drag = { mode: 'rotate', plane, base, startRot: selected.rotation.y, a0: Math.atan2(p.x - base.x, p.z - base.z) };
    controls.enabled = false;
    dom.setPointerCapture(e.pointerId);
    return;
  }
  const hit = pickObject();
  if (!hit) return;
  e.stopImmediatePropagation();
  const fresh = hit.object !== selected;
  select(hit.object);
  if (fresh) revealMenuFor(hit.object);
  // plan horizontal à la hauteur du point attrapé : il reste sous le curseur pendant le glissement
  const wp = world.localToWorld(hit.object.position.clone());
  drag = { mode: 'move', plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y), offset: wp.sub(hit.point) };
  controls.enabled = false;
  dom.setPointerCapture(e.pointerId);
}, { capture: true });

dom.addEventListener('pointermove', (e) => {
  if (atelier) { atelierPointerMove(e); return; }
  if (poseMode) { posePointerMove(e); return; }
  if (edit) { editPointerMove(e); return; }
  if (drag?.mode === 'sun') {
    // le curseur se projette sur la sphère du soleil (on garde le point le plus proche de la boule)
    setRay(e);
    const o = raycaster.ray.origin, dd = raycaster.ray.direction;
    const b = o.dot(dd), disc = b * b - (o.lengthSq() - sunDist * sunDist);
    let t = -b; // sans intersection : point le plus proche du centre
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      const p0 = o.clone().addScaledVector(dd, -b - s), p1 = o.clone().addScaledVector(dd, -b + s);
      t = p0.distanceTo(sunGizmo.position) <= p1.distanceTo(sunGizmo.position) ? -b - s : -b + s;
    }
    _v.copy(o).addScaledVector(dd, t).normalize();
    $('sunEl').value = Math.round(clamp((Math.asin(_v.y) * 180) / Math.PI, 2, 88));
    $('sunAz').value = Math.round((((Math.atan2(_v.x, _v.z) * 180) / Math.PI) % 360 + 360) % 360);
    $('ambiance').value = 'custom';
    showValues();
    applyEnv(); // recalcule aussi la couleur de la lumière et du ciel
    return;
  }
  if (drag?.mode === 'pathpt' && activePath) {
    // déplacement d'un point de contrôle : il suit le curseur sur le sol, le chemin se redessine
    setRay(e);
    const hit = groundMesh && raycaster.intersectObject(groundMesh, false)[0];
    if (hit) {
      const lp = world.worldToLocal(hit.point.clone());
      activePath.pts[drag.idx] = [r3(lp.x), r3(lp.z)];
      rebuildPath(activePath);
    }
    return;
  }
  if (drag?.mode === 'pathclick') return;
  if (isLineTool()) { brushRing.visible = false; return; }
  if ($('brush').value !== 'none' && groundMesh) {
    // curseur du pinceau sur le sol ; pendant un clic maintenu, il pilote aussi le coup de pinceau
    setRay(e);
    const hit = raycaster.intersectObject(groundMesh, false)[0];
    brushRing.visible = !!hit;
    if (hit) {
      const lp = world.worldToLocal(hit.point.clone());
      brushRing.position.set(lp.x, lp.y + 0.05, lp.z);
      brushRing.scale.setScalar(num('brushSize'));
      if (drag?.mode === 'paint') { drag.point = lp; brushStroke(); }
    }
    return;
  }
  if (!drag || !selected) return;
  setRay(e);
  if (!raycaster.ray.intersectPlane(drag.plane, _v)) return;
  if (drag.mode === 'rotate') {
    // angle du curseur autour du pied de l'arbre, sur le plan du sol
    const a = Math.atan2(_v.x - drag.base.x, _v.z - drag.base.z);
    selected.rotation.y = drag.startRot + (a - drag.a0);
    $('selRot').value = Math.round((((selected.rotation.y * 180) / Math.PI) % 360 + 360) % 360);
    showValues();
    placeRing();
    return;
  }
  const local = world.worldToLocal(_v.add(drag.offset).clone());
  const d = Math.hypot(local.x, local.z), lim = groundR * 0.97; // reste sur le terrain
  if (d > lim) { local.x *= lim / d; local.z *= lim / d; }
  const fish = selected.userData.fish; // un poisson reste à sa profondeur, il ne suit pas le fond
  selected.position.set(local.x, fish ? fishY(local.x, local.z, fish.d) : selected.userData.lily || selected.userData.duck ? lilyY() : selected.userData.wagtail && isTeal(selected.userData.wagtail.d) ? tealY(selected.userData.wagtail.d, selected.scale.x) : selected.userData.bridge ? bridgeBaseY(selected.userData.bridge, local.x, local.z) : (currentHF ? currentHF(local.x, local.z) : 0) + (selected.userData.stairs?.dy || 0), local.z); // suit le relief
  placeRing();
});

window.addEventListener('pointerup', (e) => {
  if (atelier) { atelierPointerUp(e); return; }
  if (poseMode) { posePointerUp(e); return; }
  if (edit) { editPointerUp(e); return; }
  if (drag) {
    // fin d'un coup de pinceau : les chemins se reposent sur le nouveau relief
    if (drag.mode === 'paint' && pathsData.length) rebuildPaths();
    const moved = (drag.mode === 'move' || drag.mode === 'rotate') && selected?.userData.bridge;
    drag = null;
    controls.enabled = true;
    if (moved) liveEdit('bridge'); // les pieds du pont se recalent sur le terrain à la nouvelle place
  } else if (downAt && e.target === dom && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4) {
    // simple clic : sur un chemin on le sélectionne, dans le vide on désélectionne tout
    setRay(e);
    if (!pickObject()) {
      const pp = pickPath();
      if (pp) { if (pp !== activePath) selectPath(pp); }
      else { select(null); deselectPathOnly(); }
    }
  }
  downAt = null;
});

window.addEventListener('keydown', (e) => {
  if (atelier) { atelierKeyDown(e); return; }
  if (poseMode) { if (e.key === 'Escape') { exitPose(); e.preventDefault(); } return; }
  if (edit) { editKey(e); return; }
  const free = e.target === document.body || e.target === dom;
  if (free && e.key === 'Enter' && isLineTool()) { deselectPathOnly(); setBrushTool('none'); return; } // fin du tracé
  if (free && (e.key === 'Delete' || e.key === 'Backspace') && activePath) {
    if (isLineTool() && activePath.pts.length > 1) { // en traçant : retire le dernier point
      activePath.pts.pop();
      rebuildPath(activePath);
      refreshHandles();
    } else deletePath();
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && free) deleteSelected();
  if (e.key === 'Escape') {
    if ($('brush').value !== 'none') { $('brush').value = 'none'; $('brush').dispatchEvent(new Event('change')); } // quitte l'outil
    else select(null);
  }
});

$('selScale').addEventListener('input', () => {
  if (!selected) return;
  showValues();
  selected.scale.setScalar(selected.userData.baseScale * num('selScale'));
  placeRing();
});
$('selRot').addEventListener('input', () => {
  if (!selected) return;
  showValues();
  selected.rotation.y = (num('selRot') * Math.PI) / 180;
  placeRing();
});
$('selDelete').addEventListener('click', deleteSelected);
$('selDup').addEventListener('click', duplicateSelected);

// ---------- Modification avancée d'un arbre : les branches se retouchent à la souris ----------
// Le mode isole l'arbre (tout le reste de la scène est caché) et travaille sur son squelette (voir `genSkeleton`) :
// sélectionner une branche, orienter son bout, la faire glisser sur sa branche parente, en ajouter, en supprimer.
// Les sous-branches suivent toujours leur branche. Chaque action est annulable / rétablissable.
let edit = null; // état du mode (null = mode normal)
const emptyGeo = new THREE.BufferGeometry();
const editMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const matEditSel = editMat(0xffd24a, 0.9);   // branche sélectionnée
const matEditHover = editMat(0x9fd0ff, 0.55); // branche survolée
const matEditTip = new THREE.MeshBasicMaterial({ color: 0xff7a1a, depthTest: false, transparent: true });  // poignée du bout
const matEditBase = new THREE.MeshBasicMaterial({ color: 0x3fb6ff, depthTest: false, transparent: true }); // poignée de la base
const matEditMark = new THREE.MeshBasicMaterial({ color: 0x6fe39a, depthTest: false, transparent: true }); // point d'attache (outil Ajouter)
const EDIT_HINTS = {
  select: 'Clique une branche pour la sélectionner. Glisse la boule orange (bout) pour l\'orienter (Maj = garder la longueur), la boule bleue (base) pour la déplacer le long de sa branche parente. Glisse dans le vide pour tourner la vue.',
  add: 'Clique un point d\'une branche puis glisse pour diriger la nouvelle branche ; relâche pour valider.',
};

const branchById = (sk, id) => sk.b.find((b) => b.id === id);
// la branche et toutes ses descendantes (les parents précèdent toujours leurs enfants dans la liste)
function subtreeIds(sk, id) {
  const ids = new Set([id]);
  for (const b of sk.b) if (ids.has(b.p)) ids.add(b.id);
  return ids;
}

// cylindres légèrement plus gros que la branche : la surbrillance
function branchOverlayGeo(P) {
  const b = P.b, n = b.s.length + 1, len = b.len / n, gs = [];
  for (let s = 0; s < n; s++) {
    const g = new THREE.CylinderGeometry(b.rad * (1 - (0.45 * (s + 1)) / n) * 1.25 + 0.004, b.rad * (1 - (0.45 * s) / n) * 1.25 + 0.004, len * 1.02, 8, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, P.ds[s]));
    g.translate(P.ps[s].x + (P.ds[s].x * len) / 2, P.ps[s].y + (P.ds[s].y * len) / 2, P.ps[s].z + (P.ds[s].z * len) / 2);
    gs.push(g);
  }
  const g = mergeGeometries(gs);
  gs.forEach((x) => x.dispose());
  return g;
}
function setOverlay(mesh, id) {
  if (mesh.geometry !== emptyGeo) mesh.geometry.dispose();
  const P = id == null ? null : edit.paths.get(id);
  mesh.geometry = P ? branchOverlayGeo(P) : emptyGeo;
  mesh.visible = !!P;
}

// point le plus proche entre le rayon (o, d) et le segment AB : { t sur le rayon, k fraction sur le segment, dist }
function raySeg(o, d, A, B) {
  const ux = B.x - A.x, uy = B.y - A.y, uz = B.z - A.z, wx = A.x - o.x, wy = A.y - o.y, wz = A.z - o.z;
  const b = d.x * ux + d.y * uy + d.z * uz, c = ux * ux + uy * uy + uz * uz;
  const dw = d.x * wx + d.y * wy + d.z * wz, e = ux * wx + uy * wy + uz * wz;
  const den = c - b * b;
  const k = clamp(den > 1e-9 * c ? (dw * b - e) / den : 0.5, 0, 1);
  const t = Math.max(0, dw + k * b);
  const dx = o.x + d.x * t - (A.x + ux * k), dy = o.y + d.y * t - (A.y + uy * k), dz = o.z + d.z * t - (A.z + uz * k);
  return { t, k, dist: Math.hypot(dx, dy, dz) };
}

// branche sous le curseur (tolérance d'au moins ~7 pixels pour attraper les fines) : { id, at, t }
function pickBranch() {
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  const px = (2 * Math.tan((camera.fov * Math.PI) / 360)) / dom.clientHeight; // taille d'un pixel par unité de distance
  let best = null;
  for (const P of edit.paths.values()) {
    const b = P.b, n = b.s.length + 1;
    for (let s = 0; s < n; s++) {
      const h = raySeg(o, d, P.ps[s], P.ps[s + 1]);
      const tol = Math.max(b.rad * (1 - (0.45 * (s + h.k)) / n) * 1.3, h.t * px * 7);
      if (h.dist < tol && (!best || h.t < best.t)) best = { id: b.id, at: (s + h.k) / n, t: h.t };
    }
  }
  return best;
}
// fraction de la branche P la plus proche du rayon : sert à faire glisser une branche le long de son parent
function closestAt(P) {
  const o = raycaster.ray.origin, d = raycaster.ray.direction, n = P.b.s.length + 1;
  let best = null;
  for (let s = 0; s < n; s++) {
    const h = raySeg(o, d, P.ps[s], P.ps[s + 1]);
    if (!best || h.dist < best.dist) best = { dist: h.dist, at: (s + h.k) / n };
  }
  return best.at;
}
const facingPlane = (point) => new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), point);

// oriente une branche : son bout (corde base -> bout) vise `target`, avec la longueur qui suit sauf si keepLen ;
// ses descendantes tournent avec elle autour de sa base
function aimBranch(sk, id, target, keepLen) {
  const b = branchById(sk, id), base = skelPaths(sk).get(id).ps[0]; // la base ne dépend que des parents : elle ne bouge pas
  const want = target.clone().sub(base), wl = want.length();
  if (wl < 1e-4) return;
  want.divideScalar(wl);
  const ids = subtreeIds(sk, id), Q = new THREE.Quaternion();
  for (let it = 0; it < 3; it++) { // la gravité courbe la branche : quelques passes pour que le bout rejoigne la cible
    const P = tracePath(b, base, sk.grav);
    const chord = P.ps[P.ps.length - 1].clone().sub(base), cl = chord.length();
    if (cl < 1e-6) break;
    Q.setFromUnitVectors(chord.divideScalar(cl), want);
    for (const c of sk.b) {
      if (!ids.has(c.id)) continue;
      c.d = new THREE.Vector3(...c.d).applyQuaternion(Q).toArray();
      c.a = new THREE.Vector3(...c.a).applyQuaternion(Q).toArray();
    }
    if (!keepLen) b.len = clamp(b.len * (wl / cl), 0.05, 5);
  }
  for (const c of sk.b) if (ids.has(c.id)) { c.d = c.d.map(rnd4); c.a = c.a.map(rnd4); c.len = rnd4(c.len); }
}

// reconstruit l'arbre édité (live), son tracé et les surbrillances
function rebuildEdit() {
  const t = makeTree(edit.q, edit.seed, edit.sk, { noLeaves: !edit.leaves });
  edit.mesh.geometry.dispose();
  edit.mesh.geometry = t.geo;
  edit.paths = t.paths;
  edit.bb = t.bb;
  if (edit.sel != null && !edit.paths.has(edit.sel)) edit.sel = null;
  setOverlay(edit.selMesh, edit.sel);
  setOverlay(edit.hoverMesh, edit.hover !== edit.sel ? edit.hover : null);
  placeEditHandles();
  updateEditUi();
  setStatus(`Modification avancée · ${edit.sk.b.length} branches · ${t.geo.attributes.position.count / 3} faces`);
}

// poignées de la branche sélectionnée, de taille constante à l'écran
function placeEditHandles() {
  const P = edit.sel == null ? null : edit.paths.get(edit.sel);
  edit.hTip.visible = !!P;
  edit.hBase.visible = !!P && P.b.p !== null;
  if (!P) return;
  edit.hTip.position.copy(P.ps[P.ps.length - 1]);
  edit.hBase.position.copy(P.ps[0]);
  edit.hTip.scale.setScalar(camera.position.distanceTo(edit.hTip.position) * 0.014);
  edit.hBase.scale.setScalar(camera.position.distanceTo(edit.hBase.position) * 0.012);
}

function updateEditUi() {
  const b = edit.sel == null ? null : branchById(edit.sk, edit.sel);
  $('edUndo').disabled = !edit.undo.length;
  $('edRedo').disabled = !edit.redo.length;
  $('edDel').disabled = !b || b.p === null; // le tronc ne se supprime pas
}

function setEditTool(tool) {
  edit.tool = tool;
  $('edSelect').classList.toggle('active', tool === 'select');
  $('edAdd').classList.toggle('active', tool === 'add');
  $('edHint').textContent = EDIT_HINTS[tool];
  edit.marker.visible = false;
}
function selectBranch(id) {
  edit.sel = id;
  setOverlay(edit.selMesh, id);
  setOverlay(edit.hoverMesh, edit.hover !== id ? edit.hover : null);
  placeEditHandles();
  updateEditUi();
}

// recopie le squelette dans la recette de l'arbre : la sauvegarde automatique le garde même avant de terminer
function commitEdit() {
  const spec = edit.spec, json = JSON.stringify(edit.sk);
  if (json !== edit.initial) spec.skeleton = JSON.parse(json);
  else if (edit.origSkel) spec.skeleton = edit.origSkel;
  else delete spec.skeleton;
  updateEditUi();
}
// enregistre une étape d'historique si la modification a vraiment changé quelque chose
function pushHistory(snap) {
  if (JSON.stringify(edit.sk) === snap) return;
  edit.undo.push(snap);
  if (edit.undo.length > 80) edit.undo.shift();
  edit.redo.length = 0;
  commitEdit();
}
function editUndo() {
  if (!edit.undo.length) return;
  edit.redo.push(JSON.stringify(edit.sk));
  edit.sk = JSON.parse(edit.undo.pop());
  rebuildEdit();
  commitEdit();
}
function editRedo() {
  if (!edit.redo.length) return;
  edit.undo.push(JSON.stringify(edit.sk));
  edit.sk = JSON.parse(edit.redo.pop());
  rebuildEdit();
  commitEdit();
}
// supprime la branche sélectionnée et ses sous-branches
function editDelete() {
  const b = edit.sel == null ? null : branchById(edit.sk, edit.sel);
  if (!b || b.p === null) return;
  const snap = JSON.stringify(edit.sk), ids = subtreeIds(edit.sk, b.id);
  edit.sk.b = edit.sk.b.filter((c) => !ids.has(c.id));
  edit.sel = null;
  edit.hover = null;
  rebuildEdit();
  pushHistory(snap);
}

// crée une branche enfant au point `pk` d'une branche ; renvoie son identifiant
function addBranchAt(pk) {
  const sk = edit.sk, q = edit.q, par = branchById(sk, pk.id), P = edit.paths.get(pk.id), n = par.s.length + 1;
  const at = clamp(pk.at, 0.1, 1), tan = P.ds[Math.min(n - 1, Math.floor(at * n))].clone();
  // direction par défaut : sur le côté (à droite à l'écran), ouverte de l'angle des fourches ; on la corrige ensuite en glissant
  const side = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  side.addScaledVector(tan, -side.dot(tan));
  if (side.lengthSq() < 1e-6) side.copy(perpTo(tan));
  side.normalize();
  const ang = clamp((q.angle * Math.PI) / 180, 0.5, 1.2);
  const dir = tan.clone().multiplyScalar(Math.cos(ang)).addScaledVector(side, Math.sin(ang));
  dir.y += 0.12;
  dir.normalize();
  const s = [rnd4(q.twist * 1.1), rnd4(q.curv * 0.32)];
  const b = { id: sk.nid++, p: par.id, at: rnd4(at), d: vec3(dir), a: vec3(perpTo(dir)), len: rnd4(par.len * q.lenR), rad: rnd4(Math.max(0.006, par.rad * q.radR)), lv: par.lv + 1, s: [s, [...s]] };
  sk.b.push(b);
  return b.id;
}

function editPointerDown(e) {
  if (e.button !== 0) return; // clic droit / molette : la caméra
  camera.updateMatrixWorld();
  edit.root.updateMatrixWorld(true);
  setRay(e);
  edit.down = { x: e.clientX, y: e.clientY };
  const snap = JSON.stringify(edit.sk);
  const grab = (d) => {
    e.stopImmediatePropagation(); // avant OrbitControls : la caméra ne tourne pas quand on attrape une branche
    edit.drag = { snap, moved: false, ...d };
    controls.enabled = false;
    try { dom.setPointerCapture(e.pointerId); } catch {}
  };
  // poignées de la branche sélectionnée
  if (edit.sel != null) {
    const P = edit.paths.get(edit.sel);
    const hit = raycaster.intersectObjects([edit.hTip, ...(edit.hBase.visible ? [edit.hBase] : [])], false)[0];
    if (hit && hit.object === edit.hTip) {
      const tip = P.ps[P.ps.length - 1], plane = facingPlane(tip), h0 = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, h0);
      grab({ kind: 'tip', id: edit.sel, plane, off: tip.clone().sub(h0) });
      return;
    }
    if (hit) { // base : la branche glisse le long de sa branche parente
      grab({ kind: 'slide', id: edit.sel, at0: closestAt(edit.paths.get(P.b.p)), at1: P.b.at });
      return;
    }
  }
  const pk = pickBranch();
  if (edit.tool === 'add') {
    if (!pk) return; // dans le vide : la caméra tourne
    const id = addBranchAt(pk);
    edit.sel = id;
    rebuildEdit();
    const base = edit.paths.get(id).ps[0];
    // les gestes repartent du squelette AVEC la nouvelle branche ; l'historique garde l'état d'avant l'ajout
    grab({ kind: 'tip', id, plane: facingPlane(base), off: new THREE.Vector3(), hist: snap, snap: JSON.stringify(edit.sk) });
    return;
  }
  if (!pk) return; // dans le vide : la caméra tourne (un clic sans glisser désélectionne, voir editPointerUp)
  selectBranch(pk.id);
  const b = branchById(edit.sk, pk.id);
  if (b.p !== null) grab({ kind: 'slide', id: pk.id, at0: closestAt(edit.paths.get(b.p)), at1: b.at }); // glisser le corps = glisser sur le parent
}

function editPointerMove(e) {
  camera.updateMatrixWorld();
  const dr = edit.drag;
  if (!dr) {
    if (e.buttons) return; // la caméra est en train de tourner
    // survol : la branche sous le curseur s'éclaire légèrement
    edit.root.updateMatrixWorld(true);
    setRay(e);
    const pk = pickBranch();
    const id = pk ? pk.id : null;
    if (id !== edit.hover) {
      edit.hover = id;
      setOverlay(edit.hoverMesh, id !== edit.sel ? id : null);
    }
    edit.marker.visible = edit.tool === 'add' && !!pk;
    if (pk && edit.marker.visible) {
      const P = edit.paths.get(pk.id);
      edit.marker.position.copy(pathPoint(P.ps, pk.at));
      edit.marker.scale.setScalar(camera.position.distanceTo(edit.marker.position) * 0.014);
    }
    dom.style.cursor = pk ? 'pointer' : '';
    return;
  }
  if (!dr.moved && Math.hypot(e.clientX - edit.down.x, e.clientY - edit.down.y) < 4) return; // simple clic
  dr.moved = true;
  setRay(e);
  const sk = JSON.parse(dr.snap);
  if (dr.kind === 'tip') {
    const p = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(dr.plane, p)) return;
    aimBranch(sk, dr.id, p.add(dr.off), e.shiftKey);
  } else {
    const b = branchById(sk, dr.id), parent = edit.paths.get(b.p);
    b.at = rnd4(clamp(dr.at1 + closestAt(parent) - dr.at0, 0.08, 1));
  }
  edit.sk = sk;
  rebuildEdit();
}

function editPointerUp(e) {
  const dr = edit.drag, down = edit.down;
  edit.drag = null;
  edit.down = null;
  controls.enabled = true;
  if (dr) { pushHistory(dr.hist ?? dr.snap); return; }
  // simple clic dans le vide : on désélectionne la branche
  if (edit.tool === 'select' && down && e.target === dom && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) {
    camera.updateMatrixWorld();
    setRay(e);
    if (!pickBranch()) selectBranch(null);
  }
}

function editKey(e) {
  if (e.key === 'Escape') { stopEdit(); return; }
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) editRedo(); else editUndo(); }
  else if (mod && k === 'y') { e.preventDefault(); editRedo(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); editDelete(); }
}

// appelé à chaque image : les poignées gardent la même taille à l'écran
function editTick() {
  placeEditHandles();
}

function startEdit(tree) {
  const spec = tree.userData.spec;
  if (edit || !spec || !isBroad(spec.q)) return;
  const sk = validSkel(spec.skeleton) ? JSON.parse(JSON.stringify(spec.skeleton)) : genSkeleton(spec.q, spec.seed);
  select(null);
  const root = new THREE.Group();
  const mk = (geo, mat, order) => { const m = new THREE.Mesh(geo, mat); m.renderOrder = order; root.add(m); return m; };
  edit = {
    tree, spec, q: spec.q, seed: spec.seed, sk, initial: JSON.stringify(sk), origSkel: spec.skeleton,
    tool: 'select', sel: null, hover: null, undo: [], redo: [], leaves: true, drag: null, down: null, paths: null, bb: null,
    cam: { position: camera.position.toArray().map(r3), target: controls.target.toArray().map(r3) },
    root,
    mesh: mk(new THREE.BufferGeometry(), matTree, 0),
    selMesh: mk(emptyGeo, matEditSel, 5),
    hoverMesh: mk(emptyGeo, matEditHover, 4),
    hTip: mk(new THREE.SphereGeometry(1, 14, 10), matEditTip, 11),
    hBase: mk(new THREE.SphereGeometry(1, 14, 10), matEditBase, 11),
    marker: mk(new THREE.SphereGeometry(1, 12, 8), matEditMark, 10),
  };
  edit.selMesh.visible = edit.hoverMesh.visible = edit.hTip.visible = edit.hBase.visible = edit.marker.visible = false;
  scene.add(root);
  world.visible = false;            // on ne voit plus que l'arbre
  sunGizmo.visible = sunLine.visible = false;
  $('panel').classList.add('locked');
  document.body.classList.add('editing'); // cache la barre d'outils du terrain
  document.activeElement?.blur();
  $('editBar').hidden = false;
  $('edLeaves').checked = true;
  setEditTool('select');
  rebuildEdit();
  // cadre l'arbre en gardant l'angle de vue actuel
  const c = edit.bb.getCenter(new THREE.Vector3()), size = edit.bb.getSize(new THREE.Vector3());
  const off = camera.position.clone().sub(controls.target).normalize();
  controls.target.copy(c);
  camera.position.copy(c).addScaledVector(off, Math.max(size.x, size.y, size.z) * 1.5 + 0.5);
  controls.update();
}

// termine : l'arbre édité remplace l'ancien à la même place, le reste de la scène réapparaît
function stopEdit() {
  const E = edit;
  edit = null; // d'abord : les gestionnaires redeviennent ceux du mode normal
  controls.enabled = true;
  dom.style.cursor = '';
  if (JSON.stringify(E.sk) !== E.initial) {
    const t = makeTree(E.q, E.seed, E.sk);
    const tree = E.tree;
    tree.geometry.dispose();
    tree.geometry = t.geo;
    tree.userData.trunk = t.trunk;
    tree.userData.spots = t.spots;
    tree.userData.radius = t.radial * tree.userData.baseScale;
    // les régénérations qui ne changent pas la forme (couleurs, sol…) retrouveront ce squelette
    skelStore.set(E.seed, { sig: shapeSig(E.q), skel: E.spec.skeleton });
  }
  scene.remove(E.root);
  E.root.traverse((m) => { if (m.geometry && m.geometry !== emptyGeo) m.geometry.dispose(); });
  world.visible = true;
  $('panel').classList.remove('locked');
  document.body.classList.remove('editing');
  $('editBar').hidden = true;
  camera.position.fromArray(E.cam.position);
  controls.target.fromArray(E.cam.target);
  controls.update();
  applyEnv(); // rend la boule de soleil si elle est activée
  select(E.tree);
  rebuildLeaves();
  setStatus(`${trees.length} objet(s) · ${faceCount()} faces`);
}

$('selEdit').addEventListener('click', () => { if (selected) startEdit(selected); });
$('edSelect').addEventListener('click', () => edit && setEditTool('select'));
$('edAdd').addEventListener('click', () => edit && setEditTool('add'));
$('edDel').addEventListener('click', () => edit && editDelete());
$('edUndo').addEventListener('click', () => edit && editUndo());
$('edRedo').addEventListener('click', () => edit && editRedo());
$('edDone').addEventListener('click', () => edit && stopEdit());
$('edLeaves').addEventListener('change', () => { if (!edit) return; edit.leaves = $('edLeaves').checked; rebuildEdit(); });

// ---------- Enregistrement : la scène complète en JSON, relisible et modifiable ----------
const SCENE_FORMAT = 'lowpoly-trees';
const AUTOSAVE_KEY = 'lowpoly-trees-autosave';
const r3 = (v) => Math.round(v * 1000) / 1000;

function uiState() {
  const ui = {};
  document.querySelectorAll('#controls input, #controls select').forEach((el) => {
    if (!el.id || el.id === 'brush') return;
    ui[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return ui;
}

function sceneData() {
  syncPeckers();
  const cells = [];
  for (let i = 0; i < sculpt.length; i++) if (Math.abs(sculpt[i]) > 0.002) cells.push(`${i}:${r3(sculpt[i])}`);
  return {
    format: SCENE_FORMAT,
    version: 1,
    savedAt: new Date().toISOString(),
    seed,
    mode: 'forest',
    ui: uiState(),
    world: { groundR: r3(groundR), scale: r3(world.scale.x), shadowRadius: r3(shadowRadius), viewScale: r3(viewScale) },
    camera: edit ? edit.cam : { position: camera.position.toArray().map(r3), target: controls.target.toArray().map(r3) }, // en modification avancée : la vue d'avant
    // chaque arbre : sa recette (graine + paramètres) et sa place ; modifier x / z / scale / rot suffit à le déplacer
    trees: trees.filter((t) => t.userData.spec).map((t) => ({
      spec: t.userData.spec, x: r3(t.position.x), z: r3(t.position.z),
      scale: r3(t.scale.x), rot: r3(t.rotation.y), radius: r3(t.userData.radius),
    })),
    rocks: rocksData,
    tufts: tuftsData,
    fish: fishData,
    signs: signsData,
    benches: benchesData,
    stairs: stairsData,
    bridges: bridgesData,
    herons: heronsData,
    peckers: peckersData,
    frogs: frogsData,
    wagtails: wagtailsData,
    customAnimals: customLibrary,
    flyers: flyersData,
    dragons: dragonsData,
    lilies: liliesData,
    ducks: ducksData,
    flowers: flowersData,
    insects: insectsData,
    paths: pathsData,
    paint: paintStamps.map((s) => [r3(s.x), r3(s.z), r3(s.r), s.mat]),
    sculpt: { grid: SN, half: SG, cells: cells.join(',') },
  };
}

// reconstruit toute la scène depuis le JSON (sans régénérer au hasard : chaque arbre vient de sa recette)
function loadScene(data) {
  if (!data || data.format !== SCENE_FORMAT) throw new Error('fichier non reconnu');
  for (const [id, v] of Object.entries(data.ui || {})) {
    const el = $(id);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  }
  // éclairage géré automatiquement : valeurs fixes, pas de boule de soleil
  $('shadows').checked = true; $('sunShow').checked = false; $('ambiance').value = 'day'; $('sunAz').value = 130; $('sunEl').value = 48;
  $('brush').value = 'none';
  setBrush();
  showValues();
  seed = data.seed ?? 1;
  sculpt.fill(0);
  String(data.sculpt?.cells || '').split(',').forEach((c) => {
    if (!c) return;
    const [i, v] = c.split(':');
    sculpt[+i] = +v;
  });
  paintStamps = (data.paint || []).map(([x, z, r, mat]) => ({ x, z, r, mat }));
  rocksData = data.rocks || [];
  tuftsData = data.tufts || [];
  fishData = data.fish || [];
  signsData = data.signs || [];
  benchesData = data.benches || [];
  stairsData = data.stairs || [];
  bridgesData = data.bridges || [];
  heronsData = data.herons || [];
  peckersData = data.peckers || [];
  frogsData = data.frogs || [];
  mergeCustomLibrary(data.customAnimals);
  wagtailsData = data.wagtails || [];
  flyersData = data.flyers || [];
  dragonsData = data.dragons || [];
  liliesData = data.lilies || [];
  ducksData = data.ducks || [];
  flowersData = data.flowers || [];
  insectsData = data.insects || [];
  pathsData = data.paths || [];
  activePath = null;

  clearWorld();
  const q = params(), w = data.world || {};
  groundR = w.groundR ?? 3;
  const hasGround = data.mode === 'forest' || q.ground;
  currentHF = hasGround ? makeHeightFn(q.relief, q.hillSize, seed + 3, data.mode === 'tree', groundR) : null;
  if (hasGround) setGround(groundGeo(groundR, q.alba, mulberry32(seed + 7), currentHF, groundStyle()));
  skelStore.clear();
  (data.trees || []).forEach((t) => {
    const sk = isBroad(t.spec.q) && validSkel(t.spec.skeleton) ? t.spec.skeleton : null; // branches modifiées à la main
    if (sk) skelStore.set(t.spec.seed, { sig: shapeSig(t.spec.q), skel: sk });
    else delete t.spec.skeleton;
    const made = makeTree(t.spec.q, t.spec.seed, sk);
    Object.assign(addTree(made.geo, t.x, currentHF ? currentHF(t.x, t.z) : 0, t.z, t.scale, t.rot, t.radius).userData, { spec: t.spec, trunk: made.trunk, spots: made.spots });
  });
  restoreRocks();
  restoreTufts();
  restoreFish();
  restoreSigns();
  restoreBenches();
  restoreStairs();
  restoreBridges();
  restoreHerons();
  restorePeckers();
  restoreFrogs();
  restoreWagtails();
  restoreFlyers();
  restoreDragons();
  restoreLilies();
  restoreDucks();
  restoreFlowers();
  restoreInsects();
  rebuildLeaves();
  rebuildPaths();
  world.scale.setScalar(w.scale ?? 1);
  shadowRadius = w.shadowRadius ?? 3;
  viewScale = w.viewScale ?? 1;
  lastMode = data.mode;
  $('sceneDiam').value = Math.round(groundR * 2);
  showValues();
  if (data.camera) {
    camera.position.fromArray(data.camera.position);
    controls.target.fromArray(data.camera.target);
    controls.update();
  }
  applyEnv();
  setStatus(`Scène chargée · ${trees.length} objets · ${faceCount()} faces`);
}

// remet la caméra dans sa position de départ (utile si on s'est perdu en tournant)
$('resetView').addEventListener('click', () => {
  const forest = lastMode === 'forest';
  const dist = forest ? Math.max(9, (groundR - 1.2) * 2.6 + 4) : 9;
  camera.position.copy(controls.target).add(new THREE.Vector3(4.4, 1.5, 5.2));
  frameCamera(dist);
  controls.update();
});

// ---------- Scènes multiples (chacune enregistrée dans le navigateur) ----------
const SCENES_KEY = 'lowpoly-scenes'; // { current, list: [{ id, name }] }
const sceneKey = (id) => 'lowpoly-scene:' + id;
const saveIndex = () => { try { localStorage.setItem(SCENES_KEY, JSON.stringify(scenes)); } catch {} };
function readIndex() {
  let idx = null;
  try { idx = JSON.parse(localStorage.getItem(SCENES_KEY)); } catch {}
  if (!idx || !Array.isArray(idx.list) || !idx.list.length) {
    idx = { current: 's1', list: [{ id: 's1', name: 'Scène 1' }] };
    try { const old = localStorage.getItem(AUTOSAVE_KEY); if (old) localStorage.setItem(sceneKey('s1'), old); } catch {} // ancienne sauvegarde unique
  }
  if (!idx.list.some((s) => s.id === idx.current)) idx.current = idx.list[0].id;
  return idx;
}
const scenes = readIndex();
saveIndex();
// plusieurs onglets peuvent modifier la liste : avant toute modification on relit la liste enregistrée (sinon une liste périmée écraserait les scènes des autres onglets)
function syncIndex() {
  try {
    const s = JSON.parse(localStorage.getItem(SCENES_KEY));
    if (s && Array.isArray(s.list) && s.list.length) scenes.list = s.list;
  } catch {}
}
let noSave = false; // changement de scène : sans ça, la sauvegarde de fermeture réécrirait la scène juste avant le rechargement
function switchScene(id) {
  saveNow();
  syncIndex();
  noSave = true;
  scenes.current = id;
  saveIndex();
  location.reload();
}
function newSceneEntry(name) {
  syncIndex();
  const id = 's' + Date.now().toString(36);
  scenes.list.push({ id, name: name || 'Scène ' + (scenes.list.length + 1) });
  saveIndex(); // enregistrée tout de suite : une autre liste périmée ne doit pas la perdre
  return id;
}
function renderSceneBar() {
  const sel = $('sceneSel');
  sel.innerHTML = '';
  scenes.list.forEach((s) => {
    const o = document.createElement('option');
    o.value = s.id; o.textContent = s.name; o.selected = s.id === scenes.current;
    sel.appendChild(o);
  });
}
$('sceneSel').addEventListener('change', (e) => switchScene(e.target.value));
$('newScene').addEventListener('click', () => switchScene(newSceneEntry()));
$('sceneRename').addEventListener('click', () => {
  syncIndex();
  const cur = scenes.list.find((s) => s.id === scenes.current);
  if (!cur) return;
  const name = prompt('Nom de la scène :', cur.name);
  if (name && name.trim()) { cur.name = name.trim().slice(0, 40); saveIndex(); renderSceneBar(); }
});
$('sceneDel').addEventListener('click', () => {
  syncIndex();
  const cur = scenes.list.find((s) => s.id === scenes.current);
  if (!cur) { noSave = true; location.reload(); return; } // déjà supprimée depuis un autre onglet
  if (!confirm(`Supprimer la scène « ${cur.name} » ?`)) return;
  try { localStorage.removeItem(sceneKey(cur.id)); } catch {}
  scenes.list = scenes.list.filter((s) => s !== cur);
  if (!scenes.list.length) newSceneEntry();
  noSave = true;
  scenes.current = scenes.list[0].id;
  saveIndex();
  location.reload();
});
renderSceneBar();

// ---------- Arbres de Paris (opendata.paris.fr, jeu « les-arbres ») ----------
// genre botanique -> préréglage de départ + retouches de silhouette / couleur
const PARIS_GENUS = {
  Tilia: ['ash', { leafShape: 'cloud', density: 80, fc: '#6aa84a', angle: 38 }],
  Aesculus: ['oak', { fc: '#3f7d34', leafSize: 0.34, density: 85 }],
  Platanus: ['oak', { trunkW: 0.24, fc: '#6b9a45', tc: '#a6a08a', leafSize: 0.3 }],
  Acer: ['ash', { fc: '#5f9a3c', leafShape: 'cloud' }],
  Ginkgo: ['poplar', { angle: 30, fc: '#a8c64a', fc2: '#d8d85a', leafShape: 'cloud' }],
  Carpinus: ['birch', { tc: '#8a8478', fc: '#5f9d44', density: 78 }],
  Cercis: ['cherry', { fc: '#7ab04c', fc2: '#d65a8a', mix: 20 }],
  Juglans: ['walnut', {}], Prunus: ['cherry', {}], Fraxinus: ['ash', {}], Populus: ['poplar', {}], Salix: ['willow', {}], Betula: ['birch', {}],
  Malus: ['apple', {}], Pyrus: ['pear', {}], Quercus: ['oak', {}], Robinia: ['ash', { fc: '#6fa04a' }], Sophora: ['ash', { fc: '#5f9a44', leafShape: 'cloud' }],
  Ulmus: ['oak', { fc: '#5a9a3e' }], Fagus: ['oak', { fc: '#4f8a3a', tc: '#8a8478' }], Celtis: ['oak', { fc: '#5f9a44' }],
  Pinus: ['fir', { fc: '#3c7a45' }], Picea: ['fir', {}], Abies: ['fir', {}], Cedrus: ['fir', { fc: '#3a7a58' }], Cupressus: ['fir', {}], Taxus: ['fir', {}], Thuja: ['fir', {}],
};
function parisSpec(r) {
  const [pid, over] = PARIS_GENUS[r.genre] || ['oak', {}];
  const p = TREE_PRESETS.find((x) => x.id === pid);
  const seedT = (r.idbase % 90000) + 1;
  const q = { ...params(), ...presetQ(p), ...over, relief: 0, ground: false, fruit: 'none', levels: 3, leafPoly: 1 }; // modèle allégé : beaucoup d'arbres
  return { seed: seedT, q };
}
async function importParis() {
  const lat0 = parseFloat($('parisLat').value), lon0 = parseFloat($('parisLon').value), R = num('parisRadius');
  if (!isFinite(lat0) || !isFinite(lon0)) { setStatus('Latitude / longitude invalides.'); return; }
  setStatus('Téléchargement des arbres de Paris…');
  const rows = [];
  try {
    for (let off = 0; off < 400; off += 100) {
      const url = 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/les-arbres/records?limit=100&offset=' + off +
        '&where=' + encodeURIComponent(`within_distance(geo_point_2d, geom'POINT(${lon0} ${lat0})', ${R}m)`);
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      rows.push(...j.results);
      if (j.results.length < 100) break;
    }
  } catch (err) { setStatus('Import impossible : ' + err.message); return; }
  const pts = rows.filter((r) => r.geo_point_2d);
  if (!pts.length) { setStatus('Aucun arbre trouvé ici.'); return; }
  const K = 0.14, mx = 111320 * Math.cos((lat0 * Math.PI) / 180), my = 110574; // unités de scène par mètre ; mètres par degré
  const P = pts.map((r) => ({ r, x: (r.geo_point_2d.lon - lon0) * mx * K, z: -(r.geo_point_2d.lat - lat0) * my * K }));
  const gr = clamp(Math.max(...P.map((p) => Math.hypot(p.x, p.z))) + 2.5, 4, 29);
  const trees = P.map(({ r, x, z }) => {
    const spec = parisSpec(r);
    const hM = clamp(r.hauteurenm || 6, 2, 30);
    const t = makeTree(spec.q, spec.seed, null);
    const sc = Math.min((hM * K) / Math.max(t.bb.max.y, 0.5), (0.42 * hM * K) / Math.max(t.radial, 0.3)); // hauteur réelle, couronne ≈ 0,8 × la hauteur
    return { spec, x: r3(x), z: r3(z), scale: r3(sc), rot: r3(((r.idbase * 7919) % 628) / 100), radius: r3(t.radial * sc) };
  });
  // terre autour des arbres, eau (la Seine) partout ailleurs
  const cells = [], reach = 14 * K, near = 7 * K;
  for (let j = 0; j < SN; j++) {
    for (let i = 0; i < SN; i++) {
      const x = i * SCELL - SG, z = j * SCELL - SG;
      let d = 1e9;
      for (const p of P) d = Math.min(d, Math.hypot(p.x - x, p.z - z));
      const f = clamp((d - near) / (reach - near), 0, 1);
      const v = -1.4 * f * f * (3 - 2 * f);
      if (Math.abs(v) > 0.002) cells.push(`${j * SN + i}:${r3(v)}`);
    }
  }
  const ui = { ...uiState(), forest: true, water: true, waterLevel: -0.3, relief: 0, ground: true, smoothGround: true, groundStyle: 'grass' };
  const data = {
    format: SCENE_FORMAT, version: 1, savedAt: new Date().toISOString(), seed: 1, mode: 'forest', ui,
    world: { groundR: r3(gr), scale: 1, shadowRadius: r3(gr), viewScale: 1 },
    camera: { position: [r3(gr * 0.45), r3(gr * 0.85), r3(gr * 1.15)], target: [0, 0.4, 0] },
    trees, rocks: [], tufts: [], fish: [], signs: [], benches: [], herons: [], peckers: [], frogs: [], wagtails: [], flyers: [], dragons: [], lilies: [], ducks: [], flowers: [], insects: [], paths: [], paint: [],
    sculpt: { grid: SN, half: SG, cells: cells.join(',') },
  };
  const isDefault = Math.abs(lat0 - 48.8574) < 1e-4 && Math.abs(lon0 - 2.3402) < 1e-4;
  const id = newSceneEntry(isDefault ? 'Square du Vert-Galant' : 'Paris ' + lat0.toFixed(4) + ', ' + lon0.toFixed(4));
  try { localStorage.setItem(sceneKey(id), JSON.stringify(data)); } catch { scenes.list.pop(); setStatus('Stockage du navigateur plein : import annulé.'); return; }
  switchScene(id);
}
$('parisImport').addEventListener('click', importParis);

// ---------- Sauvegarde automatique (localStorage) ----------
// la scène complète est gardée dans le navigateur et revient à l'ouverture de la page
function setSaveState(msg) {
  const el = $('saveState');
  if (el) el.textContent = msg;
}
function saveNow() {
  if (noSave) return;
  try {
    localStorage.setItem(sceneKey(scenes.current), JSON.stringify(sceneData()));
    setSaveState('Enregistré dans le navigateur · ' + new Date().toLocaleTimeString());
  } catch (err) {
    setSaveState('Sauvegarde impossible (stockage du navigateur plein ou bloqué)');
  }
}
let dirty = false;
['input', 'change', 'click', 'pointerup'].forEach((ev) => document.addEventListener(ev, () => (dirty = true), true));
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  saveNow();
}, 1500);
// dernier filet de sécurité si l'onglet est fermé juste après une modification
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });

// ---------- Export du modèle 3D (.glb) ----------
$('export').addEventListener('click', () => {
  select(null); // pas de surbrillance ni d'anneau dans le fichier
  brushRing.visible = false;
  new GLTFExporter().parse(
    world,
    (buf) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
      a.download = 'modele-lowpoly.glb';
      a.click();
      setStatus('Modèle 3D exporté (modele-lowpoly.glb)');
    },
    (err) => setStatus('Export échoué : ' + err.message),
    { binary: true }
  );
});
renderSpecies();
renderPreviews();
// reprend la dernière scène enregistrée automatiquement, si elle existe
try {
  const saved = localStorage.getItem(sceneKey(scenes.current));
  if (saved) {
    loadScene(JSON.parse(saved));
    setSaveState('Scène restaurée depuis le navigateur');
  } else { initDefaultScene(); setSaveState('Enregistrement automatique actif'); }
} catch (err) {
  // sauvegarde illisible : on repart d'une scène neuve
  console.warn('sauvegarde automatique ignorée', err);
  try { const bad = localStorage.getItem(sceneKey(scenes.current)); if (bad) localStorage.setItem('lowpoly-backup:' + scenes.current, bad); localStorage.removeItem(sceneKey(scenes.current)); } catch {} // copie de secours de la sauvegarde illisible
  initDefaultScene();
  setSaveState('Ancienne sauvegarde illisible : scène neuve');
}

// l'application démarre sur la scène ; l'atelier d'animaux s'ouvre depuis l'onglet Animaux (le brouillon en cours y est rechargé)

// crochet pour l interface (annuler / rétablir, aide) : accès à la sauvegarde et au rechargement de la scène
window.lowpoly = { pose: () => poseMode, cam: camera, ctl: controls, sel: () => selected, sceneData, loadScene, inEdit: () => edit !== null };
