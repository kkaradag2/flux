import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Renderer root element is missing.');

createRoot(root).render(
  <StrictMode>
    <main>
      <h1>Flux</h1>
    </main>
  </StrictMode>,
);
