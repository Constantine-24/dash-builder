import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@grid-master/core/grid.css';
import './styles.css';
import { App } from './app.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
