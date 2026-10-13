/** Nom cliquable : un clic choisit (le renommage a été retiré à la demande de l'utilisateur). */
export function NameEdit({ value, onSelect, prefix = '', title }: { value: string; active?: boolean; onSelect: (e: React.MouseEvent) => void; prefix?: string; title?: string }) {
  return <button onClick={onSelect} className="min-w-0 flex-1 whitespace-normal text-left font-semibold leading-tight text-stone-800 [overflow-wrap:anywhere]" title={title}>{prefix}{value}</button>;
}
