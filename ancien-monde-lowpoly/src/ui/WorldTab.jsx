import { Tab, Section, Slider, Select, Check, Btn, Hint, Tip } from './common.jsx';

function ParisSection() {
  return (
    <Section title="Arbres de Paris (open data)">
      <Tip>Crée une nouvelle scène avec les vrais arbres (espèce, taille, position) autour d'un point, depuis opendata.paris.fr. Par défaut : le square du Vert-Galant.</Tip>
      <label>Latitude <input id="parisLat" type="text" defaultValue="48.85740" /></label>
      <label>Longitude <input id="parisLon" type="text" defaultValue="2.34020" /></label>
      <Slider id="parisRadius" label="Rayon (mètres)" min="30" max="150" step="5" value="60" />
      <Btn id="parisImport">Importer dans une nouvelle scène</Btn>
    </Section>
  );
}

function TerrainSection() {
  return (
    <Section title="Terrain" open>
      <Slider id="relief" label="Relief (0 = plat)" min="0" max="1.5" step="0.01" value="0.5" />
      <Slider id="hillSize" label="Taille des collines" min="0.5" max="3" step="0.05" value="1" />
      <Select id="groundStyle" label="Type de sol" value="mix" options={[
        ['mix', 'Mélange sable / herbe'],
        ['sand', 'Sable'],
        ['grass', 'Herbe'],
        ['dirt', 'Terre'],
      ]} />
      <Slider id="sandPct" label="Part de sable (mélange)" min="0" max="100" step="1" value="50" after="%" />
      <div className="btns">
        <Btn id="clearPaint" alt>Effacer la peinture</Btn>
        <Btn id="clearSculpt" alt>Aplatir le terrain</Btn>
      </div>
    </Section>
  );
}

function GroundSection() {
  return (
    <Section title="Aspect du sol">
      <Check id="ground" checked>Afficher le sol</Check>
      <Check id="smoothGround">Terrain lisse (sans facettes)</Check>
      <Select id="groundPoly" label="Forme des polygones" value="tri" options={[
        ['tri', 'Triangles irréguliers'],
        ['reg', 'Triangles réguliers'],
        ['quad', 'Carrés'],
        ['big', 'Gros polygones'],
        ['fine', 'Petits polygones'],
      ]} />
    </Section>
  );
}

function WaterSection() {
  return (
    <Section title="Eau" open>
      <Check id="water">Afficher l'eau</Check>
      <Slider id="waterLevel" label="Niveau de l'eau" min="-2" max="1.5" step="0.01" value="-0.3" />
      <Slider id="waterOpacity" label="Opacité de l'eau" min="0.3" max="1" step="0.01" value="0.9" />
      <Hint>Creuse un lac avec l'outil « Eau » : carpes, nénuphars, héron et libellules s'y installent.</Hint>
    </Section>
  );
}

function WallSection() {
  return (
    <Section title="Murs" id="wallSec">
      <div className="btns">
        <Btn id="wallNew">Tracer un mur</Btn>
        <Btn id="wallDel" alt>Supprimer le mur</Btn>
      </div>
      <Hint id="wallPanelState">Aucun mur sélectionné : les réglages servent au prochain tracé.</Hint>
      <Select id="wallType" label="Type de mur" options={[
        ['stone', 'Pierre'],
        ['ashlar', 'Pierre de taille'],
        ['dry', 'Pierre sèche'],
        ['brick', 'Brique'],
        ['plaster', 'Enduit'],
        ['wood', 'Palissade en bois'],
      ]} />
      <Slider id="wallH" label="Hauteur" min="0.1" max="1.2" step="0.01" value="0.4" />
      <Slider id="wallT" label="Épaisseur" min="0.03" max="0.3" step="0.01" value="0.09" />
      <label className="row">Couleur <input id="wallColor" type="color" defaultValue="#b9b2a1" /></label>
      <Check id="wallCap" checked>Chaperon (dessus plus clair)</Check>
      <Check id="wallPillars">Piliers (aux bouts, tous les 2,4)</Check>
      <Check id="wallClosed">Boucle fermée</Check>

      <h4>Plante grimpante</h4>
      <Select id="wallPlant" label="Plante" options={[
        ['none', 'Aucune'],
        ['ivy', 'Lierre'],
        ['virginia', 'Vigne vierge'],
        ['passion', 'Passiflore'],
        ['rose', 'Rosier grimpant'],
        ['clematis', 'Clématite'],
        ['jasmine', 'Jasmin'],
        ['wisteria', 'Glycine'],
      ]} />
      <Slider id="wallPlantAmt" label="Quantité" min="0" max="1" step="0.01" value="0.6" />
      <Select id="wallPlantSide" label="Côté" options={[
        ['both', 'Les deux'],
        ['left', 'Gauche'],
        ['right', 'Droite'],
      ]} />

      <h4>Ouvertures</h4>
      <div className="btns3" style={{ flexWrap: "wrap" }}>
        <Btn id="wallAddDoor" alt>+ Porte</Btn>
        <Btn id="wallAddDoorArch" alt>+ Porte cintrée</Btn>
        <Btn id="wallAddGate" alt>+ Grille</Btn>
        <Btn id="wallAddArch" alt>+ Passage</Btn>
      </div>
      <label>
        Ouverture
        <select id="wallOpenSel"></select>
      </label>
      <div id="wallOpenBox" hidden>
        <Select id="wallOpenKind" label="Type" options={[
          ['door', 'Porte en bois'],
          ['doorarch', 'Porte cintrée'],
          ['gate', 'Grille en métal'],
          ['gatearch', 'Grille cintrée'],
          ['arch', 'Passage ouvert'],
        ]} />
        <Slider id="wallOpenPos" label="Position le long du mur (%)" min="0" max="100" step="1" value="50" />
        <Slider id="wallOpenW" label="Largeur" min="0.1" max="0.8" step="0.01" value="0.2" />
        <Slider id="wallOpenH" label="Hauteur" min="0.12" max="1" step="0.01" value="0.34" />
        <Slider id="wallOpenAngle" label="Ouverte (%)" min="0" max="100" step="1" value="0" />
        <label className="row">Couleur <input id="wallOpenColor" type="color" defaultValue="#7a5230" /></label>
        <Btn id="wallOpenDel" alt>Supprimer l'ouverture</Btn>
      </div>
      <Hint>Outil « Mur » : clique sur le sol pour poser les points, Entrée pour finir. Clique un mur pour le modifier, glisse ses points orange pour le déplacer.</Hint>
    </Section>
  );
}

function PathSection() {
  return (
    <Section title="Chemins" id="pathSec">
      <div className="btns">
        <Btn id="pathNew">Tracer un chemin</Btn>
        <Btn id="pathFinish" alt>Terminer</Btn>
      </div>
      <Hint id="pathPanelState">Aucun chemin sélectionné : les réglages servent au prochain tracé.</Hint>
      <Select id="pathMat" label="Matière" value="sand" options={[
        ['asphalt', 'Goudron'],
        ['sand', 'Sable'],
        ['dirt', 'Terre'],
        ['gravel', 'Gravier'],
        ['cobble', 'Pavés'],
      ]} />
      <Slider id="pathWidth" label="Largeur" min="0.2" max="1.6" step="0.02" value="0.55" />
      <Select id="pathCurve" label="Courbe" value="spline" options={[
        ['spline', 'Lisse (spline)'],
        ['line', 'Segments droits'],
      ]} />
      <Check id="pathLine" checked>Ligne centrale (goudron)</Check>
      <Check id="pathClosed">Boucle fermée</Check>
      <Select id="pathWall" label="Muret de pierre" value="none" options={[
        ['none', 'Aucun'],
        ['left', 'Bord gauche'],
        ['right', 'Bord droit'],
        ['both', 'Les deux bords'],
      ]} />
      <Slider id="pathWallH" label="Hauteur du muret" min="0.09" max="0.6" step="0.01" value="0.18" />
      <Slider id="pathWallT" label="Épaisseur du muret" min="0.05" max="0.3" step="0.01" value="0.12" />
      <label className="row">Pierre du muret <input id="pathWallColor" type="color" defaultValue="#9a9ea6" /></label>
      <Btn id="pathDel" alt>Supprimer le chemin sélectionné</Btn>
      <Hint>Outil « Chemin » : clique sur le sol pour poser les points (près du tracé = insère un point). Glisse un point orange pour le déplacer, Maj + clic pour le supprimer, Entrée pour finir. Clique un chemin pour le modifier.</Hint>
    </Section>
  );
}

export default function WorldTab() {
  return (
    <Tab name="world" hidden>
      <Tip>Dessine le terrain avec la barre d'outils en haut de la vue : monter, descendre, eau, sable, herbe, terre, chemin.</Tip>
      <ParisSection />
      <TerrainSection />
      <GroundSection />
      <WaterSection />
      <WallSection />
      <PathSection />
    </Tab>
  );
}
