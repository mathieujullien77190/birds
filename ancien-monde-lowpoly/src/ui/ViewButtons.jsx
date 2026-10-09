// Petits boutons flottants en haut à droite de la vue : annuler / rétablir, aide, replier le panneau.
// Leur comportement est branché dans behaviors.js (événements du DOM), pas par l'état React.
export default function ViewButtons() {
  return (
    <div id="viewBtns">
      <button id="undoBtn" type="button" className="alt" title="Annuler (Ctrl+Z)" disabled>↶</button>
      <button id="redoBtn" type="button" className="alt" title="Rétablir (Ctrl+Y)" disabled>↷</button>
      <button id="helpBtn" type="button" className="alt" title="Aide et raccourcis (?)">?</button>
      <button id="panelBtn" type="button" className="alt" title="Replier / déplier le panneau ([)">⇤</button>
    </div>
  );
}
