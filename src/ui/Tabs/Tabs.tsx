import type { TabDef } from './types';

/** Onglets en haut du panneau. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: TabDef<T>[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1 rounded-lg bg-stone-200/70 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`rounded-md px-1 py-1.5 text-[11px] font-medium transition-colors ${value === t.id ? 'bg-white text-emerald-900 shadow-sm' : 'text-stone-600 hover:bg-white/60'}`}
        >
          {t.label}
          {t.badge !== undefined && <span className="ml-1 rounded-full bg-emerald-100 px-1 text-[9px] text-emerald-800">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}
