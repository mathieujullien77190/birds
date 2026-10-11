import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app';
import './style.css';

// Un seul outil : le nichoir high tech (« Plaques »). Les autres outils (visionneuse STL, pavé isolé, nichoir complet, menu) sont archivés dans archive-autres-outils/.
document.title = 'Nichoir high tech';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
