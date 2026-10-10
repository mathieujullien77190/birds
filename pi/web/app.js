// Page de test : lit l'état toutes les 5 s, envoie les commandes au programme Python (même machine, port 8080).

const $ = (id) => document.getElementById(id);

function afficher(e) {
  $('t_nid').textContent = e.t_nid ?? '—';
  $('hum_nid').textContent = e.hum_nid ?? '—';
  $('t_dissipateur').textContent = e.t_dissipateur ?? '—';
  $('maj').textContent = e.derniere_lecture ?? '—';
  for (const b of ['froid', 'chaud', 'arrêt']) $('p_' + (b === 'arrêt' ? 'arret' : b)).classList.toggle('on', e.peltier === b);
  $('l_nid').classList.toggle('on', !!e.led_nid);
  $('l_ext').classList.toggle('on', !!e.led_ext);
  for (const k of ['bme280', 'ds18b20', 'gpio', 'securite', 'camera1', 'camera2']) { const el = $('err_' + k); if (el) el.textContent = e.erreurs?.[k] ?? ''; }
  if (e.erreurs?.picamera2) { $('err_camera1').textContent = e.erreurs.picamera2; $('err_camera2').textContent = e.erreurs.picamera2; }
}

async function lire() {
  try { afficher(await (await fetch('/api/etat')).json()); }
  catch { $('maj').textContent = 'programme injoignable'; }
}

async function envoyer(url, corps) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  afficher(await r.json());
}

function peltier(sens) { envoyer('/api/peltier', { sens, puissance: Number($('puiss').value) / 100 }); }
function led(quoi) {
  const on = !$('l_' + quoi).classList.contains('on');
  envoyer('/api/led', quoi === 'nid' ? { nid: on } : { ext: on });
}

lire();
setInterval(lire, 5000);
