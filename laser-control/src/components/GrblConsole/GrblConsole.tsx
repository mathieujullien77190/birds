import { useMemo, useState } from 'react';
import { Btn, Chip, Section, Terminal } from '../../ui';
import type { Grbl } from '../../hooks/useGrbl';
import { consoleCommand, toTerminal } from './helpers';

/** Journal des échanges avec la machine (envoyé en bleu, reçu en blanc), repliable. Une ligne de saisie envoie les seules commandes système (`$I`, `$$`, `$s`…) : jamais de G-code, donc aucun tir possible d'ici. */
export function GrblConsole({ grbl }: { grbl: Grbl }) {
  const [polls, setPolls] = useState(false);
  const [text, setText] = useState('');
  const cmd = consoleCommand(text);
  const busy = !grbl.connected;
  const send = () => { if (cmd) { void grbl.command(cmd); setText(''); } };
  const lines = useMemo(() => toTerminal(grbl.log, polls), [grbl.log, polls]);
  return (
    <Section title="Journal GRBL" note={`${grbl.log.length} échanges`}>
      <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
        <Chip active={polls} onClick={() => setPolls((p) => !p)}>Afficher les statuts (?)</Chip>
        <Btn block={false} variant="ghost" onClick={grbl.clearLog}>Vider</Btn>
      </div>
      <Terminal lines={lines} empty="Aucun échange : connecte la machine." />
      <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input
          value={text} onChange={(e) => setText(e.target.value)} disabled={busy} spellCheck={false} autoComplete="off" aria-label="Commande système"
          placeholder="$I, $$, $s…" className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-2 py-1 font-mono text-xs disabled:opacity-40"
        />
        <Btn block={false} variant="primary" type="submit" disabled={busy || !cmd}>Envoyer</Btn>
      </form>
      {text.trim() !== '' && !cmd && <p className="text-[11px] text-rose-600">Seules les commandes qui commencent par $ sont acceptées ici (pas de G-code).</p>}
      <div className="flex flex-wrap gap-1.5">
        {['$I', '$$', '$s'].map((c) => <Btn key={c} block={false} variant="ghost" disabled={busy} onClick={() => void grbl.command(c)}>{c}</Btn>)}
      </div>
    </Section>
  );
}
