import { Tab, Section, Slider, Select, Check, Btn, Hint, Tip, PrevRow } from './common.jsx';

export default function DecorTab() {
  return (
    <Tab name="decor" hidden>
      <Tip>Panneaux, bancs et escaliers se placent, se tournent et se redimensionnent à la souris comme les arbres.</Tip>

      <Section title="Panneaux de direction" open>
        <PrevRow prev="sign">
          <Btn id="signAdd">Ajouter un panneau</Btn>
          <Btn id="signClear" alt>Effacer</Btn>
        </PrevRow>
        <label>
          Textes des flèches (séparés par des virgules)
          <input id="signText" type="text" defaultValue="Forêt, Lac, Plage" />
        </label>
        <Slider id="signBoards" label="Nombre de flèches" min="1" max="4" step="1" value="2" />
        <Slider id="signHeight" label="Hauteur" min="0.4" max="2.2" step="0.05" value="1" />
        <label className="row">Bois <input id="signWood" type="color" defaultValue="#c8955a" /></label>
        <Hint>Si un panneau est sélectionné, les réglages le modifient en direct ; sinon ils servent aux prochains ajouts.</Hint>
      </Section>

      <Section title="Bancs et tables" open>
        <PrevRow prev="bench">
          <Btn id="benchAdd">Ajouter un banc</Btn>
          <Btn id="benchClear" alt>Effacer</Btn>
        </PrevRow>
        <Btn id="tableAdd" alt>Ajouter une table de pique-nique</Btn>
        <Slider id="benchSize" label="Longueur" min="0.3" max="1.5" step="0.05" value="0.65" />
        <Check id="benchBack" checked>Avec dossier</Check>
        <label className="row">Bois <input id="benchWood" type="color" defaultValue="#b9854e" /></label>
      </Section>

      <Section title="Ponts" open>
        <PrevRow prev="bridge">
          <Btn id="bridgeAdd">Ajouter un pont</Btn>
          <Btn id="bridgeClear" alt>Effacer</Btn>
        </PrevRow>
        <Select id="bridgeType" label="Type" options={[
          ['wood', 'Passerelle en bois'],
          ['woodarch', 'Pont en bois arqué'],
          ['arch', "Pont de pierre en dos d'âne"],
          ['rope', 'Pont de corde'],
        ]} />
        <Slider id="bridgeLen" label="Longueur" min="0.6" max="5" step="0.05" value="1.6" />
        <Slider id="bridgeW" label="Largeur" min="0.2" max="1.2" step="0.01" value="0.4" />
        <Slider id="bridgeH" label="Bombé (pierre) / affaissement (corde)" min="0" max="0.8" step="0.01" value="0.25" />
        <Slider id="bridgeY" label="Hauteur (monter / descendre)" min="-0.4" max="1" step="0.01" value="0" />
        <Check id="bridgeRail" checked>Garde-corps</Check>
        <label className="row">Couleur <input id="bridgeColor" type="color" defaultValue="#a9794c" /></label>
        <Hint>Pose les deux bouts du pont sur la terre ferme, de part et d'autre de l'eau ou d'un creux : le tablier se cale sur le bout le plus haut et les pieds descendent jusqu'au sol. Tourne-le avec la boule blanche.</Hint>
      </Section>

      <Section title="Escaliers" open>
        <PrevRow prev="stairs">
          <Btn id="stairsAdd">Ajouter un escalier</Btn>
          <Btn id="stairsClear" alt>Effacer</Btn>
        </PrevRow>
        <Select id="stairsType" label="Type" options={[
          ['stone', 'Pierre'],
          ['wood', 'Bois avec rampe'],
          ['round', 'Marches rondes'],
          ['spiral', 'Colimaçon'],
        ]} />
        <Slider id="stairsSteps" label="Nombre de marches" min="3" max="24" step="1" value="8" />
        <Slider id="stairsW" label="Largeur" min="0.12" max="0.9" step="0.01" value="0.3" />
        <Slider id="stairsH" label="Hauteur d'une marche" min="0.02" max="0.09" step="0.005" value="0.05" />
        <Slider id="stairsY" label="Hauteur (monter / enfoncer dans le sol)" min="-0.5" max="0.8" step="0.01" value="0" />
        <Check id="stairsRail" checked>Rampe (rambarde)</Check>
        <label className="row">Couleur <input id="stairsColor" type="color" defaultValue="#bdb5a3" /></label>
        <Hint>Si un escalier est sélectionné, les réglages le modifient en direct. Le bas de l'escalier pose sur le sol, il monte vers l'avant.</Hint>
      </Section>
    </Tab>
  );
}
