import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/dm-sans/wght.css';
import '@fontsource-variable/playfair-display/wght.css';
import '@fontsource-variable/playfair-display/wght-italic.css';
import '@fontsource-variable/noto-sans-devanagari/wght.css';
import { App } from './App';
import './styles.css';

// Preserve bookmarks and recovery links shared before the store used direct URLs.
function moveLegacyRoute() {
  const legacyRoute = window.location.hash.slice(1);
  if (window.location.pathname !== '/' || !/^\/(?![\\/\s])/u.test(legacyRoute)) return false;
  const destination = new URL(legacyRoute, window.location.origin);
  if (destination.origin !== window.location.origin) return false;
  history.replaceState(history.state, '', destination.href);
  return true;
}

moveLegacyRoute();
window.addEventListener('hashchange', () => {
  if (moveLegacyRoute()) window.dispatchEvent(new PopStateEvent('popstate'));
});

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>
);
