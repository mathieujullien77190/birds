import Header from './Header.jsx';
import Tabs from './Tabs.jsx';
import TreeTab from './TreeTab.jsx';
import WorldTab from './WorldTab.jsx';
import NatureTab from './NatureTab.jsx';
import AnimalsTab from './AnimalsTab.jsx';
import DecorTab from './DecorTab.jsx';
import AmbianceTab from './AmbianceTab.jsx';
import Toolbar from './Toolbar.jsx';
import Status from './Status.jsx';
import SelectionPanel from './SelectionPanel.jsx';
import EditBar from './EditBar.jsx';
import PoseBar from './PoseBar.jsx';
import AtelierUi from './AtelierUi.jsx';
import ViewButtons from './ViewButtons.jsx';
import Help from './Help.jsx';

// Rendu unique : le moteur (main.js) pilote ensuite le DOM directement.
export default function App() {
  return (
    <>
      <aside id="panel">
        <Header />
        <Tabs />
        <div id="controls">
          <TreeTab />
          <WorldTab />
          <NatureTab />
          <AnimalsTab />
          <DecorTab />
          <AmbianceTab />
        </div>
      </aside>

      <main id="view">
        <Toolbar />
        <Status />
        <SelectionPanel />
        <EditBar />
        <PoseBar />
        <AtelierUi />
        <ViewButtons />
        <Help />
      </main>
    </>
  );
}
