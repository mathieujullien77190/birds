import { Tab, Section, Slider, Select, Check, Btn } from './common.jsx';

const HIDDEN_ADD = ['fish', 'heron', 'flamingo', 'ibis', 'egret', 'pecker', 'teal', 'shoveler', 'kingfisher', 'frog', 'wagtail', 'gull', 'swallow', 'dragon', 'lily', 'duck'];

export default function AmbianceTab() {
  return (
    <Tab name="ambiance" hidden>
      <Section title="Saison" open>
        <Select id="season" label="Saison" value="none" options={[
          ['none', 'Aucune (couleurs normales)'],
          ['spring', 'Printemps'],
          ['summer', 'Été'],
          ['autumn', 'Automne'],
          ['winter', 'Hiver'],
        ]} />
        <Check id="seasonFx" checked>Particules de saison (pétales, feuilles, neige)</Check>
        <Check id="fallingLeaves">Feuilles qui tombent des arbres</Check>
      </Section>

      <Section title="Vent et pluie" open>
        <Slider id="windForce" label="Vent · force" min="0" max="1" step="0.01" value="0.02" />
        <Slider id="windDir" label="Vent · direction" min="0" max="360" step="1" value="90" after="°" />
        <Check id="rainOn">Pluie</Check>
        <Slider id="rainForce" label="Pluie · intensité" min="0.1" max="1" step="0.01" value="0.6" />
      </Section>

      <Section title="Rendu et vue" open>
        <Check id="alba" checked>Style Alba (aplats pastel)</Check>
        <Check id="rotate">Rotation automatique</Check>
        <Check id="wire">Fil de fer</Check>
        <Btn id="resetView" alt>Recentrer la vue</Btn>
      </Section>

      {/* éclairage géré automatiquement : valeurs fixes (soleil haut sur le côté, ombres douces) */}
      <div hidden>
        <input id="shadows" type="checkbox" defaultChecked />
        <input id="sunShow" type="checkbox" />
        <select id="ambiance" defaultValue="day">
          {['day', 'golden', 'sunrise', 'sunset', 'custom'].map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
        <input id="sunAz" type="range" min="0" max="360" step="1" defaultValue="130" />
        <input id="sunEl" type="range" min="2" max="88" step="1" defaultValue="48" />
        {/* boutons d'ajout historiques : pilotés par les lignes + / − */}
        {HIDDEN_ADD.map((k) => (
          <button key={k} id={`${k}Add`} type="button"></button>
        ))}
      </div>
    </Tab>
  );
}
