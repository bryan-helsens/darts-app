import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './index.css';
// Vroeg laden: het install-event van de browser komt vaak vóór de eerste render.
import './ui/pwa/install';
import { App } from './ui/App';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
