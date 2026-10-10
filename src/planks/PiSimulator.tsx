import { useEffect, useRef, useState } from 'react';
import nichoirPy from '../../pi/nichoir.py?raw';
import indexHtml from '../../pi/web/index.html?raw';
import appJs from '../../pi/web/app.js?raw';

/** Simulateur de l'interface web du Pi : le VRAI `pi/nichoir.py` (mode simulé) tourne dans le navigateur grâce à Pyodide (Python compilé en WebAssembly),
 *  et la VRAIE page `pi/web/index.html` + `app.js` s'affiche dans un cadre. Seul Flask est remplacé par une petite doublure : les appels de la page
 *  (`fetch('/api/…')`) sont envoyés directement aux fonctions de routes du programme Python, sans réseau. Pyodide est téléchargé à l'ouverture (≈ 10 Mo). */
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Py = any;
let pyPromise: Promise<Py> | null = null;
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
    elif url == "/api/peltier": fl.request.payload = json.loads(body or "{}"); r = nichoir.api_peltier()
    elif url == "/api/led": fl.request.payload = json.loads(body or "{}"); r = nichoir.api_led()
    else: return None
    return json.dumps(r)

def tick():
    nichoir.lecture()

def frame(num, n):
    return base64.b64encode(nichoir.cameras[num].image(n, 160, 120)).decode()

def surchauffe(v):
    nichoir.MOCK_SURCHAUFFE = float(v)
`;

function loadPy(): Promise<Py> {
  pyPromise ??= new Promise<Py>((resolve, reject) => {
    const boot = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const py = await (window as any).loadPyodide({ indexURL: PYODIDE });
      py.setStdout({ batched: (l: string) => sink(l) });
      py.setStderr({ batched: (l: string) => sink('! ' + l) });
      py.globals.set('SRC', nichoirPy);
      py.runPython(BOOT);
      return py;
    };
    if ((window as unknown as { loadPyodide?: unknown }).loadPyodide) { boot().then(resolve, reject); return; }
    const s = document.createElement('script');
    s.src = PYODIDE + 'pyodide.js';
    s.onload = () => boot().then(resolve, reject);
    s.onerror = () => reject(new Error('Pyodide introuvable (hors ligne ?)'));
    document.head.appendChild(s);
  });
  pyPromise.catch(() => { pyPromise = null; });
  return pyPromise;
}

/** Page du Pi, avec `fetch` redirigé vers le Python du parent (le cadre est de même origine : `parent.__piFetch`). */
const PAGE = indexHtml.replace(
  '<script src="app.js"></script>',
  () => `<script>window.fetch = (u, o) => parent.__piFetch(u, o);</script><script>${appJs}</script>`,
).replace(/(<img class="cam" src=)"[^"]*"/g, '$1""');

export function PiSimulator({ onClose, shoot }: { onClose: () => void; shoot?: (num: number) => string | null }) {
  const [state, setState] = useState<'chargement' | 'prêt' | 'erreur'>('chargement');
  const [err, setErr] = useState('');
  const [log, setLog] = useState<string[]>([]); // lignes du terminal, dans l'ordre d'arrivée
  const termRef = useRef<HTMLPreElement>(null);
  const [hot, setHot] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const pyRef = useRef<Py>(null);

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
      const api = py.globals.get('api'), tick = py.globals.get('tick'), frame = py.globals.get('frame');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__piFetch = async (url: string, opts?: { method?: string; body?: string }) => {
        const out = api(url, opts?.body ?? '');
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
        doc.querySelectorAll<HTMLImageElement>('img.cam').forEach((img, i) => { img.src = shoot?.(i) ?? 'data:image/png;base64,' + frame(i, n); }); // vue 3D depuis la caméra ; image de test du Python si la caméra n'existe pas
      }, 300));
      setState('prêt');
    }).catch((e: Error) => { setErr(String(e.message ?? e)); setState('erreur'); });
    return () => {
      dead = true;
      sink = () => {};
      timers.forEach((t) => clearInterval(t));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__piFetch;
    };
  }, []);

  useEffect(() => { const el = termRef.current; if (el) el.scrollTop = el.scrollHeight; }, [log]);

  const toggleHot = () => {
    const v = !hot;
    setHot(v);
    pyRef.current?.globals.get('surchauffe')(v ? 60 : 0);
    sink(`# NICHOIR_MOCK_SURCHAUFFE=${v ? 60 : 0} : le dissipateur monte à ${v ? 60 : 0} °C quand le Peltier tourne (coupure à 55 °C)`);
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
          <button onClick={toggleHot} disabled={state !== 'prêt'} aria-pressed={hot} title="Force le dissipateur à 60 °C dès que le Peltier tourne : essai de la coupure de sécurité à 55 °C" className={`rounded px-2.5 py-1 text-xs font-semibold disabled:opacity-40 ${hot ? 'bg-red-600 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>🔥 Surchauffe 60 °C</button>
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
              {log.length ? log.map((l, i) => <div key={i} className={l.includes('SÉCURITÉ') || l.startsWith('! ') ? 'text-red-400' : l.startsWith('127.0.0.1') ? 'text-stone-500' : l.startsWith('$') || l.startsWith('#') ? 'text-sky-300' : l.includes('Peltier :') || l.includes('LED') ? 'text-amber-300' : 'text-emerald-300'}>{l}</div>) : <span className="text-stone-600">—</span>}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
