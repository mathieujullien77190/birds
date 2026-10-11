import { Btn } from '@/ui';

/** Bouton d'arrêt : toujours rouge, visible pendant un envoi. Arrête le mouvement, éteint le laser (pause, réinitialisation, M5). */
export function StopButton({ onStop, className = '' }: { onStop: () => void; className?: string }) {
  return (
    <Btn block={false} variant="danger" className={`px-4 py-2 text-sm font-bold uppercase tracking-wide ${className}`} onClick={onStop} title="Arrête tout et éteint le laser">
      ■ Arrêt
    </Btn>
  );
}
