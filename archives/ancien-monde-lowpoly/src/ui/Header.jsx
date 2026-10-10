import { Btn } from './common.jsx';

export default function Header() {
  return (
    <>
      <header className="app-head">
        <div className="brand">
          <h1>Monde low poly</h1>
          <small id="saveState" className="hint"></small>
        </div>
        <div className="head-btns">
          <Btn id="export" title="Exporte toute la scène en fichier 3D (.glb)">Exporter 3D</Btn>
          <Btn id="newScene" alt title="Crée une nouvelle scène vide (les autres sont gardées)">+ Scène</Btn>
        </div>
      </header>

      <div id="sceneBar">
        <select id="sceneSel" title="Changer de scène"></select>
        <Btn id="sceneRename" alt title="Renommer la scène">Renommer</Btn>
        <Btn id="sceneDel" alt title="Supprimer la scène">Supprimer</Btn>
      </div>
    </>
  );
}
