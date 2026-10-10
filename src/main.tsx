import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Birdhouse from './birdhouse/Birdhouse';
import Panel from './birdhouse/Panel';
import Launcher from './Launcher';
import Planks from './planks/Planks';
import { currentTool } from './tools';
import './style.css';

const tool = currentTool();
document.title = tool === 'planks' ? 'Plaques' : tool === 'birdhouse' ? 'Pavé isolé' : tool === 'house' ? 'Nichoir' : tool === 'bird' ? 'Visionneuse STL' : 'Atelier';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {tool === 'planks' ? <Planks /> : tool === 'bird' ? <App /> : tool === 'birdhouse' ? <Panel /> : tool === 'house' ? <Birdhouse /> : <Launcher />}
  </StrictMode>,
);
