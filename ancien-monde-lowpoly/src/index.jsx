import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import App from './ui/App.jsx';

// Rendu synchrone : tout le DOM existe avant que le moteur three.js (main.js) ne s'exécute.
const root = createRoot(document.getElementById('root'));
flushSync(() => root.render(<App />));

await import('./main.js');
const { initUi } = await import('./ui/behaviors.js');
initUi();
