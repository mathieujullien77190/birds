export default function EditBar() {
  return (
    <div id="editBar" hidden>
      <div className="eb-row">
        <strong>Modification avancée</strong>
        <button id="edSelect" type="button" className="alt active" title="Cliquer une branche pour la sélectionner ; glisser la boule du bout pour l'orienter, la boule de la base pour la faire glisser sur sa branche parente (Maj = garder la longueur)">Sélectionner / orienter</button>
        <button id="edAdd" type="button" className="alt" title="Cliquer un point d'une branche puis glisser pour créer une branche">Ajouter</button>
        <button id="edDel" type="button" className="danger" title="Supprime la branche sélectionnée et ses sous-branches (Suppr)">Supprimer</button>
        <button id="edUndo" type="button" className="alt" title="Annuler (Ctrl+Z)">Annuler</button>
        <button id="edRedo" type="button" className="alt" title="Rétablir (Ctrl+Y)">Rétablir</button>
        <label className="eb-leaves"><input id="edLeaves" type="checkbox" defaultChecked /> Feuillage</label>
        <button id="edDone" type="button" title="Terminer (Échap)">Terminer</button>
      </div>
      <small id="edHint"></small>
    </div>
  );
}
