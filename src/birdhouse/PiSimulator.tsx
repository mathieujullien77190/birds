import { useEffect, useRef, useState } from 'react';
import nichoirPy from '../../pi/nichoir.py?raw';
import indexHtml from '../../pi/web/index.html?raw';
import appJs from '../../pi/web/app.js?raw';
import appCss from '../../pi/web/app.css?raw';

/** Simulateur de l'interface web du Pi : le VRAI `pi/nichoir.py` (mode simulé) tourne dans le navigateur grâce à Pyodide (Python compilé en WebAssembly),
 *  et la VRAIE page `pi/web/index.html` + `app.js` s'affiche dans un cadre. Seul Flask est remplacé par une petite doublure : les appels de la page
 *  (`fetch('/api/…')`) sont envoyés directement aux fonctions de routes du programme Python, sans réseau. Pyodide est téléchargé à l'ouverture (≈ 10 Mo). */
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

/** Une fonction Python exposée par Pyodide (définie dans `BOOT`) : arguments et résultat convertis par Pyodide, d'où `unknown`. */
type PyFn = (...a: unknown[]) => unknown;
/** La part de l'API Pyodide utilisée ici. */
interface Pyodide {
  globals: { get(name: string): PyFn; set(name: string, value: string): void };
  setStdout(o: { batched: (line: string) => void }): void;
  setStderr(o: { batched: (line: string) => void }): void;
  runPython(code: string): unknown;
}
/** Réponse minimale de la doublure de `fetch` donnée à la page du Pi. */
type PiFetch = (url: string, opts?: { method?: string; body?: string }) => Promise<{ json: () => Promise<unknown> }>;
declare global {
  interface Window {
    /** Ajouté par le script `pyodide.js` une fois chargé. */
    loadPyodide?: (opts: { indexURL: string }) => Promise<Pyodide>;
    /** La page du Pi (cadre de même origine) appelle `parent.__piFetch` à la place de `fetch`. */
    __piFetch?: PiFetch;
  }
}
let pyPromise: Promise<Pyodide> | null = null;
/** Où va la sortie standard de Python (print, erreurs) : le terminal du simulateur, rebranché à chaque ouverture. */
let sink: (line: string) => void = () => {};

/** Python exécuté une fois Pyodide chargé : doublure de Flask, exécution de nichoir.py, et trois petites fonctions appelées par la page React. */
const BOOT = `
import sys, types, os, json, base64
os.environ["NICHOIR_MOCK"] = "1"
fl = types.ModuleType("flask")  # doublure de Flask : les routes restent des fonctions normales
class _App:
    def __init__(self, *a, **k): pass
    def get(self, *a, **k): return lambda f: f
    post = get
    def run(self, *a, **k): pass
class _Req:
    payload = {}
    def get_json(self, force=False): return self.payload
fl.Flask, fl.Response, fl.jsonify, fl.request, fl.send_from_directory = _App, (lambda *a, **k: None), (lambda x: x), _Req(), (lambda *a, **k: None)
sys.modules["flask"] = fl
nichoir = types.ModuleType("nichoir")
exec(SRC, nichoir.__dict__)

def api(url, body):
    if url == "/api/etat": r = nichoir.api_etat()
    elif url == "/api/historique": r = nichoir.api_historique()
    elif url == "/api/ventilo": fl.request.payload = json.loads(body or "{}"); r = nichoir.api_ventilo()
    elif url == "/api/led": fl.request.payload = json.loads(body or "{}"); r = nichoir.api_led()
    elif url == "/api/auto": fl.request.payload = json.loads(body or "{}"); r = nichoir.api_auto()
    elif url == "/api/camera": fl.request.payload = json.loads(body or "{}"); r = nichoir.api_camera()
    else: return None
    return json.dumps(r)

def tick():
    nichoir.lecture()

def frame(num, n):
    return base64.b64encode(nichoir.cameras[num].image(n, 160, 120)).decode()

def led_on(num):
    return bool(nichoir.etat["led_nid" if num == 0 else "led_ext"])

def cam_on(num):
    return bool(nichoir.etat["cam" + str(num + 1)])

def panne(nom, on):
    nichoir.MOCK_PANNES[nom] = bool(on)

def batterie(pct):
    nichoir.sim["wh"] = pct / 100 * nichoir.CAPACITE_WH

def etat_json():
    return json.dumps(nichoir.etat)

def forcer(nid, ext):
    nichoir.MOCK_FORCE["nid"] = None if nid is None else float(nid)
    nichoir.MOCK_FORCE["ext"] = None if ext is None else float(ext)
    nichoir.sim["effet"] = 0.0

def restaurer():
    nichoir.MOCK_FORCE["nid"] = nichoir.MOCK_FORCE["ext"] = None
    nichoir.sim["effet"] = 0.0
    nichoir.MOCK_PANNES["bme"] = nichoir.MOCK_PANNES["ventilo"] = False
    nichoir.etat["auto"].update({k: v for k, v in nichoir.AUTO_DEFAUT.items()})
    nichoir.etat["auto"]["avertissements"] = []
    nichoir.ventilo(0)
    nichoir.sim["wh"] = 0.8 * nichoir.CAPACITE_WH
    nichoir.leds(False, False)
    nichoir.camera(0, True)
    nichoir.camera(1, True)
    for k in ("ventilo", "alerte_chaleur", "delestage", "bme280"):
        nichoir.etat["erreurs"].pop(k, None)
    nichoir.lecture()

def acceleration(v):
    nichoir.SIM_ACCEL = float(v)

def nuit(v):
    nichoir.MOCK_NUIT = bool(v)
`;

function loadPy(): Promise<Pyodide> {
  pyPromise ??= new Promise<Pyodide>((resolve, reject) => {
    const boot = async () => {
      if (!window.loadPyodide) throw new Error('Pyodide introuvable');
      const py = await window.loadPyodide({ indexURL: PYODIDE });
      py.setStdout({ batched: (l: string) => sink(l) });
      py.setStderr({ batched: (l: string) => sink('! ' + l) });
      py.globals.set('SRC', nichoirPy);
      py.runPython(BOOT);
      return py;
    };
    if (window.loadPyodide) { boot().then(resolve, reject); return; }
    const s = document.createElement('script');
    s.src = PYODIDE + 'pyodide.js';
    s.onload = () => boot().then(resolve, reject);
    s.onerror = () => reject(new Error('Pyodide introuvable (hors ligne ?)'));
    document.head.appendChild(s);
  });
  pyPromise.catch(() => { pyPromise = null; });
  return pyPromise;
}

/** Image d'une caméra éteinte (noir). */
const OFF = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#000"/><text x="160" y="126" fill="#666" font-family="monospace" font-size="14" text-anchor="middle">caméra éteinte</text></svg>');

/** Page du Pi, avec `fetch` redirigé vers le Python du parent (le cadre est de même origine : `parent.__piFetch`). */
const PAGE = indexHtml
  .replace(/<link rel="stylesheet" href="\.\/app\.css">/, () => `<style>${appCss}</style>`)
  .replace(
    /<script src="\.\/app\.js"><\/script>/,
    // `</script` dans le code compilé fermerait la balise : on l'échappe
    () => `<script>window.fetch = (u, o) => parent.__piFetch(u, o);</script><script>${appJs.replace(/<\/script/gi, '<\\/script')}</script>`,
  );

/** État renvoyé par `/api/etat` (seulement ce que les essais lisent). */
interface PiState { t_nid: number | null; ventilo: { pourcent: number; rpm: number | null; mode: string; raison: string }; led_nid: boolean; led_ext: boolean; cam1: boolean; cam2: boolean; erreurs: Record<string, string>; batterie: { pourcent: number | null }; auto: { actif: boolean; etat: string; raison: string } }
type PyFns = Record<'restaurer' | 'panne' | 'batterie' | 'forcer', (...a: unknown[]) => unknown>;

/** Essais automatiques : on provoque un cas limite dans le Python simulé, puis on attend que le programme réagisse comme prévu (sinon l'essai échoue au bout de `timeout` secondes). */
interface PiTest { id: string; label: string; hint: string; timeout: number; setup: (f: PyFns, cmd: (url: string, body: object) => void) => void; expect: (e: PiState) => boolean; ok: (e: PiState) => string }
const PI_TESTS: PiTest[] = [
  { id: 'auto-marche', label: 'Ventilation automatique : nid chaud', hint: 'Nid à 33 °C, dehors 26 °C, automatique activé : le ventilateur doit démarrer (au-dessus de 30 %)', timeout: 15,
    setup: (f, cmd) => { f.restaurer(); f.forcer(33, 26); cmd('/api/auto', { actif: true }); },
    expect: (e) => e.ventilo.mode === 'auto' && e.ventilo.pourcent > 30 && e.auto.etat === 'ventile', ok: (e) => `ventilateur à ${e.ventilo.pourcent} % (${e.ventilo.rpm} tr/min) — ${e.auto.raison}` },
  { id: 'auto-frais', label: 'Ventilation automatique : nid frais', hint: "Nid à 20 °C, dehors 18 °C : l'automatique actif ne doit rien faire (ventilateur arrêté, veille)", timeout: 8,
    setup: (f, cmd) => { f.restaurer(); f.forcer(20, 18); cmd('/api/auto', { actif: true }); },
    expect: (e) => e.ventilo.pourcent === 0 && e.auto.etat === 'veille', ok: (e) => `ventilateur arrêté — ${e.auto.raison}` },
  { id: 'auto-dehors', label: 'Ventilation automatique : plus chaud dehors', hint: "Nid à 34 °C mais dehors à 36 °C : aspirer l'air de dehors ne rafraîchirait pas, le ventilateur doit rester arrêté", timeout: 8,
    setup: (f, cmd) => { f.restaurer(); f.forcer(34, 36); cmd('/api/auto', { actif: true }); },
    expect: (e) => e.ventilo.pourcent === 0 && e.auto.etat === 'veille' && e.auto.raison.includes('dehors'), ok: (e) => `ventilateur arrêté — ${e.auto.raison}` },
  { id: 'panne-ventilo', label: 'Ventilateur en panne', hint: 'Ventilateur commandé à 60 % mais le tachymètre compte 0 tr/min : après 10 s une erreur doit apparaître', timeout: 25,
    setup: (f, cmd) => { f.restaurer(); f.panne('ventilo', true); cmd('/api/ventilo', { pourcent: 60 }); },
    expect: (e) => !!e.erreurs.ventilo, ok: (e) => e.erreurs.ventilo },
  { id: 'nid-panne-auto', label: 'Capteur du nid en panne (automatique)', hint: "Nid chaud, automatique activé, mais le BME280 ne répond plus : on ne sait pas s'il fait chaud, le ventilateur ne doit pas démarrer (sécurité)", timeout: 10,
    setup: (f, cmd) => { f.restaurer(); f.forcer(33, 26); f.panne('bme', true); cmd('/api/auto', { actif: true }); },
    expect: (e) => e.ventilo.pourcent === 0 && e.auto.etat === 'securite' && !!e.erreurs.bme280, ok: (e) => `ventilateur arrêté — ${e.auto.raison}` },
  { id: 'nid', label: 'Capteur du nid en panne', hint: "Le BME280 ne répond plus : la page doit afficher « — » et l'erreur, sans planter", timeout: 10,
    setup: (f) => { f.restaurer(); f.panne('bme', true); },
    expect: (e) => e.t_nid === null && !!e.erreurs.bme280, ok: (e) => e.erreurs.bme280 },
  { id: 'alerte', label: 'Alerte : nid au-dessus de 35 °C', hint: 'Nid à 37 °C malgré tout : une alerte doit apparaître (notification si configurée)', timeout: 10,
    setup: (f, cmd) => { f.restaurer(); f.forcer(37, 33); cmd('/api/auto', { actif: true }); },
    expect: (e) => !!e.erreurs.alerte_chaleur, ok: (e) => e.erreurs.alerte_chaleur },
  { id: 'batterie', label: 'Batterie presque vide (8 %)', hint: 'Nid chaud, automatique activé, LED allumées, batterie à 8 % : caméras et LED coupées (sous 10 %), mais le ventilateur reste actif (sécurité du nid)', timeout: 12,
    setup: (f, cmd) => { f.restaurer(); f.forcer(33, 26); cmd('/api/auto', { actif: true }); cmd('/api/led', { nid: true }); f.batterie(8); },
    expect: (e) => !e.led_nid && !e.cam1 && !e.cam2 && !!e.erreurs.delestage && e.ventilo.mode === 'auto' && e.ventilo.pourcent >= 30, ok: (e) => `${e.erreurs.delestage} — ventilateur à ${e.ventilo.pourcent} %` },
];

export function PiSimulator({ onClose, shoot, night = false, onToggleNight }: { onClose: () => void; shoot?: (num: number, led?: boolean) => string | null; night?: boolean; onToggleNight?: () => void }) {
  const [state, setState] = useState<'chargement' | 'prêt' | 'erreur'>('chargement');
  const [err, setErr] = useState('');
  const [log, setLog] = useState<string[]>([]); // lignes du terminal, dans l'ordre d'arrivée
  const termRef = useRef<HTMLPreElement>(null);
  const [running, setRunning] = useState<string | null>(null); // essai en cours
  const [menu, setMenu] = useState(false);
  const [accel, setAccel] = useState(1); // vitesse du temps de la batterie simulée (×1 = temps réel)
  const frameRef = useRef<HTMLIFrameElement>(null);
  const pyRef = useRef<Pyodide | null>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  useEffect(() => {
    let dead = false;
    const timers: number[] = [];
    const say = (l: string) => setLog((a) => [...a, l].slice(-400));
    sink = say;
    setLog(['$ python nichoir.py   (Pyodide : Python 3 dans le navigateur, chargement…)']); // remplace : le mode strict de React lance l'effet deux fois en dev
    loadPy().then((py) => {
      if (dead) return;
      pyRef.current = py;
      const api = py.globals.get('api'), tick = py.globals.get('tick'), frame = py.globals.get('frame'), camOn = py.globals.get('cam_on'), ledOn = py.globals.get('led_on');
      window.__piFetch = async (url, opts) => {
        const raw = api(url, opts?.body ?? '');
        const out = typeof raw === 'string' ? raw : undefined; // None côté Python : route inconnue
        const body = opts?.body ? ` ${opts.body}` : '';
        const d = new Date();
        say(`127.0.0.1 - - [${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR')}] "${opts?.method ?? 'GET'} ${url} HTTP/1.1" ${out ? 200 : 404} -${body ? '  ← ' + body.trim() : ''}`); // ligne de journal façon Flask
        return { json: async () => JSON.parse(out ?? 'null') };
      };
      tick();
      let n = 0;
      timers.push(window.setInterval(() => tick(), 1000)); // la boucle de lecture du programme (toutes les secondes en mode simulé)
      timers.push(window.setInterval(() => { // flux vidéo simulés
        const doc = frameRef.current?.contentDocument;
        if (!doc) return;
        n++;
        doc.querySelectorAll<HTMLImageElement>('img.cam').forEach((img, i) => { img.src = !camOn(i) ? OFF : shoot?.(i, !!ledOn(i)) ?? `data:image/png;base64,${String(frame(i, n))}`; }); // vue 3D depuis la caméra ; image de test du Python si la caméra n'existe pas
      }, 300));
      setState('prêt');
    }).catch((e: Error) => { setErr(String(e.message ?? e)); setState('erreur'); });
    return () => {
      dead = true;
      sink = () => {};
      timers.forEach((t) => clearInterval(t));
      delete window.__piFetch;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- volontaire : le simulateur garde la PREMIÈRE fonction `shoot` (elle lit l'état courant par une ref) ; la relancer redémarrerait Python

  useEffect(() => { // la scène 3D de nuit : le panneau solaire ne charge plus ; de jour, il recharge la batterie simulée
    if (state !== 'prêt') return;
    pyRef.current?.globals.get('nuit')(night);
    sink(night ? '# nuit : le panneau solaire ne charge plus, la batterie se décharge' : '# jour : le panneau solaire recharge la batterie (≈ 55 W)');
  }, [night, state]);

  useEffect(() => { const el = termRef.current; if (el) el.scrollTop = el.scrollHeight; }, [log]);

  useEffect(() => { if (state === 'prêt') pyRef.current?.globals.get('acceleration')(accel); }, [accel, state]);

  const fn = (name: string): PyFn => {
    const py = pyRef.current;
    if (!py) throw new Error('Pyodide pas encore chargé');
    return py.globals.get(name);
  };
  const read = (): PiState => JSON.parse(String(fn('etat_json')())) as PiState;
  const cmd = (url: string, body: object) => { fn('api')(url, JSON.stringify(body)); };

  const reset = () => { fn('restaurer')(); sink('# tout remis à zéro (pannes retirées, ventilateur et LED éteints, ventilation automatique désactivée, batterie à 80 %)'); };

  const runTest = async (t: PiTest) => {
    if (running || state !== 'prêt') return;
    setMenu(false); setRunning(t.id);
    sink(`# ESSAI : ${t.label}`); sink(`# ${t.hint}`);
    const f: PyFns = { restaurer: fn('restaurer'), panne: fn('panne'), batterie: fn('batterie'), forcer: fn('forcer') };
    t.setup(f, cmd);
    let verdict = '';
    for (let i = 0; i < t.timeout * 4 && !verdict; i++) {
      await new Promise((res) => setTimeout(res, 250));
      if (!pyRef.current) return; // fenêtre fermée
      const e = read();
      if (t.expect(e)) verdict = t.ok(e);
    }
    sink(verdict ? `✔ TEST OK : ${verdict}` : `✘ TEST ÉCHEC : rien ne s'est produit en ${t.timeout} s`);
    setRunning(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4" onClick={onClose}>
      <div className="flex h-full max-h-[52rem] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-stone-200 px-4 py-2.5">
          <span aria-hidden className="text-lg">🐍</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-stone-800">Interface web du Pi — simulateur</div>
            <div className="truncate text-[11px] text-stone-500">Le vrai <code>pi/nichoir.py</code> (mode simulé) tourne dans ton navigateur (Pyodide) ; la page est le vrai <code>pi/web/index.html</code>.</div>
          </div>
          <div className="flex items-center overflow-hidden rounded bg-stone-100 text-xs font-semibold" title="Vitesse du temps pour la batterie simulée : ×1 = temps réel, ×10 / ×60 pour voir le niveau bouger plus vite" role="group" aria-label="Vitesse du temps">
            {[1, 10, 60].map((a) => (
              <button key={a} onClick={() => setAccel(a)} aria-pressed={accel === a} className={`px-2 py-1 ${accel === a ? 'bg-stone-700 text-white' : 'text-stone-700 hover:bg-stone-200'}`}>×{a}</button>
            ))}
          </div>
          {onToggleNight && (
            <button onClick={onToggleNight} aria-pressed={night} title="Jour / nuit de la scène : les caméras voient la même scène que la vue 3D (la nuit elles sont sombres, les LED infrarouges les éclairent)" className={`rounded px-2.5 py-1 text-xs font-semibold ${night ? 'bg-indigo-900 text-indigo-100 hover:bg-indigo-800' : 'bg-amber-100 text-amber-900 hover:bg-amber-200'}`}>{night ? '🌙 Nuit' : '☀ Jour'}</button>
          )}
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} disabled={state !== 'prêt' || !!running} aria-expanded={menu} title="Essais automatiques : on provoque une panne ou un cas limite et on vérifie que le programme réagit" className="rounded bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-200 disabled:opacity-40">{running ? 'Essai en cours…' : '🧪 Tests'}</button>
            {menu && (
              <div className="absolute top-full right-0 z-10 mt-1 w-80 rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
                {PI_TESTS.map((t) => (
                  <button key={t.id} onClick={() => runTest(t)} className="block w-full rounded px-2.5 py-1.5 text-left hover:bg-stone-100">
                    <div className="text-xs font-semibold text-stone-800">{t.label}</div>
                    <div className="text-[11px] leading-snug text-stone-500">{t.hint}</div>
                  </button>
                ))}
                <button onClick={() => { setMenu(false); reset(); }} className="mt-1 block w-full rounded border-t border-stone-100 px-2.5 py-1.5 text-left text-xs font-semibold text-stone-600 hover:bg-stone-100">↺ Tout remettre à zéro</button>
              </div>
            )}
          </div>
          <button onClick={onClose} className="rounded px-2 text-xl leading-none text-stone-500 hover:bg-stone-100" title="Fermer (Échap)">×</button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_20rem]">
          <div className="relative min-h-0 border-b border-stone-200 md:border-r md:border-b-0">
            {state === 'chargement' && <div className="absolute inset-0 grid place-items-center text-sm text-stone-500">Chargement de Python (≈ 10 Mo, une seule fois)…</div>}
            {state === 'erreur' && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-red-700">Impossible de lancer Python : {err}</div>}
            {state === 'prêt' && <iframe ref={frameRef} title="Page du Pi" srcDoc={PAGE} className="h-full w-full" />}
          </div>
          <div className="flex min-h-0 flex-col bg-black text-stone-200">
            <div className="flex items-center gap-2 border-b border-stone-800 bg-stone-900 px-3 py-1.5">
              <span className="flex gap-1" aria-hidden><i className="h-2.5 w-2.5 rounded-full bg-red-500" /><i className="h-2.5 w-2.5 rounded-full bg-amber-400" /><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-stone-400">pi@nichoir: ~/nichoir</span>
              <button onClick={() => setLog([])} className="rounded px-1.5 text-[10px] text-stone-400 hover:bg-stone-800" title="Effacer le terminal">effacer</button>
            </div>
            <pre ref={termRef} className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
              {log.length ? log.map((l, i) => <div key={i} className={l.startsWith('✘') || l.includes('SÉCURITÉ') || l.includes('DÉLESTAGE') || l.startsWith('! ') ? 'text-red-400' : l.startsWith('✔') ? 'font-bold text-lime-300' : l.startsWith('127.0.0.1') ? 'text-stone-500' : l.startsWith('$') || l.startsWith('#') ? 'text-sky-300' : l.includes('Ventilateur :') || l.includes('LED') ? 'text-amber-300' : 'text-emerald-300'}>{l}</div>) : <span className="text-stone-600">—</span>}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
