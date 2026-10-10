import { useEffect, useState } from 'react';

const MOUSE = [
  ['Clic gauche', 'Sélectionner, déplacer un objet, peindre, poser les points'],
  ['Clic molette (glisser)', 'Tourner la vue'],
  ['Clic droit (glisser)', 'Déplacer la vue'],
  ['Roulette', 'Zoomer'],
  ['Boule blanche', 'Tourner l\'objet sélectionné'],
];
const KEYS = [
  ['V', 'Sélection'], ['M / D', 'Monter / Descendre'], ['N / L', 'Niveler / Lisser'], ['E', 'Eau'], ['S / H / T', 'Sable / Herbe / Terre'],
  ['P', 'Prairie'], ['C / W', 'Chemin / Mur'], ['Entrée', 'Terminer un tracé'], ['Suppr', 'Supprimer la sélection'], ['Échap', 'Désélectionner / quitter l\'outil'],
  ['Ctrl+Z / Ctrl+Y', 'Annuler / Rétablir'], ['[', 'Replier le panneau'], ['?', 'Cette aide'],
];

// Seul composant React avec un état : il s'ouvre via l'événement « lowpoly-help » (bouton ou touche ?).
export default function Help() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('lowpoly-help', toggle);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('lowpoly-help', toggle); window.removeEventListener('keydown', esc); };
  }, []);
  if (!open) return null;
  return (
    <div id="help" onClick={() => setOpen(false)}>
      <div className="help-card" onClick={(e) => e.stopPropagation()}>
        <h2>Aide</h2>
        <h3>Souris</h3>
        <dl>{MOUSE.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}</dl>
        <h3>Raccourcis</h3>
        <dl>{KEYS.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}</dl>
        <p className="help-tip">Tout est enregistré automatiquement dans le navigateur, scène par scène. « Exporter 3D » produit un fichier .glb.</p>
        <button type="button" onClick={() => setOpen(false)}>Fermer</button>
      </div>
    </div>
  );
}
