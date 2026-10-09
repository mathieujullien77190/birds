// Comportements de l'interface branchés sur le DOM : sections en accordéon, raccourcis d'outils,
// annuler / rétablir (instantanés de la scène), panneau repliable, aide.
const $ = (id) => document.getElementById(id);
const typing = (e) => /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || '') && e.target.type !== 'range' && e.target.type !== 'checkbox';
const lp = () => window.lowpoly;

// ----- sections en accordéon : en ouvrir une referme les autres du même onglet -----
function initAccordion() {
  document.querySelectorAll('.tab').forEach((tab) => {
    const secs = [...tab.querySelectorAll('details.sec')];
    secs.forEach((s, i) => { s.open = i === 0 ? s.open || true : false; });
    // un seul ouvert au départ (le premier)
    let seen = false;
    secs.forEach((s) => { if (s.open) { if (seen) s.open = false; seen = true; } });
  });
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.classList.contains('sec') || !d.open) return;
    d.closest('.tab')?.querySelectorAll('details.sec[open]').forEach((o) => { if (o !== d) o.open = false; });
  }, true);
}

// ----- raccourcis clavier -----
function initKeys() {
  document.addEventListener('keydown', (e) => {
    if (typing(e) || e.altKey) return;
    if ((e.ctrlKey || e.metaKey) && !lp()?.inEdit()) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return; }
    }
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === '?') { window.dispatchEvent(new Event('lowpoly-help')); return; }
    if (e.key === '[') { togglePanel(); return; }
    if (lp()?.inEdit()) return;
    const btn = [...document.querySelectorAll('#tools button[data-key]')].find((b) => b.dataset.key === e.key.toUpperCase());
    if (btn) btn.click();
  });
}

// ----- panneau repliable -----
function togglePanel() {
  document.body.classList.toggle('panel-collapsed');
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); // la vue 3D reprend la place
}

// ----- annuler / rétablir : instantanés JSON de la scène (sans caméra) -----
const stack = [];
let redoStack = [];
let sig = '';
let applying = false;
const MOVING = ['fish', 'herons', 'frogs', 'wagtails', 'peckers', 'flyers', 'dragons', 'insects']; // animaux qui bougent seuls : positions ignorées pour la comparaison
function snapshot() {
  const d = lp().sceneData();
  delete d.camera; delete d.savedAt;
  const s = JSON.stringify(d);
  const key = JSON.stringify({ ...d, ...Object.fromEntries(MOVING.map((k) => [k, (d[k] || []).map((o) => [o.kind || o.type || '', o.size, o.seed])])) });
  return { s, key };
}
function updateButtons() {
  $('undoBtn').disabled = stack.length < 2;
  $('redoBtn').disabled = redoStack.length === 0;
}
function commit() {
  if (applying || !lp() || lp().inEdit()) return;
  const { s, key } = snapshot();
  if (key === sig) return;
  sig = key;
  stack.push({ s, key });
  if (stack.length > 25) stack.shift();
  redoStack = [];
  updateButtons();
}
function restore(item) {
  applying = true;
  try {
    lp().loadScene(JSON.parse(item.s));
    sig = item.key;
  } finally {
    setTimeout(() => { sig = snapshot().key; applying = false; }, 400); // la scène rechargée sert de nouvelle référence
  }
  updateButtons();
}
function undo() {
  if (stack.length < 2 || lp()?.inEdit()) return;
  redoStack.push(stack.pop());
  restore(stack[stack.length - 1]);
}
function redo() {
  if (!redoStack.length || lp()?.inEdit()) return;
  const item = redoStack.pop();
  stack.push(item);
  restore(item);
}
function initHistory() {
  let timer;
  const later = () => { clearTimeout(timer); timer = setTimeout(commit, 700); };
  ['pointerup', 'change', 'click', 'input', 'keyup'].forEach((ev) => document.addEventListener(ev, later, true));
  const first = snapshot();
  sig = first.key;
  stack.push(first);
  $('undoBtn').addEventListener('click', undo);
  $('redoBtn').addEventListener('click', redo);
  updateButtons();
}

export function initUi() {
  initAccordion();
  initKeys();
  $('helpBtn').addEventListener('click', () => window.dispatchEvent(new Event('lowpoly-help')));
  $('panelBtn').addEventListener('click', togglePanel);
  if (lp()) setTimeout(initHistory, 800);
}
