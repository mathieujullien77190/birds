import { Tab, Section, Slider, Select, Check, Btn, Hint } from './common.jsx';

export default function TreeTab() {
  return (
    <Tab name="tree">
      <Slider id="sceneDiam" label="Diamètre de la scène" min="6" max="50" step="1" value="14" />
      <p className="tip">
        <b>+</b> ajoute un arbre de ce type, <b>−</b> retire le dernier. Clique un arbre dans la vue pour le déplacer, le tourner ou régler sa forme ci-dessous ; cliquer le nom d'un type transforme l'arbre sélectionné.
        <br />
        <b>Vue :</b> clic molette = tourner, clic droit = déplacer, roulette = zoom.
      </p>
      <div id="treePresets" className="rows"></div>
      <div className="btns">
        <Btn id="randomize" title="Tire tous les réglages au hasard">Aléatoire</Btn>
        <Btn id="newvar" alt title="Même réglages, autre tirage">Nouvelle variation</Btn>
      </div>
      <Select id="type" label="Type d'arbre" value="broad" options={[
        ['broad', 'Feuillu (branches)'],
        ['conifer', 'Conifère (étages)'],
        ['bamboo', 'Bambou (touffe)'],
      ]} />

      <Section title="Tronc et branches" open>
        <Slider id="trunkH" label="Hauteur du tronc" min="0.4" max="2.2" step="0.01" value="1" />
        <Slider id="trunkW" label="Épaisseur du tronc" min="0.05" max="0.5" step="0.005" value="0.18" />
        <Slider id="levels" label="Niveaux de sous-branches" min="1" max="5" step="1" value="4" />
        <Slider id="kids" label="Branches par fourche" min="1" max="4" step="1" value="2" />
        <Slider id="angle" label="Angle d'ouverture" min="10" max="85" step="1" value="42" />
      </Section>

      <Section title="Pot / bac (arbres de ville)">
        <Select id="pot" label="Contenant" value="none" options={[
          ['none', 'Aucun (en pleine terre)'],
          ['round', 'Pot rond'],
          ['square', 'Bac carré'],
          ['grate', "Grille d'arbre"],
        ]} />
        <label className="row">
          Couleur du pot <input id="potColor" type="color" defaultValue="#b5653f" />
        </label>
      </Section>

      <Section title="Forme avancée (courbure, torsion…)">
        <Slider id="lenR" label="Longueur des sous-branches" min="0.4" max="0.95" step="0.01" value="0.72" />
        <Slider id="radR" label="Épaisseur des sous-branches" min="0.4" max="0.9" step="0.01" value="0.66" />
        <Slider id="curv" label="Courbure" min="0" max="1" step="0.01" value="0.35" />
        <Slider id="twist" label="Torsion (spirale)" min="0" max="1" step="0.01" value="0.4" />
        <Slider id="droop" label="Retombée (− monte / + pleure)" min="-1" max="1" step="0.01" value="0" />
        <Slider id="irr" label="Irrégularité" min="0" max="1" step="0.01" value="0.4" />
        <Hint>Les branches retouchées à la main sont conservées quand tu changes couleurs ou feuillage, mais réinitialisées si tu changes un de ces réglages de forme.</Hint>
      </Section>

      <Section title="Feuillage et couleurs" open>
        <Slider id="density" label="Densité (0 = aucune feuille)" min="0" max="100" step="1" value="60" />
        <Slider id="leafSize" label="Taille des touffes" min="0.1" max="0.7" step="0.01" value="0.24" />
        <Slider id="leafSoft" label="Douceur du feuillage" min="0" max="1" step="0.01" value="0.7" />
        <Select id="leafShape" label="Forme des feuilles" value="sphere" options={[
          ['sphere', 'Boules'],
          ['cloud', 'Nuages (aplatis)'],
          ['crystal', 'Cristaux (pointus)'],
          ['leaf', 'Feuilles plates'],
          ['strand', 'Fils pendants (saule)'],
          ['cone', 'Cônes / aiguilles'],
          ['cube', 'Cubes'],
        ]} />
        <Select id="fruit" label="Fruits" value="none" options={[
          ['none', 'Aucun'],
          ['apple', 'Pommes'],
          ['cherry', 'Cerises'],
          ['pear', 'Poires'],
          ['orange', 'Oranges'],
          ['lemon', 'Citrons'],
          ['plum', 'Prunes'],
          ['walnut', 'Noix'],
        ]} />
        <Slider id="fruitDensity" label="Quantité de fruits" min="0" max="1" step="0.01" value="0.6" />
        <label className="row">
          Feuillage <input id="fc" type="color" defaultValue="#5fa14a" /> 2e <input id="fc2" type="color" defaultValue="#e0821f" /> Tronc <input id="tc" type="color" defaultValue="#6b4a2f" />
        </label>
      </Section>

      <Section title="Feuillage avancé">
        <Slider id="leafPoly" label="Détail des boules (0 = très low poly)" min="0" max="3" step="1" value="2" />
        <Slider id="leafVar" label="Variation de taille" min="0" max="1" step="0.01" value="0.3" />
        <Slider id="squash" label="Aplatissement" min="0.3" max="1.6" step="0.01" value="0.85" />
        <Slider id="hueVar" label="Variation de teinte" min="0" max="0.15" step="0.005" value="0.015" />
        <Slider id="mix" label="Mélange avec la 2e couleur" min="0" max="100" step="1" value="0" />
      </Section>

      <Section title="Forêt (ancien mode)" hidden>
        <Check id="forest">Mode forêt (sinon un seul arbre)</Check>
        <Slider id="treeCount" label="Nombre d'arbres" min="2" max="150" step="1" value="45" />
        <Slider id="spread" label="Étalement (petit = serré)" min="0.3" max="2.5" step="0.05" value="0.75" />
        <Slider id="forestVar" label="Variation entre arbres" min="0" max="1" step="0.01" value="0.5" />
        <Slider id="conPct" label="Part de conifères (%)" min="0" max="100" step="1" value="25" />
        <Hint>En forêt, les réglages de l'arbre servent de base : chaque arbre en est une variation.</Hint>
      </Section>
    </Tab>
  );
}
