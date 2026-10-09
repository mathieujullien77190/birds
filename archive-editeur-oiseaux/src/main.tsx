import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
import { useBird } from './store/bird';
import { useLibrary } from './store/library';

// En développement : les stores sont accessibles depuis la console (window.__bird, window.__library) pour tester et scripter.
if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { __bird: useBird, __library: useLibrary });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
