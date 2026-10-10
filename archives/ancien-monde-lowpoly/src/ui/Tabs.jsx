const TABS = [
  ['tree', '🌳', 'Arbre'],
  ['world', '🗺️', 'Monde'],
  ['nature', '🌿', 'Nature'],
  ['animals', '🐾', 'Animaux'],
  ['decor', '🏠', 'Décor'],
  ['ambiance', '☀️', 'Ambiance'],
];

export default function Tabs() {
  return (
    <nav id="tabs">
      {TABS.map(([k, ico, t], i) => (
        <button key={k} type="button" className={i === 0 ? 'active' : undefined} data-tab={k}>
          <span className="ico">{ico}</span>
          <span>{t}</span>
        </button>
      ))}
    </nav>
  );
}
