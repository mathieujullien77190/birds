// [id, couleur, nom, aide, raccourci] ; null = séparateur de groupe
const TOOLS = [
  ['none', '#8ec1ff', 'Sélection', 'Sélectionner et déplacer les objets', 'V'],
  null,
  ['raise', '#f5a25d', 'Monter', 'Monter le terrain', 'M'],
  ['lower', '#b07cf0', 'Descendre', 'Descendre le terrain', 'D'],
  ['level', '#e8e8f0', 'Niveler', "Niveler : aplanir le terrain à une hauteur choisie (Maj + clic = prendre la hauteur d'un point)", 'N'],
  ['smooth', '#cfd6df', 'Lisser', 'Lisser le relief', 'L'],
  null,
  ['water', '#4aa8d8', 'Eau', "Creuser et remplir d'eau", 'E'],
  null,
  ['sand', '#e9c46a', 'Sable', 'Peindre du sable', 'S'],
  ['grass', '#6fcf5a', 'Herbe', "Peindre de l'herbe", 'H'],
  ['dirt', '#a5683c', 'Terre', 'Peindre de la terre', 'T'],
  ['meadow', '#8fd36a', 'Prairie', "Semer vite de l'herbe haute avec des fleurs : glisse sur le sol", 'P'],
  null,
  ['path', '#ff9a3c', 'Chemin', 'Tracer un chemin', 'C'],
  ['wall', '#d8c9a8', 'Mur', 'Tracer un mur : pierre, brique, enduit, palissade… avec porte, grille et plantes grimpantes', 'W'],
];

export default function Toolbar() {
  return (
    <div id="toolbar" data-tool="none">
      <div id="tools" className="tools">
        {TOOLS.map((tool, i) =>
          tool ? (
            <button key={tool[0]} type="button" className={tool[0] === 'none' ? 'tool active' : 'tool'} data-brush={tool[0]} data-key={tool[4]} style={{ '--c': tool[1] }} title={tool[3] + ' (' + tool[4] + ')'}>{tool[2]}</button>
          ) : (
            <span key={'sep' + i} className="tool-sep" />
          )
        )}
      </div>
      <input id="brush" type="hidden" defaultValue="none" />
      <div id="waterBar" title="Niveau de l'eau">
        <span>Niveau de l'eau</span>
        <button id="waterDown" type="button" className="alt" title="Baisser l'eau">−</button>
        <b id="waterVal"></b>
        <button id="waterUp" type="button" className="alt" title="Monter l'eau">+</button>
      </div>
      <div id="brushOpts">
        <label>Taille <input id="brushSize" type="range" min="0.3" max="4" step="0.05" defaultValue="1.2" /> <b data-for="brushSize"></b></label>
        <label id="levelWrap">Hauteur <input id="levelH" type="range" min="-1.5" max="2" step="0.01" defaultValue="0" /> <b data-for="levelH"></b></label>
        <label>Force <input id="brushStr" type="range" min="0.1" max="1" step="0.05" defaultValue="0.5" /> <b data-for="brushStr"></b></label>
      </div>
    </div>
  );
}
