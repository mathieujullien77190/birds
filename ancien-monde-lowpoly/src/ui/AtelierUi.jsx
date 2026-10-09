import { Slider, Check } from './common.jsx';

const SHAPES = [['egg', 'Corps'], ['sphere', 'Tête'], ['beak', 'Bec'], ['eye', 'Œil'], ['wing', 'Aile'], ['hip', 'Bassin'], ['thigh', 'Cuisse'], ['shin', 'Jambe'], ['foot', 'Patte']]; // formes disponibles pour l'instant : on ajoutera le reste pas à pas

// Atelier d'animaux : barre du haut (nom, taille, enregistrer) et panneau de gauche (formes, pièces, réglages de la pièce choisie)
export default function AtelierUi() {
  return (
    <>
      <div id="atBar" hidden>
        <div className="eb-row">
          <strong>Atelier d'animaux</strong>
          <input id="atName" type="text" defaultValue="Mon animal" maxLength="30" />
          <label className="eb-leaves">Taille dans la scène <input id="atSize" type="range" min="0.15" max="1.5" step="0.01" defaultValue="0.5" /></label>
          <button id="atUndo" type="button" className="alt" title="Annuler la dernière action (Ctrl+Z)" disabled>↶ Annuler</button>
          <button id="atRedo" type="button" className="alt" title="Rétablir (Ctrl+Y)" disabled>↷ Rétablir</button>
          <button id="atNew" type="button" className="alt" title="Efface l'animal en cours et repart de zéro">Nouveau</button>
          <button id="atSave" type="button">Enregistrer l'animal</button>
          <button id="atQuit" type="button" className="alt">Quitter</button>
        </div>
        <small>Avant de l'animal = flèche verte (+Z) · trait orange = plan de symétrie · <span id="atFaces"></span></small>
      </div>
      <div id="atPanel" hidden>
        <h2>Modèles</h2>
        <div className="at-grid">
          <button id="atAnim" type="button" className="alt" title="Aperçu animé en boucle : hochements de tête, sautillements, picorage. Ne modifie rien.">Animer</button>
          <button id="atGreatTit" type="button" title="Construit toute la mésange charbonnière : corps jaune à bande noire, tête noire aux joues blanches, ailes, manteau vert, queue et pattes">Mésange charbonnière</button>
          <button id="atMvPitch" type="button" className="alt" title="La tête monte et descend, en boucle">Tête : bas / haut</button>
          <button id="atMvYaw" type="button" className="alt" title="La tête tourne à gauche puis à droite, en boucle">Tête : gauche / droite</button>
          <button id="atMvBow" type="button" className="alt" title="Le corps bascule vers l'avant comme pour se baisser, puis se redresse, en boucle">Corps : se baisse</button>
          <button id="atMvLean" type="button" className="alt" title="Le corps se penche à gauche puis à droite ; la queue fait balancier, les pattes suivent un peu">Corps : penche gauche / droite</button>
          <button id="atHoopoe" type="button" title="Construit toute la huppe fasciée : corps orangé, long bec noir, huppe à bout noir, ailes et queue rayées noir et blanc">Huppe fasciée</button>
          <button id="atHoopoeFly" type="button" title="La huppe fasciée en plein vol : corps à l'horizontale, grandes ailes ouvertes rayées noir et blanc">Huppe en vol</button>
          <button id="atHoopoeFlySave" type="button" className="alt" title="Les pièces actuelles deviennent la huppe volante de la scène">Enregistrer comme Huppe en vol</button>
          <button id="atHoopoeFlyReset" type="button" className="alt" title="Oublie ta version de la huppe en vol">Huppe en vol d'origine</button>
          <button id="atHoopoeSave" type="button" className="alt" title="Les pièces actuelles deviennent la huppe fasciée, dans l'atelier et dans la scène">Enregistrer comme Huppe</button>
          <button id="atHoopoeReset" type="button" className="alt" title="Oublie ta version de la huppe et revient à celle construite">Huppe d'origine</button>
          <button id="atTitSave" type="button" className="alt" title="Garde les pièces actuelles comme version de la mésange bleue">Enregistrer comme Mésange</button>
          <button id="atCopy" type="button" className="alt" title="Copie toutes les pièces en JSON pour me les envoyer">Copier les pièces</button>
        </div>
        <h2>Ajouter une forme</h2>
        <div id="atShapes" className="at-grid">
          {SHAPES.map(([k, t]) => (
            <button key={k} type="button" className="alt" data-shape={k}>{t}</button>
          ))}
          <button type="button" className="alt" data-pair="eye" title="Deux yeux, un de chaque côté">Paire d'yeux</button>
          <button type="button" className="alt" data-pair="wing" title="Deux ailes, une de chaque côté">Paire d'ailes</button>
          <button type="button" className="alt" data-pair="tail" title="Deux plumes rectangulaires, au bout aplati, qui se croisent légèrement">Queue (2 plumes)</button>
          <button type="button" className="alt" data-pair="leg" title="Un bassin (rond vertical à 2 points d'accroche) puis, de chaque côté, cuisse, jambe et patte">Pattes complètes</button>
        </div>
        <h2>Plan de coupe</h2>
        <div className="at-grid">
          <button id="atPlaneToggle" type="button" className="alt" title="Un plan que l'on déplace le long d'un axe et que l'on tourne ; il trace sa section sur toutes les formes">Afficher le plan</button>
        </div>
        <div id="atPlaneBox" hidden>
          <label>Direction du plan (sa normale)
            <select id="atPlaneAxis" defaultValue="1">
              <option value="1">Horizontal (normale Y, il monte et descend)</option>
              <option value="2">Normale Z (il avance et recule)</option>
              <option value="0">Normale X (il va à droite et à gauche)</option>
            </select>
          </label>
          <Slider id="atPlanePos" label="Position sur l'axe (ou glisse le point orange)" min="-1.5" max="2.5" step="0.005" value="0.5" />
          <Slider id="atPlaneRX" label="Rotation X du plan" min="-180" max="180" step="1" value="0" after="°" />
          <Slider id="atPlaneRY" label="Rotation Y du plan" min="-180" max="180" step="1" value="0" after="°" />
          <Slider id="atPlaneRZ" label="Rotation Z du plan" min="-180" max="180" step="1" value="0" after="°" />
          <Check id="atPlaneCut" checked>Tracer la section sur les formes (trait noir)</Check>
          <div className="at-grid">
            <button id="atCutUp" type="button" title="Coupe la forme sélectionnée : on garde ce qui est au-dessus du plan (côté de sa normale)">Couper : garder le dessus</button>
            <button id="atCutDown" type="button" title="Coupe la forme sélectionnée : on garde ce qui est en dessous du plan">Couper : garder le dessous</button>
            <button id="atEggWing" type="button" title="Crée une aile : la peau de l'œuf du corps située au-dessus du plan, coupée par le plan, avec sa symétrique">Aile : peau de l'œuf au-dessus du plan</button>
            <button id="atCutUndo" type="button" className="alt">Annuler les coupes</button>
          </div>
          <button id="atPlaneReset" type="button" className="alt">Remettre le plan à zéro</button>
        </div>
        <h2>Pièces</h2>
        <div id="atParts" className="at-grid"></div>
        <div id="atSelBox" hidden>
          <div className="at-grid">
            <button id="atModeMove" type="button">Déplacer</button>
            <button id="atModeRotate" type="button" className="alt">Tourner</button>
            <button id="atModeStretch" type="button" className="alt">Étirer</button>
            <button id="atModeDraw" type="button" className="alt" title="Pose des points sur les coins des polygones d'une forme">Dessiner</button>
            <button id="atDetach" type="button" className="alt">Décrocher</button>
          </div>
          <div className="at-grid" title="Cocher un axe supprime son anneau de rotation. Deux axes verrouillés : la pièce ne peut tourner qu'autour du troisième.">
            <span>Verrouiller la rotation (mode Tourner) :</span>
            <label className="row"><input id="atLockX" type="checkbox" /> X</label>
            <label className="row"><input id="atLockY" type="checkbox" /> Y</label>
            <label className="row"><input id="atLockZ" type="checkbox" /> Z</label>
          </div>
          <Slider id="atSizeU" label="Taille de la forme" min="0.05" max="4" step="0.01" value="1" />
          <Slider id="atDetail" label="Nombre de polygones (finesse)" min="1" max="8" step="1" value="2" />
          <small id="atDetailInfo" className="hint"></small>
          <Slider id="atPX" label="Position X" min="-1.5" max="1.5" step="0.005" value="0" />
          <Slider id="atPY" label="Position Y (hauteur)" min="-0.2" max="1.8" step="0.005" value="0.5" />
          <Slider id="atPZ" label="Position Z (avant)" min="-1.5" max="1.5" step="0.005" value="0" />
          <Slider id="atRX" label="Rotation X" min="-180" max="180" step="1" value="0" after="°" />
          <Slider id="atRY" label="Rotation Y" min="-180" max="180" step="1" value="0" after="°" />
          <Slider id="atRZ" label="Rotation Z" min="-180" max="180" step="1" value="0" after="°" />
          <Slider id="atSX" label="Étirement X (largeur)" min="0.02" max="4" step="0.01" value="1" />
          <Slider id="atSY" label="Étirement Y (hauteur)" min="0.02" max="4" step="0.01" value="1" />
          <Slider id="atSZ" label="Étirement Z (longueur)" min="0.02" max="4" step="0.01" value="1" />
          <label className="row">Couleur <input id="atColor" type="color" defaultValue="#c8a070" /></label>
          <div id="atSlideBox" hidden>
            <label>Cale la pièce liée sur
              <select id="atSlideAxis" defaultValue="">
                <option value="">Libre (aucun calage)</option>
                <option value="0">Grand axe 1 (X, rouge)</option>
                <option value="1">Grand axe 2 (Y, vert)</option>
                <option value="2">Grand axe 3 (Z, bleu)</option>
              </select>
            </label>
            <Slider id="atSink" label="Enfoncer dans la pièce parente" min="0" max="0.4" step="0.005" value="0" />
          </div>
          <div id="atSymBox" hidden>
            <label>Plan de symétrie de la paire<select id="atSymRef"></select></label>
            <label>Axe de la pièce de référence<select id="atSymAxis" defaultValue="0"><option value="0">X (rouge)</option><option value="1">Y (vert)</option><option value="2">Z (bleu)</option></select></label>
          </div>
          <Check id="atStretchBoth" checked>Étirer des deux côtés (décoché : seulement le côté du point tiré)</Check>
          <Check id="atAxes">Afficher les axes et les arcs de symétrie</Check>
          <Check id="atSmooth" checked>Lisser la forme (arrondi, sans facettes)</Check>
          <Check id="atMirror">Symétrique (copie de l'autre côté)</Check>
          <div className="at-grid">
            <button id="atDotUndo" type="button" className="alt" title="Retire le dernier point posé sur cette forme">Annuler le dernier point</button>
            <button id="atDotClear" type="button" className="alt" title="Efface tous les points de cette forme">Effacer les points</button>
            <button id="atDup" type="button" className="alt">Dupliquer</button>
            <button id="atDefault" type="button" className="alt" title="Les prochaines formes de ce type apparaîtront avec l'orientation, les étirements et la couleur de celle-ci">Définir comme défaut</button>
            <button id="atDefaultReset" type="button" className="alt" title="Revient au réglage d'origine pour ce type de forme">Défaut d'origine</button>
            <button id="atDel" type="button" className="danger">Supprimer</button>
          </div>
        </div>
      </div>
    </>
  );
}
