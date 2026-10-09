export default function PoseBar() {
  return (
    <div id="poseBar" hidden>
      <div className="eb-row">
        <strong>Modification avancée</strong>
        <span id="poseJoint">aucune articulation sélectionnée</span>
        <button id="poseResetJoint" type="button" className="alt" title="Remet l'articulation sélectionnée droite">Réinitialiser l'articulation</button>
        <button id="poseResetAll" type="button" className="alt" title="Remet toutes les articulations droites">Tout réinitialiser</button>
        <button id="poseDone" type="button" title="Terminer (Échap)">Terminer</button>
      </div>
      <small>Clique un point bleu pour choisir l'articulation : trois anneaux apparaissent (rouge : plier d'avant en arrière, vert : tourner à droite / à gauche, bleu : pencher sur le côté). Glisse le long d'un anneau pour tourner. Glisser directement le point fait tourner librement.</small>
    </div>
  );
}
