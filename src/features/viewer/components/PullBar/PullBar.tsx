import { Btn, FloatingPanel } from '@/ui';

/** Bandeau « Face en pointillés : tire-la ou pousse-la » (tirage d'une face, plus accessible depuis l'interface) avec « Terminer ». */
export function PullBar({ cutOn, onDone }: { cutOn: boolean; onDone: () => void }) {
  return (
    <FloatingPanel tone="sky" className={`absolute ${cutOn ? 'top-72' : 'top-14'} right-3 flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-sky-800`}>
      Face en pointillés : tire-la ou pousse-la (les plaques connectées suivent, 1 mm minimum).
      <Btn block={false} variant="ghost" onClick={onDone}>Terminer</Btn>
    </FloatingPanel>
  );
}
