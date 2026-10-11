import { useMemo, useState } from 'react';
import { Btn, Chip, Section, Terminal } from '@/ui';
import type { Grbl } from '../../hooks/useGrbl';
import { toTerminal } from './helpers';

/** Journal des échanges avec la machine (envoyé en bleu, reçu en blanc), repliable. Aucune saisie manuelle : on ne peut pas y envoyer de commande. */
export function GrblConsole({ grbl }: { grbl: Grbl }) {
  const [polls, setPolls] = useState(false);
  const lines = useMemo(() => toTerminal(grbl.log, polls), [grbl.log, polls]);
  return (
    <Section title="Journal GRBL" note={`${grbl.log.length} échanges`}>
      <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
        <Chip active={polls} onClick={() => setPolls((p) => !p)}>Afficher les statuts (?)</Chip>
        <Btn block={false} variant="ghost" onClick={grbl.clearLog}>Vider</Btn>
      </div>
      <Terminal lines={lines} empty="Aucun échange : connecte la machine." />
    </Section>
  );
}
