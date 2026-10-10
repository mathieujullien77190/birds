import { Tab, Section, Slider, Btn, Check } from './common.jsx';

export default function AnimalsTab() {
  return (
    <Tab name="animals" hidden>
      <p className="tip">
        <b>+</b> ajoute un animal, <b>−</b> retire le dernier. Carpe, héron, grenouille et libellule aiment l'eau ; le pic s'accroche à l'arbre sélectionné.
      </p>
      <Section title="Atelier : créer son animal" open>
        <Btn id="atOpen">Ouvrir l'atelier (scène vide)</Btn>
        <label>
          Mes animaux
          <select id="customSel"></select>
        </label>
        <div className="btns">
          <Btn id="customEdit" alt>Modifier</Btn>
          <Btn id="customDel" className="danger">Supprimer</Btn>
        </div>
        <p className="hint">Assemble des formes (patate, aile ovale, bec, tête…), étire-les, sculpte-les, puis enregistre : ton animal apparaît dans la liste ci-dessous (+) et se promène sur la terre ferme.</p>
      </Section>
      <div id="animalRows" className="rows"></div>
      <Section title="Tailles et vitesses">
        <Slider id="fishSize" label="Carpe koï · taille" min="0.05" max="0.5" step="0.01" value="0.16" />
        <Slider id="fishSpeed" label="Carpe koï · vitesse" min="0.1" max="1.5" step="0.05" value="0.5" />
        <Slider id="heronSize" label="Héron · taille" min="0.2" max="1" step="0.02" value="0.5" />
        <Slider id="flamingoSize" label="Flamant rose · taille" min="0.2" max="1" step="0.02" value="0.5" />
        <Slider id="ibisSize" label="Ibis falcinelle · taille" min="0.2" max="1" step="0.02" value="0.5" />
        <Slider id="egretSize" label="Héron garde-bœufs · taille" min="0.2" max="1" step="0.02" value="0.45" />
        <Slider id="peckerSize" label="Pic · taille" min="0.05" max="0.3" step="0.01" value="0.1" />
        <Slider id="peckerSpeed" label="Pic · vitesse du tour" min="0.3" max="2.5" step="0.05" value="1" />
        <Slider id="frogSize" label="Grenouille · taille" min="0.06" max="0.5" step="0.01" value="0.18" />
        <Slider id="gullSize" label="Mouette · envergure" min="0.15" max="0.8" step="0.01" value="0.35" />
        <Slider id="hoopoeSize" label="Huppe (en vol) · envergure" min="0.15" max="0.8" step="0.01" value="0.4" />
        <Slider id="wagtailSize" label="Bergeronnette · taille" min="0.1" max="0.5" step="0.01" value="0.22" />
        <Slider id="tealSize" label="Sarcelle · taille" min="0.15" max="0.8" step="0.01" value="0.32" />
        <Slider id="shovelerSize" label="Canard souchet · taille" min="0.15" max="0.9" step="0.01" value="0.38" />
        <Slider id="kingfisherSize" label="Martin-pêcheur · taille" min="0.1" max="0.8" step="0.01" value="0.3" />
        <Slider id="wagtailSpeed" label="Bergeronnette · vitesse" min="0.3" max="2" step="0.05" value="1" />
        <Slider id="gullSpeed" label="Mouette · vitesse" tight min="0.3" max="2" step="0.05" value="1" />
        <Slider id="hoopoeSpeed" label="Huppe (en vol) · vitesse" tight min="0.3" max="2" step="0.05" value="1" />
        <Check id="hoopoeSlow">Huppe (en vol) · ralenti (4× plus lent)</Check>
        <Slider id="swallowSize" label="Hirondelle · envergure" min="0.1" max="0.5" step="0.01" value="0.2" />
        <Slider id="swallowSpeed" label="Hirondelle · vitesse" min="0.3" max="2" step="0.05" value="1" />
        <Slider id="dragonSize" label="Libellule · taille" min="0.08" max="0.4" step="0.01" value="0.14" />
        <Slider id="dragonSpeed" label="Libellule · vitesse" min="0.2" max="1.5" step="0.05" value="0.6" />
      </Section>
      <Btn id="animalsClear" alt>Effacer tous les animaux</Btn>
    </Tab>
  );
}
