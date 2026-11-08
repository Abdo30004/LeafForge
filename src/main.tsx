import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import { initGlobalErrorLogging } from './services/logger';
import { initCustomDialogs } from './services/dialog';

initGlobalErrorLogging();
initCustomDialogs();

// Completely disable browser default context menu across all elements (WebView2 / Web)
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
}, true);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
