import { Slider, Btn, Hint } from './common.jsx';

export default function SelectionPanel() {
  return (
    <div id="selPanel" hidden>
      <h2>Objet sélectionné</h2>
      <Slider id="selScale" label="Taille" min="0.3" max="2.5" step="0.01" value="1" />
      <Slider id="selRot" label="Rotation" min="0" max="360" step="1" value="0" after="°" />
      <Btn id="selEdit" className="edit-btn" hidden>Modifier les branches</Btn>
      <Btn id="selPose" className="edit-btn" hidden>Modifier la pose (articulations)</Btn>
      <div className="btns">
        <Btn id="selDup" alt>Dupliquer</Btn>
        <Btn id="selDelete" className="danger">Supprimer</Btn>
      </div>
      <Hint>Glisse l'objet pour le déplacer, la boule blanche pour le tourner. Échap : désélectionner.</Hint>
    </div>
  );
}
