import { Tab, Section, Slider, Select, Check, Btn, Hint, Tip, PrevRow } from './common.jsx';

export default function NatureTab() {
  return (
    <Tab name="nature" hidden>
      <Tip>Chaque ligne : <b>+</b> ajoute, <b>−</b> retire le dernier, le nombre est affiché. Les objets ajoutés se sélectionnent et se déplacent à la souris.</Tip>

      <Section title="Fleurs" open>
        <div id="flowerRows" className="rows"></div>
        <Slider id="flowerSize" label="Taille" min="0.5" max="2.5" step="0.05" value="1" />
        <Slider id="flowerCount" label="Tiges par touffe" min="1" max="9" step="1" value="5" />
        <Btn id="flowersClear" alt>Effacer les fleurs</Btn>
      </Section>

      <Section title="Insectes">
        <div id="insectRows" className="rows"></div>
        <Slider id="insectSize" label="Taille (relative aux arbres)" min="0.5" max="2.5" step="0.05" value="1" />
        <Hint>Abeilles et papillons butinent les fleurs et s'y posent ; la coccinelle grimpe sur les tiges.</Hint>
      </Section>

      <Section title="Herbe">
        <PrevRow prev="tuft">
          <Btn id="tuftScatter">Semer des touffes</Btn>
          <Btn id="tuftOne" alt>Ajouter une touffe</Btn>
        </PrevRow>
        <Select id="tuftKind" label="Type d'herbe" value="mix" options={[
          ['mix', 'Mélange (varié)'],
          ['blades', 'Brins'],
          ['tall', 'Herbe haute'],
          ['short', 'Gazon'],
          ['fern', 'Fougère'],
          ['reed', 'Roseaux'],
          ['flower', 'Fleurs'],
          ['bush', 'Buisson'],
          ['daisy', 'Fleurs basses (pâquerettes)'],
          ['clover', 'Trèfle'],
          ['poppy', 'Coquelicots'],
          ['lavender', 'Lavande'],
          ['cattail', 'Massettes (aquatique)'],
          ['iris', "Iris d'eau (aquatique)"],
        ]} />
        <Select id="meadowStyle" label="Outil Prairie : style" value="flowery" options={[
          ['flowery', 'Prairie fleurie'],
          ['low', 'Fleurs basses'],
          ['tall', 'Hautes herbes'],
          ['marsh', 'Marais'],
        ]} />
        <Hint>L'outil Prairie sème aussi des plantes aquatiques (massettes, iris, roseaux) dans l'eau peu profonde.</Hint>
        <Slider id="tuftCount" label="Nombre à semer" min="1" max="120" step="1" value="25" />
        <Slider id="tuftSize" label="Taille" min="0.05" max="0.6" step="0.01" value="0.22" />
        <Slider id="tuftBlades" label="Brins par touffe" min="3" max="20" step="1" value="9" />
        <Slider id="tuftBend" label="Courbure des brins" min="0" max="1" step="0.01" value="0.5" />
        <Slider id="tuftVar" label="Variation" min="0" max="1" step="0.01" value="0.5" />
        <label className="row">
          Herbe <input id="tuftColor" type="color" defaultValue="#6fb04f" /> Fleurs <input id="flowerColor" type="color" defaultValue="#f2b8d8" />
        </label>
        <Btn id="tuftClear" alt>Effacer l'herbe</Btn>
        <Hint>Si une touffe est sélectionnée, les réglages la modifient en direct ; sinon ils servent aux prochains ajouts.</Hint>
      </Section>

      <Section title="Pierres">
        <PrevRow prev="rock">
          <Btn id="rockScatter">Semer des pierres</Btn>
          <Btn id="rockOne" alt>Ajouter une pierre</Btn>
        </PrevRow>
        <Slider id="rockCount" label="Nombre à semer" min="1" max="60" step="1" value="10" />
        <Slider id="rockSize" label="Taille" min="0.05" max="1.2" step="0.01" value="0.22" />
        <Slider id="rockVar" label="Variation de taille" min="0" max="1" step="0.01" value="0.5" />
        <Slider id="rockRough" label="Rugosité" min="0" max="1" step="0.01" value="0.5" />
        <Slider id="rockFlat" label="Aplatissement" min="0.4" max="1.2" step="0.01" value="0.7" />
        <Slider id="rockMoss" label="Mousse (%)" min="0" max="100" step="1" value="25" />
        <label className="row">Couleur de la pierre <input id="rockColor" type="color" defaultValue="#9a9ea6" /></label>
        <Btn id="rockClear" alt>Effacer les pierres</Btn>
        <Hint>Si une pierre est sélectionnée, les réglages la modifient en direct ; sinon ils servent aux prochains ajouts.</Hint>
      </Section>

      <Section title="Plantes aquatiques">
        <div id="plantRows" className="rows"></div>
        <Check id="lilyFlower" checked>Nénuphar avec une fleur</Check>
        <Slider id="lilySize" label="Nénuphar · taille" min="0.1" max="0.6" step="0.01" value="0.28" />
        <Slider id="duckSize" label="Lentille d'eau · rayon de la plaque" min="0.2" max="1.2" step="0.05" value="0.5" />
        <Btn id="plantsClear" alt>Effacer les plantes aquatiques</Btn>
        <Hint>Elles flottent sur l'eau (creuse d'abord un lac) et suivent son niveau.</Hint>
      </Section>
    </Tab>
  );
}
