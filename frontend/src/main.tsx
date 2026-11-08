import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import '@fontsource-variable/dm-sans/wght.css';
import '@fontsource-variable/playfair-display/wght.css';
import '@fontsource-variable/playfair-display/wght-italic.css';
import '@fontsource-variable/noto-sans-devanagari/wght.css';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><HashRouter><App /></HashRouter></StrictMode>
);
