// Météo : vent (balancement des arbres et des fleurs), pluie, saisons (couleurs, ciel, particules de saison).
// Module autonome : main.js lui fournit un contexte (monde, hauteur du sol, taille de référence…) et l'appelle
// à chaque image. Les réglages sont lus directement dans l'interface (ids ci-dessous).
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Particules propres à chaque saison : pétales au printemps, feuilles mortes en automne, neige en hiver.
const SEASON_FX = {
  spring: { kind: 'petal', colors: ['#f9c5dc', '#ffffff', '#f5a6c8'], size: 0.05, speed: 0.32, count: 90 },
  autumn: { kind: 'leaf', colors: ['#e0a228', '#c9501c', '#b8341c', '#e8c040'], size: 0.075, speed: 0.42, count: 140 },
  winter: { kind: 'snow', colors: ['#ffffff', '#eef4fa'], size: 0.035, speed: 0.5, count: 380 },
};

// Couleurs des arbres par saison (appliquées par-dessus les réglages de l'utilisateur, sans les modifier)
const TREE_SEASON = {
  spring: { fc: '#82d15e', fc2: '#f6b8d4', mix: 22 },       // vert tendre + quelques fleurs roses
  summer: { fc: '#4f9a3a', fc2: '#3f8a35', mix: 0 },        // vert profond
  autumn: { fc: '#e0a228', fc2: '#c9501c', mix: 55 },       // jaune / orange / rouille
};
// Couleurs du sol par saison (herbe, sable, terre) : en hiver tout est sous la neige
const GROUND_SEASON = {
  spring: { grass: '#a8dc7a' },
  summer: { grass: '#8fcf6a' },
  autumn: { grass: '#c8b05a', sand: '#e4cf9a' },
  winter: { grass: '#f1f6f9', sand: '#e7eef3', earth: '#dde3e8', dirt: '#dde3e8' },
};

export function createWeather(ctx) {
  // uniformes partagés par tous les matériaux « qui bougent au vent »
  const wind = { uTime: { value: 0 }, uWind: { value: 0 }, uDir: { value: new THREE.Vector2(1, 0) } };

  // Balancement : décalage des sommets selon leur hauteur locale (la base reste fixe, le haut oscille).
  // Les objets bas (fleurs, herbe) bougent un peu, les grands arbres beaucoup, un rocher presque pas.
  function patchMaterial(mat) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = wind.uTime;
      shader.uniforms.uWind = wind.uWind;
      shader.uniforms.uDir = wind.uDir;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;\nuniform vec2 uDir;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float hh = max(position.y, 0.0);
          float sw = uWind * (hh * 0.06 + hh * hh * 0.03);
          float ph = uTime * 1.7 + position.x * 1.9 + position.z * 1.4;
          float gust = sin(ph) + 0.35 * sin(ph * 2.7 + 1.3);
          transformed.x += uDir.x * gust * sw;
          transformed.z += uDir.y * gust * sw;`
        );
    };
    mat.customProgramCacheKey = () => 'wind-sway';
    mat.needsUpdate = true;
  }

  // ----- lecture des réglages -----
  const windForce = () => parseFloat($('windForce')?.value ?? '0');
  const windVec = () => {
    const a = (parseFloat($('windDir')?.value ?? '90') * Math.PI) / 180;
    return { x: Math.sin(a), z: Math.cos(a) };
  };
  const rainForce = () => ($('rainOn')?.checked ? parseFloat($('rainForce')?.value ?? '0.6') : 0);
  const season = () => $('season')?.value || 'none';

  const area = () => Math.max(2.2, ctx.getGroundR()) * 1.15; // rayon de la zone de particules
  const SKY_H = 5.2;                                           // hauteur de départ des particules

  // ----- pluie : traits fins qui tombent vite, inclinés par le vent -----
  const RAIN_MAX = 2400;
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN_MAX * 6), 3).setUsage(THREE.DynamicDrawUsage));
  const rainMat = new THREE.LineBasicMaterial({ color: 0xbcd4e8, transparent: true, opacity: 0.55, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  rain.visible = false;
  ctx.world.add(rain);
  const drops = Array.from({ length: RAIN_MAX }, () => ({ x: 0, y: 0, z: 0, vy: 0, init: false }));

  function updateRain(dt, editing) {
    const f = editing ? 0 : rainForce();
    rain.visible = f > 0;
    if (!f) return;
    const R = area(), prop = ctx.getProportion();
    const n = Math.min(RAIN_MAX, Math.round(28 * f * Math.PI * R * R));
    const wv = windVec(), w = windForce();
    const pos = rainGeo.attributes.position.array;
    for (let i = 0; i < n; i++) {
      const d = drops[i];
      if (!d.init) { // première apparition : réparties sur toute la hauteur
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
        d.x = Math.cos(a) * r; d.z = Math.sin(a) * r; d.y = Math.random() * SKY_H; d.vy = (7 + Math.random() * 3) * prop; d.init = true;
      }
      d.y -= d.vy * dt;
      d.x += wv.x * w * 2.2 * prop * dt; // le vent penche et pousse la pluie
      d.z += wv.z * w * 2.2 * prop * dt;
      if (d.y < ctx.groundY(d.x, d.z)) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
        d.x = Math.cos(a) * r; d.z = Math.sin(a) * r; d.y = SKY_H * (0.8 + Math.random() * 0.2);
      }
      const len = 0.28 * prop, k = len / (d.vy || 1); // le trait suit la direction de chute
      pos[i * 6] = d.x; pos[i * 6 + 1] = d.y; pos[i * 6 + 2] = d.z;
      pos[i * 6 + 3] = d.x - wv.x * w * 2.2 * prop * k; pos[i * 6 + 4] = d.y + len; pos[i * 6 + 5] = d.z - wv.z * w * 2.2 * prop * k;
    }
    rainGeo.setDrawRange(0, n * 2);
    rainGeo.attributes.position.needsUpdate = true;
  }

  // ----- particules de saison (pétales / feuilles / neige) -----
  // Feuilles et pétales se détachent du FEUILLAGE des arbres (pas du ciel), tombent, se posent un instant puis
  // repartent d'un autre point du feuillage. La neige, elle, tombe du ciel.
  let fx = null, fxKey = '';
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _z = new THREE.Vector3(0, 0, 0), _c = new THREE.Color();

  // (re)place une particule : dans le feuillage d'un arbre (feuilles, pétales) ou dans le ciel (neige)
  function respawn(it, cfg, R, initial) {
    const w = windVec(), wf = windForce();
    it.landed = false; it.floating = false; it.rest = 0; it.off = false;
    if (cfg.kind === 'snow') {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
      it.x = Math.cos(a) * r - w.x * wf * R * 0.4; it.z = Math.sin(a) * r - w.z * wf * R * 0.4;
      it.y = initial ? Math.random() * SKY_H : SKY_H * (0.85 + Math.random() * 0.15);
      return;
    }
    const p = ctx.canopyPoint();
    if (!p) { it.off = true; it.rest = 0.5 + Math.random(); return; } // pas de feuillage (hiver, aucun arbre) : on réessaie plus tard
    it.x = p.x; it.z = p.z;
    const g = ctx.groundY(p.x, p.z);
    it.y = initial ? g + Math.random() * Math.max(0.05, p.y - g) : p.y; // au départ, déjà réparties entre le feuillage et le sol
    if (it.color) it.color.set(cfg.colors[Math.floor(Math.random() * cfg.colors.length)]);
  }

  function rebuildFx() {
    if (fx) { ctx.world.remove(fx.mesh); fx.mesh.geometry.dispose(); fx.mesh.material.dispose(); fx.mesh.dispose(); fx = null; }
    const s = season(), cfg = SEASON_FX[s];
    fxKey = s + '|' + $('seasonFx')?.checked + '|' + Math.round(area() * 10);
    if (!cfg || !$('seasonFx')?.checked) return;
    const prop = ctx.getProportion(), sz = cfg.size * prop, R = area();
    const g = new THREE.OctahedronGeometry(1, 0);
    if (cfg.kind === 'snow') g.scale(sz, sz, sz); else g.scale(sz, sz * 0.12, sz * 0.62); // feuille / pétale : mince et allongé
    const n = Math.round(cfg.count * (cfg.kind === 'snow' ? clamp((R * R) / 9, 0.5, 3) : 0.7));
    // la neige reste blanche même par temps gris (légèrement émissive)
    const fxMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true });
    if (cfg.kind === 'snow') { fxMat.emissive = new THREE.Color(0xffffff); fxMat.emissiveIntensity = 0.55; }
    const mesh = new THREE.InstancedMesh(g, fxMat, n);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const items = Array.from({ length: n }, (_, i) => {
      const it = {
        x: 0, y: 0, z: 0, ph: Math.random() * 6.28, color: new THREE.Color(),
        spin: [(Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3], rot: [Math.random() * 6, Math.random() * 6, Math.random() * 6],
        v: cfg.speed * (0.7 + Math.random() * 0.6),
      };
      respawn(it, cfg, R, true);
      mesh.setColorAt(i, cfg.kind === 'snow' ? _c.set(cfg.colors[Math.floor(Math.random() * cfg.colors.length)]) : it.color);
      return it;
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    ctx.world.add(mesh);
    fx = { mesh, items, cfg, R };
  }

  function updateFx(dt, t, editing) {
    const key = season() + '|' + $('seasonFx')?.checked + '|' + Math.round(area() * 10);
    if (key !== fxKey) rebuildFx();
    if (!fx) return;
    fx.mesh.visible = !editing;
    if (editing) return;
    const { mesh, items, cfg, R } = fx, prop = ctx.getProportion(), wv = windVec(), w = windForce();
    const snow = cfg.kind === 'snow';
    items.forEach((it, i) => {
      if (it.off) { // en attente de feuillage
        it.rest -= dt;
        if (it.rest <= 0) respawn(it, cfg, R, false);
      } else if (it.landed) { // posée au sol (ou flottant) : elle y reste longtemps, puis repart du feuillage
        it.rest -= dt;
        if (it.floating) { // sur l'eau : dérive très lentement et suit le niveau de l'eau
          const ws = ctx.waterSurface(it.x, it.z);
          it.x += Math.cos(it.dr + t * 0.05) * 0.03 * prop * dt;
          it.z += Math.sin(it.dr + t * 0.05) * 0.03 * prop * dt;
          it.rot[1] += 0.15 * dt;
          if (ws === null) { it.floating = false; it.y = ctx.groundY(it.x, it.z) + 0.01; } // la dérive l'a ramenée sur la rive
          else it.y = ws + 0.012 + Math.sin(t * 1.4 + it.ph) * 0.004;
        }
        if (it.rest <= 0) respawn(it, cfg, R, false);
      } else {
        it.y -= it.v * prop * dt;
        // balancement propre à la particule + dérive due au vent (la neige est la plus légère)
        const drift = (0.05 + w * 0.9) * (snow ? 1.3 : 1) * prop;
        it.x += (Math.sin(t * 1.1 + it.ph) * 0.1 * prop + wv.x * drift) * dt;
        it.z += (Math.cos(t * 0.9 + it.ph) * 0.1 * prop + wv.z * drift) * dt;
        if (!snow) { it.rot[0] += it.spin[0] * dt; it.rot[1] += it.spin[1] * dt; it.rot[2] += it.spin[2] * dt; }
        const gy = ctx.groundY(it.x, it.z), ws = ctx.waterSurface(it.x, it.z), floor = ws !== null ? ws : gy;
        if (it.y < floor) {
          if (snow) respawn(it, cfg, R, false); // la neige fond au contact
          else if (ws !== null) { it.y = ws + 0.012; it.landed = true; it.floating = true; it.dr = Math.random() * 6.28; it.rest = 25 + Math.random() * 25; } // sur l'eau : elle flotte
          else { it.y = gy + 0.01; it.landed = true; it.rest = 20 + Math.random() * 30; } // sur terre : elle reste posée longtemps
        } else if (Math.hypot(it.x, it.z) > R * 1.2) respawn(it, cfg, R, false);
      }
      if (it.off) _m.compose(_p.set(0, -100, 0), _q.identity(), _z);
      else {
        _p.set(it.x, it.y, it.z);
        if (it.landed) _e.set(it.floating ? 0.05 + Math.sin(t * 1.4 + it.ph) * 0.04 : 0.05, it.rot[1], 0.05); else _e.set(it.rot[0], it.rot[1], it.rot[2]);
        _q.setFromEuler(_e);
        _m.compose(_p, _q, _s);
      }
      mesh.setMatrixAt(i, _m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  // ----- saisons : ce que main.js applique à la génération -----
  // couleurs / feuillage d'un arbre pour la saison courante (renvoie une copie, jamais l'original)
  function seasonTree(q) {
    const s = season();
    if (s === 'none') return q;
    if (q.type === 'conifer') { // le sapin garde ses aiguilles : plus sombre, chargé de neige en hiver
      if (s === 'winter') return { ...q, fc: '#3f6f58', fc2: '#f4f8fb', mix: 38 };
      return q;
    }
    if (s === 'winter') return { ...q, density: 0, fruit: 'none' }; // arbres nus, sans fruits
    if (s === 'spring') return { ...q, ...TREE_SEASON[s], fruit: 'none' }; // floraison : pas encore de fruits
    return { ...q, ...TREE_SEASON[s] };
  }
  // couleurs du sol par saison (null = couleurs normales)
  const seasonGround = () => GROUND_SEASON[season()] || null;
  // ciel, couleur / intensité de la lumière : saison + temps de pluie
  function envTint(env) {
    const s = season(), rf = rainForce();
    const mix = (c, hex, a) => c.lerp(new THREE.Color(hex), a);
    if (s === 'spring') mix(env.sky, '#dcefe0', 0.25);
    if (s === 'summer') mix(env.dirColor, '#fff1c8', 0.25);
    if (s === 'autumn') { mix(env.sky, '#efd8b8', 0.35); mix(env.dirColor, '#ffd9a8', 0.35); }
    if (s === 'winter') { mix(env.sky, '#dfe8ef', 0.55); mix(env.dirColor, '#dbe8ff', 0.4); env.hemiI *= 1.1; }
    if (rf > 0) { mix(env.sky, '#8b97a3', 0.6 * rf); env.dirI *= 1 - 0.5 * rf; env.hemiI *= 1 - 0.15 * rf; }
    return env;
  }

  // ----- réglages -> main.js -----
  // changement de saison : main.js régénère les couleurs des arbres et du sol sur place (sans rien déplacer)
  $('season')?.addEventListener('input', () => { rebuildFx(); ctx.onSeasonChange(); });
  $('seasonFx')?.addEventListener('input', rebuildFx);
  ['rainOn', 'rainForce'].forEach((id) => $(id)?.addEventListener('input', () => ctx.onEnvChange()));

  // à appeler à chaque image
  function update(dt, t) {
    // modification avancée : on travaille sur l'arbre immobile, sans vent ni météo
    const editing = ctx.isEditing ? ctx.isEditing() : false;
    wind.uTime.value = t;
    const f = editing ? 0 : windForce(), wv = windVec();
    wind.uWind.value = f;
    wind.uDir.value.set(wv.x, wv.z);
    updateRain(dt, editing);
    updateFx(dt, t, editing);
  }

  return { patchMaterial, update, seasonTree, seasonGround, envTint, rebuildFx, season, windForce, windVec };
}
