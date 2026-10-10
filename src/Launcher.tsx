import { TOOLS, toolUrl } from './tools';

/** Menu de départ : un bouton par outil. */
export default function Launcher() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-stone-100 p-6">
      <div className="w-full max-w-xl space-y-5">
        <header>
          <h1 className="text-xl font-semibold text-emerald-900">Atelier</h1>
          <p className="text-sm text-stone-500">Choisis un outil. En ligne de commande : <code className="rounded bg-stone-200 px-1">npm run dev bird</code> ou <code className="rounded bg-stone-200 px-1">npm run dev birdhouse</code>.</p>
        </header>
        <ul className="space-y-3">
          {TOOLS.map((t) => (
            <li key={t.id}>
              <a href={toolUrl(t.id)} className="block rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition-colors hover:border-emerald-400 hover:bg-emerald-50">
                <span className="block text-base font-semibold text-emerald-900">{t.title}</span>
                <span className="mt-1 block text-sm text-stone-600">{t.text}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
